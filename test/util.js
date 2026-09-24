export const code = (fn) => {
  try {
    fn();
    return null;
  } catch (err) {
    return err.code;
  }
};

export const fractions = (rows) => rows
  .map((one) => `${one.id}:${one.utilization.num}/${one.utilization.den}`);

export const shape = (plan) => plan.spans.map((one) => `${one.taskId}[${one.from},${one.to})`);
