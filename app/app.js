(function () {
  'use strict';

  const STORAGE_KEY = 'dutyPlannerState.v1';
  const MAX_CONSECUTIVE_DAYS = 5;
  const MAX_RANGE_DAYS = 14;
  const EARLY_START_MIN = 360;
  const EARLY_END_MIN = 720;

  const HTML_ESCAPE = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  let state = null;
  let employeeDraft = {
    id: null,
    name: '',
    position: '',
    maxDaysPerWeek: 5,
    shiftPreferences: [],
    unavailableDates: []
  };
  let shiftDraft = {
    id: null,
    name: '',
    start: '08:00',
    end: '16:00',
    minStaff: 1
  };
  let toastTimer = null;

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function toKey(date) {
    if (typeof date === 'string') {
      return date.slice(0, 10);
    }
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function fromKey(key) {
    const parts = key.slice(0, 10).split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function addDays(key, delta) {
    const date = fromKey(key);
    date.setDate(date.getDate() + delta);
    return toKey(date);
  }

  function todayKey() {
    return toKey(new Date());
  }

  function todayMonth() {
    return todayKey().slice(0, 7);
  }

  function isWeekend(key) {
    const day = fromKey(key).getDay();
    return day === 0 || day === 6;
  }

  function weekdayName(key) {
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][fromKey(key).getDay()];
  }

  function formatMonthDay(key) {
    const parts = key.slice(0, 10).split('-');
    return `${Number(parts[1])}月${Number(parts[2])}日`;
  }

  function timeToMin(value) {
    const parts = String(value || '').split(':');
    const hours = Number.parseInt(parts[0], 10);
    const minutes = Number.parseInt(parts[1], 10);
    return (Number.isNaN(hours) ? 0 : hours) * 60 + (Number.isNaN(minutes) ? 0 : minutes);
  }

  function isValidTime(value) {
    const match = /^([01]?\d|2[0-4]):([0-5]\d)$/.exec(String(value || '').trim());
    if (!match) {
      return false;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours < 24 || minutes === 0;
  }

  function isNightShift(shift) {
    return timeToMin(shift.start) < 360 || timeToMin(shift.end) < timeToMin(shift.start);
  }

  function isEarlyShift(shift) {
    const start = timeToMin(shift.start);
    return start >= EARLY_START_MIN && start < EARLY_END_MIN;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch]);
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function genId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function findEmployee(id) {
    return state.employees.find((employee) => employee.id === id);
  }

  function findShift(id) {
    return state.shifts.find((shift) => shift.id === id);
  }

  function currentPlan() {
    return state.plans.find((plan) => plan.id === state.currentPlanId) || null;
  }

  function planDates(plan) {
    if (!plan || !plan.startDate || !plan.endDate) {
      return [];
    }
    const dates = [];
    let cursor = plan.startDate;
    let guard = 0;
    while (cursor <= plan.endDate && guard < 400) {
      dates.push(cursor);
      cursor = addDays(cursor, 1);
      guard += 1;
    }
    return dates;
  }

  function getCellAssignments(plan, dateKey, shiftId) {
    const ids = plan && plan.assignments && plan.assignments[dateKey] && plan.assignments[dateKey][shiftId];
    return Array.isArray(ids) ? ids.filter((id, index, arr) => arr.indexOf(id) === index) : [];
  }

  function setCellAssignments(plan, dateKey, shiftId, ids) {
    if (!plan.assignments) {
      plan.assignments = {};
    }
    if (!plan.assignments[dateKey]) {
      plan.assignments[dateKey] = {};
    }
    plan.assignments[dateKey][shiftId] = Array.isArray(ids) ? ids.slice() : [];
  }

  function addEmployeeToCell(plan, dateKey, shiftId, employeeId) {
    const ids = getCellAssignments(plan, dateKey, shiftId);
    if (!ids.includes(employeeId)) {
      ids.push(employeeId);
      setCellAssignments(plan, dateKey, shiftId, ids);
    }
  }

  function removeEmployeeFromCell(plan, dateKey, shiftId, employeeId) {
    setCellAssignments(plan, dateKey, shiftId, getCellAssignments(plan, dateKey, shiftId).filter((id) => id !== employeeId));
  }

  function isAssignedOnDate(plan, employeeId, dateKey) {
    const dayCells = plan.assignments && plan.assignments[dateKey];
    if (!dayCells) {
      return false;
    }
    return Object.values(dayCells).some((ids) => Array.isArray(ids) && ids.includes(employeeId));
  }

  function isAssignedToNightOnDate(plan, employeeId, dateKey) {
    return state.shifts.some((shift) => isNightShift(shift) && getCellAssignments(plan, dateKey, shift.id).includes(employeeId));
  }

  function weekKey(dateKey) {
    const date = fromKey(dateKey);
    const daysSinceMonday = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - daysSinceMonday);
    return toKey(date);
  }

  function countAssignedInWeek(plan, employeeId, dateKey) {
    const targetWeek = weekKey(dateKey);
    return planDates(plan).filter((date) => weekKey(date) === targetWeek && isAssignedOnDate(plan, employeeId, date)).length;
  }

  function countWeekendAssignments(plan, employeeId) {
    return planDates(plan).filter((date) => isWeekend(date) && isAssignedOnDate(plan, employeeId, date)).length;
  }

  function countTotalAssignments(plan, employeeId) {
    return planDates(plan).filter((date) => isAssignedOnDate(plan, employeeId, date)).length;
  }

  function getConsecutiveEnding(plan, employeeId, beforeDateKey) {
    let count = 0;
    let cursor = beforeDateKey;
    let guard = 0;
    while (guard < 400) {
      if (!isAssignedOnDate(plan, employeeId, cursor)) {
        break;
      }
      count += 1;
      cursor = addDays(cursor, -1);
      guard += 1;
    }
    return count;
  }

  function getEligibleCandidates(plan, dateKey, shift) {
    const previousDate = addDays(dateKey, -1);
    const early = isEarlyShift(shift);
    return state.employees.filter((employee) => {
      if (employee.unavailableDates.includes(dateKey)) {
        return false;
      }
      if (isAssignedOnDate(plan, employee.id, dateKey)) {
        return false;
      }
      if (getConsecutiveEnding(plan, employee.id, previousDate) >= MAX_CONSECUTIVE_DAYS) {
        return false;
      }
      const weeklyMax = Math.max(0, Number(employee.maxDaysPerWeek) || 0);
      if (weeklyMax > 0 && countAssignedInWeek(plan, employee.id, dateKey) >= weeklyMax) {
        return false;
      }
      if (early && isAssignedToNightOnDate(plan, employee.id, previousDate)) {
        return false;
      }
      return true;
    });
  }

  function sortCandidates(candidates, plan, dateKey, shift) {
    return candidates.slice().sort((a, b) => {
      if (isWeekend(dateKey)) {
        const weekendA = countWeekendAssignments(plan, a.id);
        const weekendB = countWeekendAssignments(plan, b.id);
        if (weekendA !== weekendB) {
          return weekendA - weekendB;
        }
      }

      const totalA = countTotalAssignments(plan, a.id);
      const totalB = countTotalAssignments(plan, b.id);
      if (totalA !== totalB) {
        return totalA - totalB;
      }

      const prefA = a.shiftPreferences.includes(shift.id) ? 0 : 1;
      const prefB = b.shiftPreferences.includes(shift.id) ? 0 : 1;
      if (prefA !== prefB) {
        return prefA - prefB;
      }

      return a.name.localeCompare(b.name, 'zh-CN');
    });
  }

  function generatePlan(plan) {
    plan.assignments = {};
    planDates(plan).forEach((dateKey) => {
      state.shifts.forEach((shift) => {
        const candidates = sortCandidates(getEligibleCandidates(plan, dateKey, shift), plan, dateKey, shift);
        const selected = candidates.slice(0, Math.max(0, Number(shift.minStaff) || 0));
        if (selected.length > 0) {
          setCellAssignments(plan, dateKey, shift.id, selected.map((employee) => employee.id));
        }
      });
    });
    plan.updatedAt = new Date().toISOString();
  }

  function validatePlan(plan) {
    const cellViolations = {};
    const shortage = {};
    if (!plan) {
      return { cellViolations, shortage };
    }

    const dates = planDates(plan);
    const shifts = state.shifts;

    dates.forEach((dateKey) => {
      const employeeShiftMap = new Map();
      shifts.forEach((shift) => {
        getCellAssignments(plan, dateKey, shift.id).forEach((employeeId) => {
          if (!employeeShiftMap.has(employeeId)) {
            employeeShiftMap.set(employeeId, []);
          }
          employeeShiftMap.get(employeeId).push(shift.id);
        });
      });

      shifts.forEach((shift) => {
        const cellKey = `${dateKey}|${shift.id}`;
        const violations = [];
        const assignedIds = getCellAssignments(plan, dateKey, shift.id);
        const required = Math.max(0, Number(shift.minStaff) || 0);
        if (assignedIds.length < required) {
          shortage[cellKey] = required - assignedIds.length;
        }

        assignedIds.forEach((employeeId) => {
          const employee = findEmployee(employeeId);
          const employeeName = employee ? employee.name : employeeId;

          const shiftIds = employeeShiftMap.get(employeeId) || [];
          if (shiftIds.length > 1) {
            violations.push(`${employeeName}：同一天被安排多个班次`);
          }

          if (employee && employee.unavailableDates.includes(dateKey)) {
            violations.push(`${employeeName}：该日期已设为不可用`);
          }

          if (employee) {
            const assignedInWeek = countAssignedInWeek(plan, employeeId, dateKey);
            const maxDays = Math.max(0, Number(employee.maxDaysPerWeek) || 0);
            if (maxDays > 0 && assignedInWeek > maxDays) {
              violations.push(`${employeeName}：本周已排 ${assignedInWeek} 天，超过上限 ${maxDays} 天`);
            }
          }

          if (getConsecutiveEnding(plan, employeeId, dateKey) > MAX_CONSECUTIVE_DAYS) {
            violations.push(`${employeeName}：连续上班超过 ${MAX_CONSECUTIVE_DAYS} 天`);
          }

          if (isEarlyShift(shift)) {
            const previousDate = addDays(dateKey, -1);
            if (isAssignedToNightOnDate(plan, employeeId, previousDate)) {
              violations.push(`${employeeName}：晚班次日不能安排早班`);
            }
          }
        });

        if (violations.length > 0) {
          cellViolations[cellKey] = violations;
        }
      });
    });

    return { cellViolations, shortage };
  }

  function computeStats(plan) {
    if (!plan) {
      return {
        dayCount: 0,
        assignmentCount: 0,
        conflictCellCount: 0,
        shortageCellCount: 0
      };
    }

    const validation = validatePlan(plan);
    const dates = planDates(plan);
    const assignmentCount = state.shifts.reduce((total, shift) => {
      return total + dates.reduce((sum, dateKey) => sum + getCellAssignments(plan, dateKey, shift.id).length, 0);
    }, 0);

    return {
      dayCount: dates.length,
      assignmentCount,
      conflictCellCount: Object.values(validation.cellViolations).filter((items) => items.length > 0).length,
      shortageCellCount: Object.values(validation.shortage).filter((count) => count > 0).length
    };
  }

  function buildInitialState() {
    return {
      version: 1,
      employees: [],
      shifts: [
        { id: 'shift-early', name: '早班', start: '08:00', end: '16:00', minStaff: 1 },
        { id: 'shift-mid', name: '中班', start: '16:00', end: '24:00', minStaff: 1 },
        { id: 'shift-night', name: '晚班', start: '00:00', end: '08:00', minStaff: 1 }
      ],
      plans: [],
      currentPlanId: null,
      ui: {
        activeView: 'schedule',
        employeeViewId: null,
        scheduleMonth: null
      }
    };
  }

  function normalizeEmployee(employee) {
    const maxDays = Number.parseInt(employee.maxDaysPerWeek, 10);
    return {
      id: employee.id || genId('emp'),
      name: String(employee.name || '').trim(),
      position: String(employee.position || '').trim(),
      maxDaysPerWeek: Number.isNaN(maxDays) ? 5 : Math.min(7, Math.max(0, maxDays)),
      shiftPreferences: Array.isArray(employee.shiftPreferences) ? employee.shiftPreferences.filter((id) => typeof id === 'string') : [],
      unavailableDates: Array.isArray(employee.unavailableDates) ? employee.unavailableDates.map((date) => String(date).slice(0, 10)).sort() : []
    };
  }

  function normalizeShift(shift) {
    const minStaff = Number.parseInt(shift.minStaff, 10);
    return {
      id: shift.id || genId('shift'),
      name: String(shift.name || '').trim() || '未命名班次',
      start: isValidTime(shift.start) ? shift.start : '08:00',
      end: isValidTime(shift.end) ? shift.end : '16:00',
      minStaff: Number.isNaN(minStaff) ? 1 : Math.min(99, Math.max(0, minStaff))
    };
  }

  function normalizePlan(plan) {
    const startDate = String(plan.startDate || '').slice(0, 10);
    const endDate = String(plan.endDate || '').slice(0, 10);
    const assignments = {};
    if (plan.assignments && typeof plan.assignments === 'object') {
      Object.keys(plan.assignments).forEach((dateKey) => {
        assignments[dateKey] = {};
        const dayAssignments = plan.assignments[dateKey] || {};
        Object.keys(dayAssignments).forEach((shiftId) => {
          const ids = dayAssignments[shiftId];
          assignments[dateKey][shiftId] = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
        });
      });
    }
    return {
      id: plan.id || genId('plan'),
      name: String(plan.name || '').trim() || '未命名方案',
      month: String(plan.month || startDate.slice(0, 7) || todayMonth()),
      startDate,
      endDate,
      assignments,
      createdAt: plan.createdAt || new Date().toISOString(),
      updatedAt: plan.updatedAt || new Date().toISOString()
    };
  }

  function normalizeState(raw) {
    const base = buildInitialState();
    if (!raw || typeof raw !== 'object') {
      return base;
    }

    const shifts = Array.isArray(raw.shifts) && raw.shifts.length > 0 ? raw.shifts.map(normalizeShift) : base.shifts;
    const employees = Array.isArray(raw.employees) ? raw.employees.map(normalizeEmployee) : [];
    const plans = Array.isArray(raw.plans) ? raw.plans.map(normalizePlan) : [];
    const firstPlan = plans.find((plan) => plan.id === raw.currentPlanId) || plans[0] || null;

    return {
      version: 1,
      employees,
      shifts,
      plans,
      currentPlanId: firstPlan ? firstPlan.id : null,
      ui: {
        activeView: raw.ui && ['schedule', 'employees', 'shifts'].includes(raw.ui.activeView) ? raw.ui.activeView : 'schedule',
        employeeViewId: raw.ui && typeof raw.ui.employeeViewId === 'string' ? raw.ui.employeeViewId : null,
        scheduleMonth: raw.ui && typeof raw.ui.scheduleMonth === 'string' ? raw.ui.scheduleMonth : (firstPlan ? firstPlan.month : todayMonth())
      }
    };
  }

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      state = normalizeState(raw);
    } catch (error) {
      state = buildInitialState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const status = $('#saveStatus');
      if (status) {
        const now = new Date();
        status.textContent = `已保存 ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
      }
    } catch (error) {
      showToast('保存失败：浏览器存储不可用');
    }
  }

  function showToast(message) {
    const toast = $('#toast');
    if (!toast) {
      return;
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
  }

  function selectedMonth() {
    return state.ui.scheduleMonth || (currentPlan() ? currentPlan().month : todayMonth());
  }

  function plansForMonth(month) {
    return state.plans.filter((plan) => plan.month === month);
  }

  function getMonthOptions() {
    const months = new Set();
    state.plans.forEach((plan) => months.add(plan.month));
    months.add(todayMonth());
    if (currentPlan()) {
      months.add(currentPlan().month);
    }
    return Array.from(months).sort();
  }

  function defaultDateRange() {
    const start = addDays(todayKey(), 1);
    return { start, end: addDays(start, 6) };
  }

  function readDateRange() {
    const startInput = $('#scheduleStart');
    const endInput = $('#scheduleEnd');
    const start = startInput ? startInput.value : '';
    const end = endInput ? endInput.value : '';
    if (!start || !end) {
      return { error: '请选择开始和结束日期' };
    }
    if (end < start) {
      return { error: '结束日期不能早于开始日期' };
    }
    if (start < todayKey()) {
      return { error: '排班开始日期不能早于今天' };
    }
    const dayCount = Math.round((fromKey(end) - fromKey(start)) / 86400000) + 1;
    if (dayCount < 1 || dayCount > MAX_RANGE_DAYS) {
      return { error: `排班范围需为未来 1 至 ${MAX_RANGE_DAYS} 天` };
    }
    return { start, end, dayCount };
  }

  function nextPlanName(month) {
    const existingCount = plansForMonth(month).length;
    return `${month} 方案 ${existingCount + 1}`;
  }

  function createPlan(start, end) {
    const month = start.slice(0, 7);
    const now = new Date().toISOString();
    const plan = {
      id: genId('plan'),
      name: nextPlanName(month),
      month,
      startDate: start,
      endDate: end,
      assignments: {},
      createdAt: now,
      updatedAt: now
    };
    state.plans.push(plan);
    state.currentPlanId = plan.id;
    state.ui.scheduleMonth = month;
    return plan;
  }

  function setSaveStatus(text) {
    const status = $('#saveStatus');
    if (status) {
      status.textContent = text;
    }
  }

  function renderAll() {
    if (!state) {
      loadState();
    }

    $$('.nav-btn').forEach((button) => {
      button.classList.toggle('active', button.dataset.view === state.ui.activeView);
    });

    const employeeViewButton = $('#employeeViewBtn');
    if (employeeViewButton) {
      employeeViewButton.textContent = state.ui.employeeViewId ? '退出员工视图' : '员工视图';
    }

    const app = $('#app');
    if (!app) {
      return;
    }

    if (state.ui.activeView === 'employees') {
      app.innerHTML = renderEmployees();
    } else if (state.ui.activeView === 'shifts') {
      app.innerHTML = renderShifts();
    } else {
      app.innerHTML = renderSchedule();
    }
  }

  function renderSchedule() {
    const plan = currentPlan();
    const controls = renderScheduleControls(plan);

    if (state.ui.employeeViewId) {
      return `<div class="view">${controls}${renderEmployeeView(state.ui.employeeViewId)}</div>`;
    }

    if (!plan) {
      return `<div class="view">${controls}<section class="card"><div class="empty">还没有排班方案。请选择未来日期，然后点击「自动排班」生成第一份方案。</div></section></div>`;
    }

    const stats = computeStats(plan);
    return `<div class="view">
      ${controls}
      <section class="stats-row">
        <div class="stat-card"><div class="stat-label">覆盖天数</div><div class="stat-value">${stats.dayCount}</div></div>
        <div class="stat-card"><div class="stat-label">已排人次</div><div class="stat-value">${stats.assignmentCount}</div></div>
        <div class="stat-card"><div class="stat-label">冲突单元格</div><div class="stat-value ${stats.conflictCellCount > 0 ? 'warning' : ''}">${stats.conflictCellCount}</div></div>
        <div class="stat-card"><div class="stat-label">缺口单元格</div><div class="stat-value ${stats.shortageCellCount > 0 ? 'warning' : ''}">${stats.shortageCellCount}</div></div>
      </section>
      <section class="card table-card">${renderScheduleTable(plan)}</section>
      <section class="card">${renderLegend()}</section>
    </div>`;
  }

  function renderScheduleControls(plan) {
    const month = selectedMonth();
    const monthOptions = getMonthOptions().map((value) => `<option value="${escapeAttr(value)}" ${value === month ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
    const monthPlans = plansForMonth(month);
    const activePlanId = plan && plan.month === month ? plan.id : (monthPlans[0] ? monthPlans[0].id : '');
    const planOptions = monthPlans.map((item) => `<option value="${escapeAttr(item.id)}" ${item.id === activePlanId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
    const range = plan ? { start: plan.startDate, end: plan.endDate } : defaultDateRange();
    const employeeOptions = state.employees.map((employee) => `<option value="${escapeAttr(employee.id)}" ${employee.id === state.ui.employeeViewId ? 'selected' : ''}>${escapeHtml(employee.name)}</option>`).join('');

    return `<section class="card">
      <div class="view-toolbar">
        <div class="plan-controls">
          <div class="plan-selects">
            <label>月份
              <select id="monthSelect" data-role="month-select">${monthOptions}</select>
            </label>
            <label>排班方案
              <select id="planSelect" data-role="plan-select">
                <option value="">选择方案</option>
                ${planOptions}
              </select>
            </label>
            <label>开始日期
              <input id="scheduleStart" type="date" value="${escapeAttr(range.start)}" min="${escapeAttr(todayKey())}">
            </label>
            <label>结束日期
              <input id="scheduleEnd" type="date" value="${escapeAttr(range.end)}" min="${escapeAttr(todayKey())}">
            </label>
            <label>员工视图
              <select id="employeeViewSelect" data-role="employee-view-select">
                <option value="">完整排班表</option>
                ${employeeOptions}
              </select>
            </label>
          </div>
          <div class="plan-actions">
            <button type="button" class="btn" data-action="new-plan">新建方案</button>
            <button type="button" class="btn btn-primary" data-action="generate-plan">自动排班</button>
            <button type="button" class="btn btn-danger" data-action="delete-plan">删除方案</button>
          </div>
        </div>
        <div class="hint">选择未来 1 至 14 天；自动排班会跳过不可用日期，并在无法满足最低人数时标出缺口。</div>
      </div>
    </section>`;
  }

  function renderScheduleTable(plan) {
    const dates = planDates(plan);
    const validation = validatePlan(plan);
    const headerCells = dates.map((dateKey) => {
      const weekendClass = isWeekend(dateKey) ? 'weekend-cell' : '';
      return `<th class="${weekendClass}"><div class="date-day">${escapeHtml(formatMonthDay(dateKey))}</div><div class="date-week">${escapeHtml(weekdayName(dateKey))}</div></th>`;
    }).join('');

    const rows = state.shifts.map((shift) => {
      const cells = dates.map((dateKey) => renderScheduleCell(plan, dateKey, shift, validation)).join('');
      return `<tr>
        <th class="shift-cell"><div class="shift-name">${escapeHtml(shift.name)}</div><div class="shift-time">${escapeHtml(shift.start)} - ${escapeHtml(shift.end)}</div></th>
        ${cells}
      </tr>`;
    }).join('');

    return `<div class="table-wrap">
      <table class="schedule-table">
        <thead>
          <tr><th class="corner">班次 \\ 日期</th>${headerCells}</tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  function renderScheduleCell(plan, dateKey, shift, validation) {
    const cellKey = `${dateKey}|${shift.id}`;
    const ids = getCellAssignments(plan, dateKey, shift.id);
    const violations = validation.cellViolations[cellKey] || [];
    const deficit = validation.shortage[cellKey] || 0;
    const classes = ['schedule-cell'];
    if (isWeekend(dateKey)) {
      classes.push('weekend-cell');
    }
    if (violations.length > 0) {
      classes.push('cell-conflict');
    } else if (deficit > 0) {
      classes.push('cell-shortage');
    }

    const titleParts = violations.slice();
    if (deficit > 0) {
      titleParts.push(`缺口 ${deficit} 人`);
    }
    const titleAttr = titleParts.length > 0 ? ` title="${escapeAttr(titleParts.join('\n'))}"` : '';

    const chips = ids.map((employeeId) => {
      const employee = findEmployee(employeeId);
      const name = employee ? employee.name : employeeId;
      return `<span class="emp-chip">${escapeHtml(name)}<button type="button" class="chip-remove" data-action="remove-assign" data-date-key="${escapeAttr(dateKey)}" data-shift-id="${escapeAttr(shift.id)}" data-emp-id="${escapeAttr(employeeId)}" title="移除">×</button></span>`;
    }).join('');

    const availableEmployees = state.employees.filter((employee) => !ids.includes(employee.id));
    const addOptions = availableEmployees.map((employee) => `<option value="${escapeAttr(employee.id)}">${escapeHtml(employee.name)}</option>`).join('');
    const shortageHtml = deficit > 0 ? `<span class="shortage-badge">缺${deficit}人</span>` : '';

    return `<td class="${classes.join(' ')}"${titleAttr}>
      ${chips}
      ${shortageHtml}
      <select class="cell-add-select" data-role="cell-add-select" data-date-key="${escapeAttr(dateKey)}" data-shift-id="${escapeAttr(shift.id)}">
        <option value="">+ 添加人员</option>
        ${addOptions}
      </select>
    </td>`;
  }

  function renderLegend() {
    return `<div class="legend">
      <span class="legend-item"><span class="legend-swatch weekend"></span>周末</span>
      <span class="legend-item"><span class="legend-swatch conflict"></span>规则冲突</span>
      <span class="legend-item"><span class="legend-swatch shortage"></span>人数缺口</span>
      <span class="legend-item">悬停红色单元格可查看具体冲突项</span>
    </div>`;
  }

  function renderEmployeeView(employeeId) {
    const employee = findEmployee(employeeId);
    if (!employee) {
      return `<section class="card"><div class="empty">请先在员工管理中添加员工。</div></section>`;
    }

    const plan = currentPlan();
    if (!plan) {
      return `<section class="card"><div class="empty">暂无排班方案，请先生成排班。</div></section>`;
    }

    const futureDates = planDates(plan).filter((dateKey) => dateKey >= todayKey());
    const rows = [];
    futureDates.forEach((dateKey) => {
      state.shifts.forEach((shift) => {
        if (getCellAssignments(plan, dateKey, shift.id).includes(employeeId)) {
          rows.push({ dateKey, shift });
        }
      });
    });

    const body = rows.length > 0 ? rows.map((row) => `<tr>
      <td class="future-date">${escapeHtml(formatMonthDay(row.dateKey))}</td>
      <td>${escapeHtml(weekdayName(row.dateKey))}</td>
      <td>${escapeHtml(row.shift.name)}</td>
      <td>${escapeHtml(row.shift.start)} - ${escapeHtml(row.shift.end)}</td>
    </tr>`).join('') : `<tr><td colspan="4" class="empty">后续暂无值班安排</td></tr>`;

    return `<section class="card table-card">
      <div class="view-toolbar" style="padding: 14px 16px;">
        <h2 style="margin: 0; font-size: 16px;">${escapeHtml(employee.name)} 的后续值班安排</h2>
      </div>
      <div class="table-wrap">
        <table class="employee-table">
          <thead><tr><th>日期</th><th>星期</th><th>班次</th><th>时间</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </section>`;
  }

  function renderUnavailableChips() {
    if (employeeDraft.unavailableDates.length === 0) {
      return '<span class="muted">尚未添加不可用日期</span>';
    }
    return employeeDraft.unavailableDates.map((dateKey) => `<span class="tag unavailable">${escapeHtml(dateKey)}<button type="button" data-action="remove-unavailable" data-date="${escapeAttr(dateKey)}" title="移除">×</button></span>`).join('');
  }

  function renderEmployees() {
    const editing = Boolean(employeeDraft.id);
    const shiftPrefs = state.shifts.map((shift) => `<label><input type="checkbox" name="empPref" value="${escapeAttr(shift.id)}" ${employeeDraft.shiftPreferences.includes(shift.id) ? 'checked' : ''}> ${escapeHtml(shift.name)}</label>`).join('');
    const employeeItems = state.employees.map((employee) => {
      const prefTags = employee.shiftPreferences.map((shiftId) => {
        const shift = findShift(shiftId);
        return shift ? `<span class="tag">${escapeHtml(shift.name)}</span>` : '';
      }).join('');
      const unavailableTags = employee.unavailableDates.map((dateKey) => `<span class="tag unavailable">${escapeHtml(dateKey)}</span>`).join('');
      return `<li class="entity-item">
        <div class="entity-main">
          <strong>${escapeHtml(employee.name)}</strong>
          <span class="muted">${escapeHtml(employee.position || '未填写岗位')} · 每周上限 ${employee.maxDaysPerWeek} 天</span>
          <div class="entity-tags">${prefTags}${unavailableTags}</div>
        </div>
        <div class="entity-actions">
          <button type="button" class="btn-link" data-action="edit-employee" data-id="${escapeAttr(employee.id)}">编辑</button>
          <button type="button" class="btn-link danger" data-action="delete-employee" data-id="${escapeAttr(employee.id)}">删除</button>
        </div>
      </li>`;
    }).join('');

    return `<div class="view split-view">
      <section class="card">
        <h2 style="margin: 0 0 14px; font-size: 16px;">${editing ? '编辑员工' : '添加员工'}</h2>
        <div class="form-grid">
          <label>姓名<input id="empName" type="text" value="${escapeAttr(employeeDraft.name)}" placeholder="例如：张三"></label>
          <label>岗位<input id="empPosition" type="text" value="${escapeAttr(employeeDraft.position)}" placeholder="例如：前台"></label>
          <label>每周可工作天数上限<input id="empMaxDays" type="number" min="0" max="7" value="${employeeDraft.maxDaysPerWeek}"></label>
        </div>
        <fieldset>
          <legend>班次偏好</legend>
          ${shiftPrefs ? `<div class="pref-list">${shiftPrefs}</div>` : '<div class="muted">请先在「班次配置」中添加班次。</div>'}
        </fieldset>
        <fieldset>
          <legend>请假 / 外出等不可用日期</legend>
          <div class="date-picker-row">
            <input id="unavailableDateInput" type="date" min="${escapeAttr(todayKey())}">
            <button type="button" class="btn" data-action="add-unavailable">添加日期</button>
          </div>
          <div id="unavailableChips" class="chip-list">${renderUnavailableChips()}</div>
        </fieldset>
        <div class="form-actions">
          <button type="button" class="btn btn-primary" data-action="save-employee">${editing ? '保存修改' : '添加员工'}</button>
          ${editing ? '<button type="button" class="btn" data-action="cancel-employee">取消编辑</button>' : ''}
        </div>
      </section>
      <section class="card">
        <div class="view-toolbar" style="margin-bottom: 10px;">
          <h2 style="margin: 0; font-size: 16px;">团队成员</h2>
          <span class="muted">${state.employees.length} 人</span>
        </div>
        ${state.employees.length > 0 ? `<ul class="entity-list">${employeeItems}</ul>` : '<div class="empty">还没有员工，请先添加团队成员。</div>'}
      </section>
    </div>`;
  }

  function renderShifts() {
    const editing = Boolean(shiftDraft.id);
    const shiftItems = state.shifts.map((shift) => `<li class="entity-item">
      <div class="entity-main">
        <strong>${escapeHtml(shift.name)}</strong>
        <span class="muted">${escapeHtml(shift.start)} - ${escapeHtml(shift.end)} · 最低 ${shift.minStaff} 人</span>
        <div class="entity-tags"><span class="tag">${isNightShift(shift) ? '夜班' : isEarlyShift(shift) ? '早班' : '日间班'}</span></div>
      </div>
      <div class="entity-actions">
        <button type="button" class="btn-link" data-action="edit-shift" data-id="${escapeAttr(shift.id)}">编辑</button>
        <button type="button" class="btn-link danger" data-action="delete-shift" data-id="${escapeAttr(shift.id)}">删除</button>
      </div>
    </li>`).join('');

    return `<div class="view split-view">
      <section class="card">
        <h2 style="margin: 0 0 14px; font-size: 16px;">${editing ? '编辑班次' : '添加班次'}</h2>
        <div class="form-grid">
          <label>班次名称<input id="shiftName" type="text" value="${escapeAttr(shiftDraft.name)}" placeholder="例如：早班"></label>
          <label>开始时间<input id="shiftStart" type="text" value="${escapeAttr(shiftDraft.start)}" placeholder="08:00"></label>
          <label>结束时间<input id="shiftEnd" type="text" value="${escapeAttr(shiftDraft.end)}" placeholder="16:00，跨天可填 24:00"></label>
          <label>当日最低在岗人数<input id="shiftMin" type="number" min="0" max="99" value="${shiftDraft.minStaff}"></label>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-primary" data-action="save-shift">${editing ? '保存修改' : '添加班次'}</button>
          ${editing ? '<button type="button" class="btn" data-action="cancel-shift">取消编辑</button>' : ''}
        </div>
      </section>
      <section class="card">
        <div class="view-toolbar" style="margin-bottom: 10px;">
          <h2 style="margin: 0; font-size: 16px;">班次配置</h2>
          <span class="muted">${state.shifts.length} 个班次</span>
        </div>
        ${state.shifts.length > 0 ? `<ul class="entity-list">${shiftItems}</ul>` : '<div class="empty">还没有班次，请先添加。</div>'}
      </section>
    </div>`;
  }

  function resetEmployeeDraft() {
    employeeDraft = {
      id: null,
      name: '',
      position: '',
      maxDaysPerWeek: 5,
      shiftPreferences: [],
      unavailableDates: []
    };
  }

  function resetShiftDraft() {
    shiftDraft = {
      id: null,
      name: '',
      start: '08:00',
      end: '16:00',
      minStaff: 1
    };
  }

  function handleSaveEmployee() {
    const name = $('#empName').value.trim();
    if (!name) {
      showToast('请填写员工姓名');
      return;
    }

    const maxDaysValue = Number.parseInt($('#empMaxDays').value, 10);
    const maxDaysPerWeek = Number.isNaN(maxDaysValue) ? 5 : Math.min(7, Math.max(0, maxDaysValue));
    const shiftPreferences = $$('input[name="empPref"]:checked').map((input) => input.value);
    const employeeData = {
      name,
      position: $('#empPosition').value.trim(),
      maxDaysPerWeek,
      shiftPreferences,
      unavailableDates: employeeDraft.unavailableDates.slice()
    };

    const wasEditing = Boolean(employeeDraft.id);

    if (employeeDraft.id) {
      const employee = findEmployee(employeeDraft.id);
      if (employee) {
        Object.assign(employee, employeeData);
      }
    } else {
      state.employees.push(Object.assign({ id: genId('emp') }, employeeData));
    }

    resetEmployeeDraft();
    saveState();
    renderAll();
    showToast(wasEditing ? '员工已更新' : '员工已添加');
  }

  function handleCancelEmployee() {
    resetEmployeeDraft();
    renderAll();
  }

  function handleEditEmployee(employeeId) {
    const employee = findEmployee(employeeId);
    if (!employee) {
      return;
    }
    employeeDraft = {
      id: employee.id,
      name: employee.name,
      position: employee.position,
      maxDaysPerWeek: employee.maxDaysPerWeek,
      shiftPreferences: employee.shiftPreferences.slice(),
      unavailableDates: employee.unavailableDates.slice()
    };
    renderAll();
  }

  function handleDeleteEmployee(employeeId) {
    const employee = findEmployee(employeeId);
    if (!employee) {
      return;
    }
    if (!confirm(`确认删除员工「${employee.name}」？该员工在所有排班方案中的安排也会被移除。`)) {
      return;
    }

    state.employees = state.employees.filter((item) => item.id !== employeeId);
    state.plans.forEach((plan) => {
      Object.keys(plan.assignments).forEach((dateKey) => {
        Object.keys(plan.assignments[dateKey]).forEach((shiftId) => {
          setCellAssignments(plan, dateKey, shiftId, getCellAssignments(plan, dateKey, shiftId).filter((id) => id !== employeeId));
        });
      });
    });
    if (state.ui.employeeViewId === employeeId) {
      state.ui.employeeViewId = null;
    }
    saveState();
    renderAll();
    showToast('员工已删除');
  }

  function handleAddUnavailable() {
    const input = $('#unavailableDateInput');
    const value = input ? input.value : '';
    if (!value) {
      showToast('请选择不可用日期');
      return;
    }
    if (employeeDraft.unavailableDates.includes(value)) {
      showToast('该日期已在列表中');
      return;
    }
    employeeDraft.unavailableDates.push(value);
    employeeDraft.unavailableDates.sort();
    const chips = $('#unavailableChips');
    if (chips) {
      chips.innerHTML = renderUnavailableChips();
    }
    if (input) {
      input.value = '';
    }
  }

  function handleRemoveUnavailable(dateKey) {
    employeeDraft.unavailableDates = employeeDraft.unavailableDates.filter((date) => date !== dateKey);
    const chips = $('#unavailableChips');
    if (chips) {
      chips.innerHTML = renderUnavailableChips();
    }
  }

  function handleSaveShift() {
    const name = $('#shiftName').value.trim();
    const start = $('#shiftStart').value.trim();
    const end = $('#shiftEnd').value.trim();
    if (!name) {
      showToast('请填写班次名称');
      return;
    }
    if (!isValidTime(start) || !isValidTime(end)) {
      showToast('时间格式应为 HH:MM，例如 08:00 或 24:00');
      return;
    }

    const minValue = Number.parseInt($('#shiftMin').value, 10);
    const minStaff = Number.isNaN(minValue) ? 1 : Math.min(99, Math.max(0, minValue));
    const shiftData = { name, start, end, minStaff };

    if (shiftDraft.id) {
      const shift = findShift(shiftDraft.id);
      if (shift) {
        Object.assign(shift, shiftData);
      }
    } else {
      state.shifts.push(Object.assign({ id: genId('shift') }, shiftData));
    }

    resetShiftDraft();
    saveState();
    renderAll();
    showToast('班次已保存');
  }

  function handleCancelShift() {
    resetShiftDraft();
    renderAll();
  }

  function handleEditShift(shiftId) {
    const shift = findShift(shiftId);
    if (!shift) {
      return;
    }
    shiftDraft = {
      id: shift.id,
      name: shift.name,
      start: shift.start,
      end: shift.end,
      minStaff: shift.minStaff
    };
    renderAll();
  }

  function handleDeleteShift(shiftId) {
    const shift = findShift(shiftId);
    if (!shift) {
      return;
    }
    if (!confirm(`确认删除班次「${shift.name}」？相关排班单元格也会被清空。`)) {
      return;
    }

    state.shifts = state.shifts.filter((item) => item.id !== shiftId);
    state.employees.forEach((employee) => {
      employee.shiftPreferences = employee.shiftPreferences.filter((id) => id !== shiftId);
    });
    state.plans.forEach((plan) => {
      Object.keys(plan.assignments).forEach((dateKey) => {
        delete plan.assignments[dateKey][shiftId];
      });
    });
    saveState();
    renderAll();
    showToast('班次已删除');
  }

  function handleNewPlan() {
    const range = readDateRange();
    if (range.error) {
      showToast(range.error);
      return;
    }
    const plan = createPlan(range.start, range.end);
    saveState();
    renderAll();
    showToast(`已新建「${plan.name}」`);
  }

  function handleGeneratePlan() {
    const range = readDateRange();
    if (range.error) {
      showToast(range.error);
      return;
    }

    let plan = currentPlan();
    if (!plan) {
      plan = createPlan(range.start, range.end);
    } else {
      plan.startDate = range.start;
      plan.endDate = range.end;
      plan.month = range.start.slice(0, 7);
      state.ui.scheduleMonth = plan.month;
    }

    generatePlan(plan);
    const validation = validatePlan(plan);
    const shortageCount = Object.values(validation.shortage).filter((count) => count > 0).length;
    const conflictCount = Object.values(validation.cellViolations).filter((items) => items.length > 0).length;
    saveState();
    renderAll();

    if (shortageCount > 0 || conflictCount > 0) {
      showToast(`已生成，${shortageCount} 个缺口单元格，${conflictCount} 个冲突单元格`);
    } else {
      showToast('自动排班已生成');
    }
  }

  function handleDeletePlan() {
    const plan = currentPlan();
    if (!plan) {
      showToast('当前没有可删除的方案');
      return;
    }
    if (!confirm(`确认删除方案「${plan.name}」？`)) {
      return;
    }

    state.plans = state.plans.filter((item) => item.id !== plan.id);
    const remainingInMonth = plansForMonth(plan.month)[0] || state.plans[0] || null;
    state.currentPlanId = remainingInMonth ? remainingInMonth.id : null;
    state.ui.scheduleMonth = remainingInMonth ? remainingInMonth.month : todayMonth();
    saveState();
    renderAll();
    showToast('方案已删除');
  }

  function handleRemoveAssign(dateKey, shiftId, employeeId) {
    const plan = currentPlan();
    if (!plan) {
      return;
    }
    removeEmployeeFromCell(plan, dateKey, shiftId, employeeId);
    plan.updatedAt = new Date().toISOString();
    saveState();
    renderAll();
  }

  function handleCellAddSelect(select) {
    const employeeId = select.value;
    if (!employeeId) {
      return;
    }
    const plan = currentPlan();
    if (!plan) {
      showToast('请先生成排班方案');
      return;
    }
    addEmployeeToCell(plan, select.dataset.dateKey, select.dataset.shiftId, employeeId);
    plan.updatedAt = new Date().toISOString();
    saveState();
    renderAll();
  }

  function exportCsv() {
    const plan = currentPlan();
    if (!plan) {
      showToast('请先生成排班方案');
      return;
    }

    const validation = validatePlan(plan);
    const dates = planDates(plan);
    const header = ['班次'].concat(dates.map((dateKey) => `${formatMonthDay(dateKey)} ${weekdayName(dateKey)}`));
    const rows = state.shifts.map((shift) => {
      const row = [`${shift.name}(${shift.start}-${shift.end})`];
      dates.forEach((dateKey) => {
        const cellKey = `${dateKey}|${shift.id}`;
        const names = getCellAssignments(plan, dateKey, shift.id).map((employeeId) => {
          const employee = findEmployee(employeeId);
          return employee ? employee.name : employeeId;
        });
        let text = names.join('、');
        const deficit = validation.shortage[cellKey] || 0;
        if (deficit > 0) {
          text += `${text ? ' ' : ''}[缺${deficit}人]`;
        }
        if ((validation.cellViolations[cellKey] || []).length > 0) {
          text += `${text ? ' ' : ''}[冲突]`;
        }
        row.push(text);
      });
      return row;
    });

    const csv = '\uFEFF' + [header].concat(rows).map((row) => row.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `排班方案_${plan.name}_${plan.month}.csv`.replace(/[\\/:*?"<>|]/g, '_');
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    showToast('CSV 已导出');
  }

  function onDocumentClick(event) {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) {
      return;
    }

    const action = actionTarget.dataset.action;
    if (action === 'nav') {
      state.ui.activeView = actionTarget.dataset.view;
      saveState();
      renderAll();
      return;
    }

    if (action === 'export-csv') {
      exportCsv();
      return;
    }

    if (action === 'toggle-employee-view') {
      if (state.ui.employeeViewId) {
        state.ui.employeeViewId = null;
      } else if (state.employees.length > 0) {
        state.ui.employeeViewId = state.employees[0].id;
      } else {
        showToast('请先在员工管理中添加员工');
        return;
      }
      saveState();
      renderAll();
      return;
    }

    if (action === 'new-plan') {
      handleNewPlan();
      return;
    }
    if (action === 'generate-plan') {
      handleGeneratePlan();
      return;
    }
    if (action === 'delete-plan') {
      handleDeletePlan();
      return;
    }
    if (action === 'save-employee') {
      handleSaveEmployee();
      return;
    }
    if (action === 'cancel-employee') {
      handleCancelEmployee();
      return;
    }
    if (action === 'edit-employee') {
      handleEditEmployee(actionTarget.dataset.id);
      return;
    }
    if (action === 'delete-employee') {
      handleDeleteEmployee(actionTarget.dataset.id);
      return;
    }
    if (action === 'add-unavailable') {
      handleAddUnavailable();
      return;
    }
    if (action === 'remove-unavailable') {
      handleRemoveUnavailable(actionTarget.dataset.date);
      return;
    }
    if (action === 'save-shift') {
      handleSaveShift();
      return;
    }
    if (action === 'cancel-shift') {
      handleCancelShift();
      return;
    }
    if (action === 'edit-shift') {
      handleEditShift(actionTarget.dataset.id);
      return;
    }
    if (action === 'delete-shift') {
      handleDeleteShift(actionTarget.dataset.id);
      return;
    }
    if (action === 'remove-assign') {
      handleRemoveAssign(actionTarget.dataset.dateKey, actionTarget.dataset.shiftId, actionTarget.dataset.empId);
    }
  }

  function onDocumentChange(event) {
    const target = event.target;
    if (target.id === 'monthSelect') {
      const month = target.value;
      if (!month) {
        return;
      }
      state.ui.scheduleMonth = month;
      const plans = plansForMonth(month);
      const current = currentPlan();
      if (!current || current.month !== month) {
        state.currentPlanId = plans[0] ? plans[0].id : null;
      }
      saveState();
      renderAll();
      return;
    }

    if (target.id === 'planSelect') {
      state.currentPlanId = target.value || null;
      saveState();
      renderAll();
      return;
    }

    if (target.matches('[data-role="cell-add-select"]')) {
      handleCellAddSelect(target);
      return;
    }

    if (target.id === 'employeeViewSelect') {
      state.ui.employeeViewId = target.value || null;
      saveState();
      renderAll();
    }
  }

  function init() {
    loadState();
    setSaveStatus('已加载');
    renderAll();
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('change', onDocumentChange);
    window.addEventListener('beforeunload', saveState);
  }

  init();
})();
