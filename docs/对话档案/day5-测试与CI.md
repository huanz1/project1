# 对话档案 · 第 5 天（测试与 CI）

记录当天"提问 → 返工 → 通过"的关键对话片段。

## 片段 1：测试覆盖策略（弱断言 → 人点名规则）

- **人**：给这个预约系统写测试。
- **AI（初稿）**：生成了一批 `assert.ok(result)` 之类的用例，主要验证"函数能返回东西"。
- **人（返工）**：这些断言太空了。我点名 5 条必须测的业务规则——冲突检测、取消释放、新预约落库等；
  每条要验证完整结果，不能只断言非空；再补"空字符串/重复提交/已过期"这些边界。
- **AI（通过）**：按 5 条规则重写，每条含明确的状态与因果链断言，本地全绿。

## 片段 2：测试环境跑不起来（报错 → 换通道）

- **人**：`node --test tests/` 报错 MODULE_NOT_FOUND。
- **AI**：`--test` 后面直接跟目录会被当成单个测试入口。改为在仓库根运行 `node --test`，
  由测试运行器自动发现 `tests/*.test.js`；同时用 `vm` 沙箱 + 内存 localStorage 加载浏览器脚本，
  并在 bundle 末尾 `this.Store = Store` 显式导出，测试即可拿到 `Store`。
- **结果**：5/5 通过。

## 片段 3：AI 评审（第二个 AI 审第一个 AI）

- **人**：把 storage.js / app.js 作为评审输入，"作为评审者，指出风险、重复、可简化处；不要客套"。
- **评审 AI**：指出 UTC 日期在凌晨错位、cancelBooking 无"未到期"兜底、XSS 未转义、统计读取无兜底 4 个问题。
- **人（整改）**：新增 `localDateStr`、`escapeHtml`、`_getStats`，并给 `cancelBooking` 加规则；
  完成后重跑全部测试仍全绿，留痕见 `docs/评审记录/day5-代码评审.md`。

## 片段 4：CI 配置

- **人**：CI 用 GitHub Actions 还是 Gitee Go？
- **AI**：项目已部署在 GitHub Pages、推送通道（SSH over 443）已通，用 GitHub Actions 能真实触发、可验证；
  提供 `.github/workflows/ci.yml`（checkout → setup-node → `node --test`），徽章 URL 贴 README。
- **结果**：push 后 Actions 自动运行，徽章反映状态。
