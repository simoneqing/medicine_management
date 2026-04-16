const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const {
    userId, recordId, medicineId, dose, timestamp, counts, expectedRise, weightSnapshot
  } = event;
  if (!userId || !recordId || !medicineId || !dose || !timestamp) {
    return { success: false, message: '参数不完整' };
  }

  const existing = await db.collection('medRecords').doc(recordId).get().catch(() => ({ data: null }));
  if (!existing.data) return { success: false, message: '记录不存在' };
  if (existing.data.userId !== userId) return { success: false, message: '无权限修改该记录' };

  await db.collection('medRecords').doc(recordId).update({
    data: {
      medicineId,
      dose: Number(dose),
      timestamp: Number(timestamp),
      counts: counts && typeof counts === 'object' ? counts : {},
      expectedRise: Number.isFinite(Number(expectedRise)) ? Number(Number(expectedRise).toFixed(2)) : null,
      weightSnapshot: Number.isFinite(Number(weightSnapshot)) ? Number(Number(weightSnapshot).toFixed(1)) : null,
      updatedAt: Date.now()
    }
  });

  return { success: true };
};
