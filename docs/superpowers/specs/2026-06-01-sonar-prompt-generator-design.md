# Sonar 单测 Prompt 生成器 - 可自定义模板

## 概述

从 Sonar 覆盖率报告中提取指定开发者未覆盖的代码行，生成 Claude Code 单测 Prompt。用户可自定义 Prompt 模板，通过 `{file_list}` 占位符插入扫描到的文件和行号数据。

## 功能目标

1. 连接 Walkin/SonarQube API，获取增量覆盖率报告
2. 按开发者邮箱过滤，提取未覆盖的代码行
3. 将连续行号合并为区间（如第10-15行）
4. 生成可自定义模板的 Claude Code Prompt
5. 支持复制到剪贴板和导出 txt 文件

## 架构设计

### 分层结构

```
前端 SonarPromptPage.tsx（3步向导）
  ├─ 配置步骤：扫描参数 + 模板编辑器
  ├─ 选择步骤：展示增量报告列表
  └─ 结果步骤：逐文件分析 → 生成 Prompt
        │
        ▼
API 层 src/lib/api/sonar.ts
  └─ 4 个 Tauri invoke 方法封装
        │
        ▼
Tauri Commands src-tauri/src/commands/sonar.rs
  ├─ SonarAuth → WalkinAuth 类型转换
  └─ 4 个 command handler
        │
        ▼
Service 层 src-tauri/src/services/sonar/client.rs
  ├─ HTTP 客户端（Walkin API 调用）
  ├─ 行号合并算法
  └─ Prompt 模板替换引擎
```

### 文件清单

| 文件 | 职责 |
|------|------|
| `src/lib/api/sonar.ts` | 前端 API 层，定义接口和调用方法 |
| `src/pages/SonarPromptPage.tsx` | 前端页面，3步向导 + 模板编辑 |
| `src-tauri/src/commands/sonar.rs` | Tauri 命令层，类型转换 + 路由 |
| `src-tauri/src/services/sonar/client.rs` | 核心服务，HTTP 调用 + 算法 + 模板引擎 |
| `src-tauri/src/services/sonar/mod.rs` | 模块导出 |

### 认证机制

复用 GitLab 模块的 Walkin 认证配置：
- 前端通过 `useGitLabConfig()` 获取认证信息
- 封装为 `SonarAuth` 结构体传递到后端
- 后端转换为 `WalkinAuth` 后调用 API

## 模板系统

### 默认模板

```
请为以下代码区域补充单元测试。

{file_list}

要求：
1. 测试覆盖所有边界条件和异常路径
2. 使用 JUnit 5 + Mockito
3. 每个测试方法名清晰表达测试意图
4. Mock 外部依赖，不依赖真实数据库/网络
```

### 变量说明

| 变量 | 说明 | 格式 |
|------|------|------|
| `{file_list}` | 扫描到的文件和行号 | 固定格式（见下文） |

### `{file_list}` 固定输出格式

```
==================================================

文件：
path/to/File.java

Sonar重点覆盖区域：
第10-15行、第20行、第30-45行
```

每个文件一个块，包含：
- 文件路径
- 合并后的行号区间（连续行号自动合并）

### 持久化

- 模板保存到 `localStorage("sonar_prompt_template")`
- 页面加载时从 localStorage 读取，不存在则使用默认模板
- 提供"恢复默认模板"按钮

## API 设计

### 前端 API（sonar.ts）

```typescript
sonarApi.getReports(url, auth, deptId, createTimeEnd, projectKeyNotLike, branch, page, limit)
sonarApi.getFiles(url, auth, projectKey, branch, reportId)
sonarApi.getFileCoverage(url, auth, projectKey, branch, fileKey, filePath, author)
sonarApi.generatePrompt(files: FileCoverage[], template: string)
```

### 后端 Commands（sonar.rs）

- `sonar_get_reports` → 获取报告列表
- `sonar_get_files` → 获取文件列表
- `sonar_get_file_coverage` → 获取单文件覆盖信息
- `sonar_generate_prompt` → 模板替换生成 Prompt

### Walkin API 端点

| 端点 | 用途 |
|------|------|
| `GET /track/synSonarInfo/getJenkinsReport` | 获取报告列表 |
| `GET /track/synSonarInfoData/newCoverageCodeDetails` | 获取文件列表 |
| `GET /track/synSonarInfoData/newCoverageCodeDetails/source` | 获取源码行覆盖 |

## 数据流

1. 用户填写扫描参数（截止时间、分支、排除项目、数量、开发者邮箱）
2. 用户编辑 Prompt 模板（可选，含 `{file_list}` 占位符）
3. 点击"获取报告"→ 调用 `getJenkinsReport` → 过滤增量报告
4. 用户选择一个报告 → 进入结果页
5. 逐文件调用 `newCoverageCodeDetails/source` → 过滤非重复且作者匹配的行
6. 合并连续行号为区间
7. 调用 `generatePrompt` → 模板替换 `{file_list}` → 展示结果
8. 用户可复制或导出

## 行号合并算法

输入：`[1, 2, 3, 5, 6, 10]`
输出：`[{start:1, end:3}, {start:5, end:6}, {start:10, end:10}]`

逻辑：排序去重后遍历，若当前行 == 上一行 + 1 则扩展区间，否则新建区间。

## 已知限制

1. **i18n 不完整**：页面文本硬编码中文，英文 locale 缺少 `nav.sonar` 翻译
2. **串行处理**：文件逐个请求，无并行优化
3. **无缓存**：每次扫描都重新请求 API
