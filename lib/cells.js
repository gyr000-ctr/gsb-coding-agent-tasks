// A1 记法的解析和格式化，跟计算逻辑无关，先写好。
const REF = /^\$?([A-Za-z]+)\$?([1-9]\d*)$/;

export function columnToIndex(letters) {
  if (typeof letters !== 'string' || letters === '') throw new TypeError('列名不能空');
  let value = 0;
  for (const char of letters.toUpperCase()) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) throw new TypeError(`列名只能是字母：${letters}`);
    value = value * 26 + (code - 64);
  }
  return value - 1;
}

export function indexToColumn(index) {
  if (!Number.isInteger(index) || index < 0) throw new TypeError('列号得是非负整数');
  let value = index + 1;
  let out = '';
  while (value > 0) {
    const rest = (value - 1) % 26;
    out = String.fromCharCode(65 + rest) + out;
    value = Math.floor((value - 1) / 26);
  }
  return out;
}

// '$A$1' / 'a1' 都能解；解不了返回 null。
export function parseA1(text) {
  if (typeof text !== 'string') return null;
  const match = REF.exec(text.trim());
  if (!match) return null;
  return { column: columnToIndex(match[1]), row: Number(match[2]) - 1 };
}

export function formatA1(position) {
  return `${indexToColumn(position.column)}${position.row + 1}`;
}

// 统一成大写、去掉 $ 的写法；不是合法单元格就返回 null。
export function normalizeRef(text) {
  const parsed = parseA1(text);
  return parsed === null ? null : formatA1(parsed);
}

// 闭区间展开，按行再按列（A1, B1, A2, B2 这种）。
export function expandRange(start, end) {
  const left = parseA1(start);
  const right = parseA1(end);
  if (left === null || right === null) throw new TypeError(`范围解不开：${start}:${end}`);
  const top = Math.min(left.row, right.row);
  const bottom = Math.max(left.row, right.row);
  const first = Math.min(left.column, right.column);
  const last = Math.max(left.column, right.column);
  const out = [];
  for (let row = top; row <= bottom; row++) {
    for (let column = first; column <= last; column++) out.push(formatA1({ row, column }));
  }
  return out;
}
