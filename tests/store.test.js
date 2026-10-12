/* 核心业务规则测试（node:test）
   运行：node --test tests/
   覆盖 5 条人工点名的业务规则（见 docs/测试策略.md）。 */
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
    'this.Store = Store;';
  vm.runInContext(bundle, ctx);
  return { Store: ctx.Store, localStorage };
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
