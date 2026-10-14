const test = require('node:test');
const assert = require('node:assert/strict');

const Scheduler = require('../scheduler');

function employees() {
  return [
    { id: 'e1', name: '张三', role: '客服', maxDaysPerWeek: 5, shiftPreferences: ['early', 'mid'], unavailableDates: [] },
    { id: 'e2', name: '李四', role: '客服', maxDaysPerWeek: 5, shiftPreferences: ['mid', 'night'], unavailableDates: [] },
    { id: 'e3', name: '王五', role: '客服', maxDaysPerWeek: 4, shiftPreferences: ['night'], unavailableDates: [] },
  ];
}

function shifts() {
  return [
    { id: 'early', name: '早班', start: '08:00', end: '16:00', minStaff: 1 },
    { id: 'mid', name: '中班', start: '16:00', end: '24:00', minStaff: 1 },
    { id: 'night', name: '晚班', start: '00:00', end: '08:00', minStaff: 1, isNight: true },
  ];
}

test('enumerateDates returns inclusive local dates', () => {
  assert.deepEqual(Scheduler.enumerateDates('2026-01-05', '2026-01-07'), [
    '2026-01-05',
    '2026-01-06',
    '2026-01-07',
  ]);
});

test('isWeekend detects Saturday and Sunday', () => {
  assert.equal(Scheduler.isWeekend('2026-01-10'), true);
  assert.equal(Scheduler.isWeekend('2026-01-11'), true);
  assert.equal(Scheduler.isWeekend('2026-01-12'), false);
});

test('generated schedule never assigns one employee twice in a day', () => {
  const assignments = Scheduler.generateSchedule({
    startDate: '2026-01-05',
    endDate: '2026-01-11',
    shifts: shifts(),
    employees: employees(),
  });

  for (const date of Scheduler.enumerateDates('2026-01-05', '2026-01-11')) {
    const assigned = new Set();
    for (const shift of shifts()) {
      for (const employeeId of Scheduler.normalizeEmployeeIds(assignments[date][shift.id])) {
        assert.equal(assigned.has(employeeId), false, `${date} ${shift.id} 重复安排 ${employeeId}`);
        assigned.add(employeeId);
      }
    }
  }
});

test('generated schedule skips unavailable dates', () => {
  const list = employees();
  list[0].unavailableDates = ['2026-01-06'];
  const assignments = Scheduler.generateSchedule({
    startDate: '2026-01-05',
    endDate: '2026-01-11',
    shifts: shifts(),
    employees: list,
  });

  for (const shift of shifts()) {
    assert.equal(Scheduler.normalizeEmployeeIds(assignments['2026-01-06'][shift.id]).includes('e1'), false);
  }
});

test('night shift is not followed by morning shift for the same employee', () => {
  const assignments = Scheduler.generateSchedule({
    startDate: '2026-01-05',
    endDate: '2026-01-11',
    shifts: shifts(),
    employees: employees(),
  });
  const violations = Scheduler.validateSchedule(
    { startDate: '2026-01-05', endDate: '2026-01-11', assignments },
    employees(),
    shifts()
  );

  for (const key of Object.keys(violations)) {
    assert.equal(violations[key].some((message) => message.includes('晚班次日')), false, key);
  }
});

test('shortage is recorded when min staff cannot be met', () => {
  const list = employees().slice(0, 1);
  const shiftList = [
    { id: 'early', name: '早班', start: '08:00', end: '16:00', minStaff: 3 },
  ];
  const assignments = Scheduler.generateSchedule({
    startDate: '2026-01-05',
    endDate: '2026-01-05',
    shifts: shiftList,
    employees: list,
  });

  assert.equal(assignments['2026-01-05'].early.shortage, 2);
});

test('validateSchedule reports weekly limit violations', () => {
  const list = employees().slice(0, 1);
  list[0].maxDaysPerWeek = 1;
  const shiftList = [
    { id: 'early', name: '早班', start: '08:00', end: '16:00', minStaff: 1 },
  ];
  const assignments = {};
  for (const date of Scheduler.enumerateDates('2026-01-05', '2026-01-06')) {
    assignments[date] = { early: { employeeIds: ['e1'], shortage: 0 } };
  }

  const violations = Scheduler.validateSchedule(
    { startDate: '2026-01-05', endDate: '2026-01-06', assignments },
    list,
    shiftList
  );
  assert.ok(Object.values(violations).flat().some((message) => message.includes('每周上限')));
});

test('CSV export contains shortage markers', () => {
  const shiftList = shifts();
  const schedule = {
    name: '测试',
    startDate: '2026-01-05',
    endDate: '2026-01-05',
    assignments: {
      '2026-01-05': {
        early: { employeeIds: ['e1'], shortage: 0 },
        mid: { employeeIds: [], shortage: 1 },
        night: { employeeIds: ['e2'], shortage: 0 },
      },
    },
  };
  const csv = Scheduler.buildScheduleCsv(schedule, employees(), shiftList);
  assert.match(csv, /缺1人/);
  assert.match(csv, /张三/);
});
