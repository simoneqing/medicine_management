const store = {
  profile: { userId: 'u_demo_001', weight: 68 },
  medicines: [
    { id: 'm1', brand: '果纳芬', halfLife: 26, recoveryRate: 2, unit: 'IU', specs: [150, 300, 600] },
    { id: 'm2', brand: '普丽康', halfLife: 24, recoveryRate: 1.8, unit: 'IU', specs: [50, 100, 200] }
  ],
  records: [
    { medicineId: 'm1', timestamp: '2026-03-28T08:30:00+08:00', counts: { '150': 1 } },
    { medicineId: 'm1', timestamp: '2026-03-27T08:20:00+08:00', counts: { '75': 2 } },
    { medicineId: 'm2', timestamp: '2026-03-26T20:15:00+08:00', counts: { '100': 1 } }
  ]
};
const PROFILE_STORAGE_KEY = 'medicine_profile_mock_v1';

let editingMedicineId = null;
let homeChartMode = 'day';
let draftSpecs = [150, 300, 600];
let historyFilterMode = 'week';
let lastAddedRecordKey = '';


function page() { return document.body.dataset.page; }
function pad(n) { return `${n}`.padStart(2, '0'); }
function formatDateTime(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function toDatetimeLocalValue(date = new Date()) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function getMedicineById(id) { return store.medicines.find((m) => m.id === id); }
function calcDoseByCounts(counts) { return Object.entries(counts).reduce((sum, [spec, count]) => sum + Number(spec) * Number(count || 0), 0); }
function calcExpectedRise(totalDose, weight, recoveryRate) { return weight <= 0 ? 0 : (totalDose / weight) * recoveryRate; }
function normalizeWeight(value) {
  const text = `${value ?? ''}`.trim();
  if (!/^\d+(\.\d)?$/.test(text)) return null;
  const num = Number(text);
  if (!Number.isFinite(num)) return null;
  if (num <= 0 || num > 300) return null;
  return Number(num.toFixed(1));
}
function loadProfileFromStorage() {
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const nextWeight = normalizeWeight(parsed?.weight);
    if (nextWeight !== null) store.profile.weight = nextWeight;
  } catch (e) {
    // ignore invalid mock cache
  }
}
function saveProfileToStorage() {
  try {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(store.profile));
  } catch (e) {
    // ignore storage errors in prototype
  }
}

function setStatus(id, text, type = 'info') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = type === 'error' ? '#b91c1c' : '#2563eb';
  el.style.background = type === 'error' ? '#fee2e2' : '#eff6ff';
}

function buildBottomNav() {
  const nav = document.getElementById('bottomNav');
  if (!nav) return;
  const map = [
    { p: 'home', href: './index.html', label: '首页' },
    { p: 'history', href: './history.html', label: '历史' },
    { p: 'add-record', href: './history.html?openAdd=1', label: '新增' },
    { p: 'medicine-manage', href: './medicine-manage.html', label: '药品' },
    { p: 'profile', href: './profile.html', label: '我的' }
  ];
  nav.innerHTML = map.map((item) => `<a class="${item.p === page() ? 'active' : ''}" href="${item.href}">${item.label}</a>`).join('');
}

function calcUnifiedConcentrationAt(targetDate) {
  const sorted = [...store.records].map((r) => ({ ...r, date: new Date(r.timestamp) })).sort((a, b) => a.date - b.date);
  let concentration = 0;
  let lastTime = null;

  for (const record of sorted) {
    if (record.date > targetDate) break;
    const med = getMedicineById(record.medicineId);
    if (!med) continue;
    if (lastTime) {
      const elapsed = Math.max(0, (record.date - lastTime) / 3600000);
      concentration *= Math.pow(0.5, elapsed / med.halfLife);
    }
    concentration += calcExpectedRise(calcDoseByCounts(record.counts), store.profile.weight, med.recoveryRate);
    lastTime = record.date;
  }

  return Math.min(120, Number(concentration.toFixed(2)));
}

function getChartSeries(mode) {
  const now = new Date();
  const labels = [];
  const points = [];
  if (mode === 'day') {
    for (let i = 23; i >= 0; i -= 1) {
      const d = new Date(now.getTime() - i * 3600000);
      labels.push(`${pad(d.getHours())}:00`);
      points.push(calcUnifiedConcentrationAt(d));
    }
  } else {
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now.getTime() - i * 24 * 3600000);
      labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
      points.push(calcUnifiedConcentrationAt(d));
    }
  }
  return { labels, points };
}

function drawChart(labels, points) {
  const canvas = document.getElementById('concChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const padArea = { left: 58, right: 18, top: 20, bottom: 42 };
  const maxY = 120;

  ctx.clearRect(0, 0, width, height);

  // axes
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padArea.left, padArea.top);
  ctx.lineTo(padArea.left, height - padArea.bottom);
  ctx.lineTo(width - padArea.right, height - padArea.bottom);
  ctx.stroke();

  // y ticks 0..120 step 20
  for (let v = 0; v <= 120; v += 20) {
    const y = padArea.top + ((maxY - v) / maxY) * (height - padArea.top - padArea.bottom);
    ctx.strokeStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.moveTo(padArea.left, y);
    ctx.lineTo(width - padArea.right, y);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.fillText(`${v}%`, 18, y + 4);
  }

  const toX = (i) => padArea.left + ((width - padArea.left - padArea.right) * i) / Math.max(labels.length - 1, 1);
  const toY = (v) => padArea.top + ((maxY - v) / maxY) * (height - padArea.top - padArea.bottom);

  ctx.beginPath();
  points.forEach((v, i) => {
    const x = toX(i);
    const y = toY(v);
    if (i === 0) ctx.moveTo(x, y);
    else {
      const px = toX(i - 1);
      const py = toY(points[i - 1]);
      const cx = (px + x) / 2;
      ctx.quadraticCurveTo(cx, py, x, y);
    }
  });
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 3;
  ctx.stroke();

  const step = homeChartMode === 'day' ? 3 : 1;
  labels.forEach((label, i) => {
    if (i % step !== 0 && i !== labels.length - 1) return;
    ctx.fillStyle = '#475569';
    ctx.font = '11px sans-serif';
    ctx.fillText(label, toX(i) - 14, height - 12);
  });

  // axis names
  ctx.fillStyle = '#334155';
  ctx.font = '12px sans-serif';
  ctx.fillText('血药浓度（%）', 8, padArea.top - 4);
  ctx.fillText('时间', width - 38, height - 8);
}

function renderHomeStats() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 3600000);

  const weekly = store.records.filter((r) => new Date(r.timestamp) >= weekAgo);
  const monthly = store.records.filter((r) => new Date(r.timestamp) >= monthAgo);

  document.getElementById('weeklyDoseCount').textContent = `${weekly.length} 次`;
  document.getElementById('weeklyDoseTotal').textContent = `${weekly.reduce((s, r) => s + calcDoseByCounts(r.counts), 0).toFixed(0)} IU`;
  document.getElementById('monthlyDoseCount').textContent = `${monthly.length} 次`;
  document.getElementById('monthlyDoseTotal').textContent = `${monthly.reduce((s, r) => s + calcDoseByCounts(r.counts), 0).toFixed(0)} IU`;
}

function setHomeTabs() {
  const day = document.getElementById('tabDay');
  const week = document.getElementById('tabWeek');
  if (!day || !week) return;
  day.classList.toggle('active', homeChartMode === 'day');
  week.classList.toggle('active', homeChartMode === 'week');
}

function renderHomeChart() {
  const { labels, points } = getChartSeries(homeChartMode);
  drawChart(labels, points);
}

function initHome() {
  const now = new Date();
  document.getElementById('nowTime').textContent = formatDateTime(now);
  document.getElementById('weightText').textContent = `体重 ${store.profile.weight} kg`;
  document.getElementById('currentConc').textContent = calcUnifiedConcentrationAt(now).toFixed(1);
  renderHomeStats();
  setHomeTabs();
  renderHomeChart();

  const tabDay = document.getElementById('tabDay');
  const tabWeek = document.getElementById('tabWeek');
  if (tabDay && tabWeek) {
    tabDay.addEventListener('click', () => { homeChartMode = 'day'; setHomeTabs(); renderHomeChart(); });
    tabWeek.addEventListener('click', () => { homeChartMode = 'week'; setHomeTabs(); renderHomeChart(); });
  }
}

function renderMedicineOptions() {
  const select = document.getElementById('medicineSelect');
  if (!select) return;
  select.innerHTML = store.medicines.map((m) => `<option value="${m.id}">${m.brand}（半衰期 ${m.halfLife}h）</option>`).join('');
}

function renderSpecInputs(medicineId) {
  const container = document.getElementById('specInputs');
  if (!container) return;
  const med = getMedicineById(medicineId);
  if (!med) {
    container.innerHTML = '<p class="muted">未找到药品规格</p>';
    return;
  }

  container.innerHTML = med.specs.map((spec) => `
    <div class="spec-item">
      <div class="spec-label">${spec} ${med.unit}</div>
      <div class="stepper">
        <button class="step-btn" type="button" data-spec="${spec}" data-op="minus">-</button>
        <span class="step-count" data-count-for="${spec}">0</span>
        <button class="step-btn" type="button" data-spec="${spec}" data-op="plus">+</button>
      </div>
    </div>
  `).join('');
}

function bindSpecChange(recalc) {
  document.querySelectorAll('[data-op]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const spec = btn.dataset.spec;
      const countEl = document.querySelector(`[data-count-for="${spec}"]`);
      if (!countEl) return;
      let n = Number(countEl.textContent || 0);
      n = btn.dataset.op === 'plus' ? n + 1 : Math.max(0, n - 1);
      countEl.textContent = String(n);
      recalc();
    });
  });
}

function bindAddRecordCalc() {
  const select = document.getElementById('medicineSelect');
  const specContainer = document.getElementById('specInputs');
  const submitBtn = document.getElementById('submitRecordBtn');
  if (!select || !specContainer || !submitBtn) return;

  const recalc = () => {
    const med = getMedicineById(select.value);
    if (!med) return;
    const counts = {};
    specContainer.querySelectorAll('.spec-count').forEach((input) => { counts[input.dataset.spec] = Number(input.value || 0); });
    const totalDose = calcDoseByCounts(counts);
    const expectedRise = calcExpectedRise(totalDose, store.profile.weight, med.recoveryRate);

    document.getElementById('totalDose').textContent = `${totalDose} mg`;
    document.getElementById('currentWeight').textContent = `${store.profile.weight} kg`;
    document.getElementById('currentRecoveryRate').textContent = `${med.recoveryRate}`;
    document.getElementById('expectedRise').textContent = `${expectedRise.toFixed(3)} mg/L`;
    submitBtn.disabled = totalDose <= 0;
  };

  select.addEventListener('change', () => { renderSpecInputs(select.value); bindSpecChange(recalc); recalc(); });
  bindSpecChange(recalc);
  recalc();
}

function initAddRecord() {
  const recordTime = document.getElementById('recordTime');
  if (!recordTime) return;
  recordTime.value = toDatetimeLocalValue(new Date());
  renderMedicineOptions();
  const select = document.getElementById('medicineSelect');
  renderSpecInputs(select.value);
  bindAddRecordCalc();
}

function renderSpecEditor() {
  const list = document.getElementById('specEditorList');
  const unit = (document.getElementById('medUnit')?.value || 'IU').trim() || 'IU';
  if (!list) return;

  list.innerHTML = draftSpecs.map((value, index) => `
    <div class="spec-editor-row">
      <label>规格 ${index + 1}
        <div class="spec-input-wrap">
          <input type="number" min="0.1" step="0.1" value="${value}" data-spec-index="${index}" class="spec-edit-input" />
          <span class="spec-unit-tag">${unit}</span>
        </div>
      </label>
      <button class="btn-ghost" type="button" data-remove-index="${index}">删除</button>
    </div>
  `).join('');

  list.querySelectorAll('.spec-edit-input').forEach((input) => {
    input.addEventListener('input', () => {
      draftSpecs[Number(input.dataset.specIndex)] = Number(input.value || 0);
    });
  });

  list.querySelectorAll('[data-remove-index]').forEach((btn) => {
    btn.addEventListener('click', () => {
      draftSpecs = draftSpecs.filter((_, i) => i !== Number(btn.dataset.removeIndex));
      renderSpecEditor();
    });
  });
}

function renderMedicineList() {
  const list = document.getElementById('medicineList');
  if (!list) return;

  list.innerHTML = store.medicines.map((m) => `
    <article class="list-item">
      <div class="list-head">
        <strong>${m.brand}</strong>
        <button class="small-btn" data-edit-id="${m.id}" type="button">编辑</button>
      </div>
      <div class="spec-main">${[...m.specs].sort((a, b) => a - b).join(' / ')} ${m.unit}</div>
      <div class="muted">同品牌下不同规格共用半衰期、回收率系数与规格单位</div>
      <div class="stats">
        <div><span>半衰期</span><strong>${m.halfLife} h</strong></div>
        <div><span>回收率系数（浓度换算）</span><strong>${m.recoveryRate}</strong></div>
        <div><span>规格单位</span><strong>${m.unit}</strong></div>
      </div>
      <div class="meta-line">预计提升浓度 =（总剂量 / 体重）× 回收率系数</div>
    </article>
  `).join('');

  list.querySelectorAll('[data-edit-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const med = getMedicineById(btn.dataset.editId);
      if (!med) return;
      editingMedicineId = med.id;
      draftSpecs = [...med.specs];
      document.getElementById('medicineFormTitle').textContent = `编辑药品：${med.brand}`;
      document.getElementById('medBrand').value = med.brand;
      document.getElementById('medHalfLife').value = med.halfLife;
      document.getElementById('medRecoveryRate').value = med.recoveryRate;
      document.getElementById('medUnit').value = med.unit || 'IU';
      renderSpecEditor();
      setStatus('medicineStatus', `已载入 ${med.brand}，可编辑共享参数和规格列表。`);
      const editState = document.getElementById('medicineEditState');
      if (editState) editState.textContent = `当前正在编辑：${med.brand}`;
    });
  });
}

function resetMedicineForm() {
  editingMedicineId = null;
  draftSpecs = [150, 300, 600];
  document.getElementById('medicineFormTitle').textContent = '新增药品';
  document.getElementById('medBrand').value = '';
  document.getElementById('medHalfLife').value = '';
  document.getElementById('medRecoveryRate').value = '';
  document.getElementById('medUnit').value = 'IU';
  renderSpecEditor();
  setStatus('medicineStatus', '可新增或点击列表“编辑”后更新。');
  const editState = document.getElementById('medicineEditState');
  if (editState) editState.textContent = '当前状态：新增药品';
}

function initMedicineManage() {
  if (!document.getElementById('medicineList')) return;

  renderMedicineList();
  renderSpecEditor();

  document.getElementById('medUnit').addEventListener('input', renderSpecEditor);
  document.getElementById('addSpecBtn').addEventListener('click', () => {
    draftSpecs.push(0);
    renderSpecEditor();
  });

  document.getElementById('saveMedicineBtn').addEventListener('click', () => {
    const brand = document.getElementById('medBrand').value.trim();
    const halfLife = Number(document.getElementById('medHalfLife').value);
    const recoveryRate = Number(document.getElementById('medRecoveryRate').value);
    const unit = (document.getElementById('medUnit').value || 'IU').trim() || 'IU';
    const specs = draftSpecs.map(Number).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);

    if (!brand || !halfLife || !recoveryRate || !specs.length) {
      setStatus('medicineStatus', '请完整填写品牌、半衰期、回收率、单位和规格列表。', 'error');
      return;
    }

    if (editingMedicineId) {
      const target = getMedicineById(editingMedicineId);
      target.brand = brand;
      target.halfLife = halfLife;
      target.recoveryRate = recoveryRate;
      target.unit = unit;
      target.specs = specs;
      setStatus('medicineStatus', '药品更新成功（mock）。');
    } else {
      store.medicines.push({ id: `m_${Date.now()}`, brand, halfLife, recoveryRate, unit, specs });
      setStatus('medicineStatus', '药品新增成功（mock）。');
    }

    renderMedicineList();
    resetMedicineForm();
  });

  document.getElementById('resetMedicineBtn').addEventListener('click', resetMedicineForm);
}

function openHistoryAddDrawer() {
  const d = document.getElementById('historyAddDrawer');
  if (!d) return;
  d.classList.remove('hidden');
  const t = document.getElementById('recordTime');
  if (t) t.value = toDatetimeLocalValue(new Date());
}

function closeHistoryAddDrawer() {
  const d = document.getElementById('historyAddDrawer');
  if (!d) return;
  d.classList.add('hidden');
}

function getFilteredHistoryRecords() {
  const now = new Date();
  const rows = [...store.records].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (historyFilterMode === 'week') {
    const from = new Date(now.getTime() - 7 * 24 * 3600000);
    return rows.filter((r) => new Date(r.timestamp) >= from);
  }
  if (historyFilterMode === 'month') {
    const from = new Date(now.getTime() - 30 * 24 * 3600000);
    return rows.filter((r) => new Date(r.timestamp) >= from);
  }
  if (historyFilterMode === 'custom') {
    const sDate = document.getElementById('customStart')?.value;
    const eDate = document.getElementById('customEnd')?.value;
    if (!sDate || !eDate) return rows;
    const from = new Date(`${sDate}T00:00:00`);
    const to = new Date(`${eDate}T23:59:59`);
    return rows.filter((r) => {
      const t = new Date(r.timestamp);
      return t >= from && t <= to;
    });
  }
  return rows;
}

function renderHistoryStats() {
  const total = store.records.length;
  const year = new Date().getFullYear();
  const yearCount = store.records.filter((r) => new Date(r.timestamp).getFullYear() === year).length;
  const totalEl = document.getElementById('historyTotalCount');
  const yearEl = document.getElementById('historyYearCount');
  if (totalEl) totalEl.textContent = String(total);
  if (yearEl) yearEl.textContent = String(yearCount);
}

function renderHistoryList() {
  const list = document.getElementById('historyList');
  if (!list) return;
  const rows = getFilteredHistoryRecords();

  if (!rows.length) {
    list.innerHTML = '';
    setStatus('historyStatus', '当前筛选条件下暂无记录。');
    return;
  }

  list.innerHTML = rows.map((r, idx) => {
    const med = getMedicineById(r.medicineId);
    const dose = calcDoseByCounts(r.counts);
    const rise = calcExpectedRise(dose, store.profile.weight, med?.recoveryRate || 0);
    const key = `${r.timestamp}_${r.medicineId}_${idx}`;
    const isNew = key === lastAddedRecordKey;
    return `
      <article class="list-item ${isNew ? 'new-record' : ''}">
        <div class="list-head">
          <strong>${formatDateTime(new Date(r.timestamp))}</strong>
          <span>${med?.brand || '未知药品'} ${isNew ? '<span class="new-tag">刚刚新增</span>' : ''}</span>
        </div>
        <div class="muted">规格组合：${Object.entries(r.counts).map(([s, c]) => `${s}${med?.unit || ''}×${c}`).join(' + ')}</div>
        <div class="muted">总剂量：${dose.toFixed(2)} ${med?.unit || ''}</div>
        <div class="muted">预计提升浓度：${rise.toFixed(2)}%</div>
      </article>
    `;
  }).join('');

  setStatus('historyStatus', `共 ${rows.length} 条记录，已按时间倒序展示。`);
}

function setFilterButtonState() {
  ['week', 'month', 'custom'].forEach((mode) => {
    const id = mode === 'week' ? 'filterWeek' : mode === 'month' ? 'filterMonth' : 'filterCustom';
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle('active', historyFilterMode === mode);
  });
  const wrap = document.getElementById('customDateWrap');
  if (wrap) wrap.classList.toggle('hidden', historyFilterMode !== 'custom');
}

function initHistoryRecordForm() {
  renderMedicineOptions();
  const select = document.getElementById('medicineSelect');
  if (!select) return;
  renderSpecInputs(select.value);

  const submitBtn = document.getElementById('submitRecordBtn');

  const recalc = () => {
    const med = getMedicineById(select.value);
    if (!med) return;
    const counts = {};
    document.querySelectorAll('#specInputs [data-count-for]').forEach((el) => {
      counts[el.dataset.countFor] = Number(el.textContent || 0);
    });
    const total = calcDoseByCounts(counts);
    const rise = calcExpectedRise(total, store.profile.weight, med.recoveryRate);
    document.getElementById('totalDose').textContent = `${total.toFixed(2)} ${med.unit}`;
    document.getElementById('currentWeight').textContent = `${store.profile.weight} kg`;
    document.getElementById('currentRecoveryRate').textContent = String(med.recoveryRate);
    document.getElementById('expectedRise').textContent = `${rise.toFixed(2)}%`;
    document.getElementById('calcDetail').textContent = `计算明细：(${total.toFixed(2)} / ${store.profile.weight}) × ${med.recoveryRate} = ${rise.toFixed(2)}%`;
    submitBtn.disabled = total <= 0;
    setStatus('recordStatus', total > 0 ? '可提交：计算完成。' : '请填写规格数量后提交。');
  };

  select.addEventListener('change', () => {
    renderSpecInputs(select.value);
    bindSpecChange(recalc);
    recalc();
  });

  bindSpecChange(recalc);
  recalc();

  submitBtn.addEventListener('click', () => {
    const med = getMedicineById(select.value);
    const counts = {};
    document.querySelectorAll('#specInputs [data-count-for]').forEach((el) => {
      const n = Number(el.textContent || 0);
      if (n > 0) counts[el.dataset.countFor] = n;
    });

    const timestamp = document.getElementById('recordTime').value;
    submitBtn.textContent = '提交中...';
    submitBtn.disabled = true;

    setTimeout(() => {
      const iso = new Date(timestamp || new Date()).toISOString();
      const newRecord = { medicineId: med.id, timestamp: iso, counts };
      store.records.push(newRecord);
      lastAddedRecordKey = `${newRecord.timestamp}_${newRecord.medicineId}_${getFilteredHistoryRecords().length}`;
      renderHistoryStats();
      renderHistoryList();
      closeHistoryAddDrawer();
      submitBtn.textContent = '提交记录';
      setStatus('historyStatus', '新增成功：新记录已出现在列表中。');
    }, 500);
  });
}

function initHistory() {
  if (!document.getElementById('historyList')) return;

  renderHistoryStats();
  setFilterButtonState();
  renderHistoryList();
  initHistoryRecordForm();

  document.getElementById('filterWeek').addEventListener('click', () => { historyFilterMode = 'week'; setFilterButtonState(); renderHistoryList(); });
  document.getElementById('filterMonth').addEventListener('click', () => { historyFilterMode = 'month'; setFilterButtonState(); renderHistoryList(); });
  document.getElementById('filterCustom').addEventListener('click', () => { historyFilterMode = 'custom'; setFilterButtonState(); renderHistoryList(); });
  document.getElementById('applyCustomFilter').addEventListener('click', renderHistoryList);

  document.getElementById('openAddInHistory').addEventListener('click', openHistoryAddDrawer);
  document.getElementById('fabAddBtn').addEventListener('click', openHistoryAddDrawer);
  document.getElementById('closeAddDrawer').addEventListener('click', closeHistoryAddDrawer);

  const params = new URLSearchParams(window.location.search);
  if (params.get('openAdd') === '1') openHistoryAddDrawer();
}

function initProfile() {
  const n = document.getElementById('profileWeight');
  const input = document.getElementById('profileWeightInput');
  const saveBtn = document.getElementById('saveWeightBtn');
  if (!n || !input || !saveBtn) return;

  const renderCurrentWeight = () => {
    n.textContent = String(store.profile.weight);
    input.value = String(store.profile.weight);
  };

  const syncSaveButtonState = () => {
    const valid = normalizeWeight(input.value) !== null;
    saveBtn.disabled = !valid;
    return valid;
  };

  const showProfileStatus = (text, type = 'info') => {
    setStatus('profileStatus', text, type);
  };

  renderCurrentWeight();
  syncSaveButtonState();
  showProfileStatus('请输入大于 0 且不超过 300 的数字（最多 1 位小数）。');

  input.addEventListener('input', () => {
    const raw = input.value.trim();
    if (!raw) {
      showProfileStatus('体重不能为空，请输入有效数字。', 'error');
      syncSaveButtonState();
      return;
    }
    if (normalizeWeight(raw) === null) {
      showProfileStatus('输入不合法：仅支持 >0 且 <=300，最多 1 位小数。', 'error');
      syncSaveButtonState();
      return;
    }
    syncSaveButtonState();
    showProfileStatus('输入合法，可点击“保存体重”。');
  });

  saveBtn.addEventListener('click', () => {
    if (saveBtn.disabled) return;
    const trimmed = input.value.trim();
    if (!trimmed) {
      showProfileStatus('体重不能为空，请输入有效数字。', 'error');
      return;
    }
    const nextWeight = normalizeWeight(trimmed);
    if (nextWeight === null) {
      showProfileStatus('体重需为大于 0 且不超过 300 的数字（支持小数）。', 'error');
      return;
    }

    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';

    setTimeout(() => {
      store.profile.weight = nextWeight;
      saveProfileToStorage();
      renderCurrentWeight();
      showProfileStatus('保存成功：当前体重已更新，并将用于后续计算。');
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
      syncSaveButtonState();
    }, 500);
  });
}

(function bootstrap() {
  loadProfileFromStorage();
  buildBottomNav();
  if (page() === 'home') initHome();
  if (page() === 'add-record') initAddRecord();
  if (page() === 'medicine-manage') initMedicineManage();
  if (page() === 'history') initHistory();
  if (page() === 'profile') initProfile();
})();
