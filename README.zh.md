# dsh-tac

[![check](https://github.com/cgartlab/dsh-tac/actions/workflows/check.yml/badge.svg)](https://github.com/cgartlab/dsh-tac/actions/workflows/check.yml)
[![license: CC BY-NC-SA 4.0](https://img.shields.io/badge/license-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

[English](README.md) | 中文

一个 [DeepSeek Harness](https://deepseek.com) 客户端插件，把 Harness 变成项目感知的工作台：
原生右侧栏的全局项目/会话看板、浮动会话 HUD、键盘优先的会话导航、按住即滚的长对话阅读，
以及桌面级的任务通知。

## 功能

- **项目看板** —— 会话与项目两种数据库视图，支持搜索、状态/类型/项目筛选、分组、多列排序、
  归档感知的行，以及每个项目自定义图标与颜色。项目视图有 6 列属性（会话总数 / Open Issue / Open PR /
  本地内部版本 / 最新上线版本 / 最近活动时间）。**点击项目行会在下方展开该项目的会话列表**（手风琴式，
  不再翻到会话页）。支持窄（380px）、中（50vw）、原生全屏三种呈现，
  同一个键打开、再按关闭。面板的开关与大小属于工作区而非每个对话：切换会话只切换对话，
  不会重新打开、关闭或改变看板尺寸。
- **悬浮会话 HUD** —— 实时展示活跃/最近会话、计时、待处理提醒、自动化任务标记，可拖拽移动，
  胶囊 ⇄ 列表带动画收起展开；打开原生左侧会话栏时会收成胶囊贴在它的右侧，关闭后复位
  （拖过的列表保持自己的纵向位置；仍在默认锚点的只是收起，不会被甩到别处）。只有一条稳定排序：活跃会话优先，同组内最近活动在前；
  切换会话只移动高亮、不重排列表，`⌥+I` / `⌥+,` 严格按这个顺序循环。
- **搜索面板** —— 模糊搜索会话、按项目限定范围、键盘导航、跳转到会话。
- **按住滚动阅读** —— 按住快捷键平滑滚动对话，在到达边界前自动预载更早历史（需开启
  「滚到顶自动加载历史」）；当聊天视图回弹位置写入时，退化为按消息锚点分步上移。按住 `⌥+M` 滚到最下方后
  会激活输入框，可以立刻输入回复。
- **滚到顶自动加载历史** —— 长会话滚到顶部时自动加载上一页更早的消息，不用再手动点
  「加载更早」；默认开启，可在设置里关闭。走的是宿主原生分页，加载提示、失败提示和
  加载后的滚动位置保持都与手动点击一致。
- **任务通知** —— 会话完成、等待回答或请求权限时，在会话面板右下角弹出应用内卡片并播放提示音；
  应用在后台时改用系统通知，并完整带出问题文本与全部选项。
- **快捷键冲突检测** —— 录入与插件自身或 DSH 内置命令重复的组合会被当场拒绝，
  已保存的冲突会在启动时与设置页中提示。
- **日志与排查** —— 可选本地日志（错误/警告/常规/细节四种级别），内存里留最近若干条，设置页可一键复制或清空；启动时检查与内置命令的快捷键冲突，并记录页面报错和未处理的 Promise 异常。
- **悬浮列表归档** —— 鼠标悬停在会话行上时，右侧运行时间会换成归档按钮；搜索列表可包含已归档会话（带「已归档」标记），由设置控制，默认打开。
- **GitHub 数据源** —— 在「设置 → GitHub 数据源」为每个项目指定其 GitHub 仓库（owner/repo，自动按路径预填仓库名）与本地版本，看板的 Open Issue / Open PR / 最新上线版本列就会显示从 api.github.com 读取的真实数字（Personal Access Token 可选，公开仓库可不填）；未配置的项目仍显示「—」占位。

## 快捷键

所有快捷键都可在 **设置 → 项目看板设置** 中修改。默认值：

在 macOS 上，`⌥` 是 Option 键，`⌃` / `⇧` / `⌘` 分别是 Control / Shift / Command；
`⌥+…` 对应的就是物理 Option 键。Windows / Linux 上仍显示为 `Alt+…` / `Meta+…`。
存储的按键绑定在所有平台保持一致，已保存的快捷键无需迁移。

| 快捷键 | 行为 |
| --- | --- |
| `⌥+K` | 开/关搜索会话 —— 面板内 `⌥+I` / `⌥+,` / `↑` / `↓` 移动选择，`Enter` 打开 |
| `⌥+I` / `⌥+,` | 上一个 / 下一个会话 |
| `⌥+U` / `⌥+M` | 上一条 / 下一条用户指令（点按跳转，按住滚动） |
| `⌥+S` | 滚动到底并聚焦输入框 |
| `⌥+D` | 会话操作弹窗（归档；客户端开放删除接口时可删除） |
| `⌥+N` / `⌥+B` / `⌥+V` | 看板窄 / 中 / 全屏，同键关闭 |
| `⌥+W` | 显示/隐藏原生左侧栏；全屏看板下先退出全屏 |
| `⌥+R` | 重命名当前会话 |
| `⌥+E` | 收起 / 展开悬浮会话列表 |
| `⌥+Enter` | 把最早一条排队消息插话发送到运行中的回合 |

## 环境要求

- 支持客户端插件的 DeepSeek Harness 构建，并带有 `dsh-client-ui-sidebar`、
  `dsh-client-ui-workspace`、`dsh-client-ui-session` 客户端包。
- Node.js 18+ 仅用于仓库检查；插件本身由 Harness 加载。

## 安装

以本地链接方式安装（不发布到 npm）：

```powershell
plugin_manager install_bundle target="<本仓库路径>"
```

包名为 `@local/dsh-tac`，以 `dsh-tac` 这个 loader 条目插入。
`package.json` 暴露 `dsh.bundle.patch` 与 `dsh.client`；插件注入
`conversation.header.leading`、`conversation.session.header.utilities`、
`conversation.composer.dock`、`shell.overlay` 和 `settings.section`。

## 实现方式

插件用 **TypeScript** 写在 `src/` 下，由 esbuild 编译成单文件客户端 bundle（`client.js`）。
bundle 通过 Harness 客户端模块加载器加载，只使用公开客户端能力（`ctx.slots`、
`ctx.sidebarRight`、`ctx.layout`、`ctx.get('workspaces')`、会话状态 store）以及宿主提供的
React，自身没有运行时依赖；宿主侧 `index.js` 刻意保持 no-op。

- `src/index.ts` —— Harness 注入的入口：绑定宿主 React、调用 `apply`
- `src/apply.ts` —— 字典、样式、store、原生看板/侧栏动作、插槽注册
- `src/features/` —— 看板、悬浮列表、搜索面板（含快捷键分发）、通知、弹窗、设置页、对话滚动
- `src/core/` —— 设置与迁移、日志、组合键、store、DOM 探测、自动化/模式数据源
- `src/i18n/` —— zh/en 字典（键不一致会直接编译失败）
- `client.js`、`index.js` —— 构建产物（不要手改）
- `cordis.patch.yml` —— bundle 插入声明
- `locale/` —— zh/en 尾部字符串
- `scripts/` —— 构建脚本 + 本地与 CI 使用的清单、语法、i18n 检查
- `docs/architecture.md` —— 插槽映射、状态、键盘与通知内部实现

## 已知限制

- 会话删除取决于客户端契约；当前 DeepSeek Harness 构建没有开放删除接口，
  因此会话弹窗会禁用删除并提示改用归档。
- 归档仍在运行的会话会被宿主拒绝，弹窗会显示错误而不是强行执行。
- 系统通知受操作系统/浏览器通知权限影响，提示音受 Harness WebView 的自动播放策略影响。
- 插件面向当前客户端插槽与服务接口；若 Harness 更新重命名这些插槽，需要同步更新插件。

## 开发

```bash
npm ci                 # 安装 typescript + esbuild
npm run typecheck      # tsc --noEmit（strict）
npm run build          # src/ -> client.js + index.js
npm run check          # 类型检查 + 清单/exports/语法 + i18n 一致性
npm test               # bundle 加载测试 + 快捷键回归
```

`client.js`、`index.js` 都是由 `src/` 生成的；CI 会重新构建，若提交的产物与源码不一致就失败。
这些检查都会在每次推送和 PR 时由 CI 执行（`.github/workflows/check.yml`）。

## 协议

采用 [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-nc-sa/4.0/)，
与 [cgartlab.com](https://cgartlab.com) 相同。

Copyright (c) 2025-2026 CGArtLab.



