/* 核心业务规则测试（node:test）
   运行：node --test tests/
   覆盖 10 条人工点名的业务规则（见 docs/测试策略.md）。 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { LocalStorageMock } = require('./localStorage.mock');

const jsDir = path.join(__dirname, '..', 'js');

/* 在带 localStorage 的沙箱里加载浏览器脚本，拿到 Store */
function loadStore() {
  const localStorage = new LocalStorageMock();
  const ctx = {
    localStorage, console, Date, JSON, Set, Map, Promise,
    Math, Object, Array, String, Number, Boolean, RegExp, Error,
  };
  vm.createContext(ctx);
  const bundle =
    fs.readFileSync(path.join(jsDir, 'data.js'), 'utf8') + '\n' +
    fs.readFileSync(path.join(jsDir, 'storage.js'), 'utf8') + '\n' +
    'this.Store = Store; this.isBookingExpired = isBookingExpired;';
  vm.runInContext(bundle, ctx);
  return { Store: ctx.Store, isBookingExpired: ctx.isBookingExpired, isDueToday: ctx.isDueToday, localStorage };
}

/* R1：首次初始化写入种子数据（6 台设备、6 条预约、统计初始） */
test('R1 首次初始化写入 6 台设备与 6 条种子预约', () => {
  const { Store } = loadStore();
  Store.init();
  assert.strictEqual(Store.getEquipment().length, 6);
  assert.strictEqual(Store.getBookings().length, 6);
  assert.ok(Store.getBookings().every(b => b.status === 'active'));
  // 幂等：再次 init 不重复写入
  Store.init();
  assert.strictEqual(Store.getBookings().length, 6);
});

/* R2：同设备 + 同日期 + 同时段已存在 active 预约 → 冲突 */
test('R2 同设备同日同时段重复预约判定为冲突', () => {
  const { Store } = loadStore();
  Store.init();
  const b = Store.getBookings()[0];
  assert.strictEqual(Store.hasConflict(b.equipId, b.date, b.slotId), true);
  // occupiedSlots 包含该时段
  assert.ok(Store.occupiedSlots(b.equipId, b.date).has(b.slotId));
});

/* R3：不同设备 / 日期 / 时段 → 不冲突 */
test('R3 不同设备、日期、时段不冲突', () => {
  const { Store } = loadStore();
  Store.init();
  const b = Store.getBookings()[0];
  assert.strictEqual(Store.hasConflict('e_other', b.date, b.slotId), false);
  assert.strictEqual(Store.hasConflict(b.equipId, '2099-01-01', b.slotId), false);
  assert.strictEqual(Store.hasConflict(b.equipId, b.date, 'sX'), false);
});

/* R4：取消预约后状态为 cancelled，时段释放且不再参与冲突；
   边界：已过期、已取消的预约不可取消 */
test('R4 取消后预约失效、时段释放；过期/已取消不可取消', () => {
  const { Store } = loadStore();
  Store.init();
  const b = Store.getBookings()[0];
  const cancelled = Store.cancelBooking(b.id);
  assert.strictEqual(cancelled.status, 'cancelled');
  // 该时段已释放
  assert.strictEqual(Store.occupiedSlots(b.equipId, b.date).has(b.slotId), false);
  // 已取消的预约不再判定冲突 → 同设备同日同时段可再约
  assert.strictEqual(Store.hasConflict(b.equipId, b.date, b.slotId), false);
  // 已取消的不能重复取消
  assert.strictEqual(Store.cancelBooking(b.id).status, 'cancelled');
  // 已过期的预约不能取消
  Store.addBooking({
    id: 'b_old', equipId: 'e3', equipName: '数字示波器',
    date: '2000-01-01', slotId: 's1', slotLabel: '08:00 - 10:00',
    name: '历史', sid: 'T000', purpose: '过期',
    createdAt: '2000-01-01T00:00:00.000Z', status: 'active',
  });
  assert.strictEqual(Store.cancelBooking('b_old').status, 'active');
});

/* R5：空闲时段新预约能落库并被占用检测识别 */
test('R5 新预约落库后该时段变为占用', () => {
  const { Store } = loadStore();
  Store.init();
  const before = Store.getBookings().length;
  Store.addBooking({
    id: 'b_new', equipId: 'e1', equipName: '3D 打印机',
    date: '2099-06-01', slotId: 's1', slotLabel: '08:00 - 10:00',
    name: '测试人', sid: 'T001', purpose: '测试',
    createdAt: new Date().toISOString(), status: 'active',
  });
  assert.strictEqual(Store.getBookings().length, before + 1);
  assert.ok(Store.occupiedSlots('e1', '2099-06-01').has('s1'));
  assert.strictEqual(Store.hasConflict('e1', '2099-06-01', 's1'), true);
});

/* 附加：到期判定精确到当天时段（D2 整改），用固定时刻保证稳定 */
test('R6 当天预约按时段结束判定到期，不只是看日期', () => {
  const { isBookingExpired } = loadStore();
  const mk = (date, slotId) => ({ date, slotId });
  const at = (h, m = 0) => new Date(2026, 9, 13, h, m); // 以 2026-10-13 为基准
  // 当天 s1 结束于 10:00
  assert.strictEqual(isBookingExpired(mk('2026-10-13', 's1'), at(9)), false);
  assert.strictEqual(isBookingExpired(mk('2026-10-13', 's1'), at(10, 30)), true);
  // 明天未到期、昨天已到期
  assert.strictEqual(isBookingExpired(mk('2026-10-14', 's1'), at(23)), false);
  assert.strictEqual(isBookingExpired(mk('2026-10-12', 's1'), at(8)), true);
});

/* R7：今日到期提醒标记（题库要求"到期提醒先做页面标记"）：
   当天的预约且时段未结束 → 今日到期；当天但时段已过 → 已过期（不算今日到期）；
   未来/过去日期 → 都不是今日到期 */
test('R7 今日到期判定：仅当天且时段未结束的预约为今日到期', () => {
  const { isDueToday } = loadStore();
  const mk = (date, slotId) => ({ date, slotId });
  const at = (h, m = 0) => new Date(2026, 9, 13, h, m); // 基准 2026-10-13
  assert.strictEqual(isDueToday(mk('2026-10-13', 's3'), at(9)), true);   // 今天 14-16 点档，早上看 → 今日到期
  assert.strictEqual(isDueToday(mk('2026-10-13', 's1'), at(11)), false); // 今天 8-10 点档，已过 → 不算
  assert.strictEqual(isDueToday(mk('2026-10-14', 's1'), at(9)), false);  // 明天
  assert.strictEqual(isDueToday(mk('2026-10-12', 's1'), at(9)), false);  // 昨天
});

/* R8：AI 用量统计累加（C1 挑战）——成功/失败分别计数，token 累加，读取有兜底 */
test('R8 AI 用量统计按次累加，初始有兜底值', () => {
  const { Store } = loadStore();
  // 未初始化时也有默认结构（不崩溃）
  assert.deepStrictEqual(Store.getAIStats(), { calls: 0, okCalls: 0, failCalls: 0, tokensIn: 0, tokensOut: 0 });
  Store.recordAICall({ ok: true, tokensIn: 800, tokensOut: 300 });
  Store.recordAICall({ ok: false, tokensIn: 120, tokensOut: 0 });
  Store.recordAICall({ ok: true, tokensIn: 50, tokensOut: 60 });
  const s = Store.getAIStats();
  assert.strictEqual(s.calls, 3);
  assert.strictEqual(s.okCalls, 2);
  assert.strictEqual(s.failCalls, 1);
  assert.strictEqual(s.tokensIn, 970);
  assert.strictEqual(s.tokensOut, 360);
});

/* R9：改期规则（第 8 天 P0）——成功时旧时段释放、新时段占用；
   与同设备其他预约冲突、过期、已取消、过去日期一律拒绝 */
test('R9 改期：成功换档并释放旧时段，冲突/过期/已取消/过去日期被拒绝', () => {
  const { Store } = loadStore();
  Store.init();
  const target = Store.getBookings()[0]; // e1, offset(1), s1（同日 s3 已被另一条种子预约占用）
  // ① 改到空闲的 s4 → 成功
  const r = Store.rescheduleBooking(target.id, target.date, 's4');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.booking.slotId, 's4');
  assert.strictEqual(r.booking.slotLabel, '16:00 - 18:00');
  // 旧时段 s1 已释放（可再约），新时段 s4 已占用
  assert.strictEqual(Store.hasConflict('e1', target.date, 's1'), false);
  assert.strictEqual(Store.hasConflict('e1', target.date, 's4'), true);
  // ② 改到已被别人占的 s3 → 冲突拒绝（排除自身也不放行）
  const r2 = Store.rescheduleBooking(target.id, target.date, 's3');
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.reason, 'CONFLICT');
  // ③ 改到过去日期 → 拒绝
  const r3 = Store.rescheduleBooking(target.id, '2000-01-01', 's1');
  assert.strictEqual(r3.ok, false);
  assert.strictEqual(r3.reason, 'PAST_DATE');
  // ④ 已取消的预约不能改（用未来日期的新预约，避免被“过期”抢先拦截）
  Store.addBooking({
    id: 'b_fut', equipId: 'e3', equipName: '数字示波器',
    date: '2099-01-01', slotId: 's1', slotLabel: '08:00 - 10:00',
    name: '未来', sid: 'T002', purpose: '未来',
    createdAt: new Date().toISOString(), status: 'active',
  });
  const cancelled = Store.cancelBooking('b_fut');
  assert.strictEqual(cancelled.status, 'cancelled');
  const r4 = Store.rescheduleBooking('b_fut', '2099-01-02', 's2');
  assert.strictEqual(r4.ok, false);
  assert.strictEqual(r4.reason, 'NOT_ACTIVE');
  // ⑤ 已过期的预约不能改
  Store.addBooking({
    id: 'b_old2', equipId: 'e3', equipName: '数字示波器',
    date: '2000-01-01', slotId: 's1', slotLabel: '08:00 - 10:00',
    name: '历史', sid: 'T000', purpose: '过期',
    createdAt: '2000-01-01T00:00:00.000Z', status: 'active',
  });
  const r5 = Store.rescheduleBooking('b_old2', target.date, 's1');
  assert.strictEqual(r5.ok, false);
  assert.strictEqual(r5.reason, 'EXPIRED');
});

/* R10：占用总览矩阵（第 8 天 P0）——只含 active 且日期匹配的预约，
   未占用档位为 null，设备/时段全集覆盖 */
test('R10 占用总览：按日期返回设备×时段矩阵，仅统计当天有效预约', () => {
  const { Store } = loadStore();
  Store.init();
  const some = Store.getBookings()[0];
  const ov = Store.getDayOverview(some.date);
  // 矩阵维度 = 6 设备 × 5 时段
  assert.strictEqual(Object.keys(ov).length, 6);
  Object.values(ov).forEach(row => {
    assert.strictEqual(Object.keys(row).length, 5);
    Object.values(row).forEach(v => assert.ok(v === null || (v && v.status === 'active')));
  });
  // 该预约所在格子有值，且内容就是这条预约
  assert.ok(ov[some.equipId][some.slotId]);
  assert.strictEqual(ov[some.equipId][some.slotId].id, some.id);
  // 换一个没有任何预约的日期 → 全 null
  const ov2 = Store.getDayOverview('2099-01-01');
  Object.values(ov2).forEach(row => Object.values(row).forEach(v => assert.strictEqual(v, null)));
  // 取消后总览同步释放
  Store.cancelBooking(some.id);
  const ov3 = Store.getDayOverview(some.date);
  assert.strictEqual(ov3[some.equipId][some.slotId], null);
});
