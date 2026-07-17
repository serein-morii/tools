# Unified AI Provider 设计文档

## 概述

将项目中散落的 AI 调用逻辑（TestGen 的 CLI 调用、Activity Reporter 的 CLI/API 调用）统一为可扩展的 AI Provider 模块。支持 Windows/Mac/Linux，调用时用户可选择 AI，可设置全局默认。

## 架构

```
前端 (React)
  ├── AiContext.tsx       全局 AI 执行浮层面板（仿 TestGenContext 模式）
  ├── AiSelector           复用组件，嵌入各页面的工具栏
  ├── SettingsPage         新增 AI 设置区域
  └── lib/query/aiQueries.ts   React Query hooks

后端 (Rust)
  ├── commands/ai.rs       Tauri 命令入口
  └── services/ai/
      ├── mod.rs           AiProvider trait + ProviderRegistry
      ├── types.rs         公共类型
      └── providers/
          ├── claude_cli.rs
          ├── codex_cli.rs
          ├── anthropic_api.rs
          └── openai_api.rs
```

## Rust 后端设计

### AiProvider trait

```rust
#[async_trait]
pub trait AiProvider: Send + Sync {
    fn info(&self) -> &AiProviderInfo;
    async fn call_streaming(&self, request: AiRequest) -> Result<AiResponse>;
    async fn call(&self, request: AiRequest) -> Result<AiResponse>;
}
```

### 核心类型

- `AiProviderInfo { id, name, provider_type, enabled }` — 注册信息
- `ProviderType::Cli | ProviderType::Api`
- `AiRequest { prompt, config, continue_session, on_event }` — 请求
- `AiEvent { Progress, Thinking, TextDelta, Done, Error }` — 流式事件
- `AiResponse { output, token_count }` — 最终结果

### Provider 实现

| Provider ID | 类型 | 调用方式 |
|---|---|---|
| `claude-cli` | CLI | 子进程 `claude -p --output-format stream-json --verbose` |
| `codex-cli` | CLI | 子进程 `codex -p --output-format stream-json --verbose` |
| `anthropic-api` | API | POST `{base_url}/v1/messages` |
| `openai-api` | API | POST `{base_url}/v1/chat/completions` |

CLI provider 支持 `continue_session`（通过 `--continue` 参数）。

### ProviderRegistry

```rust
pub struct ProviderRegistry {
    providers: HashMap<String, Box<dyn AiProvider>>,
}
```

- `new()` 注册所有内置 provider
- `list()` 获取所有 provider 信息
- `get(id)` 按 id 获取 provider

### Tauri commands (commands/ai.rs)

- `list_ai_providers()` → `Vec<AiProviderInfo>`
- `call_ai(provider_id, prompt, config_json, continue_session)` → stream events

## 配置设计

通过现有 settings 表存储，key-value 方式：

| Key | 默认值 | 说明 |
|---|---|---|
| `ai_default_provider` | `"claude-cli"` | 全局默认 provider |
| `ai_providers_config` | JSON (见下) | 所有 provider 配置 |

`ai_providers_config` 结构：

```json
{
  "providers": [
    {
      "id": "claude-cli", "enabled": true,
      "command": "claude", "default_model": ""
    },
    {
      "id": "codex-cli", "enabled": false,
      "command": "codex", "default_model": ""
    },
    {
      "id": "anthropic-api", "enabled": false,
      "api_key": "", "base_url": "https://api.anthropic.com",
      "default_model": "claude-sonnet-4-20250514", "max_tokens": 4096
    },
    {
      "id": "openai-api", "enabled": false,
      "api_key": "", "base_url": "https://api.openai.com",
      "default_model": "gpt-4o", "max_tokens": 4096
    }
  ]
}
```

- CLI provider 配置项：enabled, command, default_model
- API provider 配置项：enabled, api_key, base_url, default_model, max_tokens
- 扩展新 provider 只需在这 JSON 加一项 + Rust 注册

## 前端设计

### AiContext（全局 AI 执行面板）

仿照 `TestGenContext` 模式，`src/lib/AiContext.tsx`：

- `AiProvider` 包裹整个应用
- 全局浮层 Modal 显示 AI 执行过程
- 最小化时显示底部浮动按钮
- 通过 `useAi()` hook 调用

核心接口：
```typescript
interface AiContextValue {
  panelOpen: boolean;
  panelMinimized: boolean;
  status: "idle" | "running" | "done" | "error";
  logs: AiLog[];
  streamText: string;
  thinkingTokens: number | null;
  startRun(request: AiCallRequest): Promise<void>;
  cancelRun(): void;
}
```

行为：
- 任何地方调用 `startRun()` 自动打开面板
- 运行中可最小化，完成后可关闭
- 与 Rust 通过 Tauri event `ai-stream` / `ai-progress` 通信

### AiSelector 组件

复用组件，嵌入 TestGenPage 和 ActivityTrackerPage：

- 下拉列出所有 enabled 的 provider
- 默认选中 `ai_default_provider`，可临时切换
- API provider 显示模型下拉

### 设置页

SettingsPage 新增 "AI 设置" 区域：

- 默认 AI 选择器
- Provider 列表（可展开编辑每个 provider 的配置）

### React Query hooks (`src/lib/query/aiQueries.ts`)

- `useAiProviders()` — 获取配置
- `useDefaultAiProvider()` — 获取默认
- `useUpdateAiConfig()` — 更新配置

## 与现有代码的集成

### TestGen 改造

- `services/testgen/cli.rs` 删除 CLI 调用，改调 AI 模块
- `commands/testgen.rs` 的 `run_test_gen` 内部调 `call_ai`
- `TestGenPage.tsx` 工具栏加 `AiSelector`

### Activity 报告改造

- `services/activity/summarizer.rs` 删除 CLI/API 调用，改调 AI 模块
- `commands/activity_tracker.rs` 的 `generate_report` 内部调 `call_ai`
- `ActivityTrackerPage.tsx` 简化为 AiSelector + 模型选择

### 数据迁移

首次加载时，检测旧 `ai_summary_*` 设置，自动迁移到 `ai_providers_config`。

## 跨平台

- CLI provider：命令在各平台 PATH 中查找，支持设置页自定义路径
- API provider：纯 HTTP，全平台一致
- Tauri event：Tauri 2 全平台支持

## 实现顺序

1. Rust `services/ai/` 模块（trait + types + 4 providers + registry）
2. Rust `commands/ai.rs`（Tauri 命令）
3. 前端 `AiContext.tsx`（全局面板）
4. 前端 `AiSelector` 组件 + `aiQueries.ts`
5. 设置页 AI 管理区域
6. TestGen 改造接入
7. Activity Reporter 改造接入
8. 数据迁移逻辑
