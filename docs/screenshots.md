# README 截图：抓什么、怎么更新

README（中英文）顶部一共嵌了三张图，它们和代码一样属于「会过期的产物」：
功能改了、界面变了，图还是旧的，读者看到的就是一个不存在的产品。这份文档规定
三件事——**每张图要展示什么**、**更新流程**、**落后时怎么记账**——并由
`scripts/check-screenshots.cjs` 在 `npm run check` 里机械校验。

## 三张图

| 文件 | 展示内容 | 抓图时必须出现 |
| --- | --- | --- |
| `docs/screenshots/board.png` | 右侧栏的项目看板（项目 / 会话两个标签、统计 chip、按项目分组的表格） | 至少两个项目；表格里能看到 GitHub 相关列（Open Issue / PR / 版本）；「项目」「会话」两个标签都在 |
| `docs/screenshots/hud.png` | 悬浮会话列表（运行中一行带计时 + 若干最近会话 + 底部快捷键脚注） | 至少一条**运行中**的会话（显示计时与「当前」标记）；底部脚注的「会话 / 指令」两组快捷键完整 |
| `docs/screenshots/palette.png` | 命令面板（搜索框、项目 chip 行、会话列表、底部快捷键提示） | 项目 chip 行里能看到 **「只看已归档」**（0.5.0 起）；最好选中一条归档行，让底部出现 **Shift+Enter 恢复**的提示（0.5.1 起） |

尺寸参考（不是硬性要求，但换图时尽量保持一致，避免 README 排版跳动）：
`board.png` 640×540、`hud.png` 300×440、`palette.png` 730×430。

**图必须来自真实运行的应用**（桌面端当前发布版本）。不要用 mock 页面或手工拼的 HTML
生成截图——那种图会骗人，也会掩盖真实的排版问题。

## 更新流程

1. 把应用更新到准备发布的版本（`dsh-tac@<version>`），重启 DSH。
2. 按上表把对应界面调整到「必须出现」的状态，抓图并覆盖 `docs/screenshots/*.png`。
3. 重新计算哈希并更新 `screenshots.meta.json` 的对应条目：

   ```powershell
   (Get-FileHash docs/screenshots/palette.png -Algorithm SHA256).Hash.ToLower()
   ```

   同时把 `showsVersion` 改成当前版本、`capturedAt` 改成抓图日期。
4. `npm run check` —— 结构（文件存在 / PNG / 两份 README 都引用 / 哈希一致）与
   新鲜度（`showsVersion` 是否等于 `package.json` 版本）都会校验。
5. 连同图、`screenshots.meta.json` 和必要的 CHANGELOG 条目一起提交。

## 暂时抓不了图：登记欠账

发布节奏和抓图时机不一定对得上。如果某张图这轮确实没条件重抓，**不要**把
`showsVersion` 直接改成新版本（那是假账）。在 `screenshots.meta.json` 的
`acknowledgedStale` 里登记：

```json
{ "path": "docs/screenshots/palette.png", "reason": "缺 0.5.0 的「只看已归档」chip；等下次抓图窗口一并更新" }
```

检查会把这张图的版本落后从 **FAIL 降级为 WARN**，并把 `reason` 打进日志——欠账留在
仓库里，可被评审和后续任务看见，而不是只存在某个人的记忆里。

## 为什么只有一个数组在 `screenshots.json`

`screenshots.json` 保持「纯路径数组」是为了不影响外部消费者（应用商店 / 商店页读取它）。
抓图元数据放在独立的 `screenshots.meta.json`，两边由检查脚本互相校验，
不要在 `screenshots.json` 里塞对象。
