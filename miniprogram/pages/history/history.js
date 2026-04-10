const PROFILE_STORAGE_KEY = 'medicine_profile_mock_v1';
const DEFAULT_USER_ID = 'u_demo_001';

function pad(n) { return `${n}`.padStart(2, '0'); }
function formatDateTime(date) { return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function toDateValue(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function toTimeValue(date) { return `${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function calcDoseByCounts(counts) { return Object.entries(counts || {}).reduce((s, [k, v]) => s + Number(k) * Number(v || 0), 0); }
function calcExpectedRise(total, weight, rr) { return weight <= 0 ? 0 : (total / weight) * rr; }

Page({
  data: {
    userId: DEFAULT_USER_ID,
    profile: { weight: 68 },
    medicines: [],
    records: [],
    stats: { total: 0, year: 0 },
    filterMode: 'week',
    customStart: '2026-03-01',
    customEnd: '2026-03-31',
    filteredRecords: [],
    showAddForm: false,
    submitting: false,
    formDate: '',
    formClock: '',
    selectedMedicineIndex: 0,
    medicineOptions: [],
    specInputs: [],
    calc: { totalDose: '0 IU', weight: '68 kg', recoveryRate: '0', expectedRise: '0', detail: '' },
    lastAddedId: ''
  },

  onLoad(options) {
    const now = new Date();
    this.setData({ formDate: toDateValue(now), formClock: toTimeValue(now) });
    this.initCloudData().then(() => {
      if (options.openAdd === '1') this.openAddForm();
    });
  },

  onShow() {
    this.loadProfileFromStorage();
    this.refreshStatsAndList();
    this.recalcForm();
  },

  async initCloudData() {
    await Promise.all([this.loadProfileFromCloud(), this.loadMedicinesFromCloud(), this.loadRecordsFromCloud()]);
    this.refreshStatsAndList();
    this.resetSpecInputs();
  },

  async loadProfileFromCloud() {
    const db = wx.cloud.database();
    try {
      const res = await db.collection('users').doc(this.data.userId).get();
      const w = Number(res.data?.weight);
      if (Number.isFinite(w) && w > 0 && w <= 300) {
        const profile = { ...this.data.profile, weight: Number(w.toFixed(1)) };
        this.setData({ profile });
        wx.setStorageSync(PROFILE_STORAGE_KEY, profile);
        return;
      }
    } catch (e) {
      // ignore and fallback local cache
    }
    this.loadProfileFromStorage();
  },

  loadProfileFromStorage() {
    const cached = wx.getStorageSync(PROFILE_STORAGE_KEY);
    if (!cached || typeof cached !== 'object') return;
    const nextWeight = Number(cached.weight);
    if (!Number.isFinite(nextWeight) || nextWeight <= 0 || nextWeight > 300) return;
    this.setData({ profile: { ...this.data.profile, weight: Number(nextWeight.toFixed(1)) } });
  },

  async loadMedicinesFromCloud() {
    const db = wx.cloud.database();
    const res = await db.collection('medicines').get();
    const medicines = (res.data || []).map((m) => ({
      id: m._id,
      brand: m.brand || m.name || '未知药品',
      recoveryRate: Number(m.recoveryRate ?? m.xValue ?? 2),
      unit: m.unit || 'IU',
      specs: Array.isArray(m.specs) ? m.specs.map(Number).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b) : []
    }));

    this.setData({
      medicines,
      medicineOptions: medicines,
      selectedMedicineIndex: 0
    });
  },

  async loadRecordsFromCloud() {
    const res = await wx.cloud.callFunction({
      name: 'getWeeklyStats',
      data: { userId: this.data.userId, days: 36500, withRecords: true }
    });
    const rows = res.result?.success ? (res.result.data?.records || []) : [];

    const records = rows.map((r) => ({
      id: r._id,
      medicineId: r.medicineId,
      timestamp: Number(r.timestamp),
      dose: Number(r.dose || 0),
      counts: r.counts && typeof r.counts === 'object' ? r.counts : {},
      createdAt: Number(r.createdAt || r.timestamp || 0)
    }));

    this.setData({ records });
  },

  switchFilter(e) { this.setData({ filterMode: e.currentTarget.dataset.mode }, this.refreshStatsAndList); },
  onCustomStart(e) { this.setData({ customStart: e.detail.value }, this.refreshStatsAndList); },
  onCustomEnd(e) { this.setData({ customEnd: e.detail.value }, this.refreshStatsAndList); },

  getFilteredRecords() {
    const now = Date.now();
    const rows = [...this.data.records];
    if (this.data.filterMode === 'week') {
      const from = now - 7 * 24 * 3600000;
      return rows.filter((r) => Number(r.timestamp) >= from);
    }
    if (this.data.filterMode === 'month') {
      const from = now - 30 * 24 * 3600000;
      return rows.filter((r) => Number(r.timestamp) >= from);
    }
    const from = new Date(`${this.data.customStart}T00:00:00`).getTime();
    const to = new Date(`${this.data.customEnd}T23:59:59`).getTime();
    return rows.filter((r) => Number(r.timestamp) >= from && Number(r.timestamp) <= to);
  },

  refreshStatsAndList() {
    const total = this.data.records.length;
    const year = new Date().getFullYear();
    const yearCount = this.data.records.filter((r) => new Date(Number(r.timestamp)).getFullYear() === year).length;

    const filteredRecords = this.getFilteredRecords()
      .sort((a, b) => {
        const tsDiff = Number(b.timestamp || 0) - Number(a.timestamp || 0);
        if (tsDiff !== 0) return tsDiff;
        return Number(b.createdAt || 0) - Number(a.createdAt || 0);
      })
      .map((r) => {
        const med = this.data.medicines.find((m) => m.id === r.medicineId) || {};
        const fromCounts = calcDoseByCounts(r.counts);
        const totalDoseVal = fromCounts > 0 ? fromCounts : Number(r.dose || 0);
        const rise = Math.round(calcExpectedRise(totalDoseVal, this.data.profile.weight, Number(med.recoveryRate || 0)));
        const specText = fromCounts > 0
          ? Object.entries(r.counts).map(([s, c]) => `${s}${med.unit || ''}×${c}`).join(' + ')
          : `总剂量记录 ${totalDoseVal.toFixed(2)} ${med.unit || 'IU'}`;
        return {
          ...r,
          isNew: r.id === this.data.lastAddedId,
          timeText: formatDateTime(new Date(Number(r.timestamp))),
          brand: med.brand || '未知药品',
          specText,
          totalDose: `${totalDoseVal.toFixed(2)} ${med.unit || 'IU'}`,
          expectedRise: `${rise}%`
        };
      });

    this.setData({ stats: { total, year: yearCount }, filteredRecords });
  },

  openAddForm() {
    const now = new Date();
    this.setData({ showAddForm: true, formDate: toDateValue(now), formClock: toTimeValue(now) });
  },
  closeAddForm() { this.setData({ showAddForm: false }); },
  onFormDate(e) { this.setData({ formDate: e.detail.value }); },
  onFormClock(e) { this.setData({ formClock: e.detail.value }); },

  onMedicineChange(e) {
    this.setData({ selectedMedicineIndex: Number(e.detail.value) });
    this.resetSpecInputs();
  },

  resetSpecInputs() {
    const med = this.data.medicines[this.data.selectedMedicineIndex];
    if (!med) {
      this.setData({ specInputs: [] });
      return;
    }
    const specInputs = (med.specs || []).map((s) => ({ spec: s, unit: med.unit, count: 0 }));
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
    if (!med) return;
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

  async submitRecord() {
    if (this.data.submitting) return;
    const med = this.data.medicines[this.data.selectedMedicineIndex];
    if (!med) {
      wx.showToast({ title: '请先维护药品数据', icon: 'none' });
      return;
    }

    const counts = {};
    this.data.specInputs.forEach((i) => { if (i.count > 0) counts[i.spec] = i.count; });
    if (!Object.keys(counts).length) {
      wx.showToast({ title: '请先填写规格数量', icon: 'none' });
      return;
    }

    const totalDose = calcDoseByCounts(counts);
    const datetimeText = `${this.data.formDate}T${this.data.formClock || '00:00'}:00`;
    const timestampMs = new Date(datetimeText).getTime();

    this.setData({ submitting: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'addMedicineRecord',
        data: {
          userId: this.data.userId,
          medicineId: med.id,
          dose: totalDose,
          timestamp: timestampMs,
          counts,
          createdAt: Date.now()
        }
      });

      if (!res.result?.success) {
        throw new Error(res.result?.message || '新增失败');
      }

      await this.loadRecordsFromCloud();
      const latest = [...this.data.records].sort((a, b) => Number(b.createdAt) - Number(a.createdAt))[0];
      this.setData({
        submitting: false,
        showAddForm: false,
        lastAddedId: latest?.id || ''
      }, () => {
        this.refreshStatsAndList();
        wx.showToast({ title: '新增成功', icon: 'success' });
      });
    } catch (e) {
      this.setData({ submitting: false });
      wx.showToast({ title: e.message || '新增失败', icon: 'none' });
    }
  }
});
