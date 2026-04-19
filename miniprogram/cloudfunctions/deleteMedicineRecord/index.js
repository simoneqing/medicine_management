const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { userId, recordId } = event;
  if (!userId || !recordId) {
    return { success: false, message: '缺少 userId 或 recordId' };
  }

  const found = await db.collection('medRecords').doc(recordId).get().catch(() => ({ data: null }));
  if (!found.data) {
    return { success: false, message: '记录不存在' };
  }
  if (found.data.userId !== userId) {
    return { success: false, message: '无权限删除该记录' };
  }

  await db.collection('medRecords').doc(recordId).remove();
  return { success: true };
};
