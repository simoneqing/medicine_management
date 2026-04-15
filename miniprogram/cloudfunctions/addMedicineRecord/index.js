const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { userId, medicineId, dose, timestamp, counts } = event;

  if (!userId || !medicineId || !dose || !timestamp) {
    return { success: false, message: '参数不完整' };
  }

  const createdAt = Number(event.createdAt || Date.now());
  const expectedRise = Number(event.expectedRise);
  const weightSnapshot = Number(event.weightSnapshot);
  await db.collection('medRecords').add({
    data: {
      userId,
      medicineId,
      dose: Number(dose),
      timestamp: Number(timestamp),
      counts: counts && typeof counts === 'object' ? counts : {},
      createdAt,
      expectedRise: Number.isFinite(expectedRise) ? Number(expectedRise.toFixed(2)) : null,
      weightSnapshot: Number.isFinite(weightSnapshot) ? Number(weightSnapshot.toFixed(1)) : null
    }
  });

  return { success: true };
};
