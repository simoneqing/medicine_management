const PROFILE_STORAGE_KEY = 'medicine_profile_mock_v1';
const DEFAULT_USER_ID = 'u_demo_001';

function normalizeWeight(value) {
  const text = `${value ?? ''}`.trim();
  if (!/^\d+(\.\d)?$/.test(text)) return null;
  const num = Number(text);
  if (!Number.isFinite(num)) return null;
  if (num <= 0 || num > 300) return null;
  return Number(num.toFixed(1));
}

Page({
  data: {
    userId: DEFAULT_USER_ID,
    maskedUserId: '',
    profile: { weight: 68 },
    weightInput: '68',
    canSave: true,
    saving: false,
    statusType: 'info',
    statusText: '请输入大于 0 且不超过 300 的数字（最多 1 位小数）。'
  },

  onLoad() {
    const tail = this.data.userId.slice(-6);
    this.setData({ maskedUserId: `***${tail}` });
    this.loadProfile();
  },

  async loadProfile() {
    const db = wx.cloud.database();
    try {
      const res = await db.collection('users').doc(this.data.userId).get();
      const nextWeight = normalizeWeight(res.data?.weight);
      if (nextWeight !== null) {
        const profile = { ...this.data.profile, weight: nextWeight };
        wx.setStorageSync(PROFILE_STORAGE_KEY, profile);
        this.setData({
          profile,
          weightInput: String(nextWeight),
          canSave: true
        });
        return;
      }
    } catch (e) {
      // fallback local cache
    }

    const cached = wx.getStorageSync(PROFILE_STORAGE_KEY);
    const nextWeight = normalizeWeight(cached && cached.weight);
    const weight = nextWeight === null ? this.data.profile.weight : nextWeight;
    this.setData({
      profile: { ...this.data.profile, weight },
      weightInput: String(weight),
      canSave: true
    });
  },

  onWeightInput(e) {
    const nextInput = e.detail.value;
    const nextWeight = normalizeWeight(nextInput);
    if (!nextInput.trim()) {
      this.setData({
        weightInput: nextInput,
        canSave: false,
        statusType: 'error',
        statusText: '体重不能为空，请输入有效数字。'
      });
      return;
    }

    if (nextWeight === null) {
      this.setData({
        weightInput: nextInput,
        canSave: false,
        statusType: 'error',
        statusText: '输入不合法：仅支持 >0 且 <=300，最多 1 位小数。'
      });
      return;
    }

    this.setData({
      weightInput: nextInput,
      canSave: true,
      statusType: 'info',
      statusText: '输入合法，可点击“保存体重”。'
    });
  },

  setStatus(text, type = 'info') {
    this.setData({ statusText: text, statusType: type });
  },

  async saveWeight() {
    if (this.data.saving || !this.data.canSave) return;
    const input = (this.data.weightInput || '').trim();
    if (!input) {
      this.setStatus('体重不能为空，请输入有效数字。', 'error');
      return;
    }

    const nextWeight = normalizeWeight(input);
    if (nextWeight === null) {
      this.setStatus('体重需为大于 0 且不超过 300 的数字（支持小数）。', 'error');
      return;
    }

    this.setData({ saving: true });
    const db = wx.cloud.database();
    const profile = { ...this.data.profile, weight: nextWeight };

    try {
      await db.collection('users').doc(this.data.userId).set({ data: { weight: nextWeight, updatedAt: Date.now() } });
      wx.setStorageSync(PROFILE_STORAGE_KEY, profile);
      this.setData({
        saving: false,
        profile,
        weightInput: String(nextWeight),
        canSave: true
      });
      this.setStatus('保存成功：当前体重已更新，并将用于后续计算。');
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (e) {
      this.setData({ saving: false });
      this.setStatus(`保存失败：${e.message || '请稍后重试'}`, 'error');
    }
  },

  switchTab(e) {
    const key = e.currentTarget.dataset.key;
    if (key === 'profile') return;
    if (key === 'home') return wx.reLaunch({ url: '/pages/home/home' });
    if (key === 'history') return wx.reLaunch({ url: '/pages/history/history' });
    if (key === 'add') return wx.reLaunch({ url: '/pages/history/history?openAdd=1' });
    if (key === 'medicine') return wx.reLaunch({ url: '/pages/medicine-manage/medicine-manage' });
  }
});
