# 实验室设备预约系统

[![CI](https://github.com/huanz1/project1/actions/workflows/ci.yml/badge.svg)](https://github.com/huanz1/project1/actions/workflows/ci.yml)

> Vibe Coding 集中实践 · 个人项目（题库第 5 题）
> 作者：吴辰枫 ｜ 🌐 线上地址：https://huanz1.github.io/project1/ （详见 `docs/部署手册.md`）
> 📦 作业提交仓库（Gitee，课程口径"push 到自己仓库就算交"）：https://gitee.com/huanz-007/project1
> ⚠️ 老师 `coolfun2018`（谢峰）须为本仓库**开发者**，否则巡查读不到 = 作业缺交（每次大改动后自查）

## 一句话介绍

工程训练中心的 3D 打印机、激光切割机、示波器等设备抢手且时段常冲突，本系统让学生在线查看设备台账、按时段预约，系统自动做**冲突检测**，并提供使用率数据看板。

## 功能一览

| 模块 | 说明 |
| --- | --- |
| 设备台账 | 6 台设备卡片，展示位置、参数、当前预约状态 |
| 在线预约 | 选择日期 + 时段，填写姓名/学号/用途（表单收集） |
| 冲突检测 | 同一设备 + 同一天 + 同一时段只接受一条有效预约 |
| 占用总览 | 按日期查看全部设备 × 时段占用矩阵，空格即可约 |
| 我的预约 | 凭学号查询；未到期预约可「改期」或「取消」；「今日到期」提前标记 |
| 数据看板 | **ECharts** 渲染：各设备预约次数、时段分布、近 7 天访问量 |
| AI 助手 | **LLM** 台账周报生成 + 自然语言查询（密钥只在服务端）+ 用量统计 |
| 访问统计 | 累计 PV、今日 PV、表单提交次数（localStorage 计数） |
| 数据导出 | 一键导出全部预约记录为 CSV（Excel 可直接打开） |

## 技术栈

- 纯前端：原生 HTML + CSS + JavaScript（无构建步骤，无框架依赖）
- 数据存储：浏览器 `localStorage`
- 外部开源组件：**[Apache ECharts 5.5.1](https://echarts.apache.org/)**（图表）
- AI 能力：零依赖 Node 代理 `server/server.js`（LLM 转发，密钥只在服务端环境变量）
- 部署：GitHub Pages 静态托管（0 成本；Gitee Pages 已下线故改用，同属附录 B"静态托管"路线）；AI 功能需另行运行/部署该代理
- 🌐 线上地址：**https://huanz1.github.io/project1/**
- 📦 提交仓库：**Gitee** `https://gitee.com/huanz-007/project1`（作业以此为准；两个远端保持同步）

## 架构

```mermaid
graph LR
  subgraph 浏览器（纯前端）
    UI["index.html 单页 + Tab 切换"]
    APP["js/app.js 交互/渲染"]
    STORE["js/storage.js 数据访问层"]
    AIJS["js/ai.js AI 前端模块"]
    LS[("localStorage<br/>设备/预约/统计/AI用量")]
  end
  subgraph 服务端（第 7 天，零依赖 Node ≥18）
    SRV["server/server.js<br/>静态托管 + LLM 转发"]
  end
  LLM[("LLM 平台<br/>火山方舟 / 百炼 / 硅基流动")]
  UI --> APP
  APP --> STORE
  STORE --> LS
  APP --> AIJS
  AIJS -->|"POST /api/ai/*（不含密钥）"| SRV
  SRV -->|"Authorization: Bearer $AI_API_KEY"| LLM
```

## 本地运行

无需安装依赖，直接用浏览器打开 `index.html` 即可；
或在仓库根目录启动一个静态服务器：

```bash
python -m http.server 8000
# 浏览器访问 http://localhost:8000
```

AI 功能需要 AI 代理（Node ≥ 18，零依赖，Key 只存在于服务端环境变量）：

```bash
AI_API_KEY=你的Key node server/server.js   # 默认端口 3000
# 浏览器访问 http://localhost:3000 ，AI 助手页即可使用
```

> 不配 Key 也能启动：AI 接口返回 503，页面给出明确提示，其余功能正常（故障兜底见 docs/技术方案.md §6.2）。平台申请与成本估算见同节。

## 外部能力接入记录（ECharts 怎么接的）

1. **取库**：从 npmmirror 下载 `echarts.min.js`（约 1 MB）放到 `vendor/` 目录，用 `<script src="vendor/echarts.min.js"></script>` 引入。本地化而非 CDN，避免外网抖动导致线上白屏。
2. **备容器**：在页面放一个带**显式宽高**的 `<div id="chartEquip" class="chart-box">`。
3. **初始化**：`const chart = echarts.init(document.getElementById('chartEquip'))`。
4. **配置数据**：从 localStorage 统计出各设备预约数，组装 `option`（xAxis / yAxis / series），调用 `chart.setOption(option)`。
5. **窗口变化**：监听 `window resize` 调用 `chart.resize()` 防止缩放后错位。

**踩过的坑（重点）**：
- **坑 1：容器必须有高度。** ECharts 容器没有显式高度时，图表渲染为 0 高度，页面一片空白。已在 CSS 中给 `.chart-box` 固定 `height: 280px`。
- **坑 2：隐藏 Tab 里 init 拿到 0 宽高。** 看板页默认 `display:none`，页面加载时立即 `echarts.init` 会因容器宽高为 0 而图表不显示。改为**切换到「数据看板」Tab 时才懒初始化**（`ensureChart`），并在窗口 resize 时重绘。
- **坑 3：日期默认无界。** 日期选择器必须设 `min=今天`，否则能预约历史日期。

## 课程作业节奏（每日四步，第 2–10 天循环）

```bash
# ① 反思件：docs/反思录/吴辰枫/dayN.md（含对话证据）
# ② 提交（署名真名）+ ③ tag 封卷：
git add -A && git commit -m "dayN: 完成xxx + 今日反思"
git tag dayN && git push origin master && git push origin --tags
git push github master && git push github --tags   # 同步 GitHub Pages 部署
# ④ Gitee 发「第 N 天完工报告」issue；收工自查（CI 同款，四盏灯全绿）：
python3 交作业自查.py --day N
```

分支约定（实验二）：`master` 只进可运行代码；新功能开 `feat/功能名` 分支，测试绿再合回。

## 目录结构

```
project1/
├── index.html            # 单页入口
├── css/style.css         # 样式
├── js/
│   ├── data.js           # 设备/时段种子数据
│   ├── storage.js        # localStorage 数据访问层
│   ├── ai.js             # AI 助手前端模块（调用服务端代理 + 兜底 + 用量统计）
│   └── app.js            # 交互逻辑 + ECharts 看板
├── server/server.js      # AI 代理服务（零依赖 Node：静态托管 + LLM 转发，Key 只在服务端）
├── vendor/echarts.min.js # ECharts 本地库
├── docs/                 # PRD、技术方案、数据字典、schema.sql、部署手册、反思录、对话档案
├── AGENTS.md             # AI 协作规则（课程要求即硬约束）
└── 交作业自查.py          # 课程收工自查脚本（CI 版，每次 push 自动校验）
```

## 相关文档

| 文档 | 内容 |
| --- | --- |
| [PRD 产品需求文档](docs/PRD.md) | F1–F12 验收条款（需求来源=题库第 5 题原文） |
| [技术方案](docs/技术方案.md) | 选型/数据模型/模块/AI 架构/成本估算表 |
| [数据字典](docs/数据字典.md) | 四张逻辑表 + Trae MySQL MCP 配置记录 |
| [schema.sql](docs/schema.sql) | 四张表的 MySQL DDL（MCP 任务表结构来源） |
| [部署手册](docs/部署手册.md) | GitHub Pages 路线 + AI 代理三路线 + 安全清单 |
| [冲刺任务板](docs/冲刺任务板.md) | 第 7 天过审版，覆盖第 7–9 天 |
| [演示脚本](docs/演示脚本.md) | 每步"点哪里 + 预期看到什么" |
| [路演彩排](docs/路演彩排.md) | 3 分钟走场 + 挑刺分级 |
| [DemoDay 路演稿](docs/DemoDay-路演稿.md) | 5 分钟：3 演示 + 2 答辩三问预答 |
| [作品集 · AI 协作叙事](docs/作品集-AI协作叙事.md) | 100 字叙事 + 3 分钟展开版 |
| [过程档案最终清单](docs/过程档案最终清单.md) | 结课核对表 + 待办 |
| [第 4 天反思录](docs/反思录/吴辰枫/day4.md) | 反思录目录：`docs/反思录/吴辰枫/day1–10.md` |
