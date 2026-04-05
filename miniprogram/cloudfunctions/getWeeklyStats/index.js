const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { userId } = event;
  if (!userId) return { success: false, message: '缺少 userId' };

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const fromTs = now - sevenDaysMs;

  const res = await db.collection('medRecords')
    .where({ userId, timestamp: db.command.gte(fromTs) })
    .get();

  return {
    success: true,
    data: {
      totalDoses: res.data.length,
      missedAlerts: 0,
      remainPills: 0,
      streakDays: Math.min(res.data.length, 7)
    }
  };
};
