# LESSONS — dsh-tac

> DeepSeek Harness 客户端插件（项目看板 / 悬浮会话列表 / 命令面板）；TypeScript 源码 + esbuild 产物（`client.js` / `index.js`），运行时零依赖。
> 本仓库从真实失误沉淀的「教训→规则」清单。**会话开始先全文阅读并遵循其中所有规则**；出现新失误按 §维护 追加。
> 权威依据：Anthropic Claude Code memory/best practices（<200 行、具体可验证、第二次犯同样错即写入）；社区 lessons.md 惯例（Boris Cherny，Anthropic）。
> 来源：本仓库 `CHANGELOG.md` 记录的真实修复（0.1.12、0.1.14、0.2.1–0.2.5）+ 0.3.0 TypeScript 重写过程中踩到的坑；预填为种子，后续由 Agent 在真实工作中增长。

## 维护

- **触发**：用户纠正 / Agent 自查到的失误 / 非显而易见的 gotcha。
- **格式**：`### <主题>` 下，每条 = 失误（具体场景）→ 规则（最小可执行指令），一行可验证。
- **只记项目特有、不可从代码推断的**；通用最佳实践不写；含糊措辞（"小心""注意"）删掉。
- **重复出现** → 升级进 `AGENTS.md` 硬规则；**月度审阅**裁剪过期项；目标 < 200 行。

## 源码与产物

- 失误：0.3.0 之前 `client.js` 既是源码又是产物，手改能"生效"，重构时无从下手 → 规则：只改 `src/`；`client.js` / `index.js` 由 `npm run build` 生成，手改必被覆盖（0.3.0）
- 失误：两个测试文件都 `readFileSync('client.js')`，只跑 `npm test` 验证的是**上一次构建**的结果 —— 改完源码不 build 就等于没验证 → 规则：验证顺序固定为 `build` → `test`；提交前跑 `npm run check`（它会校验产物与源码一致）
- 失误：产物 banner 里带 `package.json` 的 version，只改版本号不重建，产物版本与实际不符 → 规则：改版本必须 `npm run build` 并把产物一起提交；CI 用 `git diff --exit-code client.js index.js` 断言两者一致（0.3.0）
- 失误：0.3.0 TypeScript 重写后，之前直接改 `client.js` 的 macOS 适配随旧产物一起失效；若把那个旧提交 rebase 到重写后的 main，改动仍落在生成文件里、下次 build 被覆盖且 CI 报产物不一致 → 规则：同步上游重写后，把改动重新落到 `src/` 的对应模块（combos / styles / i18n / apply / features）再 `npm run build`，不 rebase 改产物的提交（0.3.1）

## 构建与检查脚本

- 失误：`check-bundle.cjs` 曾用正则从 `client.js` 里读 `__ModuleLoader__.load({ id: '…' })`；esbuild 把 id 编成变量引用（`id: MODULE_ID`），正则永远匹配不到 → 规则：产物只校验"能自洽的事实"（含包名字面量、存在 loader 调用），id 一致性读 `src/constants.ts`
- 失误：i18n 检查只数源码里的键，产物漏打包也发现不了 → 规则：`check-i18n.cjs` 读 `src/i18n/*.ts` 的字典，并额外断言产物里包含全部键（0.3.0）
- 失误：`en` 与 `zh` 靠人工对齐，删/加一个键只会在界面上显示缺字 → 规则：`en: Record<keyof typeof zh, string>`，键不一致是编译错误（0.3.0）
- 失误：`node --check` 只证明"能解析"，0.3.0 切换产物时要靠 `npm test` 的加载测试和本机热重载才确认真的挂载成功 → 规则：产物必须过一次真实运行（加载测试或本机热重载），不以语法检查代替

## 宿主客户端契约

- 失误：bundle 里 `import React` 会打出一份自己的 React，与宿主各持一份状态、hooks 直接报错 → 规则：不 import React；`src/runtime.ts` 在 `factory(require)` 里绑定宿主的 React，其它模块只用活绑定的 `h` / hooks（0.3.0）
- 失误：用 `display: contents` 的插槽锚点量宽度做头部折叠，`clientWidth` 恒为 0，折叠逻辑从未生效 → 规则：量原生中列 `[class*="_centerCol"]` 的 `getBoundingClientRect()`，并用它的 `ResizeObserver` 触发重算（0.1.14 修）
- 失误：`sidebarRight.isExpanded()` 在某个版本不可靠，按它判断"面板开着"导致 `Alt+N/B/V` 只能关不能开 → 规则：可见性用 DOM 判（`[class*="_panel"][data-sidebar-right-open]` + `sidebarRight.active().kind`），不依赖 `isExpanded()`
- 失误：曾把"有 `role=dialog`"一律当阻塞弹窗，窄窗口下侧栏会渲染成模态抽屉，于是 `Alt+W` 能开不能关 → 规则：`data-shortcut-modal="sidebar"` 的抽屉放行；只有真正的模态层抑制快捷键（0.2.1）
- 失误：假设宿主有"移动主列"的接口，实际只有左栏宽度与右栏轨道 → 规则：让位只在能改的地方改（对话滚动区 padding），改不了的不硬造，并在 `docs/architecture.md` 写明依据
- 失误：`installChatScrollListeners` 用匿名函数注册 `keyup/blur/keydown`，热重载后无法 `removeEventListener`，旧监听器叠加、一次按键被多次处理；诊断 `setTimeout` 也不在 `ctx.effect` cleanup 里（审阅：0.4.0）→ 规则：任何 `window/document.addEventListener` 与裸 `setTimeout` 都要**具名回调**、放回 `ctx.effect`，并让回调返回 dispose（`removeEventListener` / `clearTimeout`）

## 快捷键

- 失误：`chat.autoHistory` 只传给了被动的 `installChatHistoryAutoLoad`，按住滚动的 `requestOlder` 没接这个开关——关掉设置后按住到顶仍会点「加载更早」→ 规则：一个设置如果影响两条路径（被动滚动监听 + 快捷键循环），必须共用同一个 `enabled` 取值并各自断言；同一类"开关没被快捷键尊重"的问题本轮是第 2 例（上一个是 `board.enabled`） → 证据：本轮修复，`src/features/chat-scroll.ts`、`src/apply.ts`、`test/shortcuts.test.cjs`

- 失误：设置项 `board.enabled` 只挡住了头部入口和看板内容，没挡住 `Alt+N/B/V`——关掉看板后快捷键仍会拉开右侧面板，显示"项目看板已在设置中关闭"的占位，而头部通往看板的入口其实是隐藏的 → 规则：任何"功能开关"都要在**分发器**里同步判断，关闭时把组合键让给应用（与关掉命令面板时的 `Alt+K` 同策略），并配一条"关闭后不消费按键、重新打开立刻恢复"的回归测试 → 证据：本轮修复，`src/features/palette.ts`、`test/shortcuts.test.cjs`

- 失误：按住滚动只在「分发器处理快捷键」的路径里收尾，用鼠标打开命令面板时循环仍在跑——被面板遮住的对话继续滚，而且焦点进入搜索框后松开的 `keyup` 可能收不到 → 规则：任何「抢占键盘 / 遮挡界面」的状态变化（命令面板打开）都必须主动 `stopHoldScroll`，不能只依赖 `keyup` → 证据：本轮修复，`src/features/palette.ts`、`test/shortcuts.test.cjs`

- 失误：曾用"焦点在输入框就跳过快捷键"，而输入框几乎总是聚焦 → 所有 Alt 组合被一刀切掉（0.1.14 修）→ 规则：不按焦点判断，只按"真模态"判断；测试必须覆盖"输入框内 Alt 仍生效"
- 失误：`Alt+K` 面板把自己当作阻塞弹窗 → 面板打开时方向键与 `Alt+I` / `Alt+,` 全部失效 → 规则：面板自己处理的组合放行，其余吞掉（同时避免 macOS Option 字符泄漏到输入框）
- 失误：全屏看板盖住整个框架，`Alt+W` 确实切了侧栏但被挡住，表现成"按了没反应" → 规则：先退出 fullscreen 再 toggle，并在日志里记 `leave-fullscreen`（0.2.4）
- 失误：客户端插件热重载会留下旧监听器，同一次按键被两个 listener 各 toggle 一次，互相抵消 → 规则：在事件对象上打 `pbxSidebarActed` 标记，只有真正生效的 listener 占有这次按键，后来者记 `leftSidebar:duplicate`（0.2.4）
- 失误：`layout.toggleSidebar` 失败时静默跳过，"接口不存在 / 调了没生效 / 键没到"三种情况分不清 → 规则：开关按 `layout.toggleSidebar` → `layout.panels.toggleSidebar` → `sidebarLeft.toggleExpanded` 兜底并记录实际路径；260ms 后核对布局，记 `applied` / `no-change` / `unverified`（0.2.1、0.2.3）
- 失误：热重载遗留的旧监听器会让"全局副作用型"快捷键执行两次——`Alt+E` 连发两个 `pbx-hud-toggle`（开又关，看起来没反应）、`Alt+U` 起两个 rAF 循环（滚动速度翻倍）、`Alt+Enter` 连点两次插话按钮（第二次只剩一条"没有排队消息"的误报）→ 规则：凡有全局副作用的动作（HUD、按住滚动、插话、回到底部、会话循环）执行前都用 `pbxShortcutActed` 认领这次按键；调色板 / 重命名 / 会话菜单的 store 属于插件实例，旧实例切换对用户不可见，**不要**认领（否则活跃实例会被误跳过）→ 证据：本轮修复，`test/shortcuts.test.cjs` 的 Alt+E / Alt+U 重复投递回归
- 失误：`pbxSidebarActed` 重复检测只加给了 `Alt+W`（leftSidebar），`Alt+N/B/V`（board）没有 → 热重载后 leaked 监听器让 Alt+N toggle 两次互相取消，用户看到"没反应" → 规则：给一个快捷键加重复检测时，检查**所有同类快捷键**是否都需要；board 快捷键用 `pbxBoardActed` 标记，与 sidebar 同模式（0.4.0）
- 失误：`healShortcutConflicts` 只挂在 `shortcutsVersion !== 1` 的一次性迁移里，迁移标记写完之后再出现的重复绑定（新动作的默认键撞上用户改过的键、手改存储）永远不会被修，表现为"其中一个快捷键按了没反应"，而且设置页只在录制时报冲突、加载时不报 → 规则：冲突自愈必须在每次 `mergeSettings` 时**幂等**执行（仅修重复，唯一绑定原样通过），并配一条"加载后同一组合只有一个占用者"的回归测试；自愈不了的残留（两个动作的默认键都被其他动作占用）必须在设置页 `data-self-conflict` 行显式列出 + 启动日志记 `duplicate binding` 警告，不能静默留一个死快捷键 → 证据：本轮修复，`src/core/settings.ts`、`src/features/settings.ts`、`src/apply.ts`、`test/shortcuts.test.cjs`

## 原生侧栏、看板与 HUD 状态

- 失误：`toggleNativeBoard('full')` 的「同键关闭」只调了 `toggleExpanded()`，没退出全屏展示态——与 0.2.4 的 `Alt+W` 是同一个坑（面板收起但全屏层还盖着页面）→ 规则：任何「收起 / 切换」路径都先退出 fullscreen 再收面板；写「同键关闭」的断言时不能只断言面板收起，还要断言全屏态被清掉 → 证据：本轮文档审计时补的 `alt+KeyV` 两次按下测试，`src/apply.ts`

- 失误：用侧栏列宽判断"开没开"，读到的是宽度动画的中途值，HUD 让位滞后半秒或落错位置 → 规则：读帧的 `grid-template-columns` 第一轨 + `data-sidebar-collapsed`；只有读不到网格才退回测量宽度，且要求连续两次读数一致（0.2.2）
- 失误：dock 的跟随定时器（80ms / 320ms）在侧栏已经关闭后仍在跑，把胶囊挪到旧的贴边位置 → 规则：dock/restore 之间所有定时器集中 `clear`，并用 `autoDock` 标志短路后续定位
- 失误：把"看板全屏"误判成"原生侧栏展开"，打开看板时 HUD 被无故收起 → 规则：全屏看板 ≠ 侧栏展开，判定口径见 `docs/architecture.md` 的诊断表（0.1.14 修）
- 失误：往输入框加 margin 给 HUD 让位，窄窗口下溢出到面板外 → 规则：只给对话滚动区加 padding（单一机制），记住被垫节点、按会话中心判左右、剩余宽度不足约 360px 时不做（0.1.14）
- 失误：贴边吸附后自动收起再展开，胶囊"浮"到上面去 → 规则：收起/展开时按旧盒子的右/下贴边重新计算坐标，而不是复用左上角（0.1.12）
- 失误：切换会话时对话区 scroller 被替换，但 HUD padding effect 的依赖（collapsed/hudWidth/pos/rows.length）不含会话变化 → effect 不重跑 → 新 scroller 不被 padding → HUD 挡住对话 + 宽度跳变 → 规则：padding/位置 effect 如果操作的 DOM 元素会被宿主替换（如会话切换重建 scroller），必须加 MutationObserver 检测元素替换，不能只靠 React state 依赖；MutationObserver 回调是微任务（在下次渲染前执行），直接调 apply() 可在浏览器画之前设好 padding，消除 1-frame flash；apply() 幂等所以每次 mutation 直接调安全；ResizeObserver 仍用 schedule()（rAF）合并列宽变化（0.4.0）
- 失误：BoardSessionGuard 的 enforce 重试 setTimeout(enforce, 120) 未被 effect cleanup 追踪——只有首触发 timer 被清理 → 会话切换期间旧 retry 携带过期闭包触发 setBoardState(oldWant)，与新 effect 的恢复互相竞争 → 规则：effect 内部的递归/链式 setTimeout 必须用单一变量追踪最新 timer ID，cleanup 清除它；不能只清理首触发而漏掉 retry（0.4.0）
- 失误：`main` slot 的看板占满整个内容区，没有返回对话的入口，用户进去就出不来 → 规则：往 `main` slot 注册占满内容区的面板时，必须提供一个显式退出路径（`closePanel` → `layout.selectPanel(null)`）；退出按钮只注入给 main 实例，不要污染右侧栏实例（0.4.0）
- 失误：`showNativeBoard()` 无条件 `requestBoardView('projects')`，导致「已打开面板 → 按 Alt+B/V 调整大小」时把用户正在看的「会话」视图弹回「项目」→ 规则：视图重置只属于"从未显示→显示"的打开语义；给 show 函数加 `resetView` 参数，resize / 进入全屏都传 `false`（0.4.0）
- 失误：窄版（compact）分支完全不渲染「项目 / 会话」切换，右栏拖窄后用户无法查看会话列表 → 规则：响应式降级只改变呈现形式（表格→卡片、六列→统计chip），**不能删掉导航能力**；每个视图在 compact 下都要有等价入口（0.4.0）
- 失误：面板开合检测 `Boolean(querySelector('[class*="_panel"][data-sidebar-right-open]'))` 只看属性存在、不看值，把关闭态读成打开态（反之亦然）→ 会话切换的保持逻辑据此判断"状态一致"，并在不一致时反复 toggle，产生可见的开关抖动 → 规则：读 data-* 布尔属性必须读值（缺失=关闭，显式 false/0/off=关闭）；**不要用 `|| 宽度>0` 兜底**——右栏折叠时仍保留非零盒子，OR 之后每个关闭态都被读成打开态，恢复路径于是跳过本该执行的 toggle（0.4.0）
- 失误：会话切换后恢复面板状态用 `setBoardState` 每 120ms 重试最多 20 次 → 每次重试都是一次 toggle，任何检测分歧都会变成来回横跳 → 规则：状态恢复类操作**最多执行一次**（一次动作 + 一次延迟确认探测），之后接受宿主状态；且首次动作要等宿主自己的切换流程结束（~320ms），不要抢在它前面（0.4.0）
- 失误：看板视图（项目/会话）用 `useState(配置默认值)` 初始化，而恢复面板状态会重新挂载组件 → 用户在「会话」页切换会话后被弹回「项目」→ 规则：需要跨重挂保留的 UI 状态必须存在组件外（共享 store），组件初始化时**优先从 store 读**，每次变更**写回 store**；不能用 useState 默认值当地址（0.4.0）
- 失误：设置页 `readSection` 直接返回 `config[section]`——旧版本存的设置没有新加的 section 键，`values[key]` 于是在渲染时抛错，整页打不开 → 规则：设置页读 section 必须回退到 `DEFAULT_SETTINGS[section]`，写入时也要以默认值为基底再合并；新增 section 时先确认旧配置能渲染（0.4.0）
- 失误：给宿主聊天区做"滚动自动加载"时，最初按 `scrollHeight > clientHeight` + 最小高度筛滚动容器，实测不触发——宿主的对话用限高组拼装，分页状态的容器 `scrollHeight` 可能等于 `clientHeight` → 规则：判定"读者滚到顶"只依赖 `scrollTop <= 阈值`，不要用可滚动高度/容器高度做前置筛选；wheel 滚动可能以 document 为目标，要先用 `document.scrollingElement` 归一（0.4.0）
- 失误：想复用宿主的分页能力时，第一反应是找内部 controller 的 `loadOlder()` → 规则：优先**点宿主自己的控件**（文本匹配多语言文案），这样加载指示、错误提示、滚动锚点补偿全都由宿主负责；只有在找不到控件时才考虑公开 API（`ctx.sessions.binding(id).session.loadOlder()`）（0.4.0）
- 失误：宿主内部 DOM 选择器（`_frame`/`_centerCol`/`_panel`/`_rightbarCol`/`data-sidebar-*`）散落在 `apply.ts`、`header.ts`、`hud.ts`，一处宿主改名要改三四个文件，每个点还各自 try/catch → 规则：**所有宿主 DOM 探测只允许出现在 `src/core/dom.ts`**，统一回落到安全默认值（`false`/`0`/`null`）；`features/chat-dom.ts` 例外（它读官方 `data-slot` 契约）。官方文档明确不鼓励靠宿主 DOM 做布局，新需求先找 slot props 或服务（0.4.0）
- 失误：`features/board.ts` 逐渐变成全插件的类型枢纽，guard/header/hud/notifications/palette/settings 都从它 import 宿主快照类型，`settings.ts` 还跨 feature 借类型 → 规则：宿主快照形状放 `src/core/snapshot.ts`，feature 之间不互相借类型；「最小契约」（如 `SessionSummaryLike`）留在用它做判定的那个模块（0.4.0）
- 失误：延时补做（等宿主动画结束再设面板宽度、再退出全屏）用裸 `window.setTimeout`，插件卸载后仍会执行，于是可能在"已经没有这个插件"的会话里改面板状态 → 规则：会把副作用施加到宿主/全局的定时器必须登记到统一集合，由一个 `ctx.effect` 在卸载时全部 `clearTimeout`；「toast 自动消失」这类只操作插件自身 store 的定时器反而**不该**清（清了会留下僵尸 toast）（0.4.0）
- 失误：可选服务 `shortcuts`/`workspaces` 直接塞进 `INJECT` 会让缺少该服务的 profile **整个插件不激活**（看板/HUD 一起失效），而不声明又违反官方「optional services 放 inject」的建议 → 规则：INJECT 只放"没有它插件就没意义"的服务；纯增强型可选服务用 `optionalService()` 每次使用时探测，缺了只降级该功能，并把理由写在 INJECT 旁边（0.4.0）
- 失误：命令面板是模态搜索框，但列表在下方持续刷新（会话推送、状态变化）时光标会掉出输入框，接着打的字去了别处——用户描述为"面板自己跳出" → 规则：**模态输入框必须有焦点守卫**（capture 监听 focusin/focusout），但只在焦点掉到 `body`/`documentElement` 时抢回；焦点停在真实元素说明用户主动点走了（行、筛选 chip、别的对话框），抢回会与用户打架。同理，所有"聚焦输入框"的快捷键处理必须先检查模态层是否打开（`isPaletteOpen()`），不能隔着模态框抢光标（0.4.0）
- 失误：「同一快捷键再按一次关闭」依赖"按实测宽度判定当前档位"，而窄档又用"上次拖到的宽度"打开 → 拖宽过之后窄档被判定成中档，再按变成调整宽度，按键看起来失效 → 规则：**toggle 键的"打开档位"必须是固定的可判定值**（`BOARD_NARROW_WIDTH = 380`），不能复用持久化的用户偏好；档位阈值的字面量只写一次（`BOARD_NARROW_MAX`），打开路径与判定路径共用（0.4.0）

## React 组件纪律

- 失误：`FloatingStatus` 把 `if (rows.length === 0) return null` 写在 hooks 之前，会话行数 0↔>0 时 hooks 数量变化 → 崩溃（0.1.14 修）→ 规则：所有 hooks 在条件返回之前；需要多挂一帧做退场时用 `present` 状态，不提前 return
- 失误：外观浮层的 outside-click 把触发它的图标也算"外部"，点开即被自己关掉 → 规则：opener 排除在 outside 判定之外，或延迟一帧再绑定监听（0.1.14 修）
- 失误：拖拽结束后的 click 被 drag-moved 标志吞掉，点胶囊没反应 → 规则：抑制只作用于紧随的一次 click，并在 220ms 后复位标志（0.1.14 修）
- 失误：用普通可变对象 `boardViewRef` 作为 prop 传给 React 组件，`requestBoardView` 原地 mutate `seq` 但对象引用不变 → React 不重渲染 → viewRequest effect 不触发 → Alt+N 打开看板时视图不切换 → 规则：跨组件传递可变状态用 `createUiStore`（`.set()` 产生新快照 + emit 订阅者），不用裸对象；组件内用 `useEffect` + `useState` 订阅 store（0.4.0）
- 失误：GitHub fetch effect 依赖 `githubRepos` 对象引用，而 `mergeSettings` 每次保存都 `cloneJson` 产生新引用 → 改任意设置都重新 fetch 所有仓库 → 规则：effect 依赖用**稳定指纹**（JSON.stringify 关键字段），不用对象引用（0.4.0）
- 失误：`fetchRepoStats` 的 pulls 请求失败时静默返回 `prs=0`，用户看到"0 个 PR"而不是错误 → 规则：partial success 也报错（pulls !ok → `errorFor`），只有 releases 404（无发布）合法留 `undefined`（0.4.0）

## 验证与调试

- 失误：测试把共享夹具 `SESSION_FIXTURE.byId.s2` 存成**引用**再 `delete retainedBy`，"还原"时赋回的还是被改过的同一个对象 → 这个文件里**之后所有测试都在"没有当前会话"的状态下跑**，`Alt+R` / `Alt+D` 那几条"没有重复弹窗"的断言一直是空过的（本轮全量冒烟才发现） → 规则：共享夹具的保存必须**深拷贝**（`JSON.parse(JSON.stringify(x))`）或用 `try/finally` 重新构造；更彻底的做法是让 harness 自己持有夹具副本（`createHarness` 深拷贝 + `patchSessions(mutate)` 每次从常量重建），测试**不允许**直接改模块级夹具 → 证据：`test/shortcuts.test.cjs`
- 失误：虚拟滚动容器把 `scrollTop` 当普通字段，而插件用 `node.scrollTop = node.scrollHeight` 这个"到底"哨兵依赖浏览器**自动 clamp**，测试里就成了 `2000`（越界值），看起来像 bug → 规则：夹具里给 `scrollTop` 写 setter 并按 `scrollHeight - clientHeight` 限制，和真实元素一致 → 证据：本轮矩阵测试
- 失误：多条快捷键在"匹配到了但目标不存在"时完全静默（没有对话时 `Alt+U`/`Alt+S`、没有指令时跳转、没有当前会话时 `Alt+R`），真机上用户只会看到"按键没反应"，日志也帮不上忙 → 规则：凡"匹配后无事可做"的分支都留一条 debug 日志（`hold:no-chat` / `scrollBottom:no-chat` / `userJump:no-target` / `rename:blocked` 等），让每一次按键都能在日志里找到归属 → 证据：`test/shortcuts.test.cjs` 的 no-target 测试
- 失误：沙箱里没有 `WheelEvent` 构造器，而插件在 `try/catch` 里 `new WheelEvent(...)` 发送"解除滚动锚点"信号——于是这条特性在测试中**从未执行过**，测试一直绿只是因为它被 catch 吞掉了 → 规则：`vm` 沙箱要提供浏览器里真实存在的全局构造器（`WheelEvent` 等），并给这类"workaround 分支"补一条可观测断言；同理，"测试绿"不等于"这行代码跑过" → 证据：本轮补的 wheel 信号测试

- 失误：想用 SendKeys / AppActivate / PostMessage 往 DSH 窗口注入快捷键来验证，Windows 前台锁 + 无地址化的 Chromium 子窗口，全部失败 → 规则：快捷键只能由人按，Agent 只读插件日志验证；日志必须有 scope 粒度（`shortcut` / `sidebar` / `hud`）
- 失误：想用浏览器客户端 `?token=` 连 `127.0.0.1` 验证，桌面端 token 是启动时临时签发 → 401 → 规则：不用 web 客户端代跑验证，走桌面端插件日志
- 失误：日志级别停在默认档时，`Alt+W` 的 info 记录看不到 → 规则：排查前先把「日志与排查」级别调到「常规」，或直接读 localStorage 里的 `entries`
- 失误：只写"修好了"而没有可复现的判断依据，下一轮又是猜 → 规则：每次行为修复配一条回归测试（`test/` 下两个测试文件的回归测试就是地基），并在 `docs/architecture.md` 留判定口径
- 失误：构造宿主布局夹具时把 `grid-template-columns: 280px …` 整串塞进 `frame.style.gridTemplateColumns`，而插件的 `readExpanded()` 用 `parseFloat` 读它 → `NaN` → 悄悄退到"量列宽"分支，测试看着绿其实没走 grid 目标态；同样的问题让"侧栏关闭后 HUD 复位"一直测不出来 → 规则：夹具必须还原 DOM 语义——`element.style.<prop>` 只放**值**，整条声明放 `getAttribute('style')`，否则测的是回落路径而不是主路径

## 本机网络与工具

- 失误：本机 `git` 全局配了 HTTP 代理，本地代理没启动时 `git fetch/push` 直接失败（`Failed to connect to github.com port 443`），而 `gh` 走 API 一切正常，很容易误判成"仓库/权限坏了" → 规则：先看 `git config --get http.proxy` 与端口是否有监听；绕过用 `git -c http.proxy= -c https.proxy= …`，大 pack 传输再叠加 `-c http.version=HTTP/1.1`（2026-11-06 实测：HTTP/2 直连会被 reset，HTTP/1.1 能过）
- 失误：`git pull` 会在网络阶段再 fetch 一次，网络抖动时明明已经 `fetch` 成功却 pull 失败 → 规则：已经 `git fetch` 到本地后，用 `git merge --ff-only origin/main` 完成快进，不重复走网络
- 失误：用占位符写提交身份时抄错一个字符（`{{EMAIL_…}}` 少一位），git 不会校验，commit author 变成未替换的字面量；两次都是推送前才靠 `git log -1 --format='%an <%ae>'` 发现 → 规则：每次 `commit` 之后、`push` 之前都跑一次 `git log -1 --format='%an <%ae>'`；发现错了用 `git commit --amend --no-edit --reset-author`（amend 会保留原 author，必须带 `--reset-author`），已推送的不要改写

## 文案、设置与迁移

- 失误：新增设置段没 bump 对应的迁移版本，老配置读不出来（`boardProjVersion` 就漏过一次）→ 规则：加/改设置段必须 bump `*Version` 并在 `mergeSettings` 写迁移，保存统一走 `writeSettings`（0.1.14 补）
- 失误：`boardProjVersion` 迁移标记在 `mergeSettings` 写进 `board.boardProjVersion`（嵌套），判定却读顶层 `boardProjVersion`，两处各存各的，升级后反复触发迁移（审阅：0.4.0）→ 规则：迁移标记与判定必须读/写**同一层**；`Settings.boardProjVersion` 留在顶层，嵌套的 `BoardSettings.boardProjVersion` 是误加，删除
- 失误：`headerButtons` 迁移先逐 id 叠加用户 `side/hidden/order`，紧接着又 `cloneJson(DEFAULT_SETTINGS.headerButtons)` 整组替换，用户改过的按钮全被清掉（审阅：0.4.0）→ 规则：迁移只做**增量叠加**，绝不整组重置；特殊 legacy 信号（如 `header.capsule===false`）在叠加之上单独应用
- 失误：通知 / Toast 层级一度盖在模态背板之上 → 规则：新增浮层先决定它属于"模态背板之下"（Toast、通知 dock）还是"之上"（命令面板、弹窗），层级在 `src/styles.ts` 里成组管理，不临时加 z-index（0.1.14 修）
- 失误：README 里写死的快捷键说明与实际默认值漂移 → 规则：改快捷键默认值必须同步 `README.md` / `README.zh.md` 的快捷键表与设置页文案，以及 `docs/architecture.md` 里点名的具体键（如 `Alt+U` / `Alt+M`）
- 失误：用户在 GitHub token 输入框填了 DSH 密钥引用 `{{API_KEY_...}}`（不是真实 PAT），插件把它当 token 发给 GitHub API → 401 → 规则：接受凭据的输入框检测框架占位符模式（`{{...}}`），显示警告提示用户填真实值（0.4.0）
- 失误：fallback 模式（无 workspace）下 path 输入用受控 `value` + row `key` 随 path 变 → 每次击键 row 重建、input 失焦 → 规则：path 输入用 `defaultValue` + `onBlur`（非受控，失焦时提交），不用 path 做 row key（0.4.0）

## 平台检测与修饰键文案

- 失误：`IS_MAC` 在 platform 非空时直接 return，只拿 platform 字符串排除 iphone/ipad/ipod；iPadOS Safari 请求桌面网站时是 `platform='MacIntel'` + UA 含 `iPad`，于是被当成 macOS、界面显示 ⌥/⌘ → 规则：平台判定无条件先查 UA 的 iOS 标记（`iphone|ipad|ipod`，忽略大小写）并立即返回 false，再走 `userAgentData.platform > navigator.platform > UA` 优先级；改检测必须给 `test/load.test.cjs` 的 `loadModule` 传 UA / userAgentData 变体做回归 → 证据：a6e314c，`src/core/combos.ts`、`test/load.test.cjs`
- 失误：`zh` / `en` 字典把 macOS 与 Windows 两套修饰键术语塞进同一句（「Option（⌥，Windows 为 Alt）」），字典拿不到当前平台，macOS 用户看到「Windows 为 Alt」、Windows 用户看到 ⌥/⌘ → 规则：用户可见的修饰键名一律用 `{ctrl}/{alt}/{meta}/{shift}` 占位符，渲染处传 `src/core/combos.ts` 导出的 `MODIFIER_LABELS`（与 `comboDisplay` 同一张 IS_MAC 派生的表），zh/en 同步，不写死 ⌥/⌘ 或 `Alt on Windows` → 证据：a6e314c，`src/i18n/zh.ts`、`src/i18n/en.ts`、`src/features/settings.ts`、`src/features/board.ts`

## 字典占位符与产物同步

- 失误：0.3.2 把 `sort.hint` 等字典改成 `{shift}` 占位符、settings.ts 渲染点已传 `MODIFIER_LABELS`，但 `src/features/board.ts` 的 3 个 `t('sort.hint')` 漏传第二参数（列头 tooltip 显示字面量 `{shift}`）；同时合并含 src 改动的 PR 时 `client.js` 没跟着重建，旧产物仍是修复前代码 → main CI step 7「The committed bundle matches src/」失败、`npm test` 在 HEAD 产物上 18 条中 2 条失败，运行时没有任何修复 → 规则：改字典占位符后必须 grep 全部 `t('<key>')` 渲染点并逐一传参；合并任何含 `src/` 改动的 PR 后必须 `npm run build`、`git diff --exit-code -- client.js index.js`，并确认 CI 的「产物一致」step 绿 → 证据：fe3f948，`src/features/board.ts`、`src/features/settings.ts`、`src/i18n/zh.ts`、`src/i18n/en.ts`、`test/load.test.cjs`、`client.js`

## 发版与合并

- 失误：在 `79e9d54` 解决 CHANGELOG 冲突时整体取了旧文件，把已随 v0.3.2 发布的 13 条又写回 `[未发布]`，同一批条目在两个小节重复——下一个版本会再"发"一遍已发布内容，读者也无法判断哪些真的没发 → 规则：解决 CHANGELOG 冲突以**已发布 tag 的版本小节**为准；发版后再合并分支，先按「条目前 40 字」比对 `[未发布]` 与各版本小节，重叠即删 → 证据：`76e6d81`（折叠）、`79e9d54`（merge 回退）、本轮修复
