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
    .where({ userId })
    .get();

  const normalizeTs = (row = {}) => {
    const ts = Number(row.timestamp);
    if (Number.isFinite(ts) && ts > 0) return ts < 1e12 ? ts * 1000 : ts;
    const createdAt = Number(row.createdAt);
    if (Number.isFinite(createdAt) && createdAt > 0) return createdAt < 1e12 ? createdAt * 1000 : createdAt;
    return 0;
  };

  const normalized = (res.data || []).map((row) => ({
    ...row,
    _tsMs: normalizeTs(row)
  }));

  const inRange = normalized.filter((row) => row._tsMs >= fromTs);
  const totalDoseIU = inRange.reduce((sum, row) => sum + Number(row.dose || 0), 0);

  const data = {
    totalDoses: inRange.length,
    totalDoseIU: Number(totalDoseIU.toFixed(2)),
    missedAlerts: 0,
    remainPills: 0,
    streakDays: Math.min(inRange.length, days)
  };

  if (withRecords) {
    data.records = normalized
      .sort((a, b) => Number(b._tsMs || 0) - Number(a._tsMs || 0))
      .map((r) => ({
      _id: r._id,
      userId: r.userId,
      medicineId: r.medicineId,
      dose: Number(r.dose || 0),
      timestamp: Number(r._tsMs || 0),
      counts: r.counts && typeof r.counts === 'object' ? r.counts : {},
      createdAt: Number(normalizeTs({ timestamp: r.createdAt, createdAt: r.timestamp }) || r._tsMs || 0),
      expectedRise: Number.isFinite(Number(r.expectedRise)) ? Number(r.expectedRise) : null,
      weightSnapshot: Number.isFinite(Number(r.weightSnapshot)) ? Number(r.weightSnapshot) : null
      }));
  }

  return {
    success: true,
    data
  };
};
