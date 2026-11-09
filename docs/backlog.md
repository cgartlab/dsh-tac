# 待办与可选改进（backlog）

这个文件记录"还没做，但值得做"的点，避免有价值的工作散落在关闭的 PR 里。

## 当前待办

暂无。

### 已关闭：ChatViewport 精确滚动（前提不成立）

原条目写的是"通过 DSH 的 ChatViewport owner API（`write()` / `metrics()` / `scrollToTurn()`）
驱动滚动，当前实现是 `scrollTop` 写入 + wheel 信号，能用但更依赖 DOM 细节"，并建议单独开分支。

2026-11-09 用 `cordis_inspect_query` 核对宿主实际暴露的接口后，确认**这个前提不存在**：

- `conversation.chat.flow` 的 `ownerProps` 只有四个数据字段（`entries` / `pendingInputs` /
  `lastInputTurn` / `deferCollapse`），没有任何视口或滚动方法；
- 它的 `standardProps` 里的 `useChat` / `useConversation` / `useTrajectory` 等 hook 也不提供滚动控制；
- 客户端服务目录（`slots` / `layout` / `sessions` / `theme` / `timer` / `uiWorkspace` /
  `workspaces` / `locale`）里没有与聊天视口相关的服务；
- 代码里**从未**出现过 `scrollToTurn` / `metrics()` / `scrollToMessage`。参考提交 `6f0c934` 的
  message 写着 "drive the transcript through DSH's ChatViewport"，但那次提交实际做的是按
  `overflowY` 探测 DOM 滚动容器（`src/features/chat-dom.ts`），message 与实现不符——
  所以"当前实现只是临时方案"这个判断本身也是错的。

结论：现在的做法（`scrollTop` 写入 + `data-chat-anchor-key` 锚点 + `scrollIntoView` 兜底）
是没有宿主接口时的上限，**不是待替换的临时方案**。要做到真正精确，需要上游把视口能力暴露到
slot props 或客户端服务里；在那之前重复尝试没有意义。

## 已从 backlog 取走

以下条目已实现，从待办里删除（对应 CHANGELOG 见 0.4.0 与之后的版本）：

| 改进 | 落地情况 |
| --- | --- |
| macOS 快捷键符号 | 已在 `src/core/combos.ts`：`MODIFIER_LABELS` 在 macOS 显示 `⌃⌥⇧⌘`，并按 Control → Alt → Shift → Meta 的规范顺序排列；存储的绑定保持平台中立 |
| macOS 顶部安全区 | 已在 `src/styles.ts`：HUD / toast / 搜索面板 / 重命名弹窗在 `html[data-pbx-platform="darwin"]` 下按 `--dsh-frame-top-clearance`（含全屏 20px 回退）留出系统菜单栏与窗口按钮区；平台标记由插件自己在 `<html>` 上写，因为 Electron 只在原生窗口注入 `data-platform` |
| 失败通知 | 已完成通知会先向 `ctx.sessions.binding(id).session.getSnapshot()` 取 `lastAgentError` / `promptError`，有错误就改报「任务失败」并把原因写进正文；宿主未暴露 `sessions` 服务时降级为原来的行为 |
| 本地化审批原因 | `approvalReasonText()` 处理字符串 / `{en,zh}` / message 对象，通知正文不再出现 `[object Object]` |
| 停止运行中的回合 | 会话操作弹窗新增「停止运行」，调用 `remote.session.cancel`；不可用时给出说明而不是静默失败 |
| 文档/版本一致性检查 | `scripts/check-bundle.cjs` 校验 README 存在、CHANGELOG 最新标题与 `package.json` 版本一致（`[未发布]` 视为合法，兼容"攒一批再发版"的流程） |

## 维护约定

- 从 backlog 拿走一项时，请在 PR 或提交里注明"来自 backlog"。
- 已完成的条目从「当前待办」移到「已从 backlog 取走」，并在 CHANGELOG 里记一笔。
