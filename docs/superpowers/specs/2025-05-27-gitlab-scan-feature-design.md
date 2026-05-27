# GitLab 代码扫描功能设计文档

> 创建日期: 2025-05-27
> 状态: 待审核

## 一、背景与目标

### 1.1 背景
用户已有 Python 脚本 `scan.py` 用于扫描 GitLab 本周代码提交并检测单测情况，希望将此功能集成到 Tools 桌面应用中，实现：
- 可视化展示扫描结果
- 定时自动扫描并推送通知
- 历史记录追溯与对比

### 1.2 目标
1. **GitLab提交扫描模块** - 在应用中新增页面，展示本周提交扫描结果
2. **定时扫描+推送通知** - 作为定时任务执行，定期扫描并推送结果到钉钉等渠道

---

## 二、功能需求

### 2.1 核心功能
| 功能 | 描述 |
|------|------|
| GitLab连接配置 | 支持Token和账号密码两种认证方式，首次使用引导配置 |
| 手动扫描 | 用户点击按钮立即触发扫描 |
| 定时扫描 | 按配置的cron表达式自动扫描 |
| 结果展示 | 卡片统计 + 表格详情 + 趋势图表 |
| 历史记录 | 保存扫描历史，支持对比和导出 |
| 通知推送 | 扫描完成后推送到配置的通知渠道 |

### 2.2 扫描维度
- 本周提交统计 + 单测检测
- 提交人统计排行
- 代码变更量统计（新增/删除行数）
- MR审核状态检测
- 周对比趋势

---

## 三、技术方案

### 3.1 架构选择
**纯Rust后端实现**，理由：
- 与项目现有架构一致
- 复用现有的 scheduler 调度服务和 notifier 通知服务
- 数据存储在本地SQLite，支持历史记录查询
- 性能最优，适合定时扫描场景

### 3.2 技术栈
- 后端: Rust + reqwest (HTTP客户端) + serde (JSON解析)
- 前端: React + TypeScript + TanStack Query
- 数据库: SQLite (rusqlite)

---

## 四、数据模型设计

### 4.1 GitLab配置（复用settings表）

| Key | 描述 | 示例值 |
|-----|------|--------|
| `gitlab_url` | GitLab服务器地址 | `http://code.jms.com` |
| `gitlab_auth_type` | 认证方式 | `token` / `password` |
| `gitlab_token` | Private Token | `yTeXMd****ay8VQ` |
| `gitlab_username` | 用户名 | `admin` |
| `gitlab_password` | 密码 | `****` |
| `gitlab_filter_mode` | 项目过滤模式 | `include` / `exclude` / `all` |
| `gitlab_filter_projects` | 项目过滤列表 | `["basicdata","lmdm"]` |
| `gitlab_test_keywords` | 单测关键词 | `["单测","测试","用例"]` |
| `gitlab_scan_schedule` | 定时扫描cron | `0 9 * * 1` |
| `gitlab_scan_channels` | 推送渠道ID | `["xxx-xxx"]` |
| `gitlab_scan_range` | 扫描范围 | `week` / `days:7` |

### 4.2 扫描历史表（新增）

```sql
CREATE TABLE IF NOT EXISTS gitlab_scan_history (
    id                  TEXT PRIMARY KEY,
    scan_type           TEXT NOT NULL,           -- 'weekly' / 'manual'
    scan_at             INTEGER NOT NULL,        -- 扫描时间戳
    scan_range_start    TEXT,                    -- 扫描范围开始
    scan_range_end      TEXT,                    -- 扫描范围结束
    total_projects      INTEGER,                 -- 扫描项目总数
    total_commits       INTEGER,                 -- 总提交数
    total_lines_added   INTEGER,                 -- 新增行数
    total_lines_removed INTEGER,                 -- 删除行数
    test_projects       INTEGER,                 -- 有单测的项目数
    pending_mrs         INTEGER,                 -- 待审核MR数
    contributors        TEXT,                    -- 贡献者JSON数组
    summary             TEXT,                    -- JSON格式详细结果
    created_at          INTEGER NOT NULL
);
```

### 4.3 TypeScript类型定义

```typescript
// GitLab配置
interface GitLabConfig {
  url: string;
  authType: 'token' | 'password';
  token?: string;
  username?: string;
  password?: string;
  filterMode: 'include' | 'exclude' | 'all';
  filterProjects: string[];
  testKeywords: string[];
  scanSchedule: string;
  scanChannels: string[];
  scanRange: { type: 'week' } | { type: 'days'; value: number };
}

// 扫描结果
interface GitLabScanResult {
  id: string;
  scanType: 'weekly' | 'manual';
  scanAt: number;
  totalProjects: number;
  totalCommits: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  testProjects: number;
  pendingMrs: number;
  contributors: string[];
  projects: GitLabProjectResult[];
}

// 项目扫描结果
interface GitLabProjectResult {
  projectId: string;
  projectName: string;
  commits: number;
  linesAdded: number;
  linesRemoved: number;
  hasTest: boolean;
  testCommits: string[];
  pendingMrs: number;
  contributors: string[];
  lastCommitAt: string;
}

// 扫描历史
interface GitLabScanHistory {
  id: string;
  scanType: string;
  scanAt: number;
  totalProjects: number;
  totalCommits: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  testProjects: number;
  pendingMrs: number;
  contributors: string[];
  createdAt: number;
}
```

---

## 五、后端服务设计

### 5.1 目录结构

```
src-tauri/src/
├── commands/
│   └── gitlab.rs              # 新增：GitLab相关命令
├── database/
│   └── dao/
│       └── gitlab_scan.rs     # 新增：扫描历史DAO
└── services/
    └── gitlab/                # 新增：GitLab服务模块
        ├── mod.rs
        ├── client.rs          # GitLab HTTP客户端
        ├── projects.rs        # 项目API
        ├── commits.rs         # 提交API
        ├── merge_requests.rs  # MR API
        └── scanner.rs         # 扫描聚合逻辑
```

### 5.2 GitLab客户端

```rust
pub struct GitLabClient {
    base_url: String,
    auth: GitLabAuth,
    http_client: reqwest::Client,
}

pub enum GitLabAuth {
    Token(String),
    Password { username: String, password: String },
}

impl GitLabClient {
    pub fn new(base_url: &str, auth: GitLabAuth) -> Result<Self>;
    pub async fn test_connection(&self) -> Result<bool>;
    pub async fn get_projects(&self, page: i32) -> Result<Vec<Project>>;
    pub async fn get_commits(&self, project_id: &str, since: &str) -> Result<Vec<Commit>>;
    pub async fn get_commit_diff(&self, project_id: &str, commit_sha: &str) -> Result<DiffStats>;
    pub async fn get_merge_requests(&self, project_id: &str, state: &str) -> Result<Vec<MergeRequest>>;
}
```

### 5.3 扫描器

```rust
pub struct GitLabScanner {
    client: GitLabClient,
    config: ScanConfig,
}

pub struct ScanConfig {
    pub filter_mode: FilterMode,
    pub filter_projects: Vec<String>,
    pub test_keywords: Vec<String>,
    pub scan_range: ScanRange,
}

impl GitLabScanner {
    pub async fn scan(&self) -> Result<ScanResult>;
    fn filter_projects(&self, projects: Vec<Project>) -> Vec<Project>;
    fn detect_test_commits(&self, commits: Vec<Commit>) -> Vec<Commit>;
    fn calculate_diff_stats(&self, project_id: &str, commits: Vec<Commit>) -> Result<DiffStats>;
}
```

### 5.4 Tauri命令

```rust
// commands/gitlab.rs

#[tauri::command]
pub fn get_gitlab_config(db: State<'_, Arc<Database>>) -> Result<GitLabConfig>;

#[tauri::command]
pub fn save_gitlab_config(db: State<'_, Arc<Database>>, config: GitLabConfig) -> Result<()>;

#[tauri::command]
pub async fn test_gitlab_connection(config: GitLabConfig) -> Result<bool>;

#[tauri::command]
pub async fn trigger_gitlab_scan(db: State<'_, Arc<Database>>) -> Result<GitLabScanResult>;

#[tauri::command]
pub fn get_gitlab_scan_history(db: State<'_, Arc<Database>>, limit: Option<i32>) -> Result<Vec<GitLabScanHistory>>;

#[tauri::command]
pub fn get_gitlab_scan_detail(db: State<'_, Arc<Database>>, id: String) -> Result<GitLabScanResult>;

#[tauri::command]
pub fn delete_gitlab_scan_history(db: State<'_, Arc<Database>>, id: String) -> Result<()>;
```

### 5.5 调度集成

在 `services/scheduler/scheduler.rs` 中新增：

```rust
pub enum ScheduledTaskType {
    Reminder,
    GitLabScan,
}

// 启动GitLab扫描调度器
pub fn start_gitlab_scheduler(db: Arc<Database>) {
    // 读取gitlab_scan_schedule配置
    // 解析cron表达式
    // 定时触发扫描
    // 扫描完成后调用notifier推送
}
```

---

## 六、前端页面设计

### 6.1 目录结构

```
src/
├── pages/
│   ├── GitLabOverviewPage.tsx    # 概览页
│   ├── GitLabHistoryPage.tsx     # 历史页
│   └── GitLabSettingsPage.tsx    # 配置页
├── components/
│   └── modules/
│       └── gitlab/
│           ├── GitLabLayout.tsx        # 子路由布局
│           ├── ScanSummaryCards.tsx    # 统计卡片
│           ├── ProjectTable.tsx        # 项目表格
│           ├── TrendChart.tsx          # 趋势图表
│           ├── HistoryCard.tsx         # 历史记录卡片
│           ├── CompareView.tsx         # 对比视图
│           ├── ConfigForm.tsx          # 配置表单
│           └── FirstTimeSetupModal.tsx # 首次配置引导
├── lib/
│   ├── api/
│   │   └── gitlab.ts              # API调用
│   └── query/
│       └── gitlabQueries.ts       # React Query hooks
```

### 6.2 路由配置

```tsx
// App.tsx
<Route path="gitlab" element={<GitLabLayout />}>
  <Route index element={<Navigate to="/gitlab/overview" replace />} />
  <Route path="overview" element={<GitLabOverviewPage />} />
  <Route path="history" element={<GitLabHistoryPage />} />
  <Route path="settings" element={<GitLabSettingsPage />} />
</Route>
```

### 6.3 侧边栏导航

```tsx
// Sidebar.tsx
const primaryItems = [
  { to: "/", icon: Home, labelKey: "nav.home", match: "/" },
  { to: "/reminder/tasks", icon: Bell, labelKey: "nav.reminder", match: "/reminder" },
  { to: "/gitlab", icon: GitBranch, labelKey: "nav.gitlab", match: "/gitlab" },
];
```

### 6.4 页面功能

#### 概览页 (GitLabOverviewPage)
- 顶部：上次/下次扫描时间，[立即扫描] [导出报告] 按钮
- 统计卡片区：扫描项目、提交总数、参与人数、单测覆盖、新增代码、待审MR
- 趋势图：近4周提交趋势、单测覆盖率趋势
- 项目详情表格：支持搜索、排序、展开查看单测详情

#### 历史页 (GitLabHistoryPage)
- 筛选：日期范围、扫描类型
- 历史记录卡片：统计概览、需关注项目、贡献者排行
- 对比功能：选择两次扫描进行对比
- 周报生成：一键导出Markdown

#### 配置页 (GitLabSettingsPage)
- GitLab连接配置：URL、认证方式、Token/账号密码
- 项目过滤配置：过滤模式、项目列表
- 单测检测配置：关键词、检测范围、文件匹配规则
- 定时扫描配置：周期、时间、扫描范围
- 通知推送配置：推送渠道、推送时机、内容模板
- 报告配置：历史保留、导出格式

---

## 七、通知推送设计

### 7.1 推送模板

**钉钉Markdown格式**：
```markdown
【GitLab周报】本周代码提交汇总

📊 统计概览
• 扫描项目：12个
• 代码提交：156次
• 参与人员：5人
• 单测覆盖：67%（↑7%）

📈 代码变更
• 新增：+12,345行
• 删除：-3,456行

⚠️ 需关注项目
• lmdm-api：15次提交，未发现单测
• network-gateway：2个MR待审核

🏆 本周贡献TOP3
1. 张三：45次提交
2. 李四：38次提交
3. 王五：32次提交

📅 扫描时间：2025-05-27 09:00
```

### 7.2 推送时机
1. **扫描完成后推送**：扫描完成立即推送（默认）
2. **问题预警推送**（可选）：
   - 连续N周无单测的项目
   - MR积压超过N天
   - 提交量异常波动

---

## 八、实现步骤

### Phase 1: 后端基础 (预计2-3小时)
1. [ ] 创建 `services/gitlab/` 模块结构
2. [ ] 实现 GitLabClient（HTTP请求封装）
3. [ ] 实现项目、提交、MR API调用
4. [ ] 实现 GitLabScanner 聚合逻辑
5. [ ] 创建 `database/dao/gitlab_scan.rs`
6. [ ] 更新数据库 schema
7. [ ] 创建 `commands/gitlab.rs` 命令
8. [ ] 注册命令到 lib.rs

### Phase 2: 前端基础 (预计2-3小时)
1. [ ] 创建类型定义 `types/index.ts`
2. [ ] 创建 API `lib/api/gitlab.ts`
3. [ ] 创建 React Query hooks `lib/query/gitlabQueries.ts`
4. [ ] 创建 GitLabLayout 布局组件
5. [ ] 更新路由 App.tsx
6. [ ] 更新侧边栏 Sidebar.tsx
7. [ ] 添加国际化翻译

### Phase 3: 配置页面 (预计1-2小时)
1. [ ] 实现 GitLabSettingsPage
2. [ ] 实现首次配置引导弹窗
3. [ ] 实现连接测试功能

### Phase 4: 概览页面 (预计2-3小时)
1. [ ] 实现 ScanSummaryCards 统计卡片
2. [ ] 实现 ProjectTable 项目表格
3. [ ] 实现 TrendChart 趋势图表
4. [ ] 实现 GitLabOverviewPage

### Phase 5: 历史页面 (预计1-2小时)
1. [ ] 实现 HistoryCard 历史卡片
2. [ ] 实现 CompareView 对比视图
3. [ ] 实现周报导出功能
4. [ ] 实现 GitLabHistoryPage

### Phase 6: 调度与通知 (预计1-2小时)
1. [ ] 集成到 scheduler 调度器
2. [ ] 实现通知推送模板
3. [ ] 测试定时扫描流程

### Phase 7: 测试与优化 (预计1小时)
1. [ ] 端到端测试
2. [ ] 性能优化
3. [ ] 错误处理完善

---

## 九、关键文件清单

| 类型 | 文件路径 | 操作 |
|------|---------|------|
| 后端服务 | `src-tauri/src/services/gitlab/mod.rs` | 新增 |
| 后端服务 | `src-tauri/src/services/gitlab/client.rs` | 新增 |
| 后端服务 | `src-tauri/src/services/gitlab/scanner.rs` | 新增 |
| 后端命令 | `src-tauri/src/commands/gitlab.rs` | 新增 |
| 后端DAO | `src-tauri/src/database/dao/gitlab_scan.rs` | 新增 |
| 数据库 | `src-tauri/src/database/schema.rs` | 修改 |
| 命令注册 | `src-tauri/src/lib.rs` | 修改 |
| 前端类型 | `src/types/index.ts` | 修改 |
| 前端API | `src/lib/api/gitlab.ts` | 新增 |
| 前端Query | `src/lib/query/gitlabQueries.ts` | 新增 |
| 前端布局 | `src/components/modules/gitlab/GitLabLayout.tsx` | 新增 |
| 前端页面 | `src/pages/GitLabOverviewPage.tsx` | 新增 |
| 前端页面 | `src/pages/GitLabHistoryPage.tsx` | 新增 |
| 前端页面 | `src/pages/GitLabSettingsPage.tsx` | 新增 |
| 路由 | `src/App.tsx` | 修改 |
| 侧边栏 | `src/components/layout/Sidebar.tsx` | 修改 |
| 国际化 | `src/i18n/locales/zh.json` | 修改 |

---

## 十、验证方案

### 10.1 单元测试
- GitLabClient API调用测试
- GitLabScanner 扫描逻辑测试
- 数据存储和查询测试

### 10.2 集成测试
- 配置保存和读取
- 手动扫描流程
- 定时扫描流程
- 通知推送流程

### 10.3 端到端测试
1. 启动应用，检查GitLab导航是否显示
2. 首次进入，检查配置引导是否弹出
3. 配置GitLab连接，测试连接是否成功
4. 点击立即扫描，检查结果是否正确显示
5. 检查历史记录是否保存
6. 配置定时扫描，等待触发，检查推送是否收到

---

## 十一、风险与注意事项

1. **GitLab API限流**：大量请求可能触发限流，需要添加请求间隔和重试机制
2. **Token安全**：敏感信息需要脱敏展示，存储时考虑加密
3. **网络超时**：GitLab服务器可能响应慢，需要设置合理的超时时间
4. **数据量**：项目多时扫描耗时长，需要异步处理和进度提示
5. **跨版本兼容**：不同GitLab版本API可能有差异，需要版本适配
