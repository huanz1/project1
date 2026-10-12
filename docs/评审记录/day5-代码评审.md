# 第 5 天 · 代码评审记录（第二个 AI 评审第一个 AI）

- 评审日期：2026-10-12
- 被评审对象：`js/storage.js`、`js/app.js`、`js/data.js`（第 3–4 天由 AI 生成的代码）
- 评审方式：按手册工作流，由"第二个 AI / 评审会话"只审不改，问题交原作者处理并留痕
- 评审要求：**作为评审者，指出风险、重复、可简化处；不要客套。**

## 一、课前：AI 代码风险清单（本项目最怕的 3 条）

对照手册附录 B 的四个高频坑，结合本项目（纯前端 + localStorage + ECharts）圈出最该防的 3 条：

| # | 风险 | 本项目为什么怕 |
|---|---|---|
| 1 | **幻觉 API** | AI 可能调用不存在的 localStorage 方法、ECharts 方法或浏览器 API，页面在某些环境直接崩。本次评审正好发现一处相关隐患（统计读取无兜底）。 |
| 2 | **安全隐患（XSS / 数据篡改）** | 用户姓名、用途、学号经 `innerHTML` 直接渲染，若写入 `<img onerror=...>` 会执行脚本；localStorage 数据也可被用户手改。无后端、无 SQL 注入面，但 XSS 是真实暴露面。 |
| 3 | **过度生成 / 许可证污染** | AI 倾向多塞功能和依赖，违背"不引框架"的约束；引入依赖须查许可证（ECharts 为 Apache-2.0，可商用、无 copyleft，**不构成污染**）。 |

## 二、评审发现（评审会话输出）

### 发现 1【高 · 时区 bug】日期用 UTC 而非本地日期
`new Date().toISOString().slice(0,10)` 是 **UTC 日期**。中国 UTC+8 在凌晨 0:00–8:00 时 UTC 仍为前一天，导致：
- 「今日 PV」被记到昨天的桶；
- 日期不能早于今天的校验在凌晨误判；
- 看板「近 7 天」序列整体错位。
涉及：`app.js` 的 `todayStr`、看板近 7 天；`storage.js` 的 `recordVisit`；`data.js` 的 `seedBookings`。

### 发现 2【中 · 业务规则未在数据层兜底】`cancelBooking` 无校验
PRD 规则是"**未到期才可取消**"。数据层 `cancelBooking` 对任意预约都能取消，"未到期"判断只存在于前端视图层。一旦绕过 UI 直接调用，规则失效。

### 发现 3【高 · 安全】XSS：用户输入未转义
`queryMine` 用 `innerHTML` 插入 `b.purpose`、`b.equipName` 等用户可控字段，存在存储型 XSS。

### 发现 4【低 · 健壮性】统计读取无兜底
`recordVisit / recordFormSubmit / getStats` 中 `JSON.parse(localStorage.getItem(K_STATS))`，若该键缺失返回 `null`，随后 `s.pvTotal += 1` 抛 TypeError。

### 发现 5【可接受 · 重复】
`hasConflict` 与 `occupiedSlots` 都遍历 active 过滤，语义清晰、用途不同，**不强行合并**，避免过度抽象。

## 三、整改记录（原作者处理）

| 发现 | 处理 | 落地 |
|---|---|---|
| 1 时区 | 新增 `localDateStr()`（本地年月日），`data.js` 顶部定义，storage/app 统一改用；`seedBookings` 同步修复 | `data.js`、`storage.js`、`app.js` |
| 2 取消兜底 | `cancelBooking` 增加 `status==='active'` 且 `date >= 今天` 才允许取消，否则原样返回 | `storage.js` |
| 3 XSS | 新增 `escapeHtml()`，渲染"我的预约"的设备名与用途时转义 | `data.js`、`app.js` |
| 4 统计兜底 | 新增 `_getStats()`，键缺失时返回默认统计结构 | `storage.js` |
| 5 重复 | 不改（附理由） | — |

## 四、验证
- `node --test`：5 条业务规则全部通过；R4 增补"已过期/已取消不可取消"边界断言，R5 验证落库→占用→冲突链路。
- 整改后重跑全部测试，结果仍全绿；页面渲染正常（转义后中文正常显示）。
- 本文件随 day5 提交入库，评审→整改链路留痕。
