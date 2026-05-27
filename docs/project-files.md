# 项目文件作用说明

本文件由 `scripts/update-project-docs.mjs` 生成,用于快速理解当前项目目录下每个源码文件的主要作用。`output/` 是生成产物目录,不纳入源码文件清单。

| 文件 | 主要作用 |
|---|---|
| `.githooks/pre-commit` | 本地 Git pre-commit hook,提交前重生成 README、ADR 和文件作用说明并自动 stage。 |
| `.gitignore` | 忽略本地依赖、生成产物和系统临时文件。 |
| `README.md` | 项目入口说明,包含快速开始、当前选项和文档索引。 |
| `SKILL.md` | 给 Agent 使用的 skill 说明,定义 PPT 生成流程和约束。 |
| `assets/motion.min.js` | 浏览器端 Motion One 动效 runtime,由渲染器复制到最终产物。 |
| `assets/template-swiss.html` | 静态 PPT HTML 外壳模板,包含 CSS、背景、翻页、导航和动效入口。 |
| `docs/ADR.md` | 架构决策记录,描述当前生成链路和组件化边界。 |
| `docs/project-files.md` | 项目文件作用说明,由脚本根据当前文件列表生成。 |
| `examples/component-decks/ai-ops-review.jsx` | AI 运营复盘示例 deck,演示技术/运营复盘主题的页面组合。 |
| `examples/component-decks/climate-field-report.jsx` | 城市微气候田野报告示例 deck,演示生态/田野主题的页面组合。 |
| `examples/component-decks/retail-launch-brief.jsx` | 零售新品上市简报示例 deck,演示消费/上市主题的页面组合。 |
| `examples/component-decks/swiss-demo.jsx` | 组件选项机制 demo deck,可用环境变量切换主题和字体。 |
| `package-lock.json` | npm 依赖锁定文件。 |
| `package.json` | npm 脚本和 React/tsx 依赖声明。 |
| `references/component-workflow.md` | 组件选项工作流参考,说明新增选项和 subagent 测试要求。 |
| `scripts/render-deck.jsx` | 渲染 CLI 入口,把 deck 配置文件输出成静态 HTML。 |
| `scripts/update-project-docs.mjs` | 文档同步脚本,更新 README、ADR 和项目文件作用说明。 |
| `scripts/validate-swiss-deck.mjs` | Swiss deck 静态校验器,检查合法 layout、图片槽位和禁用模式。 |
| `src/components/swiss.jsx` | React 页面组件库,包含封面、时间线、六宫格、KPI、横条图、图片页和收尾页。 |
| `src/options.jsx` | 选项注册表,集中登记主题色、字体组合和页面版式。 |
| `src/renderDeck.jsx` | 核心渲染器,把 React slides 注入模板并替换主题/字体变量。 |
