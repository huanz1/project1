/* localStorage 数据访问层 */
const K_EQUIP = 'leq_equipment';
const K_BOOK = 'leq_bookings';
const K_STATS = 'leq_stats';
const K_AI = 'leq_ai_stats';

const Store = {
  /* 首次访问初始化种子数据 */
  init() {
    if (!localStorage.getItem(K_EQUIP)) {
      localStorage.setItem(K_EQUIP, JSON.stringify(SEED_EQUIPMENT));
    }
    if (!localStorage.getItem(K_BOOK)) {
      localStorage.setItem(K_BOOK, JSON.stringify(seedBookings()));
    }
    if (!localStorage.getItem(K_STATS)) {
      localStorage.setItem(K_STATS, JSON.stringify({ pvTotal: 0, pvDaily: {}, formSubmits: 0 }));
    }
  },

  getEquipment() {
    return JSON.parse(localStorage.getItem(K_EQUIP) || '[]');
  },

  getBookings() {
    return JSON.parse(localStorage.getItem(K_BOOK) || '[]');
  },

  saveBookings(list) {
    localStorage.setItem(K_BOOK, JSON.stringify(list));
  },

  addBooking(b) {
    const list = this.getBookings();
    list.push(b);
    this.saveBookings(list);
  },

  /* 冲突检测：同一设备 + 同一天 + 同一时段，存在 active 预约即冲突 */
  hasConflict(equipId, date, slotId, excludeId = null) {
    return this.getBookings().some(b =>
      b.status === 'active' &&
      b.equipId === equipId &&
      b.date === date &&
      b.slotId === slotId &&
      b.id !== excludeId
    );
  },

  /* 某设备某日已占用的时段（用于禁用） */
  occupiedSlots(equipId, date) {
    const set = new Set();
    this.getBookings().forEach(b => {
      if (b.status === 'active' && b.equipId === equipId && b.date === date) set.add(b.slotId);
    });
    return set;
  },

  /* 预约聚合统计（看板/卡片复用，避免视图层反复 filter 计数）。
     一次遍历同时得到按设备、按时段的计数。 */
  getBookingSummary() {
    const active = this.getBookings().filter(b => b.status === 'active');
    const byEquipment = {};
    const bySlot = {};
    active.forEach(b => {
      byEquipment[b.equipId] = (byEquipment[b.equipId] || 0) + 1;
      bySlot[b.slotId] = (bySlot[b.slotId] || 0) + 1;
    });
    return { active, byEquipment, bySlot };
  },

  cancelBooking(id) {
    const list = this.getBookings();
    const b = list.find(x => x.id === id);
    if (b) {
      /* 业务规则兜底：仅 active 且未到期（精确到当天时段）的预约可取消 */
      if (b.status !== 'active') return b;
      if (isBookingExpired(b)) return b;
      b.status = 'cancelled';
      this.saveBookings(list);
    }
    return b;
  },

  /* 改期（第 8 天 P0）：把未到期预约换到新日期/时段。
     规则：仅 active 且未到期可改；不得早于今天；新时段不得与该设备其他 active 预约冲突（排除自身）；
     成功后旧时段自动释放（记录被覆盖，无需两步）。返回 { ok, booking } 或 { ok:false, reason } */
  rescheduleBooking(id, date, slotId) {
    const list = this.getBookings();
    const b = list.find(x => x.id === id);
    if (!b) return { ok: false, reason: 'NOT_FOUND' };
    if (b.status !== 'active') return { ok: false, reason: 'NOT_ACTIVE' };
    if (isBookingExpired(b)) return { ok: false, reason: 'EXPIRED' };
    if (date < localDateStr()) return { ok: false, reason: 'PAST_DATE' };
    if (this.hasConflict(b.equipId, date, slotId, b.id)) return { ok: false, reason: 'CONFLICT' };
    b.date = date;
    b.slotId = slotId;
    const slot = TIME_SLOTS.find(s => s.id === slotId);
    if (slot) b.slotLabel = slot.label;
    this.saveBookings(list);
    return { ok: true, booking: b };
  },

  /* 某日占用总览（第 8 天 P0）：{ equipId: { slotId: booking|null } }，占用总览页复用 */
  getDayOverview(date) {
    const overview = {};
    this.getEquipment().forEach(e => {
      overview[e.id] = {};
      TIME_SLOTS.forEach(s => { overview[e.id][s.id] = null; });
    });
    this.getBookings().forEach(b => {
      if (b.status === 'active' && b.date === date && overview[b.equipId]) {
        overview[b.equipId][b.slotId] = b;
      }
    });
    return overview;
  },

  /* 统计读取兜底（K_STATS 缺失时返回默认结构，避免 null 崩溃） */
  _getStats() {
    return JSON.parse(localStorage.getItem(K_STATS) ||
      '{"pvTotal":0,"pvDaily":{},"formSubmits":0}');
  },

  /* AI 用量统计（C1 挑战：调用量 / token / 成本累计）。读取兜底同 _getStats */
  _getAIStats() {
    return JSON.parse(localStorage.getItem(K_AI) ||
      '{"calls":0,"okCalls":0,"failCalls":0,"tokensIn":0,"tokensOut":0}');
  },

  recordAICall(rec) {
    const s = this._getAIStats();
    s.calls += 1;
    if (rec && rec.ok) s.okCalls += 1; else s.failCalls += 1;
    s.tokensIn += (rec && rec.tokensIn) || 0;
    s.tokensOut += (rec && rec.tokensOut) || 0;
    localStorage.setItem(K_AI, JSON.stringify(s));
  },

  getAIStats() {
    return this._getAIStats();
  },

  /* 访问统计 */
  recordVisit() {
    const s = this._getStats();
    const today = localDateStr();
    s.pvTotal += 1;
    s.pvDaily[today] = (s.pvDaily[today] || 0) + 1;
    localStorage.setItem(K_STATS, JSON.stringify(s));
  },

  recordFormSubmit() {
    const s = this._getStats();
    s.formSubmits += 1;
    localStorage.setItem(K_STATS, JSON.stringify(s));
  },

  getStats() {
    return this._getStats();
  }
};
