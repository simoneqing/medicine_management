function calcDoseByCounts(counts) {
  return Object.entries(counts).reduce((sum, [spec, count]) => sum + Number(spec) * Number(count || 0), 0);
}

function calcExpectedRise(totalDose, weight, recoveryRate) {
  if (weight <= 0) return 0;
  return (totalDose / weight) * recoveryRate;
}

function calcConcentrationAt(records, medicines, weight, targetDate) {
  const sorted = [...records].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  let concentration = 0;
  let lastTime = null;

  for (const record of sorted) {
    const t = new Date(record.timestamp);
    if (t > targetDate) break;
    const med = medicines.find((m) => m.id === record.medicineId);
    if (!med) continue;

    if (lastTime) {
      const elapsed = Math.max(0, (t - lastTime) / 3600000);
      concentration *= Math.pow(0.5, elapsed / med.halfLife);
    }

    concentration += calcExpectedRise(calcDoseByCounts(record.counts), weight, med.recoveryRate);
    lastTime = t;
  }

  if (concentration > 120) concentration = 120;
  return Number(concentration.toFixed(1));
}

Page({
  data: {
    profile: { weight: 68 },
    medicines: [
      { id: 'm1', brand: '舍曲林', halfLife: 26, recoveryRate: 2, specs: [10, 20, 40] },
      { id: 'm2', brand: '阿戈美拉汀', halfLife: 2.3, recoveryRate: 1.4, specs: [25] }
    ],
    records: [
      { medicineId: 'm1', timestamp: '2026-03-28T08:30:00+08:00', counts: { '20': 1, '40': 1 } },
      { medicineId: 'm1', timestamp: '2026-03-27T08:20:00+08:00', counts: { '20': 2 } },
      { medicineId: 'm2', timestamp: '2026-03-26T20:15:00+08:00', counts: { '25': 1 } }
    ],
    weeklyStats: { count: 0, totalDose: 0 },
    monthlyStats: { count: 0, totalDose: 0 },
    currentConcentration: '0.0',
    chartMode: 'day',
    chartData: { labels: [], points: [] }
  },

  onLoad() {
    this.buildStats();
    this.buildChartData('day');
    this.drawChart();
  },

  switchToDay() {
    this.buildChartData('day');
    this.drawChart();
  },

  switchToWeek() {
    this.buildChartData('week');
    this.drawChart();
  },

  buildStats() {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3600000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 3600000);

    const weekly = this.data.records.filter((r) => new Date(r.timestamp) >= weekAgo);
    const monthly = this.data.records.filter((r) => new Date(r.timestamp) >= monthAgo);

    const weeklyTotal = weekly.reduce((s, r) => s + calcDoseByCounts(r.counts), 0);
    const monthlyTotal = monthly.reduce((s, r) => s + calcDoseByCounts(r.counts), 0);

    const current = calcConcentrationAt(this.data.records, this.data.medicines, this.data.profile.weight, now);

    this.setData({
      weeklyStats: { count: weekly.length, totalDose: weeklyTotal },
      monthlyStats: { count: monthly.length, totalDose: monthlyTotal },
      currentConcentration: current.toFixed(1)
    });
  },

  buildChartData(mode) {
    const now = new Date();
    const labels = [];
    const points = [];

    if (mode === 'day') {
      for (let i = 23; i >= 0; i -= 1) {
        const d = new Date(now.getTime() - i * 3600000);
        labels.push(`${d.getHours()}时`);
        points.push(calcConcentrationAt(this.data.records, this.data.medicines, this.data.profile.weight, d));
      }
    } else {
      for (let i = 6; i >= 0; i -= 1) {
        const d = new Date(now.getTime() - i * 24 * 3600000);
        labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
        points.push(calcConcentrationAt(this.data.records, this.data.medicines, this.data.profile.weight, d));
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
      const dpr = wx.getSystemInfoSync().pixelRatio;
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
    });
  },

  handleAddRecord() { wx.showToast({ title: '请接入录入页', icon: 'none' }); },
  handleViewHistory() { wx.showToast({ title: '请接入记录列表页', icon: 'none' }); },
  handleViewProfile() { wx.showToast({ title: '请接入个人信息页', icon: 'none' }); }
});
