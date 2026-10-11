/* localStorage 数据访问层 */
const K_EQUIP = 'leq_equipment';
const K_BOOK = 'leq_bookings';
const K_STATS = 'leq_stats';

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

  cancelBooking(id) {
    const list = this.getBookings();
    const b = list.find(x => x.id === id);
    if (b) { b.status = 'cancelled'; this.saveBookings(list); }
    return b;
  },

  /* 访问统计 */
  recordVisit() {
    const s = JSON.parse(localStorage.getItem(K_STATS));
    const today = new Date().toISOString().slice(0, 10);
    s.pvTotal += 1;
    s.pvDaily[today] = (s.pvDaily[today] || 0) + 1;
    localStorage.setItem(K_STATS, JSON.stringify(s));
  },

  recordFormSubmit() {
    const s = JSON.parse(localStorage.getItem(K_STATS));
    s.formSubmits += 1;
    localStorage.setItem(K_STATS, JSON.stringify(s));
  },

  getStats() {
    return JSON.parse(localStorage.getItem(K_STATS));
  }
};
