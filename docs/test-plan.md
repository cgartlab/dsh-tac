# dsh-tac 全面测试流程

> 依据项目性质（DSH 客户端插件：宿主内运行、零运行时依赖、四块 UI、14 个快捷键、
> 依赖宿主 DOM 与公开服务）整理的验收流程。每次大改后按此逐项过一遍。

## 0. 静态基线（每次必跑）

| 项 | 命令 | 通过标准 |
| --- | --- | --- |
| 类型 | `npm run typecheck` | 无输出 |
| 产物 | `npm run build` | `client.js` / `index.js` 重建 |
| 清单与字典 | `npm run check` | bundle checks passed；zh 键 = en 键 |
| 回归 | `npm test` | 全通过 |
| 产物一致 | `git diff --exit-code client.js index.js` | 提交后无差异（CI 也查） |

## 1. 结构与契约（A）

- [x] `package.json` 的 `exports` / `files` / `dsh.bundle.patch` / `dsh.client` 与官方模板一致
- [x] `locale/*.json` 有 `meta.title` + `meta.description`，描述覆盖**全部**能力（不能只写看板）
- [x] `icon.svg` 存在且合法；LICENSE 存在
- [x] `INJECT` 只含"没有它插件就没意义"的服务；可选服务走 `optionalService()`
- [x] 宿主 DOM 选择器**只**出现在 `src/core/dom.ts`（`chat-dom.ts` 的 `data-slot` 除外）
- [x] 无循环依赖；`src/core/snapshot.ts` 是宿主快照类型的唯一来源
- [x] 每个 `ctx.effect` 的 disposer 完整（监听器 / 定时器 / observer 全部清理）

## 2. 状态机（B）—— 最高风险区

面板档位 × 会话切换 × 快捷键 的穷举：

> 语义（已定）：**每个尺寸键都是独立的开关**。看板示于任意档位时，按任意尺寸键都**关闭**；
> 看板关闭时，按某个尺寸键**打开为该尺寸**。档位只由「真全屏标记」与「实测宽度」判定，
> 拖宽的窄/中档不会被误判成全屏。

| 起点 | 操作 | 期望 |
| --- | --- | --- |
| 关闭 | Alt+N | 打开 **narrow(380)** |
| narrow | Alt+N | **关闭** |
| 关闭 | Alt+B | 打开 half(50vw) |
| half | Alt+B | **关闭** |
| 关闭 | Alt+V | 打开 full |
| full | Alt+V | **关闭** |
| narrow | Alt+B | **关闭**（尺寸键在任意档位都是关闭） |
| half | Alt+N | **关闭**（同上；改尺寸需先关闭再按目标键） |
| 关闭 | 再按某键 | 打开该键对应档位 |
| 任意档位 | 切会话 | 档位与**实测宽度**都保持，不横跳，视图保持 |
| 其他 tab 打开 | Alt+N/B/V | 切回看板 tab + 该档位 |
| 主面板 | 「返回对话」 | 回到对话 |

补充检查：
- [x] 档位判定的阈值只有一处常量（`BOARD_NARROW_MAX`）
- [x] `'full'` 只由宿主真全屏标记决定；拖宽到 ~75% 的档位切会话后不会跳全屏
- [x] 恢复档位时优先用记录下来的实测宽度（`want.width`）
- [x] `resetView` 只在"真正打开"时为 true
- [x] 快捷键意图（900ms）内切会话，guard 不抢
- [x] 守卫恢复最多操作一次（不反复 toggle）
- [x] 共享 view store 的两个实例（main / 右侧面板）不会互相干扰
- [x] 会话数 > 200 时分批渲染，底部可「显示更多」；改筛选条件回到第一批

## 3. 快捷键（C）

- [x] 14 个默认键逐个触发，副作用正确
- [x] 语义无重叠、无"同键不同义"的困惑
- [x] 输入框聚焦时字母键不误触；Alt 组合仍可达
- [x] 真实对话框（宿主 modal）抑制快捷键；插件自己的 palette 不抑制关闭键
- [x] palette 打开时：**窗口级键**（看板 / 左侧栏 / HUD / 重命名 / 会话菜单）一律「关闭面板 + 执行」；**对话级键**（插话 / 按住滚动 / 跳到底 / 会话循环）一律「消费但不动」——同一类必须完全一致
- [x] 重复监听器守卫（`pbxSidebarActed` / `pbxBoardActed`）覆盖所有 toggle 键
- [x] 一次按键不会同时触发宿主默认行为（`preventDefault` 到位）

## 4. i18n 与可访问性（D）

- [x] 无硬编码文案（`title` / `aria-label` / `placeholder` / 错误 / 空态）
- [x] zh/en 语义等价，单位与复数自然
- [x] 所有可交互元素可 Tab 到、Enter/Space 生效、焦点环可见
- [x] `aria-checked` / `aria-selected` / `aria-expanded` 反映真实状态
- [x] `prefers-reduced-motion` 被尊重

## 5. 设置（E）

- [x] 旧配置缺字段时不崩（`readSection` 回落默认）
- [x] 依赖矛盾已处理：`board.enabled=false` / `hud.enabled=false` / `notify.enabled=false` / `palette.enabled=false` / `log.enabled=false` 时，从属项**变灰并禁用**，开关本身仍可点
- [x] `hud.recentEnabled=false` 时，仅「最近会话条数 / 排除自动」被禁用
- [x] 数值边界（越界 / NaN / 负数）不产生非法 UI
- [x] 「恢复默认」覆盖敏感项（token / repo 映射）且行为明确

## 6. 数据源（F）

- [x] 无 token 时公开仓库可读；私有仓库给出可理解错误
- [x] 401 / 403 / 404 / 超时 / 限流 各自的错误文案与 `aria-label`
- [x] repo 映射只填一半 / owner 非法 / repo 不存在
- [x] 数值计算正确：`issues = max(0, open_issues_count - prs)`，PR 数取分页 `Link` 尾页
- [x] 拉取中显示 loading（`aria-busy`）、失败显示可读错误、无映射显示 `—`

## 7. 生命周期（G）

- [x] 热重载（disable→enable）后无重复监听器、无僵尸定时器
- [x] 卸载后不再对宿主施加副作用（改面板宽度 / 退出全屏 / 抢焦点）
- [x] 卸载后 `opener.focus` 不指向已移除元素
- [x] 日志/存储不会被无限追加

## 8. 边界与异常（H）

- [x] 0 workspace / 0 会话 / 全部归档
- [x] 超长标题与路径、emoji、非拉丁文字不破版
- [x] 几百个会话时列表可用（性能与滚动）
- [x] 宿主服务缺失（无 shortcuts / workspaces / remote.session）时插件仍可用
- [x] `updatedAt` 缺失 / 未来 / 极旧 时的相对时间输出

## 9. 视觉一致性（I）

- [x] 无硬编码颜色（token 之外）
- [x] 深/浅色主题下对比度足够
- [x] 字号/间距/圆角与宿主同类页面一致
- [x] 空态 / 加载态 / 错误态都有明确视觉反馈
- [x] 四块 UI 的视觉语言统一
- [x] 极窄（380）/ 极宽（全屏）下布局不破

## 10. 交互一致性（J）

同一能力的不同入口必须给出**相同结果**：

| 能力 | 入口 | 应一致 |
| --- | --- | --- |
| 打开看板 | 左侧菜单 / 快捷键 / 按钮 | 是否都进「项目」视图 |
| 打开会话 | 看板行 / HUD 行 / palette / 左侧栏 | 是否都切换 + 关闭遮罩 |
| 关闭面板 | 快捷键 / 面板关闭按钮 / 「返回对话」 | 结果是否相同 |
| 会话操作 | HUD 悬停 / 会话菜单 / 快捷键 | 是否同一套动作 |
| 打开看板（已开） | 菜单 / 快捷键 / 按钮 | 是否都**保留**当前 tab，不重置 |

## 附：证据来源与已知缺口

勾选状态的含义（不要把它当成"跑过一遍就永久有效"，改动后要重新过）：

| 证据类型 | 覆盖的维度 | 说明 |
| --- | --- | --- |
| 回归测试 | B、C、D、E、F、H、J | `npm test`（125 条）：状态机、快捷键矩阵、设置迁移与禁用、GitHub 数据源、边界、双入口一致性 |
| 代码清点 | A、G | 逐个核对 `ctx.effect` 的 disposer、监听器/定时器/observer 的清理、日志上限（`slice(-max)` + 存储 `slice(-120)` + 800ms 节流） |
| 静态审查 | D、I | 无硬编码文案/颜色、aria 属性、reduced-motion、字号圆角一致性 |
| 人工实测 | B、交互 | 截图验证面板开关、命令面板、看板渲染、HUD |

### 已知缺口（需要人工做，Agent 做不了）

1. **设置页的界面实测**。设置页有测试覆盖（挂载 + 断言 `data-setting` 行存在/禁用状态），但没有在真实窗口里点开看过视觉效果。
2. **深色/浅色主题的对比度实测**。审查是静态分析 CSS 变量与透明度，没有在两种主题下逐个截图比对。
3. **快捷键的真人按键验证**。Windows 前台锁 + Chromium 子窗口无地址化，键盘注入实测全部失败；快捷键只能靠单元测试（模拟 keydown 事件）与日志验证。
4. **几百个会话的真实性能**。分批渲染（阈值 200）有测试断言，但没有在真实 profile 里构造 500 条会话测帧率。

## 11. 发布与分发（K）

这一维只在"准备对外分发"时过一遍。

- [x] `package.json` 的 `exports` 与同类第三方 bundle 对齐（`.`、`./client`、`./cordis.patch.yml`、`./package.json`、`./locale/*.json`、`./icon`）
- [x] `dsh.bundle.patch` 指向的文件确实在本包内，且被打进 tarball
- [x] 安装命令实测可用：`dsh plugin --profile <名> add github:<owner>/<repo>` 能下载、安装并**自动注册进 `dsh.profile.bundles`**
- [x] 文档写清了 `dsh` CLI 的位置（桌面版不在 PATH）与如何确认 profile 名
- [x] 仓库挂了 `dsh-plugin` topic（市场扫描入口）
- [x] 提交材料齐备：一行价值 / 分类 / 安装命令 / 兼容性 / 许可证 / 截图 / 权限说明
- [ ] npm 发布（需要维护者账号与包名决策；不发布则只被网站收录，不进 DSH 内置 Plugin Hub）

## 12. 字典反向检查（L）

`npm run check` 只验证"用到的键都在字典里"，不验证反过来。每批改动后单独跑一次：

- [x] 找出**定义了但没有任何源文件引用**的键（本轮清掉 18 个，两语言共 36 条）
- [x] 动态拼接的键（如 `'settings.hb.' + id`）不算死键——先确认没有 `t(a + b)` 形式
- [x] **注意检测方法本身**：带点号的正则会漏掉 `loading` / `subtitle` / `open` / `title` 这类无点号键，必须用 `t('key')` 精确匹配二次确认
- [x] 清理后 `npm run check`（会报"unknown i18n key used as a literal"）与全部测试仍需通过