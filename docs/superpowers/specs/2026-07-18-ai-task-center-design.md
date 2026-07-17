# AI Task Center 改造设计文档

## 概述

将当前的单任务 AiContext 全局面板改造为右下角 **AI 任务中心**，支持多任务并发执行。TestGen 单测执行和 Activity 日报周报月报都走这个任务中心，用户可在页面上显眼位置选择 AI provider，执行过程统一在右下角管理。

## 架构

```
前端 (React)
  ├── AiTaskCenter.tsx         全局任务中心 Context + 三层 UI
  │   ├── FloatingButton        右下角浮动按钮 + 运行数角标
  │   ├── TaskListPanel         点击展开的任务列表面板
  │   └── TaskDetailModal       点击某个任务展开的详情弹窗
  │
  ├── AiSelector                 复用组件（已有，需确认位置显眼）
  │   ├── TestGenPage 工具栏      放执行按钮旁边
  │   └── ActivityTrackerPage    放"生成报告"按钮旁边
  │
  ├── TestGenContext            保留（管理分支/提交/push 等非 AI 逻辑）
  │   └── 调 useAiTaskCenter().startTask() 启动 AI 任务
  │
  └── ActivityTrackerPage       移除自己的 ReportGenModal
      └── 调 useAiTaskCenter().startTask() 启动 AI 任务

后端 (Rust)
  └── commands/ai.rs             事件带上 task_id 区分任务
      └── AiStreamPayload { task_id, AiEvent }
```

## AiTaskCenter 三层 UI

### 1. FloatingButton（右下角浮动按钮）

- 始终可见（z-50, fixed bottom-4 right-4）
- 运行中任务数角标：`🤖 AI (2)`
- 无任务时灰色，有运行中任务时呼吸动画
- 点击展开 TaskListPanel

### 2. TaskListPanel（任务列表面板）

- 从右下角弹出，宽约 360px，高约 400px
- 任务列表，每条显��：
  - 任务类型图标/标签（单测执行 / 日报生成 / 周报生成 / 月报生成）
  - AI provider 名称
  - 状态指示（运行中 spinner / 完成 ✓ / 失败 ✗）
  - 点击进入 TaskDetailModal
- 已完成任务可清除（X 按钮）
- 面板外置"全部清除"按钮

### 3. TaskDetailModal（任务详情弹窗）

- 居中 Modal，620px 宽，类似当前 AiPanel
- 标题栏：任务类型 | provider 名 | 状态
- 内容区：日志流 [stage] text + 流式文字（打字机效果）
- 运行中可最小化到任务列表
- 完成后可关闭

## 数据模型

```typescript
interface AiTask {
  id: string;
  type: "testgen" | "daily_report" | "weekly_report" | "monthly_report";
  providerId: string;
  providerName: string;
  status: "running" | "done" | "error";
  logs: AiLog[];
  streamText: string;
  thinkingTokens: number | null;
  result: AiResponse | null;
  error: string | null;
  createdAt: number;
}

interface AiTaskCenterValue {
  tasks: AiTask[];
  panelOpen: boolean; setPanelOpen: (v: boolean) => void;
  detailTaskId: string | null; openDetail: (id: string) => void; closeDetail: () => void;
  startTask(req: AiTaskRequest): string;  // 返回 taskId
  removeTask(id: string): void;
  clearDone(): void;
}
```

## 事件路由

Rust `call_ai` 接收 `task_id`，所有事件带上 `task_id`：

```rust
struct AiStreamPayload {
    task_id: String,
    kind: String,  // progress / thinking / text / done
    stage: Option<String>,
    message: Option<String>,
    tokens: Option<i64>,
    text: Option<String>,
}
```

前端 `AiTaskCenter` 监听 `ai-stream`，根据 `task_id` 更新对应任务：

- `progress` → appendLog
- `thinking` → 更新 thinkingTokens
- `text` → 追加 streamText
- `done` → 标记完成

## AiSelector 位置

**TestGenPage**：AiSelector 直接放在"执行"按钮旁边，工具栏显眼位置。移除原来藏在 `<details>` 里的旧版本。

**ActivityTrackerPage**：AiSelector 直接放在"生成报告"按钮旁边。移除原来藏在"设置"Tab 里的旧版本，移除独立的 ReportGenModal。

## 与现有代码的关系

| 组件 | 处理方式 |
|------|----------|
| `AiContext.tsx` | 重写为 `AiTaskCenter.tsx`，删掉旧文件 |
| `AiSelector.tsx` | 保留，不变 |
| `TestGenContext.tsx` | 保留（分支/提交/push/QA 逻辑），内部改调 `useAiTaskCenter()` |
| `ActivityTrackerPage` 的 `ReportGenModal` | 删除，改调 `useAiTaskCenter()` |
| `commands/ai.rs` | 加 `task_id` 参数 + `AiStreamPayload` |
| `App.tsx` | `AiProvider` 替换为 `AiTaskCenterProvider` |

## 实现顺序

1. Rust 后端：`call_ai` 加 `task_id` 参数
2. 前端：`AiTaskCenter.tsx` 替换 `AiContext.tsx`
3. 前端：`App.tsx` 换 Provider
4. 前端：TestGenPage 接入 + AiSelector 提到显眼位置
5. 前端：ActivityTrackerPage 接入 + AiSelector 提到显眼位置 + 删除 ReportGenModal
6. 验证：多任务并发 + cargo check + tsc + build
