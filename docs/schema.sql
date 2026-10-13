-- 实验室设备预约系统 · MySQL 等价结构（第 7 天 MCP 任务表结构来源）
-- 用途：实验七 T2「给自己的 Trae 配一个 MySQL MCP，让 AI 根据现有表结构生成一份数据字典」。
--       本文件与 localStorage 四张逻辑表一一对应（见 docs/数据字典.md），
--       导入任意 MySQL 8.x（或 Docker: docker run -e MYSQL_ROOT_PASSWORD=... -p 3306:3306 mysql:8）即可被 MCP 读取。
-- 注意：本项目线上运行仍是 localStorage（题库定位：单机演示，不接数据库）；
--       本 DDL 只服务于 MCP 体验与"后续若接后端"的对照，不引入任何运行时依赖。

CREATE DATABASE IF NOT EXISTS lab_equipment_booking
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lab_equipment_booking;

-- 1. equipment 设备表（对应 localStorage 键 leq_equipment）
CREATE TABLE IF NOT EXISTS equipment (
  id        VARCHAR(16)  NOT NULL COMMENT '设备唯一标识，如 e1',
  name      VARCHAR(50)  NOT NULL COMMENT '设备名称',
  icon      VARCHAR(8)   NOT NULL DEFAULT '' COMMENT '卡片图标（emoji）',
  location  VARCHAR(100) NOT NULL COMMENT '位置',
  `desc`    VARCHAR(255) NOT NULL COMMENT '参数描述',
  PRIMARY KEY (id)
) ENGINE=InnoDB COMMENT='设备台账';

-- 2. bookings 预约表（对应 leq_bookings）
--    冲突规则（题库"命门"）：同一 equip_id + date + slot_id 只允许一条 status=active 记录。
--    该唯一性在应用层由 Store.hasConflict 保证；MySQL 侧用生成列 + 唯一索引做同等兜底
--    （active_flag 仅对 active 行取值，取消/过期行不参与唯一性，与前端规则一致）。
CREATE TABLE IF NOT EXISTS bookings (
  id          VARCHAR(32)  NOT NULL COMMENT '预约唯一标识',
  equip_id    VARCHAR(16)  NOT NULL COMMENT 'FK → equipment.id',
  equip_name  VARCHAR(50)  NOT NULL COMMENT '设备名称冗余（列表免关联）',
  date        DATE         NOT NULL COMMENT '预约日期，≥ 当天',
  slot_id     VARCHAR(8)   NOT NULL COMMENT '时段标识 s1..s5',
  slot_label  VARCHAR(32)  NOT NULL COMMENT '时段展示文本',
  name        VARCHAR(20)  NOT NULL COMMENT '预约人姓名',
  sid         VARCHAR(20)  NOT NULL COMMENT '学号（查询键）',
  purpose     VARCHAR(100) NOT NULL COMMENT '用途说明',
  created_at  DATETIME     NOT NULL COMMENT '提交时间',
  status      VARCHAR(16)  NOT NULL DEFAULT 'active' COMMENT 'active / cancelled',
  active_flag TINYINT      GENERATED ALWAYS AS (IF(status='active',1,NULL)) STORED,
  PRIMARY KEY (id),
  KEY idx_sid (sid),
  KEY idx_equip_date (equip_id, date),
  UNIQUE KEY uk_conflict (equip_id, date, slot_id, active_flag)
) ENGINE=InnoDB COMMENT='预约记录（含已取消）';

-- 3. stats 访问统计表（对应 leq_stats，单行单对象）
CREATE TABLE IF NOT EXISTS stats (
  id           INT NOT NULL DEFAULT 1 COMMENT '固定单行',
  pv_total     INT NOT NULL DEFAULT 0 COMMENT '累计 PV',
  pv_daily     JSON         NULL COMMENT '{"2026-10-13":3} 当日 PV',
  form_submits INT NOT NULL DEFAULT 0 COMMENT '表单成功提交次数',
  PRIMARY KEY (id)
) ENGINE=InnoDB COMMENT='访问统计';

-- 4. ai_usage AI 用量表（对应 leq_ai_stats，第 7 天 C1 挑战）
CREATE TABLE IF NOT EXISTS ai_usage (
  id         INT NOT NULL DEFAULT 1 COMMENT '固定单行',
  calls      INT NOT NULL DEFAULT 0 COMMENT '累计调用（含失败）',
  ok_calls   INT NOT NULL DEFAULT 0 COMMENT '成功次数',
  fail_calls INT NOT NULL DEFAULT 0 COMMENT '失败次数',
  tokens_in  BIGINT NOT NULL DEFAULT 0 COMMENT '累计输入 token',
  tokens_out BIGINT NOT NULL DEFAULT 0 COMMENT '累计输出 token',
  PRIMARY KEY (id)
) ENGINE=InnoDB COMMENT='AI 用量统计';

-- 5. 时段常量（data.js TIME_SLOTS，非存储表；入库便于 MCP 查询时对照）
CREATE TABLE IF NOT EXISTS time_slots (
  slot_id  VARCHAR(8)  NOT NULL COMMENT 's1..s5',
  label    VARCHAR(32) NOT NULL COMMENT '如 08:00 - 10:00',
  end_hour TINYINT     NOT NULL COMMENT '结束小时（到期判定用）',
  PRIMARY KEY (slot_id)
) ENGINE=InnoDB COMMENT='时段常量';

INSERT INTO time_slots (slot_id, label, end_hour) VALUES
  ('s1','08:00 - 10:00',10),('s2','10:00 - 12:00',12),('s3','14:00 - 16:00',16),
  ('s4','16:00 - 18:00',18),('s5','19:00 - 21:00',21)
ON DUPLICATE KEY UPDATE label=VALUES(label), end_hour=VALUES(end_hour);

-- 种子数据（与 js/data.js 的 6 台设备 + 6 条种子预约同构；日期用相对值占位，联调时改真实日期）
INSERT INTO equipment (id,name,icon,location,`desc`) VALUES
  ('e1','3D 打印机','🖨️','工程训练中心 114-A','FDM 熔融沉积，最大 220×220×250mm'),
  ('e2','激光切割机','✂️','工程训练中心 114-B','60W CO₂，加工幅面 600×400mm'),
  ('e3','数字示波器','📈','电子实验室 203','四通道 100MHz，配探头'),
  ('e4','高亮度投影仪','📽️','器材借用室 102','4500 流明，含支架与幕布'),
  ('e5','激光打印机','🖨️','创客空间 110','A3/A4 黑白，自带纸张登记'),
  ('e6','台式万用表','🔌','电子实验室 203','六位半精度，校准有效')
ON DUPLICATE KEY UPDATE name=VALUES(name);
