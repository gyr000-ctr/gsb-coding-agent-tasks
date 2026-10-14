(function () {
  'use strict';

  const Scheduler = window.Scheduler;
  const STORAGE_KEY = 'shiftSchedulerState.v1';

  let state = createDefaultState();
  let saveTimer = null;

  function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/\n/g, '&#10;');
  }

  function createDefaultState() {
    const earlyShift = { id: 'shift_early', name: '早班', start: '08:00', end: '16:00', minStaff: 1, isNight: false };
    const midShift = { id: 'shift_mid', name: '中班', start: '16:00', end: '24:00', minStaff: 1, isNight: false };
    const nightShift = { id: 'shift_night', name: '晚班', start: '00:00', end: '08:00', minStaff: 1, isNight: true };

    return {
      version: 1,
      page: 'employees',
      employeeViewId: null,
      activeScheduleId: null,
      shifts: [earlyShift, midShift, nightShift],
      employees: [
        {
          id: 'emp_zhang',
          name: '张伟',
          role: '值班主管',
          maxDaysPerWeek: 5,
          shiftPreferences: [earlyShift.id, midShift.id],
          unavailableDates: [],
        },
        {
          id: 'emp_li',
          name: '李娜',
          role: '客服专员',
          maxDaysPerWeek: 5,
          shiftPreferences: [midShift.id, nightShift.id],
          unavailableDates: [],
        },
        {
          id: 'emp_wang',
          name: '王强',
          role: '客服专员',
          maxDaysPerWeek: 4,
          shiftPreferences: [nightShift.id],
          unavailableDates: [],
        },
        {
          id: 'emp_zhao',
          name: '赵敏',
          role: '客服专员',
          maxDaysPerWeek: 5,
          shiftPreferences: [earlyShift.id, nightShift.id],
          unavailableDates: [],
        },
      ],
      schedules: [],
    };
  }

  function normalizeState(raw) {
    const base = createDefaultState();
    if (!raw || typeof raw !== 'object') return base;

    const normalized = Object.assign({}, base, raw);
    normalized.shifts = Array.isArray(raw.shifts) ? raw.shifts : base.shifts;
    normalized.employees = Array.isArray(raw.employees) ? raw.employees : base.employees;
    normalized.schedules = Array.isArray(raw.schedules) ? raw.schedules : [];
    normalized.page = ['employees', 'shifts', 'schedule', 'employeeView'].includes(raw.page) ? raw.page : 'employees';
    normalized.employeeViewId = raw.employeeViewId || null;
    normalized.activeScheduleId = raw.activeScheduleId || null;

    normalized.employees.forEach((employee) => {
      employee.id = employee.id || uid('emp');
      employee.name = employee.name || '未命名员工';
      employee.role = employee.role || '';
      employee.maxDaysPerWeek = employee.maxDaysPerWeek === '' || employee.maxDaysPerWeek === null || employee.maxDaysPerWeek === undefined
        ? null
        : Number(employee.maxDaysPerWeek);
      employee.shiftPreferences = Array.isArray(employee.shiftPreferences) ? employee.shiftPreferences : [];
      employee.unavailableDates = Array.isArray(employee.unavailableDates) ? employee.unavailableDates : [];
    });

    normalized.shifts.forEach((shift) => {
      shift.id = shift.id || uid('shift');
      shift.name = shift.name || '未命名班次';
      shift.start = shift.start || '09:00';
      shift.end = shift.end || '17:00';
      shift.minStaff = Math.max(0, Number(shift.minStaff) || 0);
      shift.isNight = Boolean(shift.isNight);
    });

    normalized.schedules.forEach((schedule) => {
      schedule.id = schedule.id || uid('sch');
      schedule.name = schedule.name || '未命名方案';
      schedule.startDate = schedule.startDate || Scheduler.todayString();
      schedule.endDate = schedule.endDate || schedule.startDate;
      schedule.assignments = schedule.assignments && typeof schedule.assignments === 'object' ? schedule.assignments : {};
      ensureScheduleCells(schedule);
    });

    if (!normalized.schedules.some((schedule) => schedule.id === normalized.activeScheduleId)) {
      normalized.activeScheduleId = normalized.schedules[0]?.id || null;
    }

    return normalized;
  }

  async function loadState() {
    let loaded = null;
    try {
      if (window.desktop && typeof window.desktop.loadState === 'function') {
        loaded = await window.desktop.loadState();
      } else {
        loaded = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      }
    } catch (error) {
      console.error('读取状态失败', error);
    }
    state = normalizeState(loaded);
  }

  async function saveStateNow() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    state.savedAt = new Date().toISOString();
    try {
      if (window.desktop && typeof window.desktop.saveState === 'function') {
        await window.desktop.saveState(state);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
      setSaveStatus('已自动保存');
    } catch (error) {
      console.error('保存状态失败', error);
      setSaveStatus('保存失败');
    }
  }

  function scheduleSave() {
    setSaveStatus('保存中…');
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveStateNow, 350);
  }

  function setSaveStatus(text) {
    const node = document.getElementById('saveStatus');
    if (node) node.textContent = text;
  }

  function toast(message) {
    const root = document.getElementById('toastRoot');
    if (!root) return;
    const item = document.createElement('div');
    item.className = 'toast';
    item.textContent = message;
    root.appendChild(item);
    setTimeout(() => item.remove(), 2400);
  }

  function getActiveSchedule() {
    if (!state.schedules.length) return null;
    return state.schedules.find((schedule) => schedule.id === state.activeScheduleId) || state.schedules[0];
  }

  function employeeName(employeeId) {
    const employee = state.employees.find((item) => item.id === employeeId);
    return employee ? employee.name : employeeId;
  }

  function shiftById(shiftId) {
    return state.shifts.find((shift) => shift.id === shiftId) || null;
  }

  function ensureScheduleCells(schedule) {
    if (!schedule || !schedule.startDate || !schedule.endDate) return;
    schedule.assignments = schedule.assignments || {};
    Scheduler.enumerateDates(schedule.startDate, schedule.endDate).forEach((date) => {
      schedule.assignments[date] = schedule.assignments[date] || {};
    });
  }

  function createEmptyAssignments(startDate, endDate) {
    const assignments = {};
    Scheduler.enumerateDates(startDate, endDate).forEach((date) => {
      assignments[date] = {};
    });
    return assignments;
  }

  function defaultScheduleRange() {
    const now = new Date();
    const mondayOffset = (8 - now.getDay()) % 7;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { startDate: Scheduler.toDateString(start), endDate: Scheduler.toDateString(end) };
  }

  function defaultScheduleName(startDate) {
    const parts = String(startDate).split('-');
    return `${Number(parts[0])}年${Number(parts[1])}月排班`;
  }

  function uniqueScheduleName(startDate) {
    const base = defaultScheduleName(startDate);
    if (!state.schedules.some((schedule) => schedule.name === base)) return base;
    let index = 2;
    while (state.schedules.some((schedule) => schedule.name === `${base}(${index})`)) {
      index += 1;
    }
    return `${base}(${index})`;
  }

  function validateRange(startDate, endDate) {
    if (!startDate || !endDate) return '请选择开始和结束日期。';
    if (startDate > endDate) return '开始日期不能晚于结束日期。';
    const days = Scheduler.daysBetween(startDate, endDate);
    if (days < 1) return '排班周期至少为 1 天。';
    if (days > 14) return '排班周期最长支持 14 天（一至两周）。';
    const today = Scheduler.todayString();
    if (startDate < today) return '开始日期不能早于今天。';
    return null;
  }

  function setActivePage(page) {
    document.querySelectorAll('.nav-item').forEach((button) => {
      button.classList.toggle('active', button.dataset.page === page);
    });
  }

  function render() {
    setActivePage(state.page);
    if (state.page === 'employees') renderEmployeesPage();
    if (state.page === 'shifts') renderShiftsPage();
    if (state.page === 'schedule') renderSchedulePage();
    if (state.page === 'employeeView') renderEmployeeViewPage();
  }

  function renderEmployeesPage() {
    const main = document.getElementById('main');
    main.innerHTML = `
      <div class="page-head">
        <div>
          <h2>员工管理</h2>
          <p>维护岗位、每周可工作天数上限、班次偏好，以及请假或外出等不可用日期。</p>
        </div>
        <button id="addEmployeeButton" class="button" type="button">+ 添加员工</button>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table class="employee-table">
            <thead>
              <tr>
                <th style="width:130px">姓名</th>
                <th style="width:150px">岗位</th>
                <th style="width:110px">每周上限</th>
                <th>班次偏好</th>
                <th style="width:230px">不可用日期</th>
                <th style="width:80px">操作</th>
              </tr>
            </thead>
            <tbody>
              ${state.employees.map((employee) => employeeRowHtml(employee)).join('')}
            </tbody>
          </table>
        </div>
        <p class="hint" style="margin-top:12px">每周上限留空表示不限制；0 表示该员工本周不参与排班。</p>
      </div>
    `;

    document.getElementById('addEmployeeButton').addEventListener('click', addEmployee);
    bindEmployeeTableEvents(main.querySelector('tbody'));
  }

  function employeeRowHtml(employee) {
    const preferences = state.shifts.map((shift) => {
      const checked = (employee.shiftPreferences || []).includes(shift.id) ? 'checked' : '';
      return `<label class="check-label"><input type="checkbox" data-shift-pref="${escapeAttr(shift.id)}" ${checked}> ${escapeHtml(shift.name)}</label>`;
    }).join('');

    const unavailableDates = [...(employee.unavailableDates || [])].sort();
    const chips = unavailableDates.map((date) => {
      return `<span class="chip">${escapeHtml(date)}<button type="button" data-remove-date="${escapeAttr(date)}" title="移除">×</button></span>`;
    }).join('');

    return `
      <tr data-employee-id="${escapeAttr(employee.id)}">
        <td><input class="input" data-field="name" value="${escapeAttr(employee.name)}" placeholder="姓名"></td>
        <td><input class="input" data-field="role" value="${escapeAttr(employee.role || '')}" placeholder="例如：客服专员"></td>
        <td><input class="input" data-field="maxDaysPerWeek" type="number" min="0" max="7" value="${employee.maxDaysPerWeek === null || employee.maxDaysPerWeek === undefined ? '' : employee.maxDaysPerWeek}" placeholder="不限"></td>
        <td><div class="preference-list">${preferences || '<span class="muted">暂无班次</span>'}</div></td>
        <td>
          <input class="input" type="date" data-add-date>
          <div class="chip-list">${chips}</div>
        </td>
        <td><button class="button button-danger button-small" type="button" data-delete-employee>删除</button></td>
      </tr>
    `;
  }

  function bindEmployeeTableEvents(tbody) {
    tbody.querySelectorAll('tr[data-employee-id]').forEach((row) => {
      const employeeId = row.dataset.employeeId;
      const employee = state.employees.find((item) => item.id === employeeId);
      if (!employee) return;

      row.querySelectorAll('input[data-field]').forEach((input) => {
        input.addEventListener('input', () => {
          const field = input.dataset.field;
          if (field === 'maxDaysPerWeek') {
            employee.maxDaysPerWeek = input.value === '' ? null : Number(input.value);
          } else {
            employee[field] = input.value;
          }
          scheduleSave();
        });
      });

      row.querySelectorAll('input[data-shift-pref]').forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
          employee.shiftPreferences = Array.from(row.querySelectorAll('input[data-shift-pref]:checked')).map((item) => item.dataset.shiftPref);
          scheduleSave();
        });
      });

      const dateInput = row.querySelector('input[data-add-date]');
      if (dateInput) {
        dateInput.addEventListener('change', () => {
          if (!dateInput.value) return;
          if (!employee.unavailableDates.includes(dateInput.value)) {
            employee.unavailableDates.push(dateInput.value);
            employee.unavailableDates.sort();
            scheduleSave();
            renderEmployeesPage();
          }
        });
      }

      row.querySelectorAll('[data-remove-date]').forEach((button) => {
        button.addEventListener('click', () => {
          employee.unavailableDates = employee.unavailableDates.filter((date) => date !== button.dataset.removeDate);
          scheduleSave();
          renderEmployeesPage();
        });
      });

      row.querySelector('[data-delete-employee]').addEventListener('click', () => {
        if (!confirm(`确认删除员工“${employee.name}”吗？`)) return;
        state.employees = state.employees.filter((item) => item.id !== employeeId);
        state.employeeViewId = state.employeeViewId === employeeId ? null : state.employeeViewId;
        scheduleSave();
        renderEmployeesPage();
      });
    });
  }

  function addEmployee() {
    const id = uid('emp');
    state.employees.push({
      id,
      name: `员工${state.employees.length + 1}`,
      role: '',
      maxDaysPerWeek: 5,
      shiftPreferences: [],
      unavailableDates: [],
    });
    scheduleSave();
    renderEmployeesPage();
  }

  function renderShiftsPage() {
    const main = document.getElementById('main');
    main.innerHTML = `
      <div class="page-head">
        <div>
          <h2>班次配置</h2>
          <p>自定义班次名称、起止时间与当日最低在岗人数。</p>
        </div>
        <button id="addShiftButton" class="button" type="button">+ 添加班次</button>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table class="shift-table">
            <thead>
              <tr>
                <th style="width:170px">班次名称</th>
                <th style="width:130px">开始时间</th>
                <th style="width:130px">结束时间</th>
                <th style="width:120px">最低人数</th>
                <th>班次属性</th>
                <th style="width:80px">操作</th>
              </tr>
            </thead>
            <tbody>
              ${state.shifts.map((shift) => shiftRowHtml(shift)).join('')}
            </tbody>
          </table>
        </div>
        <p class="hint" style="margin-top:12px">时间格式为 HH:MM，结束时间可填写 24:00。勾选“晚班”后，该班次次日不可为同一员工安排早班。</p>
      </div>
    `;

    document.getElementById('addShiftButton').addEventListener('click', addShift);
    bindShiftTableEvents(main.querySelector('tbody'));
  }

  function shiftRowHtml(shift) {
    return `
      <tr data-shift-id="${escapeAttr(shift.id)}">
        <td><input class="input" data-field="name" value="${escapeAttr(shift.name)}" placeholder="班次名称"></td>
        <td><input class="input" data-field="start" value="${escapeAttr(shift.start)}" placeholder="08:00"></td>
        <td><input class="input" data-field="end" value="${escapeAttr(shift.end)}" placeholder="16:00 或 24:00"></td>
        <td><input class="input" data-field="minStaff" type="number" min="1" step="1" value="${Number(shift.minStaff) || 0}"></td>
        <td><label class="check-label"><input type="checkbox" data-field="isNight" ${shift.isNight ? 'checked' : ''}> 晚班</label></td>
        <td><button class="button button-danger button-small" type="button" data-delete-shift>删除</button></td>
      </tr>
    `;
  }

  function bindShiftTableEvents(tbody) {
    tbody.querySelectorAll('tr[data-shift-id]').forEach((row) => {
      const shiftId = row.dataset.shiftId;
      const shift = state.shifts.find((item) => item.id === shiftId);
      if (!shift) return;

      row.querySelectorAll('input[data-field]').forEach((input) => {
        input.addEventListener('input', () => {
          const field = input.dataset.field;
          if (field === 'minStaff') {
            shift.minStaff = Math.max(0, Number(input.value) || 0);
          } else if (field === 'isNight') {
            shift.isNight = input.checked;
          } else {
            shift[field] = input.value;
          }
          scheduleSave();
        });
      });

      row.querySelector('[data-delete-shift]').addEventListener('click', () => {
        if (!confirm(`确认删除班次“${shift.name}”吗？相关排班单元格也会被移除。`)) return;
        state.shifts = state.shifts.filter((item) => item.id !== shiftId);
        state.employees.forEach((employee) => {
          employee.shiftPreferences = employee.shiftPreferences.filter((id) => id !== shiftId);
        });
        state.schedules.forEach((schedule) => {
          Object.values(schedule.assignments || {}).forEach((day) => {
            delete day[shiftId];
          });
        });
        scheduleSave();
        renderShiftsPage();
      });
    });
  }

  function addShift() {
    state.shifts.push({
      id: uid('shift'),
      name: `新班次${state.shifts.length + 1}`,
      start: '09:00',
      end: '17:00',
      minStaff: 1,
      isNight: false,
    });
    scheduleSave();
    renderShiftsPage();
  }

  function renderSchedulePage() {
    const main = document.getElementById('main');
    if (!state.schedules.length) {
      renderNoSchedule(main);
      return;
    }

    if (!state.schedules.some((schedule) => schedule.id === state.activeScheduleId)) {
      state.activeScheduleId = state.schedules[0].id;
    }
    const schedule = getActiveSchedule();
    ensureScheduleCells(schedule);
    const violations = Scheduler.validateSchedule(schedule, state.employees, state.shifts);

    main.innerHTML = `
      <div class="page-head">
        <div>
          <h2>排班表</h2>
          <p>日期为列、班次为行；点击单元格可直接调整人员分配。</p>
        </div>
      </div>
      <div class="card">
        <div class="schedule-toolbar">
          <div class="toolbar-group">
            <div class="toolbar-item" style="min-width:190px">
              <label class="field-label">当前方案</label>
              <select id="scheduleSelect" class="select">
                ${state.schedules.map((item) => `<option value="${escapeAttr(item.id)}" ${item.id === schedule.id ? 'selected' : ''}>${escapeHtml(item.name)}（${item.startDate} 至 ${item.endDate}）</option>`).join('')}
              </select>
            </div>
            <div class="toolbar-item" style="min-width:220px">
              <label class="field-label">方案名称</label>
              <input id="scheduleNameInput" class="input" value="${escapeAttr(schedule.name)}">
            </div>
            <button id="newScheduleButton" class="button button-secondary" type="button">新建</button>
            <button id="duplicateScheduleButton" class="button button-secondary" type="button">复制</button>
            <button id="deleteScheduleButton" class="button button-danger" type="button">删除</button>
          </div>
          <div class="toolbar-group">
            <div class="toolbar-item" style="min-width:150px">
              <label class="field-label">开始日期</label>
              <input id="startDateInput" class="input" type="date" min="${Scheduler.todayString()}" value="${escapeAttr(schedule.startDate)}">
            </div>
            <div class="toolbar-item" style="min-width:150px">
              <label class="field-label">结束日期</label>
              <input id="endDateInput" class="input" type="date" min="${Scheduler.todayString()}" value="${escapeAttr(schedule.endDate)}">
            </div>
            <button id="autoGenerateButton" class="button" type="button">⚡ 自动排班</button>
            <button id="exportCsvButton" class="button button-secondary" type="button">导出 CSV</button>
          </div>
        </div>
        ${state.shifts.length ? scheduleTableHtml(schedule, violations) : '<div class="empty-state"><h2>尚未配置班次</h2><p>请先在“班次配置”中添加至少一个班次。</p></div>'}
        <div class="schedule-legend">
          <span class="legend-item"><i class="legend-swatch swatch-weekend"></i> 周末列</span>
          <span class="legend-item"><i class="legend-swatch swatch-shortage"></i> 人数缺口</span>
          <span class="legend-item"><i class="legend-swatch swatch-conflict"></i> 规则冲突（悬停查看原因）</span>
        </div>
      </div>
    `;

    bindScheduleEvents(main, schedule);
  }

  function scheduleTableHtml(schedule, violations) {
    const dates = Scheduler.enumerateDates(schedule.startDate, schedule.endDate);
    const headerCells = dates.map((date) => {
      const weekendClass = Scheduler.isWeekend(date) ? 'weekend-col' : '';
      return `<th class="${weekendClass}">${date}<br><span class="muted">${Scheduler.weekdayName(date)}</span></th>`;
    }).join('');

    const bodyRows = state.shifts.map((shift) => {
      const cells = dates.map((date) => {
        const day = schedule.assignments[date] || {};
        const cell = day[shift.id] || { employeeIds: [], shortage: 0 };
        const ids = Scheduler.normalizeEmployeeIds(cell);
        const minStaff = Math.max(0, Number(shift.minStaff) || 0);
        const shortage = Math.max(0, minStaff - ids.length);
        const names = ids.map((id) => employeeName(id) || id).join('、');
        const cellViolations = violations[`${date}|${shift.id}`] || [];
        const classes = ['assign-cell'];
        if (Scheduler.isWeekend(date)) classes.push('weekend-col');
        if (shortage > 0) classes.push('shortage');
        if (cellViolations.length) classes.push('conflict');

        const title = [];
        if (shortage > 0) title.push(`缺 ${shortage} 人`);
        title.push(...cellViolations);

        return `
          <td class="${classes.join(' ')}" data-date="${escapeAttr(date)}" data-shift-id="${escapeAttr(shift.id)}" title="${escapeAttr(title.join('\n'))}">
            <div class="cell-names ${ids.length ? '' : 'cell-empty'}">${ids.length ? escapeHtml(names) : '—'}</div>
            ${shortage > 0 ? `<div class="shortage-badge">缺${shortage}人</div>` : ''}
          </td>
        `;
      }).join('');
      return `<tr><th>${escapeHtml(Scheduler.formatShiftLabel(shift))}</th>${cells}</tr>`;
    }).join('');

    return `
      <div class="table-wrap">
        <table class="schedule-table">
          <thead>
            <tr>
              <th>班次</th>
              ${headerCells}
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    `;
  }

  function bindScheduleEvents(main, schedule) {
    main.querySelector('#scheduleSelect').addEventListener('change', (event) => {
      state.activeScheduleId = event.target.value;
      scheduleSave();
      renderSchedulePage();
    });

    main.querySelector('#scheduleNameInput').addEventListener('change', (event) => {
      schedule.name = event.target.value.trim() || '未命名方案';
      scheduleSave();
      renderSchedulePage();
    });

    main.querySelector('#newScheduleButton').addEventListener('click', () => {
      openNewScheduleModal();
    });

    main.querySelector('#duplicateScheduleButton').addEventListener('click', duplicateActiveSchedule);
    main.querySelector('#deleteScheduleButton').addEventListener('click', deleteActiveSchedule);

    main.querySelector('#startDateInput').addEventListener('change', (event) => {
      schedule.startDate = event.target.value;
      if (schedule.endDate < schedule.startDate) schedule.endDate = schedule.startDate;
      ensureScheduleCells(schedule);
      scheduleSave();
      renderSchedulePage();
    });

    main.querySelector('#endDateInput').addEventListener('change', (event) => {
      schedule.endDate = event.target.value;
      if (schedule.startDate > schedule.endDate) schedule.startDate = schedule.endDate;
      ensureScheduleCells(schedule);
      scheduleSave();
      renderSchedulePage();
    });

    main.querySelector('#autoGenerateButton').addEventListener('click', autoGenerateActiveSchedule);
    main.querySelector('#exportCsvButton').addEventListener('click', exportActiveCsv);

    const table = main.querySelector('.schedule-table');
    if (table) {
      table.addEventListener('click', (event) => {
        const cell = event.target.closest('td.assign-cell');
        if (!cell) return;
        openAssignmentModal(cell.dataset.date, cell.dataset.shiftId);
      });
    }
  }

  function renderNoSchedule(main) {
    const range = defaultScheduleRange();
    const today = Scheduler.todayString();
    main.innerHTML = `
      <div class="page-head">
        <div>
          <h2>排班表</h2>
          <p>创建一至两周的排班方案后即可自动生成排班表。</p>
        </div>
      </div>
      <div class="card">
        <div class="empty-state">
          <h2>还没有排班方案</h2>
          <p>选择未来一至两周的日期范围，创建第一个排班方案。</p>
          <div class="form-grid" style="max-width:680px;margin:22px auto 0;text-align:left">
            <div>
              <label class="field-label">方案名称</label>
              <input id="newScheduleName" class="input" value="${escapeAttr(uniqueScheduleName(range.startDate))}">
            </div>
            <div>
              <label class="field-label">开始日期</label>
              <input id="newScheduleStart" class="input" type="date" min="${today}" value="${range.startDate}">
            </div>
            <div>
              <label class="field-label">结束日期</label>
              <input id="newScheduleEnd" class="input" type="date" min="${today}" value="${range.endDate}">
            </div>
            <div>
              <button id="createScheduleButton" class="button" type="button" style="width:100%">创建方案</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('createScheduleButton').addEventListener('click', () => {
      const name = document.getElementById('newScheduleName').value.trim() || uniqueScheduleName(document.getElementById('newScheduleStart').value);
      createSchedule(name, document.getElementById('newScheduleStart').value, document.getElementById('newScheduleEnd').value);
    });
  }

  function openNewScheduleModal() {
    const range = defaultScheduleRange();
    const modalRoot = document.getElementById('modalRoot');
    modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <div class="modal-header">
            <div>
              <h3>新建排班方案</h3>
              <p>可创建多份按月或按周保存的方案，并随时切换查看。</p>
            </div>
            <button class="modal-close" type="button" data-close-modal>×</button>
          </div>
          <div class="modal-body">
            <div class="form-grid">
              <div>
                <label class="field-label">方案名称</label>
                <input id="modalScheduleName" class="input" value="${escapeAttr(uniqueScheduleName(range.startDate))}">
              </div>
              <div>
                <label class="field-label">开始日期</label>
                <input id="modalScheduleStart" class="input" type="date" min="${Scheduler.todayString()}" value="${range.startDate}">
              </div>
              <div>
                <label class="field-label">结束日期</label>
                <input id="modalScheduleEnd" class="input" type="date" min="${Scheduler.todayString()}" value="${range.endDate}">
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="button button-secondary" type="button" data-close-modal>取消</button>
            <button id="confirmCreateScheduleButton" class="button" type="button">创建</button>
          </div>
        </div>
      </div>
    `;

    modalRoot.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModal));
    modalRoot.querySelector('.modal-backdrop').addEventListener('click', (event) => {
      if (event.target.classList.contains('modal-backdrop')) closeModal();
    });
    modalRoot.querySelector('#confirmCreateScheduleButton').addEventListener('click', () => {
      const name = modalRoot.querySelector('#modalScheduleName').value.trim() || uniqueScheduleName(modalRoot.querySelector('#modalScheduleStart').value);
      createSchedule(name, modalRoot.querySelector('#modalScheduleStart').value, modalRoot.querySelector('#modalScheduleEnd').value);
    });
  }

  function createSchedule(name, startDate, endDate) {
    const error = validateRange(startDate, endDate);
    if (error) {
      toast(error);
      return;
    }
    const schedule = {
      id: uid('sch'),
      name,
      startDate,
      endDate,
      assignments: createEmptyAssignments(startDate, endDate),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.schedules.push(schedule);
    state.activeScheduleId = schedule.id;
    state.page = 'schedule';
    scheduleSave();
    closeModal();
    render();
    toast('排班方案已创建');
  }

  function duplicateActiveSchedule() {
    const schedule = getActiveSchedule();
    if (!schedule) return;
    const copy = JSON.parse(JSON.stringify(schedule));
    copy.id = uid('sch');
    copy.name = `${schedule.name} 副本`;
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = new Date().toISOString();
    state.schedules.push(copy);
    state.activeScheduleId = copy.id;
    scheduleSave();
    renderSchedulePage();
    toast('已复制当前方案');
  }

  function deleteActiveSchedule() {
    const schedule = getActiveSchedule();
    if (!schedule) return;
    if (!confirm(`确认删除方案“${schedule.name}”吗？此操作不可恢复。`)) return;
    state.schedules = state.schedules.filter((item) => item.id !== schedule.id);
    state.activeScheduleId = state.schedules[0]?.id || null;
    scheduleSave();
    renderSchedulePage();
  }

  function autoGenerateActiveSchedule() {
    const schedule = getActiveSchedule();
    if (!schedule) return;
    const error = validateRange(schedule.startDate, schedule.endDate);
    if (error) {
      toast(error);
      return;
    }
    if (!state.employees.length) {
      toast('请先添加员工');
      return;
    }
    if (!state.shifts.length) {
      toast('请先配置班次');
      return;
    }
    if (!confirm(`将自动排班并覆盖 ${schedule.startDate} 至 ${schedule.endDate} 的现有安排，是否继续？`)) return;

    schedule.assignments = Scheduler.generateSchedule({
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      shifts: state.shifts,
      employees: state.employees,
    });
    schedule.updatedAt = new Date().toISOString();
    scheduleSave();
    renderSchedulePage();
    toast('自动排班完成');
  }

  function openAssignmentModal(date, shiftId) {
    const schedule = getActiveSchedule();
    if (!schedule) return;
    const shift = shiftById(shiftId);
    if (!shift) return;

    schedule.assignments[date] = schedule.assignments[date] || {};
    const cell = schedule.assignments[date][shiftId] || { employeeIds: [], shortage: 0 };
    const currentIds = Scheduler.normalizeEmployeeIds(cell);
    const minStaff = Math.max(0, Number(shift.minStaff) || 0);

    const modalRoot = document.getElementById('modalRoot');
    modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <div class="modal-header">
            <div>
              <h3>调整人员分配</h3>
              <p>${date} ${Scheduler.weekdayName(date)} · ${escapeHtml(Scheduler.formatShiftLabel(shift))} · 最低 ${minStaff} 人</p>
            </div>
            <button class="modal-close" type="button" data-close-modal>×</button>
          </div>
          <div class="modal-body">
            <p class="hint">当前选择 <strong id="modalSelectedCount">${currentIds.length}</strong> 人，${minStaff > currentIds.length ? `缺口 <strong>${minStaff - currentIds.length}</strong> 人` : '已满足最低人数'}。</p>
            <div class="employee-check-list">
              ${state.employees.map((employee) => {
                const checked = currentIds.includes(employee.id) ? 'checked' : '';
                return `
                  <div class="employee-check-card">
                    <label>
                      <input class="employee-check-input" type="checkbox" value="${escapeAttr(employee.id)}" ${checked}>
                      <span>${escapeHtml(employee.name)}</span>
                    </label>
                    <div class="role">${escapeHtml(employee.role || '未设置岗位')}</div>
                  </div>
                `;
              }).join('') || '<p class="muted">请先在员工管理中添加员工。</p>'}
            </div>
            <div id="modalValidation" class="validation-box">未检测到规则冲突。</div>
          </div>
          <div class="modal-footer">
            <button class="button button-secondary" type="button" data-close-modal>取消</button>
            <button id="saveAssignmentButton" class="button" type="button">保存调整</button>
          </div>
        </div>
      </div>
    `;

    const refreshValidation = () => {
      const checkedIds = Array.from(modalRoot.querySelectorAll('.employee-check-input:checked')).map((input) => input.value);
      const countNode = modalRoot.querySelector('#modalSelectedCount');
      if (countNode) countNode.textContent = checkedIds.length;
      const clone = cloneScheduleWithCell(schedule, date, shiftId, checkedIds);
      const violations = Scheduler.validateSchedule(clone, state.employees, state.shifts);
      const messages = violations[`${date}|${shiftId}`] || [];
      const box = modalRoot.querySelector('#modalValidation');
      if (!box) return;
      if (messages.length) {
        box.className = 'validation-box error';
        box.innerHTML = `<strong>当前调整存在规则冲突（仍可保存）：</strong><ul>${messages.map((message) => `<li>${escapeHtml(message)}</li>`).join('')}</ul>`;
      } else {
        box.className = 'validation-box';
        box.innerHTML = '未检测到规则冲突。';
      }
    };

    modalRoot.querySelectorAll('.employee-check-input').forEach((input) => input.addEventListener('change', refreshValidation));
    modalRoot.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModal));
    modalRoot.querySelector('.modal-backdrop').addEventListener('click', (event) => {
      if (event.target.classList.contains('modal-backdrop')) closeModal();
    });

    modalRoot.querySelector('#saveAssignmentButton').addEventListener('click', () => {
      const checkedIds = Array.from(modalRoot.querySelectorAll('.employee-check-input:checked')).map((input) => input.value);
      schedule.assignments[date][shiftId] = {
        employeeIds: checkedIds,
        shortage: Math.max(0, minStaff - checkedIds.length),
      };
      schedule.updatedAt = new Date().toISOString();
      scheduleSave();
      closeModal();
      renderSchedulePage();
      toast('人员分配已更新');
    });
  }

  function cloneScheduleWithCell(schedule, date, shiftId, employeeIds) {
    const clone = JSON.parse(JSON.stringify(schedule));
    clone.assignments = clone.assignments || {};
    Scheduler.enumerateDates(clone.startDate, clone.endDate).forEach((item) => {
      clone.assignments[item] = clone.assignments[item] || {};
    });
    const shift = shiftById(shiftId);
    const minStaff = shift ? Math.max(0, Number(shift.minStaff) || 0) : 0;
    clone.assignments[date][shiftId] = {
      employeeIds: [...employeeIds],
      shortage: Math.max(0, minStaff - employeeIds.length),
    };
    return clone;
  }

  function closeModal() {
    document.getElementById('modalRoot').innerHTML = '';
  }

  async function exportActiveCsv() {
    const schedule = getActiveSchedule();
    if (!schedule) return;
    ensureScheduleCells(schedule);
    const csv = Scheduler.buildScheduleCsv(schedule, state.employees, state.shifts);
    const defaultName = `${sanitizeFileName(schedule.name)}.csv`;

    try {
      if (window.desktop && typeof window.desktop.exportCsv === 'function') {
        const result = await window.desktop.exportCsv({ defaultName, content: csv });
        if (!result.canceled) toast('CSV 已导出');
      } else {
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = defaultName;
        anchor.click();
        URL.revokeObjectURL(url);
        toast('CSV 已导出');
      }
    } catch (error) {
      console.error(error);
      toast('导出失败');
    }
  }

  function sanitizeFileName(value) {
    return String(value || '排班表').replace(/[\\/:*?"<>|]/g, '_');
  }

  function renderEmployeeViewPage() {
    const main = document.getElementById('main');
    const selectedId = state.employees.some((employee) => employee.id === state.employeeViewId)
      ? state.employeeViewId
      : state.employees[0]?.id || null;
    state.employeeViewId = selectedId;

    main.innerHTML = `
      <div class="page-head">
        <div>
          <h2>员工视图</h2>
          <p>仅展示所选员工在全部已保存方案中的后续值班安排。</p>
        </div>
      </div>
      <div class="card">
        <div style="max-width:340px;margin-bottom:16px">
          <label class="field-label">选择员工</label>
          <select id="employeeViewSelect" class="select">
            ${state.employees.map((employee) => `<option value="${escapeAttr(employee.id)}" ${employee.id === selectedId ? 'selected' : ''}>${escapeHtml(employee.name)}${employee.role ? `（${escapeHtml(employee.role)}）` : ''}</option>`).join('')}
          </select>
        </div>
        ${selectedId ? employeeUpcomingTableHtml(selectedId) : '<div class="empty-state"><h2>暂无员工</h2><p>请先在员工管理中添加员工。</p></div>'}
      </div>
    `;

    const select = main.querySelector('#employeeViewSelect');
    if (select) {
      select.addEventListener('change', (event) => {
        state.employeeViewId = event.target.value;
        scheduleSave();
        renderEmployeeViewPage();
      });
    }
  }

  function employeeUpcomingTableHtml(employeeId) {
    const upcoming = getUpcomingAssignments(employeeId);
    if (!upcoming.length) {
      return '<div class="empty-state"><h2>暂无后续值班安排</h2><p>该员工目前没有未来的已排班次。</p></div>';
    }

    const rows = upcoming.map((item) => {
      return `
        <tr>
          <td>${escapeHtml(item.date)}</td>
          <td>${Scheduler.weekdayName(item.date)}</td>
          <td>${escapeHtml(item.shift.name)}</td>
          <td>${escapeHtml(`${item.shift.start}–${item.shift.end}`)}</td>
          <td>${escapeHtml(item.schedule.name)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>星期</th>
              <th>班次</th>
              <th>时间</th>
              <th>所属方案</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="hint" style="margin-top:10px">共 ${upcoming.length} 个后续班次。</p>
    `;
  }

  function getUpcomingAssignments(employeeId) {
    const today = Scheduler.todayString();
    const results = [];
    state.schedules.forEach((schedule) => {
      Scheduler.enumerateDates(schedule.startDate, schedule.endDate).forEach((date) => {
        if (date < today) return;
        const day = schedule.assignments[date] || {};
        state.shifts.forEach((shift) => {
          const ids = Scheduler.normalizeEmployeeIds(day[shift.id]);
          if (ids.includes(employeeId)) {
            results.push({ date, shift, schedule });
          }
        });
      });
    });
    results.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return Scheduler.parseTimeToMinutes(a.shift.start) - Scheduler.parseTimeToMinutes(b.shift.start);
    });
    return results;
  }

  function bindGlobalEvents() {
    document.querySelectorAll('.nav-item').forEach((button) => {
      button.addEventListener('click', () => {
        state.page = button.dataset.page;
        scheduleSave();
        render();
      });
    });

    document.getElementById('saveNowButton').addEventListener('click', () => {
      saveStateNow();
      toast('已保存');
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && document.getElementById('modalRoot').innerHTML) {
        closeModal();
      }
    });
  }

  async function init() {
    await loadState();
    bindGlobalEvents();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
