const PROFILE_STORAGE_KEY = 'medicine_profile_mock_v1';
const DEFAULT_USER_ID = 'u_demo_001';

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
function normalizeTimestamp(value) {
  const ts = Number(value || 0);
  if (!Number.isFinite(ts) || ts <= 0) return 0;
  return ts < 1e12 ? ts * 1000 : ts;
}

Page({
  data: {
    userId: DEFAULT_USER_ID,
    profile: { weight: 68 },
    records: [],
    medicineMap: {},
    weeklyStats: { count: 0, totalDoseIU: 0 },
    monthlyStats: { count: 0, totalDoseIU: 0 },
    currentConcentration: '0.0',
    chartMode: 'day',
    chartData: { labels: [], points: [], pointTimes: [], renderPoints: [] },
    lastRecord: null
  },

  onLoad() {
    this.loadProfileFromStorage();
    this.refreshHomeCloudData();
  },

  onReady() {
    this.drawChart();
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

  computeConcentrationAt(targetMs) {
    const weight = Math.max(Number(this.data.profile.weight || 60), 1);
    const records = this.data.records || [];
    const map = this.data.medicineMap || {};
    let total = 0;

    records.forEach((record) => {
      const tRecord = normalizeTimestamp(record.timestamp || record.createdAt);
      if (!tRecord || targetMs < tRecord) return;
      const elapsedHours = Math.max(0, (targetMs - tRecord) / 3600000);
      const med = map[record.medicineId] || {};
      const xValue = Number(med.recoveryRate ?? med.xValue ?? 2);
      const halfLife = Math.max(Number(med.halfLife || 24), 0.1);
      const dose = Number(record.dose || 0);
      const start = (dose / weight) * xValue;
      total += start * Math.pow(0.5, elapsedHours / halfLife);
    });

    return Number(clamp(total, 0, 120).toFixed(1));
  },

  async refreshHomeCloudData() {
    const userId = this.data.userId;
    const [recordsResult, last] = await Promise.all([
      this.callCloud('getWeeklyStats', { userId, days: 36500, withRecords: true }),
      this.callCloud('getLastRecord', { userId })
    ]);
    const db = wx.cloud.database();
    const medicinesRes = await db.collection('medicines').get().catch(() => ({ data: [] }));
    const medicineMap = {};
    (medicinesRes.data || []).forEach((m) => {
      medicineMap[m._id] = {
        halfLife: Number(m.halfLife || 24),
        xValue: Number(m.xValue ?? m.recoveryRate ?? 2),
        recoveryRate: Number(m.recoveryRate ?? m.xValue ?? 2)
      };
    });

    const updates = {};
    const rows = recordsResult.success ? (recordsResult.data?.records || []) : [];
    const records = rows.map((r) => ({
      ...r,
      timestamp: normalizeTimestamp(r.timestamp || r.createdAt)
    })).filter((r) => r.timestamp > 0);

    const now = Date.now();
    const weekFrom = now - 7 * 24 * 3600000;
    const monthFrom = now - 30 * 24 * 3600000;
    const weekRows = records.filter((r) => r.timestamp >= weekFrom);
    const monthRows = records.filter((r) => r.timestamp >= monthFrom);

    updates.records = records;
    updates.medicineMap = medicineMap;
    updates.weeklyStats = {
      count: weekRows.length,
      totalDoseIU: Number(weekRows.reduce((sum, r) => sum + Number(r.dose || 0), 0).toFixed(2))
    };
    updates.monthlyStats = {
      count: monthRows.length,
      totalDoseIU: Number(monthRows.reduce((sum, r) => sum + Number(r.dose || 0), 0).toFixed(2))
    };

    if (last.success && last.data) {
      updates.lastRecord = last.data;
      if (Number.isFinite(Number(last.data.weight)) && Number(last.data.weight) > 0) {
        updates.profile = { ...this.data.profile, weight: Number(last.data.weight) };
      }
    } else if (records.length > 0) {
      const sorted = [...records].sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
      updates.lastRecord = sorted[0];
    }
    if (!updates.lastRecord) {
      updates.lastRecord = null;
    }

    this.setData(updates, () => {
      const nowConc = this.computeConcentrationAt(Date.now());
      this.setData({ currentConcentration: nowConc.toFixed(1) });
      this.buildChartData(this.data.chartMode);
      wx.nextTick(() => this.drawChart());
    });
  },

  switchToDay() {
    this.buildChartData('day');
    wx.nextTick(() => this.drawChart());
  },

  switchToWeek() {
    this.buildChartData('week');
    wx.nextTick(() => this.drawChart());
  },

  buildChartData(mode) {
    const now = new Date();
    const labels = [];
    const points = [];
    const pointTimes = [];
    const renderPoints = [];

    if (mode === 'day') {
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);
      for (let i = 0; i < 24; i += 1) {
        const d = new Date(dayStart.getTime() + i * 3600000);
        labels.push(`${d.getHours()}时`);
        const t = d.getTime();
        pointTimes.push(t);
        points.push(this.computeConcentrationAt(t));
      }
      for (let i = 0; i <= 96; i += 1) {
        const t = dayStart.getTime() + i * 15 * 60000;
        renderPoints.push({ t, v: this.computeConcentrationAt(t) });
      }
    } else {
      for (let i = -2; i <= 4; i += 1) {
        const d = new Date(now.getTime() + i * 24 * 3600000);
        labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
        const t = d.getTime();
        pointTimes.push(t);
        points.push(this.computeConcentrationAt(t));
      }
      const start = now.getTime() - 2 * 24 * 3600000;
      for (let i = 0; i <= 28; i += 1) {
        const t = start + i * 6 * 3600000;
        renderPoints.push({ t, v: this.computeConcentrationAt(t) });
      }
    }

    this.setData({ chartMode: mode, chartData: { labels, points, pointTimes, renderPoints } });
  },

  drawChart(retry = 0) {
    const query = this.createSelectorQuery();
    query.select('#chartCanvas').fields({ node: true, size: true }).exec((res) => {
      const canvas = res[0] && res[0].node;
      if (!canvas || !res[0].width || !res[0].height) {
        if (retry < 6) {
          setTimeout(() => this.drawChart(retry + 1), 80);
        }
        return;
      }
      const ctx = canvas.getContext('2d');
      let dpr = 1;
      try {
        dpr = wx.getDeviceInfo().pixelRatio || 1;
      } catch (e) {
        dpr = 1;
      }
      canvas.width = res[0].width * dpr;
      canvas.height = res[0].height * dpr;
      ctx.scale(dpr, dpr);

      const width = res[0].width;
      const height = res[0].height;
      const pad = { left: 34, right: 8, top: 16, bottom: 24 };
      const labels = this.data.chartData.labels;
      const points = this.data.chartData.points;
      const pointTimes = this.data.chartData.pointTimes || [];
      const renderPoints = (this.data.chartData.renderPoints || []).length
        ? this.data.chartData.renderPoints
        : points.map((v, i) => ({ t: pointTimes[i] || i, v }));

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

      const minT = renderPoints.length ? Number(renderPoints[0].t) : 0;
      const maxT = renderPoints.length ? Number(renderPoints[renderPoints.length - 1].t) : 1;
      const toXByTime = (t) => pad.left + ((width - pad.left - pad.right) * (Number(t) - minT)) / Math.max(maxT - minT, 1);
      const toX = (i) => pad.left + ((width - pad.left - pad.right) * i) / Math.max(labels.length - 1, 1);
      const toY = (v) => pad.top + ((120 - v) / 120) * (height - pad.top - pad.bottom);

      ctx.beginPath();
      renderPoints.forEach((p, i) => {
        const x = toXByTime(p.t);
        const y = toY(p.v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#6b7280';
      ctx.font = '10px sans-serif';
      const step = this.data.chartMode === 'day' ? 6 : 1;
      labels.forEach((label, i) => {
        if (i % step === 0 || i === labels.length - 1) {
          ctx.fillText(label, toX(i) - 12, height - 6);
        }
      });

      if (this.data.chartMode === 'week') {
        ctx.fillStyle = '#2563eb';
        ctx.font = '10px sans-serif';
        points.forEach((p, i) => {
          const x = toX(i);
          const y = toY(p);
          const text = `${Number(p).toFixed(1)}%`;
          ctx.fillText(text, x - 16, Math.max(12, y - 8));
        });
      }

      ctx.fillStyle = '#334155';
      ctx.font = '11px sans-serif';
      ctx.fillText('因子浓度（%）', 4, 10);
    });
  },

  handleAddRecord() { wx.navigateTo({ url: '/pages/history/history?openAdd=1' }); },
  handleViewHistory() { wx.navigateTo({ url: '/pages/history/history' }); },
  handleViewMedicine() { wx.navigateTo({ url: '/pages/medicine-manage/medicine-manage' }); },
  handleViewProfile() { wx.navigateTo({ url: '/pages/profile/profile' }); }
});
