# 发布流程（自动化）

目标：**你只需要说「发 0.6.2」，剩下的由 Agent 跑完，你不需要登录 npm、不需要点任何网页。**

发布本身走 GitHub Actions 的 **OIDC 可信发布**（`.github/workflows/publish.yml`）：推一个 `v*` tag，工作流自动 `npm ci → check → test → npm publish`，不依赖任何 token，也没有会过期的凭据。npmjs.com 上已经为 `cgartlab/dsh-tac` 绑定了 `publish.yml`（允许 `npm publish`），首次发布已通过验证。

## 你的一步

告诉我目标版本号（或「发下个补丁版」）。如果新版本需要新增/改文案，我会先拟好 CHANGELOG 条目给你确认。

## Agent 的步骤

1. **改版本**：`package.json` 的 `version` + `CHANGELOG.md` 的 `## [x.y.z] - 日期` 小节（中文、用户视角）。
2. **构建与提交**：`npm run build` → 手工 `git commit`（提交信息说明 WHY）→ push 到 `main`。
3. **预检**：`npm run release:preflight`
   - 校验：CHANGELOG 小节非空、产物与 `src/` 一致（干净树）、registry 上还没有这个版本、本地版本面全部一致、`npm run check` 与 `npm test` 全绿、工作区干净。
   - 任何一项不过都会打印 `NOT READY` 和具体原因，**不会**进入下一步。
4. **发布**：`npm run release:tag`
   - 打 annotated tag `v<version>` → push → `gh release create --latest`（说明逐行取自 CHANGELOG）
   - 轮询最多 10 分钟，直到 `npm view <pkg>@<version>` 返回该版本；若对应的发布工作流失败，打印失败 run 的链接并以非零退出。
   - `--dry-run` 只打印计划，不改任何东西。
5. **本机跟进**：`npm run release:tag -- --install`（或单独 `pnpm add <pkg>@<version>` 到 `~/.dsh/profiles/desktop`），然后
   `npm run version:report -- --gui=http://127.0.0.1:<端口>` 核对全部版本面。

## 失败时怎么办

| 现象 | 处理 |
| --- | --- |
| preflight 报 `already published` | 版本号被用过，bump 一个新版本，不能重发同一版本 |
| preflight 报产物不一致 | 忘了 `npm run build`，重新构建并提交产物 |
| preflight 报工作区不干净 | 先提交，再预检 |
| CI 发布失败 | 打开打印的 run 链接看日志；修好后 **bump 补丁版本** 重新走流程（tag 一旦推送不要重打） |
| registry 十分钟内没有新版本 | 看 Actions 页面 `Publish` 工作流；OIDC 绑定失效时按 npm 文档重新绑定（正常不会发生） |

## 兜底：本地 token 发布

只有 OIDC 不可用时才用：`npm run release`（先 `npm login --auth-type=web` 一次；脚本会 `npm whoami` 自检）。npm 的 granular token 最长 90 天，`2027-01` 起 2FA-bypass token 不能再直接发布，所以**不要把这条路当成长期方案**。

## 市场目录

`dsh-plugin-catalog` 每天约 04:50 UTC（北京时间 12:50）重建一次，发布后市场页会滞后到次日；`version:report` 会标成 `lags`，这不是漏发。
