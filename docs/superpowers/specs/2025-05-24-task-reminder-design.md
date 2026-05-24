# Tools 工具箱 - 任务提醒功能设计文档

## 1. 项目概述

### 1.1 项目定位

**Tools** 是一个本地优先的桌面工具箱应用，采用**可扩展的模块化架构**。首期核心功能为**任务提醒**，后续可扩展计时器、笔记等其他工具模块。

设计理念参考 [CC-Switch](https://github.com/farion1231/cc-switch) 的架构模式，采用 Tauri v2 + React 19 技术栈。

### 1.2 核心价值

- **工具箱定位**：侧边栏导航 + 模块化设计，支持后续扩展
- **本地优先**：所有数据存储在本地 SQLite，可选 WebDAV 云同步
- **高度灵活**：支持极其丰富的提醒时间配置
- **多渠道推送**：支持 Bark、飞书、企业微信、钉钉等多种通知渠道
- **模板化**：消息模板、渠道模板、预设模板三层抽象
- **状态追踪**：支持简单通知、确认提醒、反馈提醒三种模式

### 1.3 工具模块规划

| 模块 | 图标 | 说明 | 优先级 |
|-----|------|------|-------|
| 任务提醒 | 🔔 | 定时任务与提醒 | P0 (首期) |
| 计时器 | ⏱️ | 番茄钟/倒计时/秒表 | P1 |
| 笔记 | 📝 | 快速笔记/剪贴板历史 | P2 |
| 待扩展 | ... | ... | ... |
| 设置 | ⚙️ | 应用配置 | 必需 |

---

## 2. 技术架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (React 19 + TypeScript)              │
├─────────────────────────────────────────────────────────────────┤
│  页面层                                                          │
│  ├── Sidebar (侧边栏 - 一级导航)                                 │
│  │   └── 模块入口：提醒/计时器/笔记/设置                         │
│  ├── reminder/ (任务提醒模块)                                    │
│  │   ├── TaskListPage                                           │
│  │   ├── TemplatePage                                           │
│  │   ├── ChannelPage                                            │
│  │   └── HistoryPage                                            │
│  ├── timer/ (计时器模块 - 预留)                                  │
│  ├── notes/ (笔记模块 - 预留)                                    │
│  └── settings/ (设置页)                                          │
├─────────────────────────────────────────────────────────────────┤
│  组件层                                                          │
│  ├── TaskCard / TaskEditor / CronEditor                         │
│  ├── ChannelConfig / TemplateEditor                             │
│  └── ConfirmDialog / Toast / Modal                              │
├─────────────────────────────────────────────────────────────────┤
│  状态管理层                                                      │
│  ├── @tanstack/react-query (数据缓存)                           │
│  ├── Zustand (UI 状态)                                          │
│  └── localStorage (用户偏好)                                    │
├─────────────────────────────────────────────────────────────────┤
│  API 层 (src/lib/api/*)                                         │
│  └── 统一 call<T>(cmd, args) 封装 Tauri invoke                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ Tauri IPC
┌───────────────────────────▼─────────────────────────────────────┐
│                     后端 (Rust + Tauri v2)                       │
├─────────────────────────────────────────────────────────────────┤
│  Commands 层 (src-tauri/src/commands/*)                         │
│  ├── task_commands.rs    - 任务 CRUD                            │
│  ├── template_commands.rs - 模板 CRUD                           │
│  ├── channel_commands.rs - 渠道配置                             │
│  ├── reminder_commands.rs - 提醒调度                            │
│  └── settings_commands.rs - 应用设置                            │
├─────────────────────────────────────────────────────────────────┤
│  Services 层 (src-tauri/src/services/*)                         │
│  ├── scheduler/          - 调度引擎 (核心)                      │
│  │   ├── cron_parser.rs  - Cron 表达式解析                      │
│  │   ├── scheduler.rs    - 调度器主逻辑                         │
│  │   └── next_run.rs     - 下次执行时间计算                     │
│  ├── notifier/           - 通知发送器                           │
│  │   ├── mod.rs          - 统一接口                             │
│  │   ├── bark.rs         - Bark 推送                            │
│  │   ├── feishu.rs       - 飞书机器人                           │
│  │   ├── wecom.rs        - 企业微信机器人                       │
│  │   └── dingtalk.rs     - 钉钉机器人                           │
│  └── history/            - 提醒历史记录                         │
├─────────────────────────────────────────────────────────────────┤
│  数据层 (src-tauri/src/database/*)                              │
│  ├── schema.rs           - 表结构定义                           │
│  ├── dao/                - 数据访问对象                         │
│  │   ├── tasks.rs                                              │
│  │   ├── templates.rs                                          │
│  │   ├── channels.rs                                           │
│  │   ├── reminders.rs                                          │
│  │   └── settings.rs                                           │
│  └── migration.rs        - 迁移逻辑                             │
└─────────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                     存储层                                       │
├─────────────────────────────────────────────────────────────────┤
│  SQLite (~/.tools/tools.db)                                     │
│  ├── tasks              - 任务定义                              │
│  ├── templates          - 模板定义                              │
│  ├── channels           - 渠道配置                              │
│  ├── reminders          - 提醒实例记录                          │
│  ├── reminder_history   - 提醒历史                              │
│  └── settings           - 应用设置                              │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 目录结构

```
tools/
├── src/                          # 前端源码
│   ├── App.tsx                   # 主应用入口
│   ├── main.tsx                  # React 挂载点
│   ├── index.css                 # 全局样式
│   ├── components/               # 组件
│   │   ├── ui/                   # 基础 UI 组件 (Radix + Tailwind)
│   │   ├── layout/               # 布局组件
│   │   │   ├── Sidebar.tsx       # 侧边栏 (一级导航)
│   │   │   ├── MainContent.tsx   # 主内容区
│   │   │   └── TabBar.tsx        # 二级 Tab 导航
│   │   ├── common/               # 通用组件
│   │   │   ├── ConfirmDialog.tsx
│   │   │   ├── Toast.tsx
│   │   │   └── Modal.tsx
│   │   └── modules/              # 模块组件
│   │       ├── reminder/         # 任务提醒模块
│   │       │   ├── TaskCard.tsx
│   │       │   ├── TaskEditor.tsx
│   │       │   ├── CronEditor.tsx
│   │       │   ├── TemplateEditor.tsx
│   │       │   └── ChannelConfig.tsx
│   │       ├── timer/            # 计时器模块 (预留)
│   │       └── notes/            # 笔记模块 (预留)
│   ├── pages/                    # 页面
│   │   ├── reminder/             # 任务提醒页面
│   │   │   ├── TaskListPage.tsx
│   │   │   ├── TemplatePage.tsx
│   │   │   ├── ChannelPage.tsx
│   │   │   └── HistoryPage.tsx
│   │   ├── timer/                # 计时器页面 (预留)
│   │   ├── notes/                # 笔记页面 (预留)
│   │   └── settings/             # 设置页面
│   │       └── SettingsPage.tsx
│   ├── hooks/                    # 自定义 Hooks
│   ├── lib/                      # 工具库
│   │   ├── api/                  # API 封装
│   │   │   ├── index.ts
│   │   │   ├── reminder/         # 提醒模块 API
│   │   │   │   ├── task.ts
│   │   │   │   ├── template.ts
│   │   │   │   ├── channel.ts
│   │   │   │   └── reminder.ts
│   │   │   └── settings.ts
│   │   ├── query/                # React Query 配置
│   │   ├── utils.ts              # 工具函数
│   │   └── platform.ts           # 平台检测
│   ├── types/                    # TypeScript 类型
│   │   ├── reminder.ts           # 提醒模块类型
│   │   └── settings.ts           # 设置类型
│   ├── contexts/                 # React Context
│   │   └── ModuleContext.tsx     # 当前模块上下文
│   └── config/                   # 配置文件
│       ├── modules.ts            # 模块注册配置
│       └── constants.ts          # 常量定义
│   ├── main.tsx                  # React 挂载点
│   ├── index.css                 # 全局样式
│   ├── components/               # 组件
│   │   ├── ui/                   # 基础 UI 组件 (Radix + Tailwind)
│   │   ├── tasks/                # 任务相关组件
│   │   ├── templates/            # 模板相关组件
│   │   ├── channels/             # 渠道配置组件
│   │   ├── settings/             # 设置页组件
│   │   └── common/               # 通用组件
│   ├── hooks/                    # 自定义 Hooks
│   ├── lib/                      # 工具库
│   │   ├── api/                  # API 封装
│   │   ├── query/                # React Query 配置
│   │   ├── utils.ts              # 工具函数
│   │   └── platform.ts           # 平台检测
│   ├── types/                    # TypeScript 类型
│   ├── contexts/                 # React Context
│   └── config/                   # 配置文件
├── src-tauri/                    # 后端源码
│   ├── src/
│   │   ├── lib.rs                # Tauri 入口
│   │   ├── main.rs               # 主程序
│   │   ├── error.rs              # 错误定义
│   │   ├── config.rs             # 配置管理
│   │   ├── commands/             # Tauri Commands
│   │   │   ├── mod.rs
│   │   │   ├── task.rs
│   │   │   ├── template.rs
│   │   │   ├── channel.rs
│   │   │   ├── reminder.rs
│   │   │   └── settings.rs
│   │   ├── services/             # 业务服务
│   │   │   ├── mod.rs
│   │   │   ├── scheduler/
│   │   │   ├── notifier/
│   │   │   └── history/
│   │   └── database/             # 数据库
│   │       ├── mod.rs
│   │       ├── schema.rs
│   │       ├── migration.rs
│   │       └── dao/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── icons/
├── package.json
├── vite.config.ts
├── tailwind.config.cjs
└── tsconfig.json
```

---

## 3. 数据模型设计

### 3.1 核心实体关系图

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│    Task      │ 1───n │   Reminder   │ 1───n │   History    │
│   (任务)     │       │  (提醒实例)   │       │  (历史记录)  │
└──────┬───────┘       └──────────────┘       └──────────────┘
       │
       │ n───1
       ▼
┌──────────────┐       ┌──────────────┐
│   Template   │ 1───n │   Channel    │
│   (模板)     │       │   (渠道)     │
└──────────────┘       └──────────────┘
```

### 3.2 数据库表结构

#### 3.2.1 tasks 表 - 任务定义

```sql
CREATE TABLE tasks (
    id              TEXT PRIMARY KEY,          -- UUID
    name            TEXT NOT NULL,             -- 任务名称
    description     TEXT,                      -- 任务描述
    reminder_type   TEXT NOT NULL DEFAULT 'simple', -- simple/confirm/feedback
    -- simple: 简单通知
    -- confirm: 需要确认
    -- feedback: 需要反馈

    -- Cron 配置 (核心)
    cron_expr       TEXT NOT NULL,             -- 标准 Cron 表达式
    cron_config     TEXT NOT NULL DEFAULT '{}', -- JSON: 扩展配置

    -- 状态
    enabled         BOOLEAN NOT NULL DEFAULT 1,
    status          TEXT DEFAULT 'active',     -- active/paused/completed
    last_run_at     INTEGER,                   -- 上次执行时间戳 (ms)
    next_run_at     INTEGER,                   -- 下次执行时间戳 (ms)

    -- 关联
    template_id     TEXT,                      -- 关联模板
    channel_ids     TEXT NOT NULL DEFAULT '[]',-- JSON: 关联渠道ID列表

    -- 元数据
    tags            TEXT DEFAULT '[]',         -- JSON: 标签列表
    priority        INTEGER DEFAULT 0,         -- 优先级 0-3
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,

    FOREIGN KEY (template_id) REFERENCES templates(id)
);
```

**cron_config 扩展配置结构**：

```typescript
interface CronConfig {
  // 基础类型
  type: 'standard' | 'advanced' | 'special';

  // 标准类型配置
  standard?: {
    mode: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'interval';
    // daily: 每天
    // weekly: 每周
    // monthly: 每月
    // yearly: 每年
    // interval: 间隔重复

    time: string;              // HH:mm 格式
    daysOfWeek?: number[];     // 0-6, 0=周日
    daysOfMonth?: number[];    // 1-31
    months?: number[];         // 1-12
    intervalDays?: number;     // 间隔天数
    intervalUnit?: 'day' | 'week' | 'month';
    intervalValue?: number;
  };

  // 高级类型：第N个星期X
  advanced?: {
    mode: 'nth_weekday' | 'last_weekday' | 'offset';
    // nth_weekday: 第N个星期X
    // last_weekday: 最后一个星期X
    // offset: 偏移提醒

    nthWeek?: number;          // 第几周 1-5
    weekday?: number;          // 星期几 0-6
    month?: number;            // 月份 1-12 (用于年度)

    // 偏移配置
    offsetDays?: number;       // 提前/延后天数
    offsetHours?: number;      // 提前/延后小时
    baseDate?: string;         // 基准日期 (YYYY-MM-DD)
  };

  // 特殊日期
  special?: {
    type: 'lunar' | 'solar_term' | 'holiday';
    // lunar: 农历日期
    // solar_term: 节气
    // holiday: 节假日

    lunarMonth?: number;
    lunarDay?: number;
    solarTerm?: string;        // 节气名称
    holiday?: string;          // 节假日名称
  };

  // 多时间点
  multipleTimes?: string[];    // 多个时间点 ['09:00', '18:00']

  // 结束条件
  endDate?: string;            // 结束日期 YYYY-MM-DD
  endAfterCount?: number;      // 执行N次后结束
}
```

#### 3.2.2 templates 表 - 模板定义

```sql
CREATE TABLE templates (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,             -- 模板名称
    description     TEXT,
    category        TEXT DEFAULT 'custom',     -- system/custom/preset

    -- 消息模板
    title_template  TEXT NOT NULL,             -- 标题模板
    body_template   TEXT NOT NULL,             -- 正文模板
    -- 支持变量: {task_name}, {date}, {time}, {weekday}, {count}, {custom_*}

    -- 默认值
    default_cron    TEXT,                      -- 默认 Cron 表达式
    default_channels TEXT DEFAULT '[]',        -- 默认渠道

    -- 元数据
    icon            TEXT,                      -- 图标名称
    color           TEXT,                      -- 颜色 Hex
    tags            TEXT DEFAULT '[]',
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);
```

**内置预设模板**：

| 模板名称 | 标题模板 | 正文模板 | 默认 Cron |
|---------|---------|---------|----------|
| 会议提醒 | 会议提醒 | {task_name}\n时间: {date} {time}\n请准时参加 | - |
| 还款提醒 | 还款日提醒 | {task_name}\n还款日: {date}\n请提前准备 | 每月固定日期 |
| 周报提醒 | 周报提交提醒 | 本周周报请于今天 {time} 前提交 | 每周五 |
| 生日提醒 | 生日提醒 | {task_name} 的生日\n日期: {date} | 年度固定日期 |
| 药物提醒 | 服药提醒 | 请按时服药: {task_name} | 每日多时间 |

#### 3.2.3 channels 表 - 渠道配置

```sql
CREATE TABLE channels (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,             -- 渠道名称
    type            TEXT NOT NULL,             -- bark/feishu/wecom/dingtalk
    enabled         BOOLEAN NOT NULL DEFAULT 1,

    -- 渠道配置 (JSON)
    config          TEXT NOT NULL DEFAULT '{}',

    -- 测试状态
    last_test_at    INTEGER,
    last_test_result TEXT,

    -- 元数据
    description     TEXT,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);
```

**各渠道配置结构**：

```typescript
// Bark 配置
interface BarkConfig {
  serverUrl: string;           // 自建服务器地址 (可选)
  key: string;                 // Bark Key
  sound?: string;              // 通知铃声
  group?: string;              // 分组名称
  icon?: string;               // 自定义图标 URL
  level?: 'active' | 'timeSensitive' | 'passive';
  call?: boolean;              // 持续响铃
  url?: string;                // 点击跳转 URL
}

// 飞书机器人配置
interface FeishuConfig {
  webhook: string;             // Webhook URL
  secret?: string;             // 签名密钥
  msgType: 'text' | 'post' | 'interactive';
}

// 企业微信机器人配置
interface WecomConfig {
  webhook: string;
  msgType: 'text' | 'markdown';
  mentionedList?: string[];    // @人员列表
  mentionedMobileList?: string[];
}

// 钉钉机器人配置
interface DingtalkConfig {
  webhook: string;
  secret?: string;
  msgType: 'text' | 'markdown' | 'link';
  atMobiles?: string[];
  atUserIds?: string[];
  isAtAll?: boolean;
}
```

#### 3.2.4 reminders 表 - 提醒实例

```sql
CREATE TABLE reminders (
    id              TEXT PRIMARY KEY,
    task_id         TEXT NOT NULL,
    scheduled_at    INTEGER NOT NULL,          -- 计划执行时间
    executed_at     INTEGER,                   -- 实际执行时间

    -- 状态
    status          TEXT NOT NULL DEFAULT 'pending',
    -- pending: 待执行
    -- sent: 已发送
    -- confirmed: 已确认 (confirm 类型)
    -- feedback_done: 已反馈 (feedback 类型)
    -- failed: 发送失败
    -- cancelled: 已取消

    -- 发送结果
    channel_results TEXT DEFAULT '[]',         -- JSON: 各渠道发送结果
    error_message   TEXT,

    -- 用户响应 (confirm/feedback 类型)
    user_action     TEXT,                      -- confirmed/feedback/snoozed
    user_feedback   TEXT,                      -- 用户反馈内容
    action_at       INTEGER,                   -- 操作时间

    created_at      INTEGER NOT NULL,

    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX idx_reminders_scheduled ON reminders(scheduled_at);
CREATE INDEX idx_reminders_status ON reminders(status);
CREATE INDEX idx_reminders_task ON reminders(task_id);
```

#### 3.2.5 reminder_history 表 - 提醒历史

```sql
CREATE TABLE reminder_history (
    id              TEXT PRIMARY KEY,
    reminder_id     TEXT NOT NULL,
    task_id         TEXT NOT NULL,
    task_name       TEXT NOT NULL,             -- 快照: 任务名称
    scheduled_at    INTEGER NOT NULL,
    executed_at     INTEGER,
    status          TEXT NOT NULL,
    channel_results TEXT DEFAULT '[]',
    user_action     TEXT,
    user_feedback   TEXT,
    created_at      INTEGER NOT NULL
);

CREATE INDEX idx_history_task ON reminder_history(task_id);
CREATE INDEX idx_history_time ON reminder_history(scheduled_at);
```

#### 3.2.6 settings 表 - 应用设置

```sql
CREATE TABLE settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL
);
```

**默认设置项**：

| Key | 默认值 | 说明 |
|-----|-------|------|
| `theme` | `system` | 主题: light/dark/system |
| `language` | `zh` | 语言 |
| `auto_launch` | `false` | 开机自启 |
| `minimize_to_tray` | `true` | 关闭时最小化到托盘 |
| `silent_startup` | `false` | 静默启动 |
| `reminder_advance_minutes` | `0` | 提前提醒分钟数 |
| `snooze_minutes` | `5` | 稍后提醒间隔 |
| `history_retention_days` | `30` | 历史保留天数 |
| `webdav_enabled` | `false` | WebDAV 同步 |
| `webdav_base_url` | `` | WebDAV 地址 |
| `webdav_username` | `` | WebDAV 用户名 |
| `webdav_password` | `` | WebDAV 密码 |

---

## 4. 调度引擎设计

### 4.1 Cron 表达式扩展

采用标准 5 字段 Cron 表达式，同时支持扩展语法：

```
┌───────────── 分钟 (0-59)
│ ┌───────────── 小时 (0-23)
│ │ ┌───────────── 日期 (1-31)
│ │ │ ┌───────────── 月份 (1-12)
│ │ │ │ ┌───────────── 星期 (0-6, 0=周日)
│ │ │ │ │
* * * * *

扩展语法:
- nth_weekday: "0 9 * * 1#2"  = 每月第2个周一 9:00
- last_weekday: "0 9 * * 5L" = 每月最后1个周五 9:00
- workday: "0 9 15W * *"     = 每月15日最近工作日 9:00
- last_day: "0 9 L * *"      = 每月最后一天 9:00
```

### 4.2 调度器架构

```rust
// src-tauri/src/services/scheduler/scheduler.rs

pub struct Scheduler {
    db: Arc<Database>,
    notifier: Arc<NotifierService>,
    running: AtomicBool,
}

impl Scheduler {
    /// 主调度循环
    pub async fn run(&self) {
        let mut interval = tokio::time::interval(Duration::from_secs(10));

        loop {
            interval.tick().await;

            // 1. 获取即将执行的提醒 (next 60 秒内)
            let pending = self.get_pending_reminders().await;

            // 2. 逐个执行
            for reminder in pending {
                if let Err(e) = self.execute_reminder(&reminder).await {
                    log::error!("执行提醒失败: {}", e);
                }
            }

            // 3. 计算下次执行时间
            self.schedule_next_reminders().await;
        }
    }

    /// 计算下次执行时间
    async fn schedule_next_reminders(&self) {
        let tasks = self.db.get_enabled_tasks().await;

        for task in tasks {
            let next_run = self.calculate_next_run(&task.cron_expr, &task.cron_config);
            self.db.update_task_next_run(&task.id, next_run).await;

            // 创建提醒实例
            if let Some(scheduled_at) = next_run {
                self.db.create_reminder(&task, scheduled_at).await;
            }
        }
    }
}
```

### 4.3 时间计算示例

```rust
// src-tauri/src/services/scheduler/next_run.rs

/// 支持的时间场景
pub fn calculate_next_run(cron_expr: &str, config: &CronConfig) -> Option<i64> {
    // 标准场景
    // - 每天固定时间: "0 9 * * *"
    // - 每周固定时间: "0 9 * * 1"
    // - 每月固定日期: "0 9 15 * *"
    // - 每年固定日期: "0 9 15 6 *"
    // - 间隔重复: 存储在 config.standard.intervalDays

    // 高级场景
    // - 每月第N个星期X: "0 9 * * 1#2" (使用扩展语法)
    // - 每月最后1个星期X: "0 9 * * 5L"
    // - 偏移提醒: config.advanced.offsetDays

    // 多时间点
    // - 每天多次: 遍历 config.multipleTimes

    // 结束条件
    // - 检查 config.endDate / config.endAfterCount
}
```

---

## 5. 通知发送器设计

### 5.1 统一接口

```rust
// src-tauri/src/services/notifier/mod.rs

pub trait Notifier: Send + Sync {
    /// 发送通知
    async fn send(&self, notification: &Notification) -> Result<SendResult, NotifierError>;

    /// 测试连接
    async fn test(&self) -> Result<(), NotifierError>;

    /// 渠道类型
    fn channel_type(&self) -> &str;
}

pub struct Notification {
    pub title: String,
    pub body: String,
    pub sound: Option<String>,
    pub url: Option<String>,
    pub extra: HashMap<String, Value>,
}

pub struct SendResult {
    pub success: bool,
    pub message_id: Option<String>,
    pub response: Option<String>,
}
```

### 5.2 Bark 实现

```rust
// src-tauri/src/services/notifier/bark.rs

pub struct BarkNotifier {
    config: BarkConfig,
    client: reqwest::Client,
}

impl Notifier for BarkNotifier {
    async fn send(&self, notification: &Notification) -> Result<SendResult, NotifierError> {
        let url = format!(
            "{}/{}/{}",
            self.config.server_url.as_deref().unwrap_or("https://api.day.app"),
            self.config.key,
            urlencoding::encode(&notification.title)
        );

        let mut params = vec![
            ("body", notification.body.clone()),
        ];

        if let Some(sound) = &self.config.sound {
            params.push(("sound", sound.clone()));
        }
        if let Some(group) = &self.config.group {
            params.push(("group", group.clone()));
        }

        let response = self.client.post(&url)
            .form(&params)
            .send()
            .await?;

        // 解析响应
        let body = response.text().await?;
        let json: Value = serde_json::from_str(&body)?;

        if json["code"].as_i64() == Some(200) {
            Ok(SendResult {
                success: true,
                message_id: json["message"].as_str().map(String::from),
                response: Some(body),
            })
        } else {
            Err(NotifierError::SendFailed(json["message"].as_str().unwrap_or("未知错误").to_string()))
        }
    }
}
```

### 5.3 飞书机器人实现

```rust
// src-tauri/src/services/notifier/feishu.rs

pub struct FeishuNotifier {
    config: FeishuConfig,
    client: reqwest::Client,
}

impl Notifier for FeishuNotifier {
    async fn send(&self, notification: &Notification) -> Result<SendResult, NotifierError> {
        let mut body = json!({
            "msg_type": self.config.msg_type,
        });

        match self.config.msg_type.as_str() {
            "text" => {
                body["content"] = json!({
                    "text": format!("{}\n{}", notification.title, notification.body)
                });
            }
            "post" => {
                body["content"] = json!({
                    "post": {
                        "zh_cn": {
                            "title": notification.title,
                            "content": [[{
                                "tag": "text",
                                "text": notification.body
                            }]]
                        }
                    }
                });
            }
            _ => {}
        }

        // 签名
        if let Some(secret) = &self.config.secret {
            let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
            let sign = self.sign(secret, timestamp);
            body["timestamp"] = json!(timestamp);
            body["sign"] = json!(sign);
        }

        let response = self.client.post(&self.config.webhook)
            .json(&body)
            .send()
            .await?;

        let result: Value = response.json().await?;

        if result["StatusCode"].as_i64() == Some(0) {
            Ok(SendResult { success: true, ..Default::default() })
        } else {
            Err(NotifierError::SendFailed(result["msg"].as_str().unwrap_or("发送失败").to_string()))
        }
    }
}
```

---

## 6. 前端设计

### 6.1 整体布局结构

采用**侧边栏 + 内容区**的经典布局，支持模块化扩展：

```
┌─────────────────────────────────────────────────────────────────┐
│  Tools                                              [_][□][×]    │
├────────┬────────────────────────────────────────────────────────┤
│        │  [任务] [模板] [渠道] [历史]         <- 二级 Tab 导航   │
│  🔔    ├────────────────────────────────────────────────────────┤
│  提醒  │                                                        │
│        │  ┌────────────────────────────────────────────────┐   │
│  ───   │  │  搜索 [________] [+新建] [今天][本周][全部]    │   │
│        │  └────────────────────────────────────────────────┘   │
│  ⏱️    │                                                        │
│  计时  │  ┌────────────────────────────────────────────────┐   │
│        │  │  📋 每日站会提醒                                 │   │
│  ───   │  │     每天 09:30 | 简单通知 | 下次: 明天 09:30    │   │
│        │  │     [编辑] [暂停] [删除]                         │   │
│  📝    │  └────────────────────────────────────────────────┘   │
│  笔记  │                                                        │
│        │  ┌────────────────────────────────────────────────┐   │
│  ───   │  │  📅 月度汇报提醒                            ✓    │   │
│        │  │     每月第2个周一 14:00 | 需确认 | 下次: 6月10日│   │
│  ⚙️    │  │     [编辑] [确认] [稍后提醒]                    │   │
│  设置  │  └────────────────────────────────────────────────┘   │
│        │                                                        │
└────────┴────────────────────────────────────────────────────────┘
   ↑
   侧边栏 (一级导航)
```

**布局说明**：

| 区域 | 宽度 | 说明 |
|-----|------|------|
| 侧边栏 | 72px (可折叠至 48px) | 一级导航，展示各模块图标+名称 |
| 内容区 | 剩余宽度 | 各模块的具体内容 |
| Tab 栏 | 全宽 | 二级导航，仅当前模块生效 |

**侧边栏设计**：

```typescript
// src/config/modules.ts

export interface ModuleConfig {
  id: string;
  name: string;
  icon: React.ComponentType;
  path: string;
  enabled: boolean;
  order: number;
}

export const modules: ModuleConfig[] = [
  {
    id: 'reminder',
    name: '提醒',
    icon: BellIcon,
    path: '/reminder',
    enabled: true,
    order: 1,
  },
  {
    id: 'timer',
    name: '计时',
    icon: TimerIcon,
    path: '/timer',
    enabled: true,
    order: 2,
  },
  {
    id: 'notes',
    name: '笔记',
    icon: FileTextIcon,
    path: '/notes',
    enabled: true,
    order: 3,
  },
  {
    id: 'settings',
    name: '设置',
    icon: SettingsIcon,
    path: '/settings',
    enabled: true,
    order: 99, // 始终在底部
  },
];
```

**侧边栏组件**：

```tsx
// src/components/layout/Sidebar.tsx

function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const visibleModules = modules
    .filter(m => m.enabled)
    .sort((a, b) => a.order - b.order);

  // 设置模块单独放在底部
  const mainModules = visibleModules.filter(m => m.id !== 'settings');
  const settingsModule = visibleModules.find(m => m.id === 'settings');

  return (
    <aside className={cn(
      "flex flex-col bg-muted/30 border-r",
      collapsed ? "w-12" : "w-[72px]"
    )}>
      {/* 主模块 */}
      <nav className="flex-1 py-4">
        {mainModules.map(module => (
          <NavItem
            key={module.id}
            module={module}
            collapsed={collapsed}
            active={location.pathname.startsWith(module.path)}
          />
        ))}
      </nav>

      {/* 设置模块 */}
      <nav className="py-4 border-t">
        {settingsModule && (
          <NavItem
            module={settingsModule}
            collapsed={collapsed}
            active={location.pathname === settingsModule.path}
          />
        )}
      </nav>

      {/* 折叠按钮 */}
      <button
        className="p-2 text-muted-foreground hover:text-foreground"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? <ChevronRight /> : <ChevronLeft />}
      </button>
    </aside>
  );
}
```

### 6.2 任务提醒模块页面结构

```
┌─────────────────────────────────────────────────────────────────┐
│  Tools                                              [_][□][×]    │
├────────┬────────────────────────────────────────────────────────┤
│  🔔    │  [任务] [模板] [渠道] [历史]                            │
│  提醒  ├────────────────────────────────────────────────────────┤
│  ...   │                                                        │
└────────┴────────────────────────────────────────────────────────┘
              ↑
              二级导航 (Tab)
```

**Tab 导航配置**：

| Tab | 路由 | 说明 |
|-----|------|------|
| 任务 | `/reminder/tasks` | 任务列表，默认页 |
| 模板 | `/reminder/templates` | 模板管理 |
| 渠道 | `/reminder/channels` | 渠道配置 |
| 历史 | `/reminder/history` | 提醒历史 |

### 6.3 任务列表页

```
┌─────────────────────────────────────────────────────────────────┐
│  新建任务                                              [×]      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  任务名称                                                       │
│  [________________________]                                     │
│                                                                 │
│  任务描述 (可选)                                                │
│  [________________________]                                     │
│                                                                 │
│  提醒类型                                                       │
│  ○ 简单通知    ○ 需要确认    ○ 需要反馈                        │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  提醒时间                                                       │
│                                                                 │
│  快捷选择                                                       │
│  [每天] [每周] [每月] [工作日] [自定义]                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  时间 [09:00]                                            │  │
│  │                                                          │  │
│  │  重复方式                                                 │  │
│  │  ○ 每天                                                  │  │
│  │  ○ 每周  [一][二][三][四][五]                             │  │
│  │  ○ 每月  [1][15][最后一天]                                │  │
│  │  ○ 每月第 [2▼] 个 [周一▼]                                │  │
│  │  ○ 间隔   每 [3] [天▼]                                   │  │
│  │  ○ 高级   Cron表达式 [________]                          │  │
│  │                                                          │  │
│  │  多时间点 [+ 添加时间点]                                  │  │
│  │                                                          │  │
│  │  结束条件                                                 │  │
│  │  ○ 永不                                                  │  │
│  │  ○ 日期 [2025-12-31]                                     │  │
│  │  ○ 次数 [10] 次                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  通知渠道                                                       │
│  ☑ Bark (iPhone)                                               │
│  ☑ 飞书机器人                                                   │
│  ☐ 企业微信                                                     │
│  ☐ 钉钉                                                        │
│                                                                 │
│  使用模板 (可选)                                                │
│  [请选择模板 ▼]                                                 │
│                                                                 │
│                              [取消]  [保存]                     │
└─────────────────────────────────────────────────────────────────┘
```

### 6.4 任务编辑器

```typescript
// src/components/tasks/CronEditor.tsx

interface CronEditorProps {
  value: string;
  config: CronConfig;
  onChange: (expr: string, config: CronConfig) => void;
}

### 6.5 Cron 编辑器组件

```typescript
// src/components/modules/reminder/CronEditor.tsx

interface CronEditorProps {
  value: string;
  config: CronConfig;
  onChange: (expr: string, config: CronConfig) => void;
}

type RepeatMode =
  | 'daily'      // 每天
  | 'weekly'     // 每周
  | 'monthly'    // 每月
  | 'nth_weekday'// 每月第N个星期X
  | 'interval'   // 间隔
  | 'advanced';  // 高级 Cron

function CronEditor({ value, config, onChange }: CronEditorProps) {
  const [mode, setMode] = useState<RepeatMode>('daily');
  const [time, setTime] = useState('09:00');

  // 根据 mode 渲染不同的配置 UI
  // 实时生成 Cron 表达式
}
```

---

## 7. API 设计

### 7.1 任务 API

```typescript
// src/lib/api/task.ts

export const taskApi = {
  // 获取所有任务
  getAll: (): Promise<Task[]> =>
    invoke('get_tasks'),

  // 获取单个任务
  getById: (id: string): Promise<Task> =>
    invoke('get_task', { id }),

  // 创建任务
  create: (task: CreateTaskRequest): Promise<Task> =>
    invoke('create_task', { task }),

  // 更新任务
  update: (id: string, task: UpdateTaskRequest): Promise<Task> =>
    invoke('update_task', { id, task }),

  // 删除任务
  delete: (id: string): Promise<void> =>
    invoke('delete_task', { id }),

  // 暂停/恢复任务
  toggle: (id: string, enabled: boolean): Promise<void> =>
    invoke('toggle_task', { id, enabled }),

  // 获取下次执行时间预览
  previewNextRuns: (cronExpr: string, config: CronConfig, count: number): Promise<number[]> =>
    invoke('preview_next_runs', { cronExpr, config, count }),
};
```

### 7.2 提醒 API

```typescript
// src/lib/api/reminder.ts

export const reminderApi = {
  // 获取待处理提醒
  getPending: (): Promise<Reminder[]> =>
    invoke('get_pending_reminders'),

  // 确认提醒
  confirm: (id: string): Promise<void> =>
    invoke('confirm_reminder', { id }),

  // 提交反馈
  submitFeedback: (id: string, feedback: string): Promise<void> =>
    invoke('submit_feedback', { id, feedback }),

  // 稍后提醒
  snooze: (id: string, minutes: number): Promise<void> =>
    invoke('snooze_reminder', { id, minutes }),

  // 获取历史
  getHistory: (params: { taskId?: string; limit?: number; offset?: number }): Promise<ReminderHistory[]> =>
    invoke('get_reminder_history', { params }),
};
```

### 7.3 渠道 API

```typescript
// src/lib/api/channel.ts

export const channelApi = {
  // 获取所有渠道
  getAll: (): Promise<Channel[]> =>
    invoke('get_channels'),

  // 创建渠道
  create: (channel: CreateChannelRequest): Promise<Channel> =>
    invoke('create_channel', { channel }),

  // 更新渠道
  update: (id: string, channel: UpdateChannelRequest): Promise<Channel> =>
    invoke('update_channel', { id, channel }),

  // 删除渠道
  delete: (id: string): Promise<void> =>
    invoke('delete_channel', { id }),

  // 测试渠道
  test: (id: string): Promise<TestResult> =>
    invoke('test_channel', { id }),
};
```

---

## 8. 扩展功能

### 8.1 托盘菜单

```rust
// 系统托盘菜单
- 今日待办 (3)
  ├── 09:30 每日站会提醒
  ├── 14:00 月度汇报提醒
  └── 18:00 服药提醒
- 新建任务
- 暂停所有提醒
- 设置
- 退出
```

### 8.2 系统通知集成

- Windows: Windows Notification API
- macOS: NSUserNotification / UserNotifications
- Linux: libnotify

当应用在后台时，通过系统通知显示提醒，点击可唤起应用。

### 8.3 WebDAV 同步

参考 cc-switch 的 WebDAV 同步实现，支持：
- 手动同步
- 自动同步 (可配置间隔)
- 冲突解决 (最后修改时间优先)

---

## 9. 打包与分发

### 9.1 Windows MSI 打包

```json
// src-tauri/tauri.conf.json
{
  "bundle": {
    "targets": ["msi"],
    "windows": {
      "wix": {
        "template": "wix/per-user-main.wxs"
      }
    }
  }
}
```

### 9.2 其他平台

- macOS: .dmg + .app
- Linux: .deb + .rpm + AppImage

---

## 10. 开发计划

### Phase 1: 基础框架 (Week 1-2)

1. 项目初始化 (Tauri v2 + React 19)
2. 数据库 Schema 设计与实现
3. 基础 UI 框架搭建
4. 任务 CRUD API 实现

### Phase 2: 核心功能 (Week 3-4)

1. Cron 表达式解析与调度引擎
2. 通知发送器 (Bark / 飞书 / 企业微信 / 钉钉)
3. 任务编辑器 UI
4. 提醒历史记录

### Phase 3: 高级功能 (Week 5-6)

1. 模板系统
2. 确认/反馈模式
3. 托盘集成
4. 系统通知集成

### Phase 4: 完善与发布 (Week 7-8)

1. WebDAV 同步
2. 设置页完善
3. MSI 打包配置
4. 测试与 Bug 修复

---

## 11. 附录

### A. TypeScript 类型定义

```typescript
// src/types/task.ts

export type ReminderType = 'simple' | 'confirm' | 'feedback';
export type TaskStatus = 'active' | 'paused' | 'completed';

export interface Task {
  id: string;
  name: string;
  description?: string;
  reminderType: ReminderType;
  cronExpr: string;
  cronConfig: CronConfig;
  enabled: boolean;
  status: TaskStatus;
  lastRunAt?: number;
  nextRunAt?: number;
  templateId?: string;
  channelIds: string[];
  tags: string[];
  priority: number;
  createdAt: number;
  updatedAt: number;
}

export interface Template {
  id: string;
  name: string;
  description?: string;
  category: 'system' | 'custom' | 'preset';
  titleTemplate: string;
  bodyTemplate: string;
  defaultCron?: string;
  defaultChannels: string[];
  icon?: string;
  color?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export type ChannelType = 'bark' | 'feishu' | 'wecom' | 'dingtalk';

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  enabled: boolean;
  config: BarkConfig | FeishuConfig | WecomConfig | DingtalkConfig;
  lastTestAt?: number;
  lastTestResult?: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export type ReminderStatus =
  | 'pending'
  | 'sent'
  | 'confirmed'
  | 'feedback_done'
  | 'failed'
  | 'cancelled';

export interface Reminder {
  id: string;
  taskId: string;
  scheduledAt: number;
  executedAt?: number;
  status: ReminderStatus;
  channelResults: ChannelResult[];
  errorMessage?: string;
  userAction?: 'confirmed' | 'feedback' | 'snoozed';
  userFeedback?: string;
  actionAt?: number;
  createdAt: number;
}

export interface ChannelResult {
  channelId: string;
  success: boolean;
  message?: string;
  sentAt: number;
}
```

### B. Cron 表达式示例

| 场景 | Cron 表达式 | 说明 |
|-----|------------|------|
| 每天 9:00 | `0 9 * * *` | - |
| 每周一 9:00 | `0 9 * * 1` | - |
| 每月 15 日 9:00 | `0 9 15 * *` | - |
| 每月最后一天 9:00 | `0 9 L * *` | 扩展语法 |
| 每月第 2 个周一 9:00 | `0 9 * * 1#2` | 扩展语法 |
| 每月最后 1 个周五 9:00 | `0 9 * * 5L` | 扩展语法 |
| 工作日 9:00 | `0 9 * * 1-5` | - |
| 每 3 天 9:00 | 通过 config.intervalDays 实现 | - |
| 每年 1 月 1 日 0:00 | `0 0 1 1 *` | - |
