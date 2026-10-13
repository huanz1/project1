/* 应用主逻辑 */
let currentEquip = null;
let selectedSlot = null;
const charts = {};
const todayStr = () => localDateStr();

/* ---------- 通用提示 ---------- */
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.className = 'toast', 2400);
}

/* ---------- Tab 切换 ---------- */
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + name));
  if (name === 'dashboard') renderDashboard();
}

/* ---------- 设备卡片 ---------- */
function renderEquipment() {
  const grid = document.getElementById('equipGrid');
  const { byEquipment } = Store.getBookingSummary();
  grid.innerHTML = Store.getEquipment().map(e => {
    const count = byEquipment[e.id] || 0;
    return `
      <div class="equip-card">
        <div class="eq-top">
          <h3><span class="eq-icon">${e.icon}</span> ${e.name}</h3>
          <span class="badge ${count ? 'busy' : 'ok'}">${count ? count + ' 条预约' : '可预约'}</span>
        </div>
        <p class="eq-meta">📍 ${e.location}</p>
        <p class="eq-meta">${e.desc}</p>
        <button class="btn btn-primary" data-id="${e.id}">预约</button>
      </div>`;
  }).join('');
  grid.querySelectorAll('button').forEach(btn =>
    btn.addEventListener('click', () => openModal(btn.dataset.id)));
}

/* ---------- 预约模态框 ---------- */
function openModal(equipId) {
  currentEquip = Store.getEquipment().find(e => e.id === equipId);
  selectedSlot = null;
  document.getElementById('modalTitle').textContent = '预约：' + currentEquip.name;
  document.getElementById('fEquipId').value = equipId;
  document.getElementById('fDate').value = '';
  document.getElementById('fDate').min = todayStr();
  document.getElementById('fName').value = '';
  document.getElementById('fSid').value = '';
  document.getElementById('fPurpose').value = '';
  document.getElementById('formMsg').textContent = '';
  renderSlots();
  document.getElementById('modalMask').classList.add('show');
}

function closeModal() {
  document.getElementById('modalMask').classList.remove('show');
}

function renderSlots() {
  /* 日期变化/重渲染时清空已选时段，防止旧时段残留被误提交到新日期（D1） */
  selectedSlot = null;
  const date = document.getElementById('fDate').value;
  const wrap = document.getElementById('slotGroup');
  const occupied = date ? Store.occupiedSlots(currentEquip.id, date) : new Set();
  wrap.innerHTML = TIME_SLOTS.map(s =>
    `<button type="button" class="slot-btn ${occupied.has(s.id) ? 'disabled' : ''}" data-slot="${s.id}" ${occupied.has(s.id) ? 'disabled' : ''}>${s.label}</button>`
  ).join('');
  wrap.querySelectorAll('.slot-btn').forEach(b => b.addEventListener('click', () => {
    if (b.classList.contains('disabled')) return;
    selectedSlot = b.dataset.slot;
    wrap.querySelectorAll('.slot-btn').forEach(x => x.classList.toggle('selected', x === b));
  }));
}

/* ---------- 提交预约 ---------- */
function submitBooking(e) {
  e.preventDefault();
  const msg = document.getElementById('formMsg');
  const date = document.getElementById('fDate').value;
  const name = document.getElementById('fName').value.trim();
  const sid = document.getElementById('fSid').value.trim();
  const purpose = document.getElementById('fPurpose').value.trim();

  if (!date) return msg.textContent = '请选择预约日期';
  if (date < todayStr()) return msg.textContent = '预约日期不能早于今天';
  if (!selectedSlot) return msg.textContent = '请选择预约时段';
  if (!name || !sid || !purpose) return msg.textContent = '请填写完整的预约信息';

  if (Store.hasConflict(currentEquip.id, date, selectedSlot)) {
    msg.textContent = '该时段已被预约，请更换日期或时段';
    renderSlots();
    return;
  }
  const slot = TIME_SLOTS.find(s => s.id === selectedSlot);
  Store.addBooking({
    id: 'b' + Date.now(),
    equipId: currentEquip.id,
    equipName: currentEquip.name,
    date, slotId: selectedSlot, slotLabel: slot.label,
    name, sid, purpose,
    createdAt: new Date().toISOString(),
    status: 'active'
  });
  Store.recordFormSubmit();
  closeModal();
  renderEquipment();
  toast('预约成功！可在「我的预约」中查看', 'success');
}

/* ---------- 我的预约 ---------- */
function queryMine() {
  const sid = document.getElementById('mineSid').value.trim();
  const wrap = document.getElementById('mineList');
  if (!sid) return toast('请输入学号', 'error');
  const list = Store.getBookings()
    .filter(b => b.sid === sid)
    .sort((a, b) => (a.date + a.slotId).localeCompare(b.date + b.slotId));
  if (!list.length) { wrap.innerHTML = '<div class="empty">未查询到该学号的预约记录</div>'; return; }
  wrap.innerHTML = list.map(b => {
    const expired = isBookingExpired(b);
    const canCancel = b.status === 'active' && !expired;
    return `
      <div class="booking-item">
        <div class="bi-main">
          <span class="bi-title">${escapeHtml(b.equipName)} <span class="badge ${b.status === 'active' ? 'ok' : 'cancel'}">${b.status === 'active' ? (expired ? '已过期' : '有效') : '已取消'}</span></span>
          <span class="bi-sub">📅 ${b.date}　🕐 ${b.slotLabel}</span>
          <span class="bi-sub">用途：${escapeHtml(b.purpose)}</span>
        </div>
        ${canCancel ? `<button class="btn btn-danger btn-sm" data-id="${b.id}">取消预约</button>` : ''}
      </div>`;
  }).join('');
  wrap.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
    Store.cancelBooking(btn.dataset.id);
    renderEquipment();
    queryMine();
    toast('预约已取消', 'success');
  }));
}

/* ---------- 数据看板 ---------- */
function renderDashboard() {
  const { active, byEquipment, bySlot } = Store.getBookingSummary();
  const stats = Store.getStats();
  const today = todayStr();
  const todayPV = stats.pvDaily[today] || 0;

  document.getElementById('statGrid').innerHTML = [
    { num: active.length, label: '有效预约（条）' },
    { num: Store.getEquipment().length, label: '可预约设备（台）' },
    { num: stats.formSubmits, label: '表单提交（次）' },
    { num: stats.pvTotal, label: '累计访问量（PV）' },
    { num: todayPV, label: '今日访问（PV）' },
  ].map(s => `<div class="stat-card"><div class="num">${s.num}</div><div class="label">${s.label}</div></div>`).join('');

  /* 图1：各设备预约次数 */
  const equipData = Store.getEquipment().map(e => ({
    name: e.name, value: byEquipment[e.id] || 0
  }));
  ensureChart('chartEquip').setOption({
    animation: false,
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 24, bottom: 40 },
    xAxis: { type: 'category', data: equipData.map(d => d.name), axisLabel: { interval: 0, fontSize: 11, rotate: 18 } },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{ type: 'bar', data: equipData.map(d => d.value), itemStyle: { color: '#2563eb', borderRadius: [4, 4, 0, 0] }, barWidth: '50%' }]
  });

  /* 图2：时段分布（饼图） */
  const slotData = TIME_SLOTS.map(s => ({
    name: s.label, value: bySlot[s.id] || 0
  })).filter(d => d.value > 0);
  ensureChart('chartSlot').setOption({
    animation: false,
    tooltip: { trigger: 'item', formatter: '{b}<br/>{c} 条 ({d}%)' },
    legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 11 } },
    series: [{
      type: 'pie', radius: ['38%', '62%'], center: ['50%', '44%'],
      data: slotData,
      itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
      label: { fontSize: 11 }
    }],
    color: ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626']
  });

  /* 图3：近 7 天 PV 折线 */
  const days = [], pvs = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = localDateStr(d);
    days.push(key.slice(5));
    pvs.push(stats.pvDaily[key] || 0);
  }
  ensureChart('chartPV').setOption({
    animation: false,
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 24, top: 24, bottom: 30 },
    xAxis: { type: 'category', data: days, boundaryGap: false },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{ type: 'line', data: pvs, smooth: true, areaStyle: { color: 'rgba(37,99,235,.15)' }, itemStyle: { color: '#2563eb' }, symbolSize: 7 }]
  });
}

/* 关键：隐藏 Tab 里直接 init 会拿到 0 宽高，按需创建并 resize */
function ensureChart(domId) {
  if (!charts[domId]) {
    charts[domId] = echarts.init(document.getElementById(domId));
    window.addEventListener('resize', () => charts[domId].resize());
  }
  return charts[domId];
}

/* ---------- 导出 CSV ---------- */
function exportCSV() {
  const rows = Store.getBookings();
  if (!rows.length) return toast('暂无预约记录可导出', 'error');
  const header = ['设备', '日期', '时段', '姓名', '学号', '用途', '状态', '提交时间'];
  const lines = rows.map(b =>
    [b.equipName, b.date, b.slotLabel, b.name, b.sid, b.purpose, b.status === 'active' ? '有效' : '已取消', b.createdAt.slice(0, 10)]
      .map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','));
  /* 加 BOM 保证 Excel 打开中文不乱码 */
  const blob = new Blob(['\ufeff' + [header.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '预约记录_' + todayStr() + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('已导出 ' + rows.length + ' 条记录', 'success');
}

/* ---------- 初始化 ---------- */
document.addEventListener('DOMContentLoaded', () => {
  Store.init();
  Store.recordVisit();
  renderEquipment();
  document.getElementById('tabs').addEventListener('click', e => {
    if (e.target.classList.contains('tab')) switchTab(e.target.dataset.tab);
  });
  document.getElementById('fDate').addEventListener('change', renderSlots);
  document.getElementById('bookingForm').addEventListener('submit', submitBooking);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('btnCancelForm').addEventListener('click', closeModal);
  document.getElementById('modalMask').addEventListener('click', e => { if (e.target.id === 'modalMask') closeModal(); });
  document.getElementById('btnQueryMine').addEventListener('click', queryMine);
  document.getElementById('mineSid').addEventListener('keydown', e => { if (e.key === 'Enter') queryMine(); });
  document.getElementById('btnExport').addEventListener('click', exportCSV);
});
