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
function getDayStartTimestamp(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function catmullRomInterpolate(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1)
    + (-p0 + p2) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
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
    recentRecords: [],
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
        name: m.brand || m.name || '未知药品',
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
    const weekdayMap = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    updates.recentRecords = [...records]
      .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
      .slice(0, 2)
      .map((r) => {
        const med = medicineMap[r.medicineId] || {};
        const dt = new Date(Number(r.timestamp));
        const specText = r.counts && typeof r.counts === 'object' && Object.keys(r.counts).length
          ? Object.entries(r.counts).filter(([, c]) => Number(c || 0) > 0).map(([s, c]) => `${s}IU×${c}`).join(' + ')
          : `${Number(r.dose || 0).toFixed(0)}IU`;
        return {
          id: r._id || `${r.timestamp}-${r.medicineId}`,
          specText,
          brand: med.name || '未知药品',
          timeText: `${`${dt.getHours()}`.padStart(2, '0')}:${`${dt.getMinutes()}`.padStart(2, '0')}`,
          weekday: weekdayMap[dt.getDay()],
          dateText: `${`${dt.getMonth() + 1}`.padStart(2, '0')}-${`${dt.getDate()}`.padStart(2, '0')}`
        };
      });

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
      const todayStart = getDayStartTimestamp(now.getTime());
      const records = this.data.records || [];
      const recordDaySet = new Set(
        records
          .map((r) => normalizeTimestamp(r.timestamp || r.createdAt))
          .filter((ts) => ts > 0)
          .map((ts) => getDayStartTimestamp(ts))
      );
      const halfHour = 30 * 60000;
      for (let i = -2; i <= 4; i += 1) {
        const dayStartMs = todayStart + i * 24 * 3600000;
        const dayEndMs = dayStartMs + 24 * 3600000;
        const d = new Date(dayStartMs);
        labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
        pointTimes.push(dayEndMs - 1);

        const hasRecord = recordDaySet.has(dayStartMs);
        if (hasRecord) {
          let dayPeak = 0;
          for (let t = dayStartMs; t < dayEndMs; t += halfHour) {
            dayPeak = Math.max(dayPeak, this.computeConcentrationAt(t));
          }
          dayPeak = Math.max(dayPeak, this.computeConcentrationAt(dayEndMs - 1));
          points.push(Number(dayPeak.toFixed(1)));
        } else {
          points.push(this.computeConcentrationAt(dayEndMs - 1));
        }
      }

      if (points.length >= 2) {
        const segmentCount = 12;
        for (let i = 0; i < points.length - 1; i += 1) {
          const p0 = points[Math.max(0, i - 1)];
          const p1 = points[i];
          const p2 = points[i + 1];
          const p3 = points[Math.min(points.length - 1, i + 2)];
          const t1 = pointTimes[i];
          const t2 = pointTimes[i + 1];
          for (let s = 0; s < segmentCount; s += 1) {
            const ratio = s / segmentCount;
            const t = t1 + (t2 - t1) * ratio;
            const smoothValue = clamp(catmullRomInterpolate(p0, p1, p2, p3, ratio), 0, 120);
            renderPoints.push({ t, v: Number(smoothValue.toFixed(2)) });
          }
        }
        renderPoints.push({
          t: pointTimes[pointTimes.length - 1],
          v: Number(points[points.length - 1].toFixed(2))
        });
      } else if (points.length === 1) {
        renderPoints.push({ t: pointTimes[0], v: points[0] });
        renderPoints.push({ t: pointTimes[0] + 3600000, v: points[0] });
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
      if (typeof ctx.setTransform === 'function') {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      } else {
        ctx.scale(dpr, dpr);
      }

      const width = res[0].width;
      const height = res[0].height;
      const pad = { left: 58, right: 18, top: 22, bottom: 38 };
      const labels = this.data.chartData.labels;
      const points = this.data.chartData.points;
      const pointTimes = this.data.chartData.pointTimes || [];
      const renderPoints = (this.data.chartData.renderPoints || []).length
        ? this.data.chartData.renderPoints
        : points.map((v, i) => ({ t: pointTimes[i] || i, v }));

      ctx.clearRect(0, 0, width, height);
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#D7E4F7';
      ctx.lineWidth = 1.2;
      for (let i = 0; i <= 6; i += 1) {
        const y = pad.top + ((height - pad.top - pad.bottom) * i) / 6;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(width - pad.right, y);
        ctx.stroke();
        const tick = 120 - i * 20;
        ctx.fillStyle = '#5F6B7A';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${tick}%`, pad.left - 8, y);
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
      ctx.strokeStyle = '#2B7DE0';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.fillStyle = '#5F6B7A';
      ctx.font = '14px sans-serif';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'center';
      const step = this.data.chartMode === 'day' ? 6 : 1;
      labels.forEach((label, i) => {
        if (i % step === 0 || i === labels.length - 1) {
          ctx.fillText(label, toX(i), height - pad.bottom + 10);
        }
      });

      if (this.data.chartMode === 'week') {
        ctx.fillStyle = '#2B7DE0';
        ctx.font = '13px sans-serif';
        ctx.textBaseline = 'bottom';
        points.forEach((p, i) => {
          const x = toX(i);
          const y = toY(p);
          const text = `${Number(p).toFixed(1)}%`;
          ctx.fillText(text, x, Math.max(pad.top + 2, y - 6));
        });
      }

    });
  },

  switchTab(e) {
    const key = e.currentTarget.dataset.key;
    if (key === 'home') return;
    if (key === 'history') return wx.redirectTo({ url: '/pages/history/history' });
    if (key === 'add') return wx.redirectTo({ url: '/pages/history/history?openAdd=1' });
    if (key === 'medicine') return wx.redirectTo({ url: '/pages/medicine-manage/medicine-manage' });
    if (key === 'profile') return wx.redirectTo({ url: '/pages/profile/profile' });
  }
});
