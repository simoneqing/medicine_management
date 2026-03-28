const store = {
  profile: { userId: 'u_demo_001', weight: 68 },
  medicines: [
    { id: 'm1', brand: '舍曲林', halfLife: 26, recoveryRate: 2, specs: [10, 20, 40] },
    { id: 'm2', brand: '阿戈美拉汀', halfLife: 2.3, recoveryRate: 1.4, specs: [25] }
  ],
  records: [
    { medicineId: 'm1', timestamp: '2026-03-27T08:30:00+08:00', counts: { '20': 1, '40': 1 } },
    { medicineId: 'm1', timestamp: '2026-03-26T08:20:00+08:00', counts: { '20': 2 } },
    { medicineId: 'm2', timestamp: '2026-03-25T20:15:00+08:00', counts: { '25': 1 } }
  ]
};

let editingMedicineId = null;

function page() {
  return document.body.dataset.page;
}

function pad(n) {
  return `${n}`.padStart(2, '0');
}

function formatDateTime(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toDatetimeLocalValue(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getMedicineById(id) {
  return store.medicines.find((m) => m.id === id);
}

function calcDoseByCounts(counts) {
  return Object.entries(counts).reduce((sum, [spec, count]) => sum + Number(spec) * Number(count || 0), 0);
}

function calcExpectedRise(totalDose, weight, recoveryRate) {
  if (weight <= 0) return 0;
  return (totalDose / weight) * recoveryRate;
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
    { p: 'add-record', href: './add-record.html', label: '新增' },
    { p: 'medicine-manage', href: './medicine-manage.html', label: '药品' },
    { p: 'profile', href: './profile.html', label: '我的' }
  ];

  nav.innerHTML = map
    .map((item) => `<a class="${item.p === page() ? 'active' : ''}" href="${item.href}">${item.label}</a>`)
    .join('');
}

function calcConcentrationAt(targetDate) {
  const sorted = [...store.records]
    .map((r) => ({ ...r, date: new Date(r.timestamp) }))
    .sort((a, b) => a.date - b.date);

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

    const dose = calcDoseByCounts(record.counts);
    concentration += calcExpectedRise(dose, store.profile.weight, med.recoveryRate);
    lastTime = record.date;
  }

  if (lastTime) {
    const lastMed = getMedicineById(sorted[sorted.length - 1].medicineId);
    const elapsed = Math.max(0, (targetDate - lastTime) / 3600000);
    concentration *= Math.pow(0.5, elapsed / (lastMed?.halfLife || 24));
  }

  return Number(concentration.toFixed(3));
}

function drawChart(labels, points) {
  const canvas = document.getElementById('concChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const padArea = { left: 56, right: 20, top: 20, bottom: 34 };

  ctx.clearRect(0, 0, width, height);

  const maxY = Math.max(...points, 0.5) * 1.15;
  const toX = (i) => padArea.left + ((width - padArea.left - padArea.right) * i) / (labels.length - 1);
  const toY = (v) => padArea.top + ((maxY - v) / maxY) * (height - padArea.top - padArea.bottom);

  ctx.strokeStyle = '#e5e7eb';
  for (let i = 0; i <= 4; i += 1) {
    const y = padArea.top + ((height - padArea.top - padArea.bottom) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padArea.left, y);
    ctx.lineTo(width - padArea.right, y);
    ctx.stroke();
  }

  ctx.beginPath();
  points.forEach((v, i) => {
    const x = toX(i);
    const y = toY(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 3;
  ctx.stroke();

  labels.forEach((label, i) => {
    ctx.fillStyle = '#4b5563';
    ctx.font = '12px sans-serif';
    ctx.fillText(label, toX(i) - 12, height - 8);
  });
}

function initHome() {
  const now = new Date();
  const records = [...store.records].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const lastRecord = records[0];
  const lastMedicine = lastRecord ? getMedicineById(lastRecord.medicineId) : null;

  document.getElementById('nowTime').textContent = formatDateTime(now);
  document.getElementById('weeklyDoseCount').textContent = `${store.records.length} 次`;
  document.getElementById('weeklyMissedCount').textContent = '1 次';
  document.getElementById('remainCount').textContent = '26 片';
  document.getElementById('weightText').textContent = `体重 ${store.profile.weight} kg`;

  if (lastRecord && lastMedicine) {
    const dose = calcDoseByCounts(lastRecord.counts);
    const specText = Object.entries(lastRecord.counts)
      .filter(([, c]) => Number(c) > 0)
      .map(([spec, c]) => `${spec}mg×${c}`)
      .join(' + ');
    document.getElementById('lastMedicine').textContent = lastMedicine.brand;
    document.getElementById('lastSpec').textContent = specText || '--';
    document.getElementById('lastDose').textContent = `${dose} mg`;
    document.getElementById('lastTime').textContent = formatDateTime(new Date(lastRecord.timestamp));
    document.getElementById('halfLifeBadge').textContent = `半衰期 ${lastMedicine.halfLife} h`;
  }

  document.getElementById('currentConc').textContent = `${calcConcentrationAt(now).toFixed(3)}`;

  const labels = [];
  const points = [];
  for (let i = 24; i >= 0; i -= 2) {
    const d = new Date(now.getTime() - i * 3600000);
    labels.push(`${pad(d.getHours())}:00`);
    points.push(calcConcentrationAt(d));
  }
  drawChart(labels, points);
}

function renderMedicineOptions() {
  const select = document.getElementById('medicineSelect');
  if (!select) return;

  select.innerHTML = store.medicines
    .map((m) => `<option value="${m.id}">${m.brand}（半衰期 ${m.halfLife}h）</option>`)
    .join('');
}

function renderSpecInputs(medicineId) {
  const container = document.getElementById('specInputs');
  if (!container) return;

  const med = getMedicineById(medicineId);
  if (!med) {
    container.innerHTML = '<p class="muted">未找到药品规格</p>';
    return;
  }

  container.innerHTML = med.specs
    .map((spec) => `<label>${spec} mg 数量<input type="number" min="0" step="1" value="0" data-spec="${spec}" class="spec-count" /></label>`)
    .join('');
}

function bindSpecChange(recalc) {
  document.querySelectorAll('.spec-count').forEach((input) => {
    input.addEventListener('input', recalc);
  });
}

function bindAddRecordCalc() {
  const select = document.getElementById('medicineSelect');
  const specContainer = document.getElementById('specInputs');
  const submitBtn = document.getElementById('submitRecordBtn');

  const recalc = () => {
    const med = getMedicineById(select.value);
    if (!med) return;

    const counts = {};
    specContainer.querySelectorAll('.spec-count').forEach((input) => {
      counts[input.dataset.spec] = Number(input.value || 0);
    });

    const totalDose = calcDoseByCounts(counts);
    const expectedRise = calcExpectedRise(totalDose, store.profile.weight, med.recoveryRate);

    document.getElementById('totalDose').textContent = `${totalDose} mg`;
    document.getElementById('currentWeight').textContent = `${store.profile.weight} kg`;
    document.getElementById('currentRecoveryRate').textContent = `${med.recoveryRate}`;
    document.getElementById('expectedRise').textContent = `${expectedRise.toFixed(3)} mg/L`;

    submitBtn.disabled = totalDose <= 0;
    setStatus('recordStatus', totalDose > 0 ? '可提交：已完成有效剂量计算。' : '请选择规格数量后提交。');
  };

  select.addEventListener('change', () => {
    renderSpecInputs(select.value);
    bindSpecChange(recalc);
    recalc();
  });

  bindSpecChange(recalc);
  recalc();
}

function initAddRecord() {
  document.getElementById('recordTime').value = toDatetimeLocalValue(new Date());
  renderMedicineOptions();

  const select = document.getElementById('medicineSelect');
  renderSpecInputs(select.value);
  bindAddRecordCalc();

  document.getElementById('submitRecordBtn').addEventListener('click', () => {
    setStatus('recordStatus', '提交成功（mock）：记录已保存到演示数据流。');
  });
}

function renderMedicineList() {
  const list = document.getElementById('medicineList');
  if (!list) return;

  list.innerHTML = store.medicines
    .map((m) => `
      <article class="list-item">
        <div class="list-head">
          <strong>${m.brand}</strong>
          <button class="small-btn" data-edit-id="${m.id}">编辑</button>
        </div>
        <div class="stats">
          <div><span>半衰期</span><strong>${m.halfLife} h</strong></div>
          <div><span>回收率</span><strong>${m.recoveryRate}</strong></div>
          <div><span>规格</span><strong>${m.specs.join(' / ')} mg</strong></div>
        </div>
      </article>
    `)
    .join('');

  list.querySelectorAll('[data-edit-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const med = getMedicineById(btn.dataset.editId);
      if (!med) return;
      editingMedicineId = med.id;
      document.getElementById('medicineFormTitle').textContent = `编辑药品：${med.brand}`;
      document.getElementById('medBrand').value = med.brand;
      document.getElementById('medHalfLife').value = med.halfLife;
      document.getElementById('medRecoveryRate').value = med.recoveryRate;
      document.getElementById('medSpecs').value = med.specs.join(',');
      setStatus('medicineStatus', `已载入 ${med.brand}，修改后点击保存。`);
    });
  });
}

function resetMedicineForm() {
  editingMedicineId = null;
  document.getElementById('medicineFormTitle').textContent = '新增药品';
  document.getElementById('medBrand').value = '';
  document.getElementById('medHalfLife').value = '';
  document.getElementById('medRecoveryRate').value = '';
  document.getElementById('medSpecs').value = '';
  setStatus('medicineStatus', '可新增或点击列表“编辑”后更新。');
}

function initMedicineManage() {
  renderMedicineList();

  document.getElementById('saveMedicineBtn').addEventListener('click', () => {
    const brand = document.getElementById('medBrand').value.trim();
    const halfLife = Number(document.getElementById('medHalfLife').value);
    const recoveryRate = Number(document.getElementById('medRecoveryRate').value);
    const specs = document.getElementById('medSpecs').value
      .split(',')
      .map((x) => Number(x.trim()))
      .filter((x) => Number.isFinite(x) && x > 0);

    if (!brand || !halfLife || !recoveryRate || !specs.length) {
      setStatus('medicineStatus', '请完整填写品牌、半衰期、回收率和规格。', 'error');
      return;
    }

    if (editingMedicineId) {
      const target = getMedicineById(editingMedicineId);
      target.brand = brand;
      target.halfLife = halfLife;
      target.recoveryRate = recoveryRate;
      target.specs = specs;
      setStatus('medicineStatus', '药品更新成功（mock）。');
    } else {
      store.medicines.push({ id: `m_${Date.now()}`, brand, halfLife, recoveryRate, specs });
      setStatus('medicineStatus', '药品新增成功（mock）。');
    }

    resetMedicineForm();
    renderMedicineList();
  });

  document.getElementById('resetMedicineBtn').addEventListener('click', resetMedicineForm);
}

function initHistory() {
  const list = document.getElementById('historyList');
  if (!list) return;

  const rows = [...store.records].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  if (!rows.length) {
    list.innerHTML = '';
    setStatus('historyStatus', '暂无历史记录，请先前往“新增记录”页录入。');
    return;
  }

  list.innerHTML = rows.map((r) => {
    const med = getMedicineById(r.medicineId);
    const dose = calcDoseByCounts(r.counts);
    return `
      <article class="list-item">
        <div class="list-head"><strong>${med?.brand || '未知药品'}</strong><span>${formatDateTime(new Date(r.timestamp))}</span></div>
        <div class="muted">剂量组合：${Object.entries(r.counts).map(([s, c]) => `${s}mg×${c}`).join(' + ')}</div>
        <div class="muted">总剂量：${dose} mg</div>
      </article>
    `;
  }).join('');

  setStatus('historyStatus', `共 ${rows.length} 条记录，按时间倒序展示。`);
}

function initProfile() {
  const n = document.getElementById('profileWeight');
  if (n) n.textContent = String(store.profile.weight);
}

(function bootstrap() {
  buildBottomNav();
  const p = page();
  if (p === 'home') initHome();
  if (p === 'add-record') initAddRecord();
  if (p === 'medicine-manage') initMedicineManage();
  if (p === 'history') initHistory();
  if (p === 'profile') initProfile();
})();
