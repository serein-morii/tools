# AI Activity Tracker — 设计文档

> 跨平台 AI 智能体活动追踪模块，集成到 Dev Tools Tauri 应用中。
> 支持 Claude Code、CodeX、Gemini CLI、Qwen CLI 等主流 CLI AI 工具的
> 活动监听、数据记录、日报/周报/月报生成。

**版本**: v0.1 (Draft)
**日期**: 2026-07-15
**作者**: pengchenghui

---

> **实现状态更新（2026-07-16）**
>
> 首版存在抓取/解析/实时监控的严重缺陷，已修复，详见
> `docs/superpowers/plans/2026-07-16-ai-activity-tracker-fix.md`。要点：
> - **确定性会话 ID**：Claude Code 取 JSONL `sessionId`，CodeX 取 `session_meta.payload.id`，兜底 `tool:file_stem`。配合 `upsert_session` + `replace_activities`，重解析改为更新而非重复插入。
> - **CodeX parser 重写**：解析 `{timestamp,type,payload}` 信封，识别 `user_message`/`agent_message`/`message`/`function_call`/`function_call_output`/`reasoning`；跳过注入的 developer/system prompt 与 `message` API 回声。
> - **Claude Code parser 增强**：`tool_use` 提取为 `tool_call`（带 `tool_name`+`file_path`），保留 `thinking` 轮次，session id 用 `sessionId`。
> - **实时监控**：`notify` 文件监听（近实时 upsert）+ HTTP Hook 监听 `127.0.0.1:19820`（实时落库）+ `setup_hooks`/`remove_hooks` 命令写入 `~/.claude/settings.json`。
> - **时区**：日期范围改用本地时区（`Local`），不再漏掉 UTC+8 当天会话。
> - **DB 瘦身**：`metadata` 只存小摘要（不再存完整 raw_json）。
> - **重建数据**：`reset_activity_data` 命令 + 前端按钮，清空后用修复后的 parser 全量重扫（含 VACUUM 回收空间）。
> - **附带**：`summarizer` Windows 改用直接 argv 调用（不再依赖 `sh`）。

---

## 1. 概述

### 1.1 背景

开发者日常使用多个 AI CLI 工具（Claude Code、CodeX 等）辅助编程，但各工具数据分散存储，无法统一回顾和分析。本模块提供统一的 AI 活动追踪能力，让开发者了解自己每天通过 AI 工具完成了什么工作，并能自动生成日报、周报、月报。

### 1.2 核心能力

| 能力 | 说明 |
|------|------|
| **混合数据采集** | Hook 实时推送 + 文件监控兜底 + 手动同步补充 |
| **多工具支持** | Claude Code、CodeX、Gemini CLI、Qwen CLI 等，可扩展 |
| **全面报告** | 日报/周报/月报，含对话统计、工具分布、文件变更、项目汇总 |
| **AI 辅助总结** | 支持 CLI 调用、API 调用、手动复制 Prompt 三种方式 |
| **后台常驻** | 独立采集线程，托盘最小化不影响数据采集 |

### 1.3 技术决策

- **方案**: Tauri 模块集成 + 独立采集线程（方案 A+）
- **数据库**: 复用现有 SQLite，新增 4 张表
- **调度器**: 复用现有 tokio cron 调度
- **国际化**: 追加 key 到现有 4 语言文件

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    Tauri 应用进程                         │
│                                                         │
│  ┌──────────────────────┐  ┌──────────────────────────┐ │
│  │   React 前端 (WebView) │  │    Rust 后端              │ │
│  │                      │  │                          │ │
│  │  ActivityTrackerPage │  │  commands/activity.rs    │ │
│  │  ├─ Dashboard        │◄─┤     ▲                    │ │
│  │  ├─ SessionList      │  │     │                    │ │
│  │  ├─ ReportViewer     │  │  services/activity/      │ │
│  │  └─ ToolSettings     │  │  ├─ collector.rs ──┐    │ │
│  │                      │  │  │  (独立 task)    │    │ │
│  └──────────────────────┘  │  ├─ parsers/*.rs   │    │ │
│                            │  ├─ summarizer.rs  │    │ │
│                            │  ├─ reporter.rs    │    │ │
│                            │  └─ mod.rs         │    │ │
│                            │       │            │    │ │
│                            │  database/dao/     │    │ │
│                            │  activity.rs       │    │ │
│                            └───────┼────────────┘    │ │
│                                    │                 │ │
│                              ┌─────▼──────┐          │ │
│                              │   SQLite    │          │ │
│                              └────────────┘          │ │
└─────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
AI Tool Hook ──→ HTTP :19820 ──┐
                               ├──→ EventBus (channel) ──→ ParserRouter
File Watcher ──→ notify crate ─┘         │
                                         ▼
Manual Sync ──→ scan all dirs ──→  tool_id → Parser → ParsedSession
                                                         │
                                                         ▼
                                                  SessionStore (SQLite)
                                                         │
                                                         ▼
                                                  Reporter / Summarizer
```

### 2.3 关键组件职责

| 组件 | 文件 | 职责 |
|------|------|------|
| `ActivityCollector` | `collector.rs` | 管理 HTTP hook listener + file watchers，事件统一转发 |
| `ParserRouter` | `parsers/mod.rs` | 根据 tool_id 路由到对应 Parser |
| `ClaudeCodeParser` | `parsers/claude_code.rs` | 解析 Claude Code JSONL 会话文件 |
| `CodexParser` | `parsers/codex.rs` | 解析 CodeX 会话文件 |
| `GenericParser` | `parsers/generic.rs` | 通用解析器，启发式匹配 JSON 格式 |
| `Reporter` | `reporter.rs` | 数据聚合 + 报告生成 |
| `Summarizer` | `summarizer.rs` | AI 总结调用（CLI/API/手动） |

---

## 3. 数据模型

### 3.1 表结构

```sql
-- AI 工具注册表
CREATE TABLE IF NOT EXISTS ai_tools (
    id              TEXT PRIMARY KEY,          -- 'claude-code', 'codex', 'gemini-cli'
    name            TEXT NOT NULL,              -- 'Claude Code'
    enabled         INTEGER NOT NULL DEFAULT 1,
    watch_paths     TEXT NOT NULL DEFAULT '[]', -- 监控目录 JSON 数组
    parser_type     TEXT NOT NULL,             -- parser 类型标识
    config          TEXT DEFAULT '{}',         -- 工具特定配置
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

-- 会话表
CREATE TABLE IF NOT EXISTS ai_sessions (
    id              TEXT PRIMARY KEY,          -- UUID
    tool_id         TEXT NOT NULL,             -- FK ai_tools.id
    project_name    TEXT,                      -- 项目名（从路径推断）
    project_path    TEXT,                      -- 项目绝对路径
    title           TEXT,                      -- 会话标题（首条消息摘要）
    message_count   INTEGER DEFAULT 0,         -- 对话轮次
    duration_secs   INTEGER DEFAULT 0,         -- 会话时长（秒）
    started_at      BIGINT NOT NULL,           -- 开始时间戳 ms
    ended_at        BIGINT,                    -- 结束时间戳 ms
    source          TEXT NOT NULL DEFAULT 'watch', -- 'hook' | 'watch' | 'manual'
    raw_path        TEXT,                      -- 原始数据文件路径
    summary         TEXT,                      -- AI 生成的摘要
    tags            TEXT DEFAULT '[]',         -- 标签 JSON
    metadata        TEXT DEFAULT '{}',         -- 扩展元数据
    created_at      BIGINT NOT NULL,
    FOREIGN KEY (tool_id) REFERENCES ai_tools(id)
);

-- 活动明细表
CREATE TABLE IF NOT EXISTS ai_activities (
    id              TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL,             -- FK ai_sessions.id
    activity_type   TEXT NOT NULL,             -- 'message' | 'tool_call' | 'file_change' | 'code_gen'
    role            TEXT,                      -- 'user' | 'assistant' | 'tool'
    content_preview TEXT,                      -- 内容预览（截断到 500 字）
    tool_name       TEXT,                      -- 调用的工具名
    file_path       TEXT,                      -- 涉及的文件路径
    lines_added     INTEGER,
    lines_removed   INTEGER,
    timestamp       BIGINT NOT NULL,
    metadata        TEXT DEFAULT '{}',
    FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE
);

-- 报告表
CREATE TABLE IF NOT EXISTS ai_reports (
    id              TEXT PRIMARY KEY,
    report_type     TEXT NOT NULL,             -- 'daily' | 'weekly' | 'monthly'
    title           TEXT NOT NULL,
    range_start     BIGINT NOT NULL,
    range_end       BIGINT NOT NULL,
    content         TEXT,                      -- 报告正文（Markdown）
    stats           TEXT DEFAULT '{}',         -- 统计数据 JSON
    session_ids     TEXT DEFAULT '[]',         -- 关联会话 ID 列表
    summary_method  TEXT,                      -- 'cli' | 'api' | 'manual'
    summary_tool    TEXT,                      -- 用的哪个工具总结
    generated_at    BIGINT,
    created_at      BIGINT NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_sessions_tool ON ai_sessions(tool_id);
CREATE INDEX IF NOT EXISTS idx_sessions_time ON ai_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON ai_sessions(project_name);
CREATE INDEX IF NOT EXISTS idx_activities_session ON ai_activities(session_id);
CREATE INDEX IF NOT EXISTS idx_activities_type ON ai_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_reports_type_time ON ai_reports(report_type, range_start);
```

### 3.2 预置数据

```sql
INSERT OR IGNORE INTO ai_tools (id, name, parser_type, watch_paths, config)
VALUES
  ('claude-code',  'Claude Code',  'claude_code',  '["~/.claude/projects/"]', '{"has_hooks": true}'),
  ('codex',        'CodeX',        'codex',         '["~/.codex/sessions/"]',  '{"has_hooks": false}'),
  ('gemini-cli',   'Gemini CLI',   'generic_json',  '["~/.gemini/"]',          '{"has_hooks": false}'),
  ('qwen-cli',     'Qwen CLI',     'generic_json',  '["~/.qwen/"]',            '{"has_hooks": false}');
```

---

## 4. 数据采集设计

### 4.1 Hook 监听

- Collector 启动本地 HTTP server，监听 `127.0.0.1:19820`
- 端点: `POST /hook/activity`，接收 JSON payload: `{ tool, session_id, event, timestamp }`
- 应用帮助用户自动写入 hook 配置到对应工具（如 Claude Code 的 `~/.claude/settings.json`）

### 4.2 文件监控

- 使用 Rust `notify` crate 监控每个工具的 `watch_paths`
- 防抖策略: 5 秒内同一文件多次变更只触发一次解析
- 幂等策略: `文件路径 + mtime` 作为唯一标识，避免重复解析
- 全量扫描: 应用启动时执行一次，之后每 30 分钟兜底扫描一次

### 4.3 手动同步

- 前端「立即同步」按钮 → Tauri command `sync_now`
- 全量对比所有工具的 watch_paths → 补录数据库中缺失的会话

### 4.4 启动流程

```
app.setup()
  ├── 加载 ai_tools 表
  ├── 对每个 enabled=true 的工具:
  │   ├── 启动 file watcher
  │   └── 执行首次全量扫描
  ├── 启动 Hook HTTP listener
  └── 注册定时任务:
      ├── 日报草稿: 每日 18:00
      ├── 周报草稿: 每周五 18:00
      └── 月报草稿: 每月最后一天 18:00
```

---

## 5. Parser 设计

### 5.1 Trait 定义

```rust
#[async_trait]
pub trait ActivityParser: Send + Sync {
    fn tool_id(&self) -> &str;
    async fn parse_session(&self, path: &Path) -> Result<ParsedSession>;
    async fn parse_hook_event(&self, payload: &HookPayload) -> Result<Option<SessionEvent>>;
    fn is_session_file(&self, path: &Path) -> bool;
    fn supports_hooks(&self) -> bool;
    fn watch_dirs(&self, home: &Path) -> Vec<PathBuf>;
}
```

### 5.2 标准化输出

```rust
pub struct ParsedSession {
    pub title: String,
    pub project_name: Option<String>,
    pub project_path: Option<String>,
    pub message_count: u32,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub activities: Vec<ParsedActivity>,
    pub raw_json: serde_json::Value,
}

pub struct ParsedActivity {
    pub activity_type: ActivityType, // Message | ToolCall | FileChange
    pub role: Option<String>,
    pub content_preview: String,
    pub tool_name: Option<String>,
    pub file_path: Option<String>,
    pub lines_added: Option<u32>,
    pub lines_removed: Option<u32>,
    pub timestamp: i64,
}
```

### 5.3 各工具 Parser 要点

| 工具 | 数据格式 | 关键字段 |
|------|---------|---------|
| Claude Code | `~/.claude/projects/<project>/<session>.jsonl` | 每行 JSON: `role`, `type`, `content`, `tool_use` |
| CodeX | `~/.codex/sessions/<id>.json` | OpenAI 格式消息流 |
| Gemini CLI | `~/.gemini/history/*.json` | 兼容常见 messages 结构 |
| Qwen CLI | `~/.qwen/*.json` | 兼容常见 conversations 结构 |

### 5.4 Claude Code JSONL 解析细节

需处理的 JSONL 事件类型:
- `role: "user"` → 提取 `content[0].text`，设置 session title
- `type: "assistant"` → 提取回复内容，统计 message_count++
- `tool_use` 块 → 记录 tool_name + input 摘要
- `tool_result` → 提取文件路径和变更信息
- `file_write` / `file_edit` / `bash` → 关联文件路径

---

## 6. 报告生成

### 6.1 生成流程

```
查询时间范围内会话数据 → 预聚合统计 → 构建 Prompt → 调用 AI 总结 → 存储报告
```

### 6.2 预聚合统计维度

- 总会话数、总对话轮次、总时长
- 各 AI 工具使用时长/次数分布
- 最活跃的项目 Top 5
- 文件变更 Top 10（按行数）
- 工具调用 Top 10（Read/Edit/Bash 等）
- 活跃时段分布（按小时热力）

### 6.3 报告 Prompt 模板

```
你是一个专业的工作总结助手。请根据以下数据生成{report_type}。

## 时间范围
{date_range}

## 整体数据
- AI 工具使用总时长：{total_duration}
- 总会话数：{total_sessions}
- 总对话轮次：{total_messages}
- 工具调用次数：{total_tool_calls}

## 各工具使用分布
{tool_distribution}

## 主要工作内容
{session_summaries}

## 文件变更统计
{file_changes}

## 要求
1. 生成一份结构化的{report_type}
2. 突出关键产出
3. 标注 AI 辅助完成的工作
4. 指出可优化的重复性工作
5. 输出格式为 Markdown
6. 语言：{language}
```

---

## 7. AI 总结设计

### 7.1 三种模式

| 模式 | 实现方式 | 适用场景 |
|------|---------|---------|
| CLI 调用 | 子进程执行 `claude -p "<prompt>"`，120 秒超时 | 本地已装 Claude Code |
| API 调用 | HTTP 调用 Anthropic/OpenAI API，需要 API Key | 无本地 CLI 或需更高精度 |
| 手动复制 | 生成完整 prompt，用户自行粘贴到 AI 工具 | 作为兜底/预览 |

### 7.2 CLI 调用实现

```rust
async fn summarize_via_cli(command: &str, prompt: &str) -> Result<String> {
    let output = tokio::process::Command::new("sh")
        .arg("-c")
        .arg(format!("{} {}", command, shell_escape(prompt)))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .timeout(Duration::from_secs(120))
        .await?;
    // 超时降级为手动模式
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
```

### 7.3 API 调用实现

支持 Anthropic Messages API 和 OpenAI Chat Completions API 两种格式，用 reqwest 发送。

### 7.4 降级策略

```
CLI 调用 → 超时/失败 → API 调用 → 超时/失败 → 手动模式（返回 prompt）
```

---

## 8. 前端设计

### 8.1 路由

| 路由 | 页面 |
|------|------|
| `/activity-tracker` | 主页面，Tab 切换 4 个子视图 |

### 8.2 页面结构

```
ActivityTrackerPage
├── 顶部栏: 时间范围选择器 + 工具过滤 + 刷新/导出按钮
└── Tabs:
    ├── 📊 概览面板 (Dashboard)
    │   ├── 4 个统计卡片（今日会话、总轮次、总时长、活跃工具数）
    │   ├── 工具使用分布图
    │   ├── 今日活动时间线
    │   └── 最近会话列表
    │
    ├── 💬 会话历史 (SessionList)
    │   ├── 搜索 + 多条件过滤
    │   ├── 会话列表（可排序、展开）
    │   └── 会话详情弹窗（活动明细 + 统计）
    │
    ├── 📝 报告中心 (ReportViewer)
    │   ├── 报告列表（按时间/类型排序）
    │   ├── 手动生成按钮 + 报告预览（Markdown 渲染）
    │   └── 导出按钮（Markdown 文件）
    │
    └── ⚙️ 工具管理 (ToolSettings)
        ├── AI 工具列表（启用/禁用、路径配置）
        ├── Hook 配置管理（一键写入/移除）
        ├── 总结方式设置（CLI/API/手动）
        └── API Key 管理
```

### 8.3 关键组件

**统计卡片:**
```
┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│ 今日会话    │ │ 总对话轮次  │ │ AI 使用时长 │ │ 活跃工具    │
│   12       │ │   347      │ │  3h 42m   │ │    3       │
└────────────┘ └────────────┘ └────────────┘ └────────────┘
```

**活动时间线:**
```
09:15 [Claude Code] 项目 temp_tools — 开始会话 "优化数据库查询"
10:30 [Claude Code] 调用工具: Read x24, Edit x12, Bash x8
12:00 [CodeX] 项目 java-service — 开始会话 "Review 接口设计"
18:00 📝 日报已自动生成
```

---

## 9. 模块集成

### 9.1 config/modules.ts 新增

```typescript
{
  id: "activity-tracker",
  path: "/activity-tracker",
  labelKey: "nav.activityTracker",
  label: "AI 活动",
  icon: Activity,   // lucide-react
  description: "AI 工具活动追踪与报告",
  settingKey: "page_activity_tracker_visible",
}
```

### 9.2 Tauri Commands

```rust
// lib.rs invoke_handler 新增
commands::get_ai_tools,
commands::update_ai_tool,
commands::get_sessions,
commands::get_session_detail,
commands::get_activities,
commands::sync_now,
commands::generate_report,
commands::get_reports,
commands::delete_report,
commands::summarize_session,
commands::setup_hooks,
commands::remove_hooks,
commands::get_collector_status,
```

### 9.3 Settings 追加

```
page_activity_tracker_visible   → 侧边栏显隐
ai_summary_method               → "cli" | "api" | "manual"
ai_summary_tool                 → "claude-code" | "codex"
ai_summary_provider             → "anthropic" | "openai"
ai_summary_api_key              → RSA 加密存储
ai_summary_model                → 模型名
ai_report_auto_generate         → "true" | "false"
ai_report_daily_cron            → "0 18 * * *"
ai_report_weekly_cron           → "0 18 * * 5"
ai_report_monthly_cron          → "0 18 L * *"
```

### 9.4 i18n

在 `zh.json` / `en.json` / `ja.json` / `ko.json` 中新增 `activityTracker` 命名空间（约 40-50 个 key）。

---

## 10. 文件清单

### 新增文件

**Rust 后端:**
```
src-tauri/src/
├── commands/activity_tracker.rs           # Tauri commands
├── services/activity/
│   ├── mod.rs                             # 模块入口
│   ├── collector.rs                       # 采集器（HTTP + file watcher）
│   ├── parsers/
│   │   ├── mod.rs                         # ActivityParser trait
│   │   ├── claude_code.rs                 # Claude Code JSONL parser
│   │   ├── codex.rs                       # CodeX parser
│   │   └── generic.rs                     # 通用 parser
│   ├── summarizer.rs                      # AI 总结（CLI/API/手动）
│   └── reporter.rs                        # 报告生成
└── database/
    └── dao/activity.rs                    # 数据访问层
```

**React 前端:**
```
src/
├── pages/ActivityTrackerPage.tsx          # 主页面
├── components/modules/activity/
│   ├── Dashboard.tsx                      # 概览面板
│   ├── SessionList.tsx                    # 会话列表
│   ├── SessionDetail.tsx                  # 会话详情弹窗
│   ├── ReportViewer.tsx                   # 报告查看器
│   └── ToolSettings.tsx                   # 工具设置
└── lib/api/activity.ts                    # API 调用层
```

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src-tauri/src/lib.rs` | 注册 commands + 启动采集器 + 托盘菜单 |
| `src-tauri/src/commands/mod.rs` | 添加 `pub mod activity_tracker` |
| `src-tauri/src/database/schema.rs` | 新增 4 张表 + 预置数据 |
| `src-tauri/src/database/dao/mod.rs` | 添加 `pub mod activity` |
| `src/config/modules.ts` | 新增 activity-tracker 模块配置 |
| `src/App.tsx` | 注册新路由 |
| `src/i18n/locales/{zh,en,ja,ko}.json` | 新增 translation keys |

---

## 11. 实现阶段

| 阶段 | 内容 | 预估工时 |
|------|------|---------|
| 阶段 1: 数据层 + 采集器 | Schema、DAO、Parser trait + 具体实现、Collector | 3-5 天 |
| 阶段 2: 报告 + 总结 | Reporter、Summarizer、Tauri commands | 2-3 天 |
| 阶段 3: 前端 | API 层、4 个页面组件 | 3-4 天 |
| 阶段 4: 集成 + i18n | 路由注册、托盘菜单、4 语言翻译、测试 | 1-2 天 |
| **总计** | | **9-14 天** |

---

## 12. 风险与注意事项

| 风险 | 缓解措施 |
|------|---------|
| Claude Code JSONL 格式变更 | Parser 做宽松解析，未知字段忽略不报错；保留 raw_json 兜底 |
| 文件监控漏事件 | 每 30 分钟全量扫描兜底 |
| CLI 总结超时 | 120 秒超时 → 自动降级 API → 再降级手动模式 |
| API Key 安全 | 复用在 Walkin 模块中已有的 RSA 加密存储 |
| 大项目数据量过大 | 活动明细 content_preview 截断到 500 字；提供按时间清理能力 |
| 多个 AI 工具同时写入 | 所有写入走 SQLite WAL 模式（已启用），tokio channel 串行化写操作 |
