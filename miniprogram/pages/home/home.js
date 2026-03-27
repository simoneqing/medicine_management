Page({
  data: {
    weeklyStats: {
      totalDoses: 0,
      missedAlerts: 0,
      remainPills: 0,
      streakDays: 0
    },
    lastRecord: null,
    currentConcentration: '--'
  },

  onLoad() {
    this.loadHomeData();
  },

  async loadHomeData() {
    try {
      const weeklyRes = await wx.cloud.callFunction({
        name: 'getWeeklyStats',
        data: { userId: 'demo-user' }
      });

      const lastRes = await wx.cloud.callFunction({
        name: 'getLastRecord',
        data: { userId: 'demo-user' }
      });

      const weeklyStats = weeklyRes.result?.data || this.data.weeklyStats;
      const lastRecord = lastRes.result?.data || null;

      this.setData({
        weeklyStats,
        lastRecord
      });

      if (lastRecord) {
        await this.calcCurrentConcentration(lastRecord);
      }
    } catch (error) {
      console.error('加载首页数据失败', error);
    }
  },

  async calcCurrentConcentration(lastRecord) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'calculateConcentration',
        data: {
          prevConc: Number(lastRecord.prevConc || 0),
          dose: Number(lastRecord.dose || 0),
          weight: Number(lastRecord.weight || 60),
          xValue: Number(lastRecord.xValue || 2),
          halfLife: Number(lastRecord.halfLife || 24),
          elapsedHours: Number(lastRecord.elapsedHours || 0)
        }
      });

      this.setData({
        currentConcentration: res.result?.currentConcentration ?? '--'
      });
    } catch (error) {
      console.error('计算浓度失败', error);
    }
  },

  handleAddRecord() {
    wx.showToast({ title: '请接入录入页', icon: 'none' });
  },

  handleViewHistory() {
    wx.showToast({ title: '请接入记录列表页', icon: 'none' });
  },

  handleViewProfile() {
    wx.showToast({ title: '请接入个人信息页', icon: 'none' });
  }
});
