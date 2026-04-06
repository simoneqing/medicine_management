const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function safeNum(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

exports.main = async (event) => {
  const prevConc = safeNum(event.prevConc, 0);
  const dose = safeNum(event.dose, 0);
  const weight = Math.max(safeNum(event.weight, 60), 1);
  const xValue = safeNum(event.xValue, 2);
  const halfLife = Math.max(safeNum(event.halfLife, 24), 0.1);
  const elapsedHours = Math.max(safeNum(event.elapsedHours, 0), 0);

  const startConcentration = prevConc + (dose / weight) * xValue;
  const decayFactor = Math.pow(0.5, elapsedHours / halfLife);
  const currentConcentration = Number((startConcentration * decayFactor).toFixed(4));

  return {
    success: true,
    startConcentration: Number(startConcentration.toFixed(4)),
    currentConcentration
  };
};
