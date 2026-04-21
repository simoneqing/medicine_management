const mockProfile = { userId: 'u_demo_001', weight: 68 };

const mockMedicine = {
  medicineId: 'm_001',
  name: '舍曲林',
  spec: '50mg*14片',
  halfLife: 26,
  xValue: 2
};

const mockRecords = [
  { dose: 50, timestamp: '2026-03-27T08:30:00+08:00' },
  { dose: 50, timestamp: '2026-03-26T08:20:00+08:00' },
  { dose: 25, timestamp: '2026-03-25T20:15:00+08:00' },
  { dose: 50, timestamp: '2026-03-24T08:25:00+08:00' }
];

function formatCNTime(date) {
  const pad = (n) => `${n}`.padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function calculateStartConcentration(prevConc, dose, weight, xValue) {
  return prevConc + (dose / weight) * xValue;
}

function decayConcentration(startConc, elapsedHours, halfLife) {
  const factor = Math.pow(0.5, elapsedHours / halfLife);
  return startConc * factor;
}

function hoursBetween(later, earlier) {
  return Math.max(0, (later - earlier) / 3600000);
}

function concentrationAtTime(targetDate) {
  const sorted = [...mockRecords]
    .map((r) => ({ ...r, date: new Date(r.timestamp) }))
    .sort((a, b) => a.date - b.date);

  let conc = 0;
  let lastTime = null;

  for (const record of sorted) {
    if (record.date > targetDate) break;

    if (lastTime) {
      const elapsedBeforeDose = hoursBetween(record.date, lastTime);
      conc = decayConcentration(conc, elapsedBeforeDose, mockMedicine.halfLife);
    }

    conc = calculateStartConcentration(conc, record.dose, mockProfile.weight, mockMedicine.xValue);
    lastTime = record.date;
  }

  if (lastTime) {
    const elapsedAfterLastDose = hoursBetween(targetDate, lastTime);
    conc = decayConcentration(conc, elapsedAfterLastDose, mockMedicine.halfLife);
  }

  return Number(conc.toFixed(3));
}

function drawChart(labels, points) {
  const canvas = document.getElementById('concChart');
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const pad = { left: 56, right: 20, top: 20, bottom: 34 };

  ctx.clearRect(0, 0, width, height);

  const maxY = Math.max(...points, 0.5) * 1.15;
  const minY = 0;

  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + ((height - pad.top - pad.bottom) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();

    const value = (maxY - ((maxY - minY) * i) / 4).toFixed(2);
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px sans-serif';
    ctx.fillText(value, 8, y + 4);
  }

  ctx.strokeStyle = '#93c5fd';
  ctx.lineWidth = 1;
  for (let i = 0; i < labels.length; i += 1) {
    const x = pad.left + ((width - pad.left - pad.right) * i) / (labels.length - 1);
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, height - pad.bottom);
    ctx.stroke();
  }

  const toX = (i) => pad.left + ((width - pad.left - pad.right) * i) / (labels.length - 1);
  const toY = (v) => pad.top + ((maxY - v) / (maxY - minY)) * (height - pad.top - pad.bottom);

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

  points.forEach((v, i) => {
    const x = toX(i);
    const y = toY(v);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#1d4ed8';
    ctx.fill();
  });

  ctx.fillStyle = '#4b5563';
  ctx.font = '12px sans-serif';
  labels.forEach((label, i) => {
    const x = toX(i);
    ctx.fillText(label, x - 10, height - 10);
  });
}

function fillHome() {
  const now = new Date();
  const nowConc = concentrationAtTime(now);

  document.getElementById('nowTime').textContent = formatCNTime(now);
  document.getElementById('weeklyDoseCount').textContent = `${mockRecords.length} 次`;
  document.getElementById('weeklyMissedCount').textContent = '1 次';
  document.getElementById('remainCount').textContent = '26 片';

  const last = mockRecords[0];
  document.getElementById('lastMedicine').textContent = mockMedicine.name;
  document.getElementById('lastSpec').textContent = mockMedicine.spec;
  document.getElementById('lastDose').textContent = `${last.dose} mg`;
  document.getElementById('lastTime').textContent = formatCNTime(new Date(last.timestamp));

  document.getElementById('currentConc').textContent = nowConc.toFixed(2);
  document.getElementById('halfLifeBadge').textContent = `半衰期 ${mockMedicine.halfLife}h`;
  document.getElementById('weightText').textContent = `体重 ${mockProfile.weight} kg`;

  const labels = [];
  const points = [];
  for (let i = 24; i >= 0; i -= 2) {
    const t = new Date(now.getTime() - i * 3600000);
    labels.push(`${t.getHours().toString().padStart(2, '0')}:00`);
    points.push(concentrationAtTime(t));
  }
  drawChart(labels, points);
}

fillHome();
setInterval(() => {
  document.getElementById('nowTime').textContent = formatCNTime(new Date());
}, 60000);
