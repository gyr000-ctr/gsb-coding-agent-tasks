(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Scheduler = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function parseDateString(value) {
    if (value instanceof Date) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    const parts = String(value || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) {
      throw new Error(`无效日期: ${value}`);
    }
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function toDateString(date) {
    const d = date instanceof Date ? date : parseDateString(date);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function todayString() {
    return toDateString(new Date());
  }

  function addDays(date, amount) {
    const d = parseDateString(date);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + amount);
  }

  function enumerateDates(startDate, endDate) {
    const dates = [];
    let cursor = parseDateString(startDate);
    const end = parseDateString(endDate);
    while (cursor <= end) {
      dates.push(toDateString(cursor));
      cursor = addDays(cursor, 1);
    }
    return dates;
  }

  function daysBetween(startDate, endDate) {
    const start = parseDateString(startDate);
    const end = parseDateString(endDate);
    return Math.round((end - start) / MS_PER_DAY) + 1;
  }

  function weekdayName(date) {
    return WEEKDAY_NAMES[parseDateString(date).getDay()];
  }

  function isWeekend(date) {
    const day = parseDateString(date).getDay();
    return day === 0 || day === 6;
  }

  function getWeekKey(date) {
    const d = parseDateString(date);
    const mondayOffset = (d.getDay() + 6) % 7;
    return toDateString(addDays(d, -mondayOffset));
  }

  function parseTimeToMinutes(value) {
    const text = String(value || '').trim();
    if (!text) return 0;
    const parts = text.split(':').map(Number);
    if (parts.length < 2 || parts.some(Number.isNaN)) return 0;
    return parts[0] * 60 + parts[1];
  }

  function isNightShift(shift) {
    if (!shift) return false;
    if (shift.isNight === true) return true;
    return /晚|夜/.test(shift.name || '');
  }

  function isMorningShift(shift, shifts) {
    if (!shift || !Array.isArray(shifts) || shifts.length === 0) return false;
    if (/早/.test(shift.name || '')) return true;

    const dayShifts = shifts.filter((item) => !isNightShift(item));
    if (dayShifts.length === 0 || isNightShift(shift)) return false;

    const earliestStart = Math.min(...dayShifts.map((item) => parseTimeToMinutes(item.start)));
    return parseTimeToMinutes(shift.start) === earliestStart && earliestStart < 12 * 60;
  }

  function formatShiftLabel(shift) {
    if (!shift) return '';
    return `${shift.name} ${shift.start || '--:--'}–${shift.end || '--:--'}`;
  }

  function normalizeEmployeeIds(cell) {
    if (!cell) return [];
    if (Array.isArray(cell.employeeIds)) return cell.employeeIds.filter(Boolean);
    if (Array.isArray(cell)) return cell.filter(Boolean);
    return [];
  }

  function normalizeMaxDays(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, Math.floor(parsed));
  }

  function countWorkDaysInWeek(empDateShifts, employeeId, date) {
    const weekKey = getWeekKey(date);
    let count = 0;
    for (const [workDate, shiftIds] of Object.entries(empDateShifts[employeeId] || {})) {
      if (getWeekKey(workDate) === weekKey && shiftIds.length > 0) {
        count += 1;
      }
    }
    return count;
  }

  function countConsecutiveEnding(empDateShifts, employeeId, date) {
    let cursor = parseDateString(date);
    let count = 0;
    while (empDateShifts[employeeId] && (empDateShifts[employeeId][toDateString(cursor)] || []).length > 0) {
      count += 1;
      cursor = addDays(cursor, -1);
    }
    return count;
  }

  function preferenceScore(employee, shift) {
    return Array.isArray(employee.shiftPreferences) && employee.shiftPreferences.includes(shift.id) ? 1 : 0;
  }

  function generateSchedule(options) {
    const shifts = Array.isArray(options.shifts) ? options.shifts : [];
    const employees = Array.isArray(options.employees) ? options.employees : [];
    const dates = enumerateDates(options.startDate, options.endDate);

    const assignments = {};
    dates.forEach((date) => {
      assignments[date] = {};
    });

    const empDateShifts = {};
    const weekendCounts = {};
    const totalCounts = {};
    employees.forEach((employee) => {
      empDateShifts[employee.id] = {};
      weekendCounts[employee.id] = 0;
      totalCounts[employee.id] = 0;
    });

    function hasShiftOnDate(employee, date) {
      return (empDateShifts[employee.id] && empDateShifts[employee.id][date] || []).length > 0;
    }

    function canAssign(employee, date, shift) {
      const unavailable = Array.isArray(employee.unavailableDates)
        ? employee.unavailableDates.includes(date)
        : false;
      if (unavailable || hasShiftOnDate(employee, date)) return false;

      const maxDays = normalizeMaxDays(employee.maxDaysPerWeek);
      if (maxDays !== null && countWorkDaysInWeek(empDateShifts, employee.id, date) + 1 > maxDays) {
        return false;
      }

      const previousDate = toDateString(addDays(date, -1));
      const previousRun = countConsecutiveEnding(empDateShifts, employee.id, previousDate);
      if (previousRun + 1 > 5) return false;

      if (isMorningShift(shift, shifts)) {
        const previousShiftIds = (empDateShifts[employee.id] && empDateShifts[employee.id][previousDate]) || [];
        const workedNightYesterday = shifts.some((item) => previousShiftIds.includes(item.id) && isNightShift(item));
        if (workedNightYesterday) return false;
      }

      return true;
    }

    function sortCandidates(candidates, date, shift) {
      const weekend = isWeekend(date);
      candidates.sort((a, b) => {
        const preferenceDiff = preferenceScore(b, shift) - preferenceScore(a, shift);
        const totalDiff = totalCounts[a.id] - totalCounts[b.id];
        const weekendDiff = weekendCounts[a.id] - weekendCounts[b.id];

        if (weekend) {
          return weekendDiff || preferenceDiff || totalDiff || a.name.localeCompare(b.name, 'zh-CN');
        }
        return preferenceDiff || totalDiff || weekendDiff || a.name.localeCompare(b.name, 'zh-CN');
      });
    }

    function assignEmployee(employee, date, shift, cell) {
      empDateShifts[employee.id][date] = empDateShifts[employee.id][date] || [];
      empDateShifts[employee.id][date].push(shift.id);
      totalCounts[employee.id] += 1;
      if (isWeekend(date)) weekendCounts[employee.id] += 1;
      cell.employeeIds.push(employee.id);
    }

    dates.forEach((date) => {
      const previousDate = toDateString(addDays(date, -1));
      const weekend = isWeekend(date);

      shifts.forEach((shift) => {
        const minStaff = Math.max(0, Number(shift.minStaff) || 0);
        const cell = { employeeIds: [], shortage: 0 };

        const candidates = employees.filter((employee) => {
          if (!employee || !employee.id) return false;
          const unavailable = Array.isArray(employee.unavailableDates)
            ? employee.unavailableDates.includes(date)
            : false;
          if (unavailable || hasShiftOnDate(employee, date)) return false;

          const maxDays = normalizeMaxDays(employee.maxDaysPerWeek);
          if (maxDays !== null && countWorkDaysInWeek(empDateShifts, employee.id, date) + 1 > maxDays) return false;

          const previousRun = countConsecutiveEnding(empDateShifts, employee.id, previousDate);
          if (previousRun + 1 > 5) return false;

          if (isMorningShift(shift, shifts)) {
            const previousShiftIds = (empDateShifts[employee.id] && empDateShifts[employee.id][previousDate]) || [];
            const workedNightYesterday = shifts.some((item) => previousShiftIds.includes(item.id) && isNightShift(item));
            if (workedNightYesterday) return false;
          }

          return true;
        });

        sortCandidates(candidates, date, shift);

        for (const employee of candidates) {
          if (cell.employeeIds.length >= minStaff) break;
          assignEmployee(employee, date, shift, cell);
        }

        cell.shortage = Math.max(0, minStaff - cell.employeeIds.length);
        assignments[date][shift.id] = cell;
      });
    });

    return assignments;
  }

  function validateSchedule(schedule, employees, shifts) {
    const violations = {};
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
    const dates = enumerateDates(schedule.startDate, schedule.endDate);
    const dateSet = new Set(dates);

    function cellKey(date, shiftId) {
      return `${date}|${shiftId}`;
    }

    function addViolation(date, shiftId, message) {
      const key = cellKey(date, shiftId);
      if (!violations[key]) violations[key] = [];
      if (!violations[key].includes(message)) violations[key].push(message);
    }

    function employeeCells(employeeId) {
      const cells = [];
      dates.forEach((date) => {
        const day = schedule.assignments[date] || {};
        shifts.forEach((shift) => {
          const ids = normalizeEmployeeIds(day[shift.id]);
          if (ids.includes(employeeId)) {
            cells.push({ date, shift });
          }
        });
      });
      return cells;
    }

    employees.forEach((employee) => {
      if (!employee || !employee.id) return;

      // 不可用日期
      const unavailable = new Set(Array.isArray(employee.unavailableDates) ? employee.unavailableDates : []);
      employeeCells(employee.id).forEach(({ date, shift }) => {
        if (unavailable.has(date)) {
          addViolation(date, shift.id, `${employee.name}：当天已被设为不可用`);
        }
      });

      // 单日多班次
      dates.forEach((date) => {
        const day = schedule.assignments[date] || {};
        const assignedShifts = shifts.filter((shift) => normalizeEmployeeIds(day[shift.id]).includes(employee.id));
        if (assignedShifts.length > 1) {
          assignedShifts.forEach((shift) => {
            addViolation(date, shift.id, `${employee.name}：当天已安排 ${assignedShifts.map((item) => item.name).join('、')}，单日只能安排一个班次`);
          });
        }
      });

      // 晚班次日早班
      employeeCells(employee.id).forEach(({ date, shift }) => {
        if (!isMorningShift(shift, shifts)) return;
        const previousDate = toDateString(addDays(date, -1));
        if (!dateSet.has(previousDate)) return;
        const previousDay = schedule.assignments[previousDate] || {};
        const workedNight = shifts.some((item) => normalizeEmployeeIds(previousDay[item.id]).includes(employee.id) && isNightShift(item));
        if (workedNight) {
          addViolation(date, shift.id, `${employee.name}：晚班次日不能安排早班，间隔不足`);
        }
      });

      // 每周工作天数上限
      const maxDays = normalizeMaxDays(employee.maxDaysPerWeek);
      if (maxDays !== null) {
        const weekBuckets = new Map();
        employeeCells(employee.id).forEach(({ date, shift }) => {
          const weekKey = getWeekKey(date);
          if (!weekBuckets.has(weekKey)) weekBuckets.set(weekKey, []);
          weekBuckets.get(weekKey).push({ date, shift });
        });
        weekBuckets.forEach((cells) => {
          if (cells.length > maxDays) {
            cells.forEach(({ date, shift }) => {
              addViolation(date, shift.id, `${employee.name}：本周已排 ${cells.length} 天，超过每周上限 ${maxDays} 天`);
            });
          }
        });
      }

      // 连续上班天数
      const sortedDates = Array.from(new Set(employeeCells(employee.id).map(({ date }) => date))).sort();
      let runStart = 0;
      for (let index = 1; index <= sortedDates.length; index += 1) {
        const previous = sortedDates[index - 1];
        const current = sortedDates[index];
        const runContinues = current && toDateString(addDays(previous, 1)) === current;
        if (!runContinues) {
          const runLength = index - runStart;
          if (runLength > 5) {
            for (let cursor = runStart; cursor < index; cursor += 1) {
              const date = sortedDates[cursor];
              const day = schedule.assignments[date] || {};
              shifts.forEach((shift) => {
                if (normalizeEmployeeIds(day[shift.id]).includes(employee.id)) {
                  addViolation(date, shift.id, `${employee.name}：连续上班 ${runLength} 天，超过 5 天上限`);
                }
              });
            }
          }
          runStart = index;
        }
      }
    });

    // 班次定义完整性：排班日期存在但缺少班次单元格时补空。
    dates.forEach((date) => {
      const day = schedule.assignments[date] || {};
      shifts.forEach((shift) => {
        const key = cellKey(date, shift.id);
        if (!violations[key]) violations[key] = [];
      });
    });

    return violations;
  }

  function buildScheduleCsv(schedule, employees, shifts) {
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const dates = enumerateDates(schedule.startDate, schedule.endDate);

    function escapeCell(value) {
      const text = String(value === null || value === undefined ? '' : value);
      if (/[",\r\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    }

    const rows = [];
    rows.push(['班次'].concat(dates.map((date) => `${date} ${weekdayName(date)}`)));

    shifts.forEach((shift) => {
      const row = [formatShiftLabel(shift)];
      dates.forEach((date) => {
        const cell = (schedule.assignments[date] || {})[shift.id];
        const ids = normalizeEmployeeIds(cell);
        let value = ids.map((id) => employeeById.get(id)?.name || id).join('、');
        const shortage = cell && Number(cell.shortage) > 0 ? Number(cell.shortage) : 0;
        if (shortage > 0) {
          value = value ? `${value}、缺${shortage}人` : `缺${shortage}人`;
        }
        row.push(value);
      });
      rows.push(row);
    });

    return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
  }

  return {
    addDays,
    buildScheduleCsv,
    daysBetween,
    enumerateDates,
    formatShiftLabel,
    generateSchedule,
    isMorningShift,
    isNightShift,
    isWeekend,
    normalizeEmployeeIds,
    parseDateString,
    parseTimeToMinutes,
    todayString,
    toDateString,
    validateSchedule,
    weekdayName,
  };
});
