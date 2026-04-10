const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { userId } = event;
  if (!userId) return { success: false, message: '缺少 userId' };

  const res = await db.collection('medRecords')
    .where({ userId, timestamp: db.command.exists(true) })
    .orderBy('timestamp', 'desc')
    .get();

  return {
    success: true,
    data: res.data || []
  };
};
