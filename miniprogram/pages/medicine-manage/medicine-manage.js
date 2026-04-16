Page({
  data: {
    medicines: [],
    showEditModal: false,
    editingId: '',
    statusText: '可新增药品，点击列表项可进入编辑。',
    form: {
      brand: '',
      halfLife: '',
      recoveryRate: '',
      unit: 'IU',
      specs: [150, 300, 600]
    }
  },

  async onLoad() {
    await this.loadMedicines();
  },

  formatMedicines(list) {
    return list.map((m) => ({
      ...m,
      specText: `${[...m.specs].sort((a, b) => a - b).join(' / ')} ${m.unit}`
    }));
  },

  async loadMedicines() {
    const db = wx.cloud.database();
    const res = await db.collection('medicines').get();
    const medicines = (res.data || []).map((m) => ({
      id: m._id,
      brand: m.brand || m.name || '',
      halfLife: Number(m.halfLife || 0),
      recoveryRate: Number(m.recoveryRate ?? m.xValue ?? 0),
      unit: m.unit || 'IU',
      specs: Array.isArray(m.specs) ? m.specs.map(Number).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b) : []
    }));
    this.setData({ medicines: this.formatMedicines(medicines) });
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`form.${key}`]: e.detail.value });
  },

  onSpecInput(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const specs = [...this.data.form.specs];
    specs[idx] = Number(e.detail.value || 0);
    this.setData({ 'form.specs': specs });
  },

  addSpec() {
    this.setData({ 'form.specs': [...this.data.form.specs, 0] });
  },

  noop() {},

  removeSpec(e) {
    const idx = Number(e.currentTarget.dataset.index);
    this.setData({ 'form.specs': this.data.form.specs.filter((_, i) => i !== idx) });
  },

  editMedicine(e) {
    const id = e.currentTarget.dataset.id;
    const med = this.data.medicines.find((m) => m.id === id);
    if (!med) return;

    this.setData({
      showEditModal: true,
      editingId: id,
      form: {
        brand: med.brand,
        halfLife: med.halfLife,
        recoveryRate: med.recoveryRate,
        unit: med.unit || 'IU',
        specs: [...med.specs]
      },
      statusText: `已载入 ${med.brand}，可编辑共享参数和规格列表。`
    });
  },

  closeEditModal() {
    this.setData({
      showEditModal: false,
      editingId: '',
      statusText: '可新增药品，点击列表项可进入编辑。',
      form: {
        brand: '',
        halfLife: '',
        recoveryRate: '',
        unit: 'IU',
        specs: [150, 300, 600]
      }
    });
  },

  resetForm() {
    this.setData({
      editingId: '',
      showEditModal: false,
      statusText: '可新增药品，点击列表项可进入编辑。',
      form: {
        brand: '',
        halfLife: '',
        recoveryRate: '',
        unit: 'IU',
        specs: [150, 300, 600]
      }
    });
  },

  async saveMedicine() {
    const { brand, halfLife, recoveryRate, unit, specs } = this.data.form;
    const cleanUnit = (unit || 'IU').trim() || 'IU';
    const cleanSpecs = specs.map(Number).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);

    if (!brand || !halfLife || !recoveryRate || !cleanSpecs.length) {
      this.setData({ statusText: '请完整填写品牌、半衰期、回收率、单位和规格列表。' });
      return;
    }

    const payload = {
      brand,
      name: brand,
      halfLife: Number(halfLife),
      recoveryRate: Number(recoveryRate),
      xValue: Number(recoveryRate),
      unit: cleanUnit,
      specs: cleanSpecs,
      updatedAt: Date.now()
    };

    const db = wx.cloud.database();
    try {
      if (this.data.editingId) {
        await db.collection('medicines').doc(this.data.editingId).update({ data: payload });
        this.setData({ statusText: '药品更新成功。' });
      } else {
        await db.collection('medicines').add({ data: { ...payload, createdAt: Date.now() } });
        this.setData({ statusText: '药品新增成功。' });
      }

      await this.loadMedicines();
      this.resetForm();
    } catch (e) {
      this.setData({ statusText: `保存失败：${e.message || '请稍后重试'}` });
    }
  }
});
