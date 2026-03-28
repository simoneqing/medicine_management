const PROFILE_STORAGE_KEY = 'medicine_profile_mock_v1';

function normalizeWeight(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num <= 0 || num > 300) return null;
  return Number(num.toFixed(1));
}

Page({
  data: {
    profile: { weight: 68 },
    weightInput: '68',
    saving: false,
    statusType: 'info',
    statusText: '请输入 0~300 之间的体重（支持小数），然后点击保存。'
  },

  onLoad() {
    this.loadProfile();
  },

  loadProfile() {
    const cached = wx.getStorageSync(PROFILE_STORAGE_KEY);
    const fallbackWeight = this.data.profile.weight;
    const nextWeight = normalizeWeight(cached && cached.weight);
    const weight = nextWeight === null ? fallbackWeight : nextWeight;
    this.setData({
      profile: { ...this.data.profile, weight },
      weightInput: String(weight)
    });
  },

  onWeightInput(e) {
    this.setData({ weightInput: e.detail.value });
  },

  setStatus(text, type = 'info') {
    this.setData({ statusText: text, statusType: type });
  },

  saveWeight() {
    if (this.data.saving) return;
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
    setTimeout(() => {
      const profile = { ...this.data.profile, weight: nextWeight };
      wx.setStorageSync(PROFILE_STORAGE_KEY, profile);
      this.setData({
        saving: false,
        profile,
        weightInput: String(nextWeight)
      });
      this.setStatus('保存成功：当前体重已更新，并将用于后续计算。');
      wx.showToast({ title: '保存成功', icon: 'success' });
    }, 500);
  }
});
