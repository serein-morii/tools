# Walkin 平台集成计划

## Context

用户希望在 GitLab 代码扫描功能中集成 Walkin 平台的 SonarQube 代码质量数据。Walkin 提供 Bug 数量、漏洞、覆盖率、重复代码、评级等指标。这些数据需要在扫描时获取，关联到对应项目，并在推送通知中展示。

## 目标

1. GitLab 扫描时同步获取 Walkin 数据
2. 项目名称匹配：先尝试名称匹配，再用配置映射
3. 在项目表格中展示 Walkin 指标
4. 推送通知包含 Walkin 质量数据

## 数据结构

### Walkin 返回的关键字段
- `projectName`: 项目名称
- `bugs/vulnerabilities/codeSmells`: 问题数量
- `coverage/newCoverage`: 覆盖率
- `duplicatedLinesDensity`: 重复代码密度
- `reliabilityRating/securityRating/maintainabilityRating`: 评级 (1-5)

## 实现步骤

### Phase 1: 后端基础 (Rust)

**1. 创建 Walkin 客户端**
- 文件: `src-tauri/src/services/walkin/mod.rs`, `client.rs`
- 参考 `gitlab/client.rs` 的模式
- 支持认证头: CSRF-TOKEN, PROJECT, WORKSPACE, X-AUTH-TOKEN

**2. 数据结构**
- 在 `scanner.rs` 的 `ProjectScanResult` 添加 `walkin_metrics: Option<WalkinMetrics>`
- WalkinMetrics 包含: bugs, vulnerabilities, code_smells, coverage, ratings 等

**3. 设置存储**
- 新增 settings: walkin_enabled, walkin_url, walkin_csrf_token, walkin_project, walkin_workspace, walkin_x_auth_token, walkin_project_mappings
- 在 `commands/gitlab.rs` 的 GitLabConfig 结构体添加这些字段

### Phase 2: 项目匹配

**匹配逻辑** (在 scanner 中):
```rust
fn match_projects(gitlab_name, walkin_projects, mappings):
  // 1. 先检查自定义映射表
  // 2. 再用项目名精确匹配 (yl-web-oauth)
```

### Phase 3: 扫描集成

修改 `scanner.rs` 的 `scan_project` 或 `scan` 方法:
1. 扫描开始时调用 Walkin API 获取所有项目数据
2. 对每个 GitLab 项目匹配 Walkin 数据
3. 将匹配结果存入 ProjectScanResult.walkin_metrics

### Phase 4: 前端展示

**类型定义** (`types/index.ts`):
```typescript
interface WalkinMetrics {
  bugs: number;
  vulnerabilities: number;
  codeSmells: number;
  coverage: number | null;
  duplicatedLinesDensity: number | null;
  reliabilityRating: string | null;
  securityRating: string | null;
  maintainabilityRating: string | null;
}
```

**设置页面** (`GitLabSettingsPage.tsx`):
- 添加 Walkin 集成配置区块
- 输入 URL、Token 等认证信息
- 测试连接按钮
- 项目名称映射配置

**概览页面** (`GitLabOverviewPage.tsx`):
- 项目表格添加"质量指标"列
- 展示评级徽章 + 覆盖率
- 展开详情显示完整 Walkin 指标

### Phase 5: 推送通知

修改 `gitlab_scheduler.rs` 和 `commands/gitlab.rs` 的通知格式:
- 添加 Walkin 质量指标区块
- 展示总 Bug/漏洞数、平均覆盖率、需关注项目(评级差的项目)

## 关键文件

| 文件 | 修改内容 |
|------|----------|
| `src-tauri/src/services/walkin/mod.rs` | 新建 Walkin 模块 |
| `src-tauri/src/services/walkin/client.rs` | Walkin API 客户端 |
| `src-tauri/src/services/gitlab/scanner.rs` | 添加 Walkin 数据获取和匹配 |
| `src-tauri/src/commands/gitlab.rs` | GitLabConfig 扩展 + Walkin 命令 |
| `src-tauri/src/services/mod.rs` | 添加 walkin 模块引用 |
| `src/types/index.ts` | WalkinMetrics 类型 |
| `src/pages/GitLabSettingsPage.tsx` | Walkin 配置 UI |
| `src/pages/GitLabOverviewPage.tsx` | 质量指标展示 |
| `src-tauri/src/services/scheduler/gitlab_scheduler.rs` | 通知包含 Walkin 数据 |

## 验证方法

1. 配置 Walkin 连接信息后点击"测试连接"按钮
2. 执行 GitLab 扫描，确认 Walkin 数据被获取
3. 查看项目表格是否展示质量指标列
4. 查看推送通知是否包含 Walkin 数据
4. 测试项目名称匹配和自定义映射