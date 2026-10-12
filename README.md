# 实验室设备预约系统

[![CI](https://github.com/huanz1/project1/actions/workflows/ci.yml/badge.svg)](https://github.com/huanz1/project1/actions/workflows/ci.yml)

> Vibe Coding 集中实践 · 个人项目（题库第 5 题）
> 作者：吴辰枫 ｜ 线上地址：https://huanz1.github.io/project1/ （详见 `docs/部署手册.md`）

## 一句话介绍

工程训练中心的 3D 打印机、激光切割机、示波器等设备抢手且时段常冲突，本系统让学生在线查看设备台账、按时段预约，系统自动做**冲突检测**，并提供使用率数据看板。

## 功能一览

| 模块 | 说明 |
| --- | --- |
| 设备台账 | 6 台设备卡片，展示位置、参数、当前预约状态 |
| 在线预约 | 选择日期 + 时段，填写姓名/学号/用途（表单收集） |
| 冲突检测 | 同一设备 + 同一天 + 同一时段只接受一条有效预约 |
| 我的预约 | 凭学号查询，可取消未到期预约 |
| 数据看板 | **ECharts** 渲染：各设备预约次数、时段分布、近 7 天访问量 |
| 访问统计 | 累计 PV、今日 PV、表单提交次数（localStorage 计数） |
| 数据导出 | 一键导出全部预约记录为 CSV（Excel 可直接打开） |

## 技术栈

- 纯前端：原生 HTML + CSS + JavaScript（无构建步骤，无框架依赖）
- 数据存储：浏览器 `localStorage`
- 外部开源组件：**[Apache ECharts 5.5.1](https://echarts.apache.org/)**（图表）
- 部署：GitHub Pages 静态托管（0 成本、0 后端；Gitee Pages 已下线）
- 🌐 线上地址：**https://huanz1.github.io/project1/**

## 本地运行

无需安装依赖，直接用浏览器打开 `index.html` 即可；
或在仓库根目录启动一个静态服务器：

```bash
python -m http.server 8000
# 浏览器访问 http://localhost:8000
```

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

## 目录结构

```
project1/
├── index.html            # 单页入口
├── css/style.css         # 样式
├── js/
│   ├── data.js           # 设备/时段种子数据
│   ├── storage.js        # localStorage 数据访问层
│   └── app.js            # 交互逻辑 + ECharts 看板
├── vendor/echarts.min.js # ECharts 本地库
├── docs/                 # PRD、技术方案、部署手册、反思录、对话档案
├── AGENTS.md             # AI 协作规则
└── 交作业自查.py          # 课程收工自查脚本
```

## 相关文档

- [PRD 产品需求文档](docs/PRD.md)
- [技术方案](docs/技术方案.md)
- [部署手册](docs/部署手册.md)
- [第 4 天反思录](docs/反思录/吴辰枫/day4.md)
