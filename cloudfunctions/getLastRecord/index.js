const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function formatTime(ts) {
  const date = new Date(ts);
  const hh = `${date.getHours()}`.padStart(2, '0');
  const mm = `${date.getMinutes()}`.padStart(2, '0');
  return `${date.getMonth() + 1}/${date.getDate()} ${hh}:${mm}`;
}

exports.main = async (event) => {
  const { userId } = event;
  if (!userId) return { success: false, message: '缺少 userId' };

  const recordRes = await db.collection('medRecords')
    .where({ userId })
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();

  if (!recordRes.data.length) {
    return { success: true, data: null };
  }

  const record = recordRes.data[0];
  const medicineRes = await db.collection('medicines').doc(record.medicineId).get().catch(() => ({ data: null }));
  const userRes = await db.collection('users').doc(userId).get().catch(() => ({ data: null }));

  const now = Date.now();
  const elapsedHours = Math.max(0, (now - record.timestamp) / 3600000);

  return {
    success: true,
    data: {
      ...record,
      medicineName: medicineRes.data?.name || '未知药品',
      halfLife: medicineRes.data?.halfLife || 24,
      xValue: medicineRes.data?.xValue || 2,
      weight: userRes.data?.weight || 60,
      prevConc: 0,
      elapsedHours,
      timeLabel: formatTime(record.timestamp)
    }
  };
};
