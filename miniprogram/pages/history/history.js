const PROFILE_STORAGE_KEY = 'medicine_profile_mock_v1';

function pad(n) { return `${n}`.padStart(2, '0'); }
function toDateTimeInput(date) { return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function formatDateTime(date) { return `${date.getMonth()+1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function calcDoseByCounts(counts) { return Object.entries(counts).reduce((s,[k,v]) => s + Number(k) * Number(v||0), 0); }
function calcExpectedRise(total, weight, rr) { return weight <= 0 ? 0 : (total / weight) * rr; }

Page({
  data: {
    profile: { weight: 68 },
    medicines: [
      { id: 'm1', brand: '果纳芬', recoveryRate: 2, unit: 'IU', specs: [150,300,600] },
      { id: 'm2', brand: '普丽康', recoveryRate: 1.8, unit: 'IU', specs: [50,100,200] }
    ],
    records: [
      { id: 'r1', medicineId: 'm1', timestamp: '2026-03-28T08:30:00+08:00', counts: { '150': 1 } },
      { id: 'r2', medicineId: 'm2', timestamp: '2026-03-15T09:20:00+08:00', counts: { '100': 2 } }
    ],
    stats: { total: 0, year: 0 },
    filterMode: 'week',
    customStart: '2026-03-01',
    customEnd: '2026-03-31',
    filteredRecords: [],
    showAddForm: false,
    submitting: false,
    formTime: '',
    selectedMedicineIndex: 0,
    medicineOptions: [],
    specInputs: [],
    calc: { totalDose: '0', weight: '68 kg', recoveryRate: '0', expectedRise: '0', detail: '' },
    lastAddedId: ''
  },

  onLoad(options) {
    this.loadProfileFromStorage();
    const medicines = this.data.medicines;
    this.setData({ medicineOptions: medicines, formTime: toDateTimeInput(new Date()) });
    this.resetSpecInputs();
    this.refreshStatsAndList();
    if (options.openAdd === '1') this.openAddForm();
  },

  onShow() {
    const oldWeight = this.data.profile.weight;
    this.loadProfileFromStorage();
    if (this.data.profile.weight !== oldWeight) {
      this.refreshStatsAndList();
      this.recalcForm();
    }
  },

  loadProfileFromStorage() {
    const cached = wx.getStorageSync(PROFILE_STORAGE_KEY);
    if (!cached || typeof cached !== 'object') return;
    const nextWeight = Number(cached.weight);
    if (!Number.isFinite(nextWeight) || nextWeight <= 0 || nextWeight > 300) return;
    this.setData({ profile: { ...this.data.profile, weight: Number(nextWeight.toFixed(1)) } });
  },

  switchFilter(e) { this.setData({ filterMode: e.currentTarget.dataset.mode }, this.refreshStatsAndList); },
  onCustomStart(e) { this.setData({ customStart: e.detail.value }, this.refreshStatsAndList); },
  onCustomEnd(e) { this.setData({ customEnd: e.detail.value }, this.refreshStatsAndList); },

  getFilteredRecords() {
    const now = new Date();
    const rows = [...this.data.records];
    if (this.data.filterMode === 'week') {
      const from = new Date(now.getTime() - 7 * 24 * 3600000);
      return rows.filter((r) => new Date(r.timestamp) >= from);
    }
    if (this.data.filterMode === 'month') {
      const from = new Date(now.getTime() - 30 * 24 * 3600000);
      return rows.filter((r) => new Date(r.timestamp) >= from);
    }
    const from = new Date(`${this.data.customStart}T00:00:00`);
    const to = new Date(`${this.data.customEnd}T23:59:59`);
    return rows.filter((r) => { const t = new Date(r.timestamp); return t >= from && t <= to; });
  },

  refreshStatsAndList() {
    const total = this.data.records.length;
    const year = new Date().getFullYear();
    const yearCount = this.data.records.filter((r) => new Date(r.timestamp).getFullYear() === year).length;

    const filteredRecords = this.getFilteredRecords()
      .sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp))
      .map((r) => {
        const med = this.data.medicines.find((m) => m.id === r.medicineId) || {};
        const totalDose = calcDoseByCounts(r.counts);
        const rise = Math.round(calcExpectedRise(totalDose, this.data.profile.weight, med.recoveryRate || 0));
        return {
          ...r,
          isNew: r.id === this.data.lastAddedId,
          timeText: formatDateTime(new Date(r.timestamp)),
          brand: med.brand || '未知药品',
          specText: Object.entries(r.counts).map(([s,c]) => `${s}${med.unit||''}×${c}`).join(' + '),
          totalDose: `${totalDose.toFixed(2)} ${med.unit||''}`,
          expectedRise: `${rise}%`
        };
      });

    this.setData({ stats: { total, year: yearCount }, filteredRecords });
  },

  openAddForm() { this.setData({ showAddForm: true, formTime: toDateTimeInput(new Date()) }); },
  closeAddForm() { this.setData({ showAddForm: false }); },
  onFormTime(e) { this.setData({ formTime: e.detail.value }); },

  onMedicineChange(e) {
    this.setData({ selectedMedicineIndex: Number(e.detail.value) });
    this.resetSpecInputs();
  },

  resetSpecInputs() {
    const med = this.data.medicines[this.data.selectedMedicineIndex];
    const specInputs = med.specs.map((s) => ({ spec: s, unit: med.unit, count: 0 }));
    this.setData({ specInputs }, this.recalcForm);
  },

  stepSpec(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const op = e.currentTarget.dataset.op;
    const arr = [...this.data.specInputs];
    const cur = Number(arr[idx].count || 0);
    arr[idx].count = op === 'plus' ? cur + 1 : Math.max(0, cur - 1);
    this.setData({ specInputs: arr }, this.recalcForm);
  },

  recalcForm() {
    const med = this.data.medicines[this.data.selectedMedicineIndex];
    const counts = {};
    this.data.specInputs.forEach((i) => { counts[i.spec] = i.count; });
    const totalDose = calcDoseByCounts(counts);
    const rise = Math.round(calcExpectedRise(totalDose, this.data.profile.weight, med.recoveryRate));
    this.setData({
      calc: {
        totalDose: `${totalDose.toFixed(2)} ${med.unit}`,
        weight: `${this.data.profile.weight} kg`,
        recoveryRate: `${med.recoveryRate}`,
        expectedRise: String(rise),
        detail: `(${totalDose.toFixed(2)} / ${this.data.profile.weight}) × ${med.recoveryRate} ≈ ${rise}%`
      }
    });
  },

  submitRecord() {
    if (this.data.submitting) return;
    const med = this.data.medicines[this.data.selectedMedicineIndex];
    const counts = {};
    this.data.specInputs.forEach((i) => { if (i.count > 0) counts[i.spec] = i.count; });
    if (!Object.keys(counts).length) {
      wx.showToast({ title: '请先填写规格数量', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    setTimeout(() => {
      const id = `r_${Date.now()}`;
      const record = {
        id,
        medicineId: med.id,
        timestamp: new Date(this.data.formTime || new Date()).toISOString(),
        counts
      };
      this.data.records.push(record);
      this.setData({ submitting: false, showAddForm: false, lastAddedId: id }, () => {
        this.refreshStatsAndList();
        wx.showToast({ title: '新增成功', icon: 'success' });
      });
    }, 500);
  }
});
