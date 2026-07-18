# 单测执行（TestGen）模块 - 设计文档

> 在已生成「单测覆盖率 Prompt」之后，端到端自动化：选本地项目目录 -> 切/建分支 -> 用 `claude -p` 写单测 -> `mvn test` 验证 -> `git commit`（+ 可选 `push`）。
> 集成到 Dev Tools Tauri 应用，复用「报告生成」的流式弹窗模式。

**版本**: v0.1 (Draft)
**日期**: 2026-07-16
**作者**: Pedro

---

## 1. 背景与目标

应用已有 SonarQube 覆盖率 Prompt 生成流程（`sonar_generate_prompt`，`commands/sonar.rs`）和 `claude -p` 流式调用 demo（`services/activity/summarizer.rs::summarize_cli_streaming`）。当前 Prompt 生成后只能复制粘贴手动执行。

本模块把「拿到 Prompt 之后」的步骤自动化：在本机项目目录上切分支、让 AI 写单测、跑测试验证、提交（可选推送）。目标：一键把覆盖率缺口变成已提交的单测代码，同时保证仓库安全（失败不破坏状态、推送需确认）。

## 2. 关键决策（已与用户确认）

| 决策点 | 结论 |
|---|---|
| 入口 | 新独立模块「单测执行」+ SonarPrompt 结果页「用 AI 执行」按钮预填 prompt 跳转 |
| 提交/推送 | 自动 `git commit`；`push` 前确认（带开关可跳过确认，用户每次自定） |
| AI 执行 | `claude -p` 在项目目录运行，`--permission-mode acceptEdits` 自动批准编辑、`--disallowedTools Bash` 禁 bash |
| 提交前验证 | 跑 `mvn test`，失败则**不提交**（Java/Maven 项目） |
| 分支策略 | 每次由用户选：新建工作分支（`test/<slug>`）或在选中分支上操作 |
| 界面 | 单页配置表单 + 流式执行弹窗（复用报告生成弹窗模式，可静默最小化） |
| Maven 仓库 | 可配本地仓库目录（`-Dmaven.repo.local`，同时告知 AI）+ 可选 settings.xml（`-s`，可含 Nexus mirror） |

## 3. 架构

```
TestGenPage (React, /testgen)
  ├─ 配置表单：prompt / 选目录 / 分支下拉 / 分支模式 / 提交名 / push确认开关 / mvn配置
  ├─ 执行 -> 流式弹窗（阶段日志 + AI 思考/输出 + 可静默）
  └─ push 确认 -> push_branch

后端 services/testgen/
  ├─ mod.rs     模块入口
  ├─ git.rs     GitOps：list_branches/validate/checkout/create_branch/add/commit/push
  ├─ cli.rs     run_claude_streaming：claude -p（cwd=项目目录, acceptEdits, 禁 Bash, 流式）
  └─ runner.rs  run_test_gen：管线编排
commands/testgen.rs   Tauri 命令
```

git/mvn 全部用 `tokio::process::Command`（与 summarizer 跑 claude 一致），**不引入 git2 crate**。

## 4. 组件

### 4.1 `services/testgen/git.rs` - `GitOps`

所有方法以 `dir: &Path` 为工作目录，用 `git -C <dir> ...` 形式执行，返回 `Result<T, String>`（错误带 stderr）。

- `validate(dir) -> RepoInfo { is_repo, current_branch, clean, remote }`
- `list_branches(dir) -> Vec<BranchInfo { name, current, upstream }>`
- `checkout(dir, branch)`
- `create_branch(dir, base, new_name)` - `git checkout -b <new_name> <base>`
- `add_all(dir)` / `commit(dir, msg) -> commit_sha`
- `push(dir, branch)` - 含 `--set-upstream` 兜底
- `is_clean(dir) -> bool` - `git status --porcelain` 为空

### 4.2 `services/testgen/cli.rs` - `run_claude_streaming`

复用 `summarizer_cli_streaming` 的 stream-json 解析逻辑，**两点增强**：
- `Command::current_dir(cwd)` 设为项目目录。
- 额外参数 `--permission-mode acceptEdits --disallowedTools Bash`（自动批准编辑、禁 bash，避免权限弹窗卡住）。

emit `testgen-stream` 事件：`{kind:"thinking", tokens}` / `{kind:"text", text}` / `{kind:"done"}`。返回最终 result 文本。

> 说明：先自包含实现，后续可把 summarizer 与本模块的 claude 调用重构为共享 `services::cli` 工具（本设计不强制，避免影响已工作的报告生成）。

### 4.3 `services/testgen/runner.rs` - `run_test_gen`

`run_test_gen(req: TestGenRequest, app: &AppHandle) -> Result<TestGenResult, String>`，管线：

1. emit `progress`「校验仓库」-> `GitOps::validate`；非 git 仓库 / 无 remote -> 中止。
2. emit「检查工作区」-> 不干净 -> **中止**（提示用户先 commit/stash，不自动 stash 防丢改）。
3. 分支：
   - `new` 模式 -> `create_branch(dir, base, new_branch_name)`，`new_branch_name` 由表单提供（默认建议 `test/<slug>`，slug = 提交名小写 + 非字母数字替换为 `-`、截断 40 字符；用户可改）。
   - `direct` 模式 -> `checkout(dir, base)`。
4. emit「调用 AI 写单测」-> 拼**上下文头**（项目目录/分支/本地 mvn 仓库）+ 用户 coverage prompt -> `run_claude_streaming`（流式 thinking/text）。失败/非 0 -> 中止不提交。
5. emit「运行 mvn test」-> `mvn test`（Windows `mvn.cmd test`），参数含 `-s <settings.xml>`（若配）+ `-Dmaven.repo.local=<local_repo>`（若配）。非 0 退出 -> emit「测试失败，未提交」+ 失败摘录，**不提交**，返回。
6. emit「提交」-> `git add -A` + `git commit -m <msg>` -> 得 commit_sha。
7. push：
   - `push_confirm_skip = on` -> 直接 `git push`，返回 push 结果。
   - `off` -> **停在 commit**，返回等前端确认（前端弹确认框 -> 调 `push_branch`）。

### 4.4 `commands/testgen.rs`

- `list_git_branches(dir) -> Vec<BranchInfo>` - 表单快速调用
- `validate_git_repo(dir) -> RepoInfo` - 选目录后回填状态
- `run_test_gen(req, app) -> TestGenResult` - 流式主管线
- `push_branch(dir, branch, app) -> PushResult` - push 确认后调用

**数据结构**：
```rust
struct TestGenRequest {
  dir: String,
  base_branch: String,
  branch_mode: String,        // "new" | "direct"
  new_branch_name: Option<String>,
  commit_message: String,
  prompt: String,
  push_confirm_skip: bool,
  mvn_local_repo: Option<String>,
  mvn_settings_xml: Option<String>,
  claude_command: Option<String>,  // 默认 "claude"
}
struct TestGenResult {
  branch: String,
  commit_sha: Option<String>,
  files_changed: usize,
  test_passed: bool,
  test_output_excerpt: String,
  pushed: bool,
  push_output: Option<String>,
  error: Option<String>,
}
```

### 4.5 前端

- `src/pages/TestGenPage.tsx` - 单页表单 + 流式执行弹窗。
- `src/lib/api/testgen.ts` - 4 个命令的 wrapper（用 `src/lib/api/index.ts` 的 `call`）。
- 流式弹窗：自包含 `TestGenRunModal`（复刻 `ReportGenModal` 模式：阶段日志 + 思考/输出流 + 静默最小化）。后续可抽共享组件。
- `SonarPromptPage` 结果区加「用 AI 执行」按钮 -> `navigate('/testgen', { state: { prompt } })` 预填。

## 5. 数据流

1. 入口：TestGen 模块 / SonarPrompt 结果页「用 AI 执行」按钮（带 prompt 跳转预填）。
2. 表单：
   - Prompt textarea（预填/可编辑）。
   - 「选择项目目录」-> `dialog.open({directory:true})` -> `validate_git_repo` + `list_git_branches` 回填当前分支/状态/分支下拉。
   - 分支下拉选 base 分支。
   - 分支模式 radio：新建工作分支（填 `test/<slug>` 建议名）/ 在选中分支操作。
   - 提交名输入。
   - push 确认开关（默认开 = 推送前确认）。
   - 「mvn 配置」折叠区：本地仓库目录 + settings.xml 路径（各带选择按钮），持久化到 settings。
3. 点「执行」-> `ConfirmDialog` 二次确认 -> `run_test_gen` -> 流式弹窗：校验/切分支/AI 思考/AI 输出/mvn test/提交。
4. commit 完成且 push 确认开 -> 弹「确认推送到 <branch>」-> `push_branch` -> 推送结果。
   push 确认关（skip）-> `run_test_gen` 内已推完 -> 直接显示完成。
5. 结果摘要：分支/commit sha/改动文件数/测试结果。

## 6. 错误处理

| 场景 | 处理 |
|---|---|
| 非 git 仓库 / 无 remote | validate 阶段中止，明确提示 |
| 工作区脏 | 中止，提示先 commit/stash（不自动 stash） |
| checkout/建分支失败 | 中止，返回 git stderr |
| AI 失败/超时/非 0 | 中止，**不提交**；AI 改动留分支供排查（new 模式隔离在 test 分支；direct 模式提示可 `git reset`） |
| mvn test 失败 | **不提交**，返回失败摘录，改动留分支供修 |
| commit 失败（无改动/pre-commit hook） | 中止，报告 |
| push 失败（无 upstream/认证/拒绝） | 报告 stderr，commit 留本地 |

**原则**：任何失败都不破坏用户仓库状态；改动留在工作分支可手动处理。

## 7. Maven 仓库配置

**Settings**（走现有 settings 系统，key 前缀 `testgen_`）：
- `testgen_mvn_local_repo` - 本地仓库目录路径（可选）
- `testgen_mvn_settings_xml` - settings.xml 路径（可选）

**mvn 执行参数**：配了 settings.xml -> 加 `-s <path>`；配了 local_repo -> 加 `-Dmaven.repo.local=<path>`。

**AI 上下文头**（runner 拼在 coverage prompt 前）：
```
项目目录：<dir>
当前分支：<branch>
本地 Maven 仓库：<local_repo 或 未配置>
请基于以上环境，按下方要求补写单元测试。
---
<coverage prompt>
```
让 `mvn test` 用配置仓库解析依赖（企业 Nexus 不重新下载），AI 也被告知 local_repo 路径可查找依赖。

## 8. 测试

- **Rust 单测**：纯函数 - git 输出解析、分支名 slug 生成、mvn 参数构造、权限 flags 构造。用临时 git 仓库测 `list_branches/current_branch/is_clean/create_branch`。
- **手工集成清单**：new/direct × mvn 通过/失败 × push 确认开/关，8 条主路径。
- **前端**：`tsc` 通过 + 手工走表单与流式弹窗。

## 9. 模块接入

- `commands/mod.rs`：`pub mod testgen; pub use testgen::*;`
- `lib.rs`：invoke_handler 注册 `list_git_branches`、`validate_git_repo`、`run_test_gen`、`push_branch`。
- `services/mod.rs`：`pub mod testgen;`
- `config/modules.ts`：加 testgen 模块项（icon: `FlaskConical`，`settingKey: "page_testgen_visible"`）。
- `App.tsx`：懒加载 `TestGenPage` + 路由 `/testgen` + `PageGuard`。
- i18n：4 语言加 `nav.testgen` + `page_testgen_visible` 默认 `"true"`。
- `SonarPromptPage`：结果区加「用 AI 执行」按钮。

## 10. 风险与缓解

| 风险 | 缓解 |
|---|---|
| `claude -p` 权限弹窗卡住 | 强制 `--permission-mode acceptEdits --disallowedTools Bash` |
| AI 在用户分支留垃圾改动 | 默认 new 工作分支隔离；direct 模式失败提示 `git reset` |
| 推送坏代码到远程 | push 默认需确认；mvn test 失败不提交 |
| 企业仓库依赖解析慢/失败 | 可配 settings.xml mirror + local_repo |
| `mvn`/`git` 不在 PATH | 执行失败时 stderr 明确提示，未来可加可执行路径配置 |
| 长 AI 任务 | 无超时（按报告生成同款），`kill_on_drop(true)` 取消时杀进程 |
