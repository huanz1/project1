/* 种子数据：设备台账与时段定义（首次加载写入 localStorage） */
const SEED_EQUIPMENT = [
  { id: 'e1', name: '3D 打印机', icon: '🖨️', location: '工程训练中心 114-A', desc: 'FDM 熔融沉积，最大 220×220×250mm' },
  { id: 'e2', name: '激光切割机', icon: '✂️', location: '工程训练中心 114-B', desc: '60W CO₂，加工幅面 600×400mm' },
  { id: 'e3', name: '数字示波器', icon: '📈', location: '电子实验室 203', desc: '四通道 100MHz，配探头' },
  { id: 'e4', name: '高亮度投影仪', icon: '📽️', location: '器材借用室 102', desc: '4500 流明，含支架与幕布' },
  { id: 'e5', name: '激光打印机', icon: '🖨️', location: '创客空间 110', desc: 'A3/A4 黑白，自带纸张登记' },
  { id: 'e6', name: '台式万用表', icon: '🔌', location: '电子实验室 203', desc: '六位半精度，校准有效' },
];

const TIME_SLOTS = [
  { id: 's1', label: '08:00 - 10:00' },
  { id: 's2', label: '10:00 - 12:00' },
  { id: 's3', label: '14:00 - 16:00' },
  { id: 's4', label: '16:00 - 18:00' },
  { id: 's5', label: '19:00 - 21:00' },
];

/* 演示用种子预约：给看板预置几条真实数据（仅首次初始化时写入） */
function seedBookings() {
  const today = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  const offset = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return fmt(d); };
  return [
    { id: 'b' + Date.now() + 1, equipId: 'e1', equipName: '3D 打印机', date: offset(1), slotId: 's1', slotLabel: '08:00 - 10:00', name: '张同学', sid: '20230101', purpose: '课程设计外壳打印', createdAt: new Date().toISOString(), status: 'active' },
    { id: 'b' + Date.now() + 2, equipId: 'e1', equipName: '3D 打印机', date: offset(1), slotId: 's3', slotLabel: '14:00 - 16:00', name: '李同学', sid: '20230102', purpose: '社团徽章模具', createdAt: new Date().toISOString(), status: 'active' },
    { id: 'b' + Date.now() + 3, equipId: 'e2', equipName: '激光切割机', date: offset(2), slotId: 's2', slotLabel: '10:00 - 12:00', name: '王同学', sid: '20230103', purpose: '亚克力外壳切割', createdAt: new Date().toISOString(), status: 'active' },
    { id: 'b' + Date.now() + 4, equipId: 'e3', equipName: '数字示波器', date: offset(2), slotId: 's4', slotLabel: '16:00 - 18:00', name: '赵同学', sid: '20230104', purpose: '电源纹波测量', createdAt: new Date().toISOString(), status: 'active' },
    { id: 'b' + Date.now() + 5, equipId: 'e4', equipName: '高亮度投影仪', date: offset(3), slotId: 's5', slotLabel: '19:00 - 21:00', name: '刘同学', sid: '20230105', purpose: '社团宣讲借用', createdAt: new Date().toISOString(), status: 'active' },
    { id: 'b' + Date.now() + 6, equipId: 'e5', equipName: '激光打印机', date: offset(0), slotId: 's2', slotLabel: '10:00 - 12:00', name: '陈同学', sid: '20230106', purpose: '论文初稿打印', createdAt: new Date().toISOString(), status: 'active' },
  ];
}
