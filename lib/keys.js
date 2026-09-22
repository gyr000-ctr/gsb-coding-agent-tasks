// 键比较和区间相交这些零碎活儿，跟选层逻辑无关，先写好。
export function compareKeys(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

// 两个闭区间 [minKey, maxKey] 有没有交集。
export function rangesIntersect(left, right) {
  return compareKeys(left.minKey, right.maxKey) <= 0 && compareKeys(right.minKey, left.maxKey) <= 0;
}

// 一组文件的键范围合并成一个闭区间；空数组给 null。
export function unionRange(files) {
  if (files.length === 0) return null;
  let minKey = files[0].minKey;
  let maxKey = files[0].maxKey;
  for (const file of files) {
    if (compareKeys(file.minKey, minKey) < 0) minKey = file.minKey;
    if (compareKeys(file.maxKey, maxKey) > 0) maxKey = file.maxKey;
  }
  return { minKey, maxKey };
}

export function sumBytes(files) {
  return files.reduce((total, file) => total + file.size, 0);
}
