Page({
  data: {
    medicines: [],
    editingId: '',
    statusText: '可新增或点击列表“编辑”后更新。',
    form: {
      brand: '',
      halfLife: '',
      recoveryRate: '',
      unit: 'IU',
      specs: [150, 300, 600]
    }
  },

  onLoad() {
    this.setData({
      medicines: this.formatMedicines([
        { id: 'm1', brand: '果纳芬', halfLife: 26, recoveryRate: 2, unit: 'IU', specs: [150, 300, 600] },
        { id: 'm2', brand: '普丽康', halfLife: 24, recoveryRate: 1.8, unit: 'IU', specs: [50, 100, 200] }
      ])
    });
  },

  formatMedicines(list) {
    return list.map((m) => ({ ...m, specText: `${m.specs.join(' / ')} ${m.unit}` }));
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

  removeSpec(e) {
    const idx = Number(e.currentTarget.dataset.index);
    this.setData({ 'form.specs': this.data.form.specs.filter((_, i) => i !== idx) });
  },

  editMedicine(e) {
    const id = e.currentTarget.dataset.id;
    const med = this.data.medicines.find((m) => m.id === id);
    if (!med) return;

    this.setData({
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

  resetForm() {
    this.setData({
      editingId: '',
      statusText: '可新增或点击列表“编辑”后更新。',
      form: {
        brand: '',
        halfLife: '',
        recoveryRate: '',
        unit: 'IU',
        specs: [150, 300, 600]
      }
    });
  },

  saveMedicine() {
    const { brand, halfLife, recoveryRate, unit, specs } = this.data.form;
    const cleanUnit = (unit || 'IU').trim() || 'IU';
    const cleanSpecs = specs.map(Number).filter((x) => Number.isFinite(x) && x > 0);

    if (!brand || !halfLife || !recoveryRate || !cleanSpecs.length) {
      this.setData({ statusText: '请完整填写品牌、半衰期、回收率、单位和规格列表。' });
      return;
    }

    let next = [...this.data.medicines];
    if (this.data.editingId) {
      next = next.map((m) => (m.id === this.data.editingId
        ? { ...m, brand, halfLife: Number(halfLife), recoveryRate: Number(recoveryRate), unit: cleanUnit, specs: cleanSpecs }
        : m));
      this.setData({ statusText: '药品更新成功（mock）。' });
    } else {
      next.push({ id: `m_${Date.now()}`, brand, halfLife: Number(halfLife), recoveryRate: Number(recoveryRate), unit: cleanUnit, specs: cleanSpecs });
      this.setData({ statusText: '药品新增成功（mock）。' });
    }

    this.setData({ medicines: this.formatMedicines(next) });
    this.resetForm();
  }
});
