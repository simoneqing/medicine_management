const PROFILE_STORAGE_KEY = 'medicine_profile_mock_v1';
const HISTORY_CACHE_KEY = 'medicine_history_records_cache_v1';
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
    recordsCalcBaseWeight: 68,
    stats: { total: 0, year: 0 },
    filterMode: 'week',
    customStart: '2026-03-01',
    customEnd: '2026-03-31',
    filteredRecords: [],
    showAddForm: false,
    submitting: false,
    deletingId: '',
    editingRecordId: '',
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
    this.loadRecordsFromCache();
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
    const requestId = Date.now();
    this._latestRecordsRequestId = requestId;
    const res = await wx.cloud.callFunction({
      name: 'getWeeklyStats',
      data: { userId: this.data.userId, days: 36500, withRecords: true }
    });
    let rows = res.result?.success ? (res.result.data?.records || []) : [];

    // 兼容：如果云端仍是旧版 getWeeklyStats（未返回 records），回退到客户端直查
    if (!rows.length && !Array.isArray(res.result?.data?.records)) {
      const db = wx.cloud.database();
      const _ = db.command;
      const direct = await db.collection('medRecords')
        .where({ userId: this.data.userId, timestamp: _.exists(true) })
        .get();
      rows = direct.data || [];
    }

    const records = rows.map((r) => ({
      id: r._id,
      medicineId: r.medicineId,
      timestamp: Number(r.timestamp),
      dose: Number(r.dose || 0),
      counts: r.counts && typeof r.counts === 'object' ? r.counts : {},
      createdAt: Number(r.createdAt || r.timestamp || 0),
      expectedRise: Number.isFinite(Number(r.expectedRise)) ? Number(r.expectedRise) : null,
      weightSnapshot: Number.isFinite(Number(r.weightSnapshot)) ? Number(r.weightSnapshot) : null
    }));

    if (!records.length && this.data.records.length) {
      return;
    }
    if (this._latestRecordsRequestId !== requestId) return;

    this.setData({ records, recordsCalcBaseWeight: Number(this.data.profile.weight || 68) });
    wx.setStorageSync(HISTORY_CACHE_KEY, records);
  },

  loadRecordsFromCache() {
    const cached = wx.getStorageSync(HISTORY_CACHE_KEY);
    if (!Array.isArray(cached) || !cached.length) return;
    this.setData({ records: cached }, this.refreshStatsAndList);
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
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const startOfYesterday = startOfToday - 24 * 3600000;
        const ts = Number(r.timestamp || 0);
        const shouldLiveUpdate = ts >= startOfYesterday;
        const fallbackWeight = Number(r.weightSnapshot || this.data.recordsCalcBaseWeight || this.data.profile.weight);
        const staticRise = Number.isFinite(Number(r.expectedRise))
          ? Number(r.expectedRise)
          : calcExpectedRise(totalDoseVal, fallbackWeight, Number(med.recoveryRate || 0));
        const rise = Math.round(shouldLiveUpdate
          ? calcExpectedRise(totalDoseVal, this.data.profile.weight, Number(med.recoveryRate || 0))
          : staticRise);
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
          expectedRise: `${rise}%`,
          canDelete: Boolean(r.id && !`${r.id}`.startsWith('local_')),
          canEdit: Boolean(r.id && !`${r.id}`.startsWith('local_'))
        };
      });

    this.setData({ stats: { total, year: yearCount }, filteredRecords });
  },

  openAddForm() {
    const now = new Date();
    this.setData({
      showAddForm: true,
      editingRecordId: '',
      formDate: toDateValue(now),
      formClock: toTimeValue(now)
    });
  },
  closeAddForm() { this.setData({ showAddForm: false, editingRecordId: '' }); },
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
      const payload = {
        userId: this.data.userId,
        medicineId: med.id,
        dose: totalDose,
        timestamp: timestampMs,
        counts,
        createdAt: Date.now(),
        expectedRise: Number(this.data.calc.expectedRise || 0),
        weightSnapshot: Number(this.data.profile.weight || 0)
      };
      const isEditing = Boolean(this.data.editingRecordId);
      const res = await wx.cloud.callFunction({
        name: isEditing ? 'updateMedicineRecord' : 'addMedicineRecord',
        data: isEditing ? { ...payload, recordId: this.data.editingRecordId } : payload
      });

      if (!res.result?.success) {
        throw new Error(res.result?.message || (isEditing ? '更新失败' : '新增失败'));
      }

      if (isEditing) {
        const nextRecords = this.data.records.map((r) => (r.id === this.data.editingRecordId
          ? {
            ...r,
            medicineId: med.id,
            timestamp: timestampMs,
            dose: totalDose,
            counts,
            expectedRise: Number(this.data.calc.expectedRise || 0),
            weightSnapshot: Number(this.data.profile.weight || 0)
          }
          : r));
        this.setData({
          records: nextRecords,
          submitting: false,
          showAddForm: false,
          editingRecordId: ''
        }, () => {
          wx.setStorageSync(HISTORY_CACHE_KEY, this.data.records);
          this.refreshStatsAndList();
          wx.showToast({ title: '更新成功', icon: 'success' });
        });
      } else {
        const recordId = res.result?.recordId || `local_${Date.now()}`;
        const localRecord = {
          id: recordId,
          medicineId: med.id,
          timestamp: timestampMs,
          dose: totalDose,
          counts,
          createdAt: Date.now(),
          expectedRise: Number(this.data.calc.expectedRise || 0),
          weightSnapshot: Number(this.data.profile.weight || 0)
        };
        this.setData({
          records: [localRecord, ...this.data.records],
          submitting: false,
          showAddForm: false,
          editingRecordId: '',
          lastAddedId: recordId
        }, () => {
          wx.setStorageSync(HISTORY_CACHE_KEY, this.data.records);
          this.refreshStatsAndList();
          wx.showToast({ title: '新增成功', icon: 'success' });
        });
      }

      this.loadRecordsFromCloud().then(() => this.refreshStatsAndList());
    } catch (e) {
      this.setData({ submitting: false });
      wx.showToast({ title: e.message || (this.data.editingRecordId ? '更新失败' : '新增失败'), icon: 'none' });
    }
  },

  onEditRecord(e) {
    const recordId = e.currentTarget.dataset.id;
    const target = this.data.records.find((r) => r.id === recordId);
    if (!target) return;

    const medIndex = this.data.medicines.findIndex((m) => m.id === target.medicineId);
    const selectedMedicineIndex = medIndex >= 0 ? medIndex : 0;
    const med = this.data.medicines[selectedMedicineIndex];
    const editDate = new Date(Number(target.timestamp || Date.now()));
    const counts = target.counts && typeof target.counts === 'object' ? target.counts : {};
    const specInputs = (med?.specs || []).map((s) => ({
      spec: s,
      unit: med.unit,
      count: Number(counts[s] || 0)
    }));

    this.setData({
      showAddForm: true,
      editingRecordId: recordId,
      selectedMedicineIndex,
      formDate: toDateValue(editDate),
      formClock: toTimeValue(editDate),
      specInputs
    }, () => this.recalcForm());
  },

  async onDeleteRecord(e) {
    const recordId = e.currentTarget.dataset.id;
    if (!recordId || this.data.deletingId) return;
    const confirmRes = await wx.showModal({
      title: '删除记录',
      content: '确认删除这条用药记录？删除后不可恢复。',
      confirmColor: '#ef4444'
    });
    if (!confirmRes.confirm) return;

    this.setData({ deletingId: recordId });
    try {
      const res = await wx.cloud.callFunction({
        name: 'deleteMedicineRecord',
        data: { userId: this.data.userId, recordId }
      });
      if (!res.result?.success) {
        throw new Error(res.result?.message || '删除失败');
      }

      const next = this.data.records.filter((r) => r.id !== recordId);
      const shouldCloseEditor = this.data.editingRecordId === recordId;
      this.setData({
        records: next,
        deletingId: '',
        showAddForm: shouldCloseEditor ? false : this.data.showAddForm,
        editingRecordId: shouldCloseEditor ? '' : this.data.editingRecordId
      }, () => {
        wx.setStorageSync(HISTORY_CACHE_KEY, next);
        this.refreshStatsAndList();
      });
      wx.showToast({ title: '删除成功', icon: 'success' });
    } catch (err) {
      this.setData({ deletingId: '' });
      wx.showToast({ title: err.message || '删除失败', icon: 'none' });
    }
  }
});
