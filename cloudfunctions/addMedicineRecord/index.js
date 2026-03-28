const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { userId, medicineId, dose, timestamp } = event;

  if (!userId || !medicineId || !dose || !timestamp) {
    return { success: false, message: '参数不完整' };
  }

  await db.collection('medRecords').add({
    data: {
      userId,
      medicineId,
      dose: Number(dose),
      timestamp,
      createdAt: Date.now()
    }
  });

  return { success: true };
};
