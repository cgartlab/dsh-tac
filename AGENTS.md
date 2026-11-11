# AGENTS.md — dsh-tac

> DeepSeek Harness 客户端插件：项目看板（原生右侧面板）+ 悬浮会话列表 + `Alt+K` 命令面板（含 14 个全局快捷键）。源码是 `src/` 下的 TypeScript，`client.js` / `index.js` 由 esbuild 生成，运行时零依赖，只用宿主公开的 client 服务。

> **会话约定**：开始任何工作前，先读根目录 `LESSONS.md`（本仓库从真实失误沉淀的「教训→规则」清单）并遵循其中所有规则；遇到新失误按其 §维护 追加。

## 这是什么

- 一个 DSH **client bundle**：`package.json` → `cordis.patch.yml` → 注入 profile；宿主侧 `index.js` 是刻意的 no-op，全部逻辑跑在浏览器客户端里。
- 四块界面：右侧项目看板、悬浮会话列表（HUD）、命令面板、插件设置页；另有任务通知、会话重命名/归档、原生左侧会话栏快捷键。
- 权威文档：`README.md` / `README.zh.md`（用户视角）、`docs/architecture.md`（插槽、状态、键盘与通知内部实现）、`docs/ts-rewrite.md`（TypeScript 改造与验收记录）、`CHANGELOG.md`（中文、用户视角的版本变化）。

## 目录与产物

| 路径 | 说明 |
| --- | --- |
| `src/index.ts` | loader 入口：绑定宿主 React → 调用 `apply` |
| `src/apply.ts` | 字典、样式、store、原生看板/侧栏动作、全部插槽注册 |
| `src/runtime.ts`、`src/host.ts` | 宿主 React 绑定；客户端服务契约类型 |
| `src/core/` | 设置与迁移、日志、组合键、store、DOM 探测、自动化/模式数据源 |
| `src/features/` | 看板、HUD、命令面板（含快捷键分发）、通知、弹窗、设置页、对话滚动 |
| `src/i18n/`、`src/styles.ts`、`src/ui/` | 双语字典、全部 CSS、图标几何 |
| `client.js`、`index.js` | **构建产物，不要手改** |
| `test/` | 加载测试 + 快捷键回归（读的是 `client.js`，即产物） |
| `scripts/` | `build.mjs`、`check-bundle.cjs`、`check-i18n.cjs` |

## 工作约定

- **只改 `src/`，然后 `npm run build`**；产物与源码不一致时 CI 直接失败。
- **不 import React**：宿主通过 loader 的 `factory(require)` 提供 React，`src/runtime.ts` 绑定一次，其它模块只用活绑定的 `h` / hooks。
- **只用公开 client 服务**：`INJECT`（`src/apply.ts`）声明的必需服务是 `slots`、`locale`、`uiWorkspace`、`remote`（含 `remote.session` / `remote.schedule` / `remote.agentPresets` 子路径）、`sidebarRight`、`sidebarRightTabs`、`layout`；可选服务 `shortcuts`、`workspaces` 用 `optionalService()` 探测（缺了只降级该功能，不整插件失活）。宿主没暴露的能力不要猜着调用。
- **宿主 DOM 探测集中在 `src/core/dom.ts`**：宿主内部的类名/属性（`_frame`、`_centerCol`、`_panel`、`_rightbarCol`、`data-sidebar-*`、`data-rightbar-*`）只允许出现在该文件，且每个探测都必须 `try/catch` 并回落到安全默认值（`false`/`0`/`null`）；`features/chat-dom.ts` 例外，它只读官方 `data-slot` 契约。官方文档明确不鼓励靠宿主 DOM 做布局，新增需求优先找 slot props 或服务。
- **不读写会话记录**：只读状态，只调用宿主暴露的动作（打开 / 重命名 / 归档）。
- **新增或改快捷键要五处同步**：`DEFAULT_SETTINGS.shortcuts`（`src/constants.ts`）、`SHORTCUT_LABEL_KEYS`、设置页录制项、`README*.md` 的快捷键表、`test/shortcuts.test.cjs` 的覆盖。
- **任何用户可见文案都要 zh + en**：`src/i18n/en.ts` 的类型按 `zh` 的键约束，缺键直接编译失败；`npm run check` 另外校验产物里嵌入了全部键。
- **颜色用主题 token**（`--dsw-alias-*`），不写死颜色；动效尊重 `prefers-reduced-motion`。
- **运行时零依赖**：devDependencies 只有 `typescript` + `esbuild`，`peerDependencies` 只有 `react`。

## 改本仓库时

- 提交信息：Conventional Commits（`feat|fix|docs|refactor|test|chore|ci`），body 讲 WHY。日常直接提交 `main`；要走 PR 时分支用 `feat/` `fix/` `docs/` `chore/` 前缀（工作区 hooks 会校验分支名）。
- 版本：`package.json` 的 `version` 是唯一权威，产物 banner 里带着它 —— **改版本必须重新 `npm run build`** 并提交产物；同时更新 `CHANGELOG.md`（中文、用户视角）与 release tag `v<version>` 保持一致。
- 文档同步：改快捷键 / 设置项 / 界面行为时，同步 `README.md`、`README.zh.md`、`docs/architecture.md`；结构性改动写进 `docs/`。
- 修 bug 时把"为什么会发生"写进 `LESSONS.md`（一条 = 失误 → 规则 + 证据）；重复犯的教训升级成本文件硬规则。

## 自检（提交前，四项都要绿）

```bash
npm run typecheck   # tsc --noEmit（strict）
npm run build       # src/ -> client.js + index.js
npm run check       # 类型 + 清单/exports/语法 + i18n（含产物嵌入）
npm test            # 加载挂载 + 快捷键回归
```

CI（`.github/workflows/check.yml`）除此之外还会 `npm ci` 后重建并 `git diff --exit-code client.js index.js`，以及对两个产物跑 `node --check`。

## 发布

1. 改 `package.json` 的 version 与 `CHANGELOG.md` → 2. `npm run build` → 3. 跑上面四项 → 4. commit + push → 5. 打 tag `v<version>` 并 `gh release create v<version>` → 6. `npm publish` → 7. `npm run version:report` 核对全部版本面 → 8. 本机热重载验证（见下）。

`npm run version:report` 一次列出所有版本面（`package.json` / 锁文件 / 两个产物 banner / CHANGELOG 标题 / git tag / npm latest / GitHub release notes 与 CHANGELOG 小节是否逐行一致 / 市场目录）并标出不一致。**市场目录（`dsh-plugin-catalog`）每天约 04:50 UTC 重建一次**，所以发布后市场页的版本会滞后到次日重建，这是正常现象，不是漏发；报告会把它标成 `lags` 并注明。`--offline` 可跳过联网检查。本机还可以加 `--gui=http://127.0.0.1:<端口>`（桌面端市场更新 API 免认证）核对**运行中的应用**装的是哪个版本：`npm run version:report -- --gui=http://127.0.0.1:59752`。

## 调试运行中的插件（本机）

- **热重载**：`plugin_manager set_plugin target="include:dsh-tac" enabled=false`，再置回 `true`；桌面端 `Ctrl+R` 重新加载也会重新注册。
- **看日志**：插件自带的「设置 → 日志与排查」就是真相来源（级别调到「常规」才看得到 info）。桌面版可从 `%APPDATA%\@deepseek-ai\dsh-desktop\Local Storage\leveldb` 里读出最近一次 `entries` 数组。
- **`Alt+W` 排查**按 scope 分三条：`shortcut`（键到没到、被谁挡）、`sidebar`（走哪条接口、是否真的生效）、`hud`（贴边收起 / 复位），三条拼起来能重建一次按键的全过程。
- **不要试图用 SendKeys / AppActivate / PostMessage 往 DSH 窗口注入按键**（Windows 前台锁 + 无地址化的 Chromium 子窗口，实测全部失败）；快捷键只能由人按，Agent 靠日志验证。

## 依赖

`git`；Node ≥ 18（CI 用 24、本机 26 实测）；`gh`（发 release 用）。插件运行时不需要任何 Node 依赖 —— `client.js` 是自包含的 IIFE，React 由宿主提供。
