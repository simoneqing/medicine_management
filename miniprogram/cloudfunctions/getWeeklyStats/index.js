const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { userId } = event;
  if (!userId) return { success: false, message: '缺少 userId' };
  const days = Math.max(Number(event.days) || 7, 1);
  const withRecords = Boolean(event.withRecords);

  const now = Date.now();
  const rangeMs = days * 24 * 60 * 60 * 1000;
  const fromTs = now - rangeMs;

  const res = await db.collection('medRecords')
    .where({ userId, timestamp: db.command.gte(fromTs) })
    .get();
  const totalDoseIU = res.data.reduce((sum, row) => sum + Number(row.dose || 0), 0);

  const data = {
    totalDoses: res.data.length,
    totalDoseIU: Number(totalDoseIU.toFixed(2)),
    missedAlerts: 0,
    remainPills: 0,
    streakDays: Math.min(res.data.length, days)
  };

  if (withRecords) {
    data.records = res.data.map((r) => ({
      _id: r._id,
      userId: r.userId,
      medicineId: r.medicineId,
      dose: Number(r.dose || 0),
      timestamp: Number(r.timestamp || 0),
      counts: r.counts && typeof r.counts === 'object' ? r.counts : {},
      createdAt: Number(r.createdAt || r.timestamp || 0)
    }));
  }

  return {
    success: true,
    data
  };
};
