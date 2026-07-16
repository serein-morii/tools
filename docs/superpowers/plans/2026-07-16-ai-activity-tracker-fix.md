# AI Activity Tracker 抓取/解析/实时监控 修复方案

> 日期：2026-07-16
> 关联设计：`docs/superpowers/specs/2026-07-15-ai-activity-tracker-design.md`

## 一、问题诊断（已读码 + 查库验证）

查库 `~/.tools/tools.db` 实测：496 会话（251 个文件，~245 重复）、120603 活动；其中 CodeX 119397 条活动 role/content 100% 为空。

| # | 问题 | 根因 | 现象 |
|---|------|------|------|
| 1 | CodeX parser 完全失效 | CodeX 文件是 `{timestamp,type,payload}` 信封格式，parser 却读顶层 `role`/`content`/`timestamp` | 197 会话/119397 活动 role 与 content 全空，timestamp 回退为入库时间，duration=0 |
| 2 | Claude Code parser 有损 | 丢弃 `thinking` 块；从不提取 `tool_name`/`file_path`；纯 thinking 的 assistant 轮被整条跳过 | 违反设计 §5.4，工具调用统计丢失，assistant 文本常只剩片段 |
| 3 | 重复会话 | session id 用随机 UUID，`poll_watchers` 见 mtime 变就重解析，`session_exists(随机uuid)` 永远 false → 每次都 INSERT | 496/251，~245 重复 |
| 4 | 会话不随文件增长更新 | Claude Code 持续往同一 `<sessionId>.jsonl` 追加；解析过即冻结 | message_count/ended_at/活动永不更新 |
| 5 | 旧脏数据冻结 | 按 raw_path 去重不再重解析 | 早期空活动永久留存，用户看到“全部无法解析” |
| 6 | 实时监控未实现 | `start_hook_listener` 是 stub（只 log）；前端 Hook 按钮无 onClick；`setup_hooks`/`remove_hooks` 未实现 | 设计 §4.1 缺失 |
| 7 | 时区 bug | `get_today_stats` 等用 UTC，用户在 UTC+8 | “今天”只查到 3 条，看板像空的 |
| 8 | DB 膨胀 462MB | `metadata` 列存完整 `raw_json` | 库巨大 |
| 9 | summarizer Windows 不可用 | `Command::new("sh")` | 报告 CLI 总结失败（附带修） |

## 二、修复方案

### 阶段 1：确定性 ID + Upsert（根因，解决重复/冻结/可重建）
文件：`services/activity/collector.rs`、`database/dao/activity.rs`、`services/activity/parsers/mod.rs`

- `ParsedSession.id` 改为确定性：Claude Code 取 JSONL 的 `sessionId`；CodeX 取 `session_meta.payload.id`；兜底 = `sha1(raw_path)`。
- DAO 新增：`upsert_session`（INSERT OR REPLACE by id）、`delete_activities_by_session`、`replace_activities`（删后重插）。
- collector 统一：解析后已存在则 UPDATE 会话 + replace 活动；否则插入。`full_scan` 与 `poll_watchers` 共用，去掉错误的随机 uuid 去重。
- `poll_watchers` 按文件 mtime 去重：mtime 变化才重解析 + upsert，天然不重复且更新增长中的会话。

### 阶段 2：修 Parser
文件：`parsers/claude_code.rs`、`parsers/codex.rs`

- **claude_code**：`tool_use` → `activity_type="tool_call"` 带 `tool_name`+`file_path`（从 input.file_path/command 提取）；`tool_result` → tool 活动+file_path+行数；纯 thinking 轮次不再丢弃；session id 用 JSONL `sessionId`。
- **codex（重写）**：解析 `{type,timestamp,payload}` 信封。`session_meta`→id/cwd/model；`message`→payload.role+payload.content[]（数组也提取 text）；`function_call`→tool_call+tool_name+arguments 摘要；`function_call_output`→tool 活动；timestamp 取顶层 ISO 字符串。

### 阶段 3：实时监控（notify + Hook 全做 + 实时落库）
文件：`collector.rs`、`commands/activity_tracker.rs`、`lib.rs`、前端 `ToolSettings`、`lib/api/activity.ts`

- 引入 `notify` crate 替换 10s 轮询，文件变更即时 upsert（近实时）。
- 实现 `setup_hooks`/`remove_hooks` 命令：在 `~/.claude/settings.json` 写入/移除 hook（Windows 用 PowerShell `Invoke-RestMethod` 把 hook stdin JSON POST 到 127.0.0.1:19820/hook/activity；跨平台分支）。写入前备份原 settings.json。
- `handle_hook_request` 真正处理 payload：解析 `{tool,session_id,event,timestamp,...}`，实时 upsert 一条 `source="hook"` 活动，并触发对应会话文件即时重解析（内容完整）。
- 前端按钮接命令、显示 hook 配置状态；注册新命令到 `lib.rs`。

### 阶段 4：时区 + DB 瘦身 + 重建数据
文件：`commands/activity_tracker.rs`、`collector.rs`、前端

- 日期辅助改本地时区（chrono `Local`）：today/yesterday/this_week/this_month。
- `metadata` 不再存完整 raw_json，只存小摘要（`{"msg_count":n,"tools":[...]}`）。
- 新增 `reset_activity_data` 命令：清空 ai_sessions + ai_activities 后全量重扫；前端设置页加“重建数据”按钮（二次确认）。

### 阶段 5：附带修复 + 验证
- `summarizer.rs`：Windows 用 `cmd /C` 而非 `sh`（跨平台分支）。
- 删除 `collect_jsonl_files` 死代码。
- `cargo check` + 运行验证：会话有内容、无重复、今天看板数量正确、CodeX 活动非空、Hook 配置可写入/移除。

## 三、涉及文件
- 后端：`collector.rs`、`parsers/{mod,claude_code,codex}.rs`、`dao/activity.rs`、`commands/activity_tracker.rs`、`summarizer.rs`、`lib.rs`、`Cargo.toml`(+notify)
- 前端：`pages/ActivityTrackerPage.tsx`(ToolSettings)、`lib/api/activity.ts`
- 文档：更新设计文档实现现状

## 四、风险
- 格式可能再变 → parser 宽松解析、未知字段忽略、raw_path 兜底（前端 `loadSessionMessages` 可重读原文件）。
- Hook 写 settings.json 需备份，避免破坏用户现有配置。
- notify 在 Windows 的行为需验证（RecursiveMode + 去抖）。
- 重建数据清空历史，需二次确认。
