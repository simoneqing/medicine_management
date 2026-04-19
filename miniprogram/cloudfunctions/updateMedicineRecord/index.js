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

  const nextCounts = counts && typeof counts === 'object'
    ? Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v || 0)]))
    : {};

  const payload = {
    ...existing.data,
    medicineId,
    dose: Number(dose),
    timestamp: Number(timestamp),
    counts: nextCounts,
    expectedRise: Number.isFinite(Number(expectedRise)) ? Number(Number(expectedRise).toFixed(2)) : null,
    weightSnapshot: Number.isFinite(Number(weightSnapshot)) ? Number(Number(weightSnapshot).toFixed(1)) : null,
    updatedAt: Date.now()
  };
  delete payload._id;

  await db.collection('medRecords').doc(recordId).set({
    data: {
      ...payload
    }
  });

  return { success: true };
};
