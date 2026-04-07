const PROFILE_STORAGE_KEY = 'medicine_profile_mock_v1';
const DEFAULT_USER_ID = 'u_demo_001';

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

Page({
  data: {
    userId: DEFAULT_USER_ID,
    profile: { weight: 68 },
    weeklyStats: { count: 0, totalDoseIU: 0 },
    monthlyStats: { count: 0, totalDoseIU: 0 },
    currentConcentration: '0.0',
    chartMode: 'day',
    chartData: { labels: [], points: [] },
    lastRecord: null
  },

  onLoad() {
    this.loadProfileFromStorage();
    this.refreshHomeCloudData();
  },

  onShow() {
    this.loadProfileFromStorage();
    this.refreshHomeCloudData();
  },

  loadProfileFromStorage() {
    const cached = wx.getStorageSync(PROFILE_STORAGE_KEY);
    if (!cached || typeof cached !== 'object') return;
    const nextWeight = Number(cached.weight);
    if (!Number.isFinite(nextWeight) || nextWeight <= 0 || nextWeight > 300) return;
    this.setData({ profile: { ...this.data.profile, weight: Number(nextWeight.toFixed(1)) } });
  },

  async callCloud(name, data) {
    try {
      const res = await wx.cloud.callFunction({ name, data });
      return res.result || { success: false };
    } catch (e) {
      return { success: false, message: e?.errMsg || '云函数调用失败' };
    }
  },

  computeConcentrationFromRecord(record, targetDate) {
    if (!record) return 0;
    const tRecord = new Date(record.timestamp).getTime();
    const tTarget = targetDate.getTime();
    if (!Number.isFinite(tRecord) || !Number.isFinite(tTarget) || tTarget < tRecord) return 0;

    const elapsedHours = Math.max(0, (tTarget - tRecord) / 3600000);
    const dose = Number(record.dose || 0);
    const weight = Math.max(Number(this.data.profile.weight || record.weight || 60), 1);
    const xValue = Number(record.xValue || 2);
    const halfLife = Math.max(Number(record.halfLife || 24), 0.1);
    const prevConc = Number(record.prevConc || 0);

    const start = prevConc + (dose / weight) * xValue;
    const current = start * Math.pow(0.5, elapsedHours / halfLife);
    return Number(clamp(current, 0, 120).toFixed(1));
  },

  async refreshHomeCloudData() {
    const userId = this.data.userId;
    const [weekly, monthly, last] = await Promise.all([
      this.callCloud('getWeeklyStats', { userId, days: 7 }),
      this.callCloud('getWeeklyStats', { userId, days: 30 }),
      this.callCloud('getLastRecord', { userId })
    ]);

    const updates = {};
    if (weekly.success && weekly.data) {
      updates.weeklyStats = {
        count: Number(weekly.data.totalDoses || 0),
        totalDoseIU: Number(weekly.data.totalDoseIU || 0)
      };
    }
    if (monthly.success && monthly.data) {
      updates.monthlyStats = {
        count: Number(monthly.data.totalDoses || 0),
        totalDoseIU: Number(monthly.data.totalDoseIU || 0)
      };
    }
    if (last.success && last.data) {
      updates.lastRecord = last.data;
      if (Number.isFinite(Number(last.data.weight)) && Number(last.data.weight) > 0) {
        updates.profile = { ...this.data.profile, weight: Number(last.data.weight) };
      }
    } else {
      updates.lastRecord = null;
    }

    this.setData(updates, () => {
      const nowConc = this.computeConcentrationFromRecord(this.data.lastRecord, new Date());
      this.setData({ currentConcentration: nowConc.toFixed(1) });
      this.buildChartData(this.data.chartMode);
      this.drawChart();
    });
  },

  switchToDay() {
    this.buildChartData('day');
    this.drawChart();
  },

  switchToWeek() {
    this.buildChartData('week');
    this.drawChart();
  },

  buildChartData(mode) {
    const now = new Date();
    const labels = [];
    const points = [];

    if (mode === 'day') {
      for (let i = 23; i >= 0; i -= 1) {
        const d = new Date(now.getTime() - i * 3600000);
        labels.push(`${d.getHours()}时`);
        points.push(this.computeConcentrationFromRecord(this.data.lastRecord, d));
      }
    } else {
      for (let i = 6; i >= 0; i -= 1) {
        const d = new Date(now.getTime() - i * 24 * 3600000);
        labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
        points.push(this.computeConcentrationFromRecord(this.data.lastRecord, d));
      }
    }

    this.setData({ chartMode: mode, chartData: { labels, points } });
  },

  drawChart() {
    const query = wx.createSelectorQuery();
    query.select('#chartCanvas').fields({ node: true, size: true }).exec((res) => {
      const canvas = res[0] && res[0].node;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const deviceInfo = wx.getDeviceInfo();
      const dpr = deviceInfo.pixelRatio;
      canvas.width = res[0].width * dpr;
      canvas.height = res[0].height * dpr;
      ctx.scale(dpr, dpr);

      const width = res[0].width;
      const height = res[0].height;
      const pad = { left: 34, right: 8, top: 16, bottom: 24 };
      const labels = this.data.chartData.labels;
      const points = this.data.chartData.points;

      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = '#e5e7eb';
      for (let i = 0; i <= 6; i += 1) {
        const y = pad.top + ((height - pad.top - pad.bottom) * i) / 6;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(width - pad.right, y);
        ctx.stroke();
        const tick = 120 - i * 20;
        ctx.fillStyle = '#64748b';
        ctx.font = '10px sans-serif';
        ctx.fillText(`${tick}%`, 2, y + 3);
      }

      const toX = (i) => pad.left + ((width - pad.left - pad.right) * i) / Math.max(labels.length - 1, 1);
      const toY = (v) => pad.top + ((120 - v) / 120) * (height - pad.top - pad.bottom);

      ctx.beginPath();
      points.forEach((p, i) => {
        const x = toX(i);
        const y = toY(p);
        if (i === 0) ctx.moveTo(x, y);
        else {
          const prevX = toX(i - 1);
          const prevY = toY(points[i - 1]);
          const cx = (prevX + x) / 2;
          ctx.quadraticCurveTo(cx, prevY, x, y);
        }
      });
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#6b7280';
      ctx.font = '10px sans-serif';
      const step = this.data.chartMode === 'day' ? 4 : 1;
      labels.forEach((label, i) => {
        if (i % step === 0 || i === labels.length - 1) {
          ctx.fillText(label, toX(i) - 10, height - 8);
        }
      });

      ctx.fillStyle = '#334155';
      ctx.font = '11px sans-serif';
      ctx.fillText('血药浓度（%）', 4, 10);
      ctx.fillText('时间', width - 24, height - 8);
    });
  },

  handleAddRecord() { wx.navigateTo({ url: '/pages/history/history?openAdd=1' }); },
  handleViewHistory() { wx.navigateTo({ url: '/pages/history/history' }); },
  handleViewMedicine() { wx.navigateTo({ url: '/pages/medicine-manage/medicine-manage' }); },
  handleViewProfile() { wx.navigateTo({ url: '/pages/profile/profile' }); }
});
