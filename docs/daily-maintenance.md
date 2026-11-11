# 每日维护：定时任务、判定清单与协作工作流

> 每天定时检查 `cgartlab/dsh-tac` 的 open PR：没问题就合并；有问题先在 PR 分支上修好再合并；
> 发版 PR 合并后按发布流程打 tag 与 release。本文是这套流程的可重建说明，不依赖任何对话记忆。

## 定时任务（当前生效）

| 项 | 值 |
| --- | --- |
| 时间 | 每天 **09:00（Asia/Shanghai）** |
| 标题 | 每日检查并合并 dsh-tac 的 open PR |
| 任务 id | `schedule-86a33a92-6bbd-4b6b-ab71-b20ad7ec0138` |
| 投递目标 | 新会话（`new`），cwd `D:\github-repos\dsh-tac`，preset `cordis` |
| 授权范围 | 检查、在 PR 分支修复并推回、合并通过判定的 PR、按发布流程发版、给 `[未发布]` 补条目 |

重建方法：`schedule_create` 一次，`rrule` 用

```
DTSTART;TZID=Asia/Shanghai:YYYYMMDDT090000
RRULE:FREQ=DAILY;BYHOUR=9;BYMINUTE=0
```

`target` 选 `new`，prompt 直接复用本文「判定清单」「处理流程」「版本发布流程」三节——它们是
任务 prompt 的权威副本，改流程时两边一起改。

## 判定清单（全过才算「没问题」）

a) CI：`headRefOid` 那个 commit 上的 `check` workflow 为 SUCCESS（别拿旧 commit 的绿充数）。
b) 可合并：`mergeable: MERGEABLE` 且 `mergeStateStatus: CLEAN`（无冲突、无待处理 review）。
c) 改动面：`gh pr diff <n> --name-only` 落在插件范围内；无密钥 / 真实 token / 私钥；无无关的全仓格式化。
d) 产物一致：改了 `src/`、`scripts/` 或 `package.json` 就必须带重建后的 `client.js`（`index.js` 同理）；
   本地复算 `npm run build` 后 `git diff --exit-code client.js index.js` 必须干净。
e) 工程规则：只改 `src/`、不手改产物；快捷键五处同步；用户可见文案 zh + en 齐全；主题 token；不新增运行时依赖。
f) 文档与版本：`CHANGELOG.md` 有条目；改快捷键 / 设置 / 界面要同步 `README(.zh).md`、`docs/`；
   改 `version` 时 `package-lock.json` 同步、有对应版本小节、产物 banner 版本一致、PR 写明 tag 计划。
g) 测试：`npm test` 全绿；新行为有回归测试；不得为变绿删测试或放宽断言。

## 处理流程

1. 没有 open PR → 报告「今天没有 PR」，不动任何东西；Draft PR 跳过并列出。
2. 有问题 → `gh pr checkout <n>`，在分支上修（只改 `src/`）→ `npm run build` →
   `npm run typecheck && npm run check && npm test` 全绿 → 提交（身份 `a-pc-dsh`）→ 推回同一分支，**绝不 force push**。
3. 修不了（需求不清 / 需产品决策 / 涉及权限或密钥）→ 不动 PR，报告卡点并跳过。
4. 合并：`gh pr merge <n> --squash --delete-branch`；随后 `git checkout main && git pull --ff-only`，
   确认 `git log -1` 是这次 squash 的提交、CI 在 main 最新 commit 上跑绿。
5. 报告：PR 列表与判定、修了什么、main HEAD 与 CI 结论、是否发版、「需要人决定的事」。
   **「没查成」不得写成「没有」**：查不到、权限不足、CI 未出结果都要写明原因。

## 版本发布流程

- **发版 PR**（改了 version + 有 `[<version>]` CHANGELOG 小节 + 已重建产物）合并后：
  `git tag v<version> && git push origin v<version>`；
  `gh release create v<version> --title "v<version> — <一句话>" --notes "<CHANGELOG 该版本条目>"`。
  发版后核对：tag 指向 main 的 merge commit、`gh release list --limit 1` 正确、产物 banner 版本与 tag 一致；
  `npm publish` 之后跑 `npm run version:report` 一次核对所有版本面（`package.json` / 锁文件 / 两个产物 banner /
  CHANGELOG / tag / npm latest / 市场目录），有 `MISMATCH` 就先修再继续。
  **市场目录 `dsh-plugin-catalog` 每天约 04:50 UTC 重建**，发行后市场页会滞后到次日重建——报告里显示 `lags`
  属正常等待，不是漏发；次日重建后再跑一次报告确认它已收录。
- **普通 PR**：不 bump 版本、不打 tag；只确认 `CHANGELOG.md` 的 `[未发布]` 里有该改动
  （缺就补一条，单独一次 `docs:` 提交推到 main），并在报告里写「该发版了」。
- 发版前四项自检必须全绿：`npm run typecheck` / `npm run build` / `npm run check` / `npm test`。

## 安全边界

- 禁止：force push、改写远程历史、改 PR 的 base 分支、关闭或改写他人在审的 PR、在 `main` 上直接改代码
  （唯一例外：给 `[未发布]` 补一条 CHANGELOG 的 `docs:` 提交）。
- 允许：推 PR 分支、squash 合并通过判定的 PR（含 `--delete-branch`）、发版 PR 的 tag 与 release。
- 网络 / CI / 凭据查询失败必须写明「没查成」及原始错误，不得写成「没有」。

## 网络注意

- 若 `git fetch` / `git push` 报「Failed to connect to github.com port 443」这类错误，通常是本机 `git` 配置的 HTTP 代理没起来，不是仓库或权限问题；`gh`（走 API）不受影响。
- 排查：`git config --get http.proxy` 看当前代理设置，确认对应端口有服务在监听。
- 绕过：`git -c http.proxy= -c https.proxy= fetch origin`（push 同理）。大 pack 传输仍可能被重置，
  此时改用 `gh api` 读写文件（在服务端产生提交），不要用 reset / force 硬来。

## 可选：四人并行巡检（手动，非定时）

需要比日常更重的检查时（跨平台适配、发版前全量回归），可用 `spawn_teammate`（`context: fresh`）
临时组队；日常定时任务不需要团队，单会话足够。

| 成员 | 职责 | 写范围 |
| --- | --- | --- |
| `main-sync` | 同步、ahead/behind、版本与 CHANGELOG 一致性 | 无（只读 + git refs） |
| `macos-compat` | macOS 兼容：IS_MAC、`⌥` 标签与规范顺序、安全区与全屏、真实 GUI 0 错误 | 无 |
| `feature-audit` | 全功能回归：四项自检、功能矩阵、i18n、文档一致、真实 GUI、远程足迹 | 无（可跑命令） |
| `patch-delivery` | 汇总去重定级、修复、重建产物、提交、推分支 + 开 PR | `src/`、`package*.json`、`CHANGELOG.md`、`README*.md`、`test/*`、`docs/*`、`client.js`、`index.js` |

**为什么只有一个写者**：`src/` 里多个模块会一起改（combos / styles / i18n / apply / features），
并发写同一批文件必然冲突；三名检查员只读并产出问题清单，由 `patch-delivery` 串行修复。
合并由每日定时任务（或人）在判定通过后执行，`patch-delivery` 只负责把 PR 准备好。

## 仓库规则速查（0.3.0 起）

- 源码 `src/`（TypeScript，strict），产物 `client.js` / `index.js` 由 esbuild 生成。
- 只改 `src/` + `npm run build`；改版本必须重建产物（banner 带版本）。
- 任何用户可见文案 zh + en 都要有；`en: Record<keyof typeof zh, string>` 让缺键编译失败。
- 每次行为修复配一条回归测试；修 bug 把「为什么会发生」写进 `LESSONS.md`。
- 分支与提交规约、发布流程见根目录 `AGENTS.md` / `LESSONS.md`。
