# Tools 工具箱 - 基础设施实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 初始化 Tauri v2 + React 19 项目，搭建可扩展的模块化架构基础。

**Architecture:** 参考 cc-switch 架构，采用侧边栏 + 内容区布局，React Router hash 模式路由，TanStack Query 数据管理，Radix UI + Tailwind 组件库。

**Tech Stack:** Tauri v2, React 19, TypeScript, Vite, Tailwind CSS, Radix UI, TanStack Query, React Router, Zustand

---

## 文件结构规划

```
tools/
├── src/
│   ├── App.tsx                 # 主应用入口
│   ├── main.tsx                # React 挂载点
│   ├── index.css               # 全局样式 + Tailwind
│   ├── vite-env.d.ts           # Vite 类型声明
│   ├── components/
│   │   ├── ui/                 # Radix UI 基础组件
│   │   │   ├── button.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── toast.tsx
│   │   │   └── sonner.tsx
│   │   └── layout/
│   │       ├── Sidebar.tsx     # 侧边栏
│   │       ├── NavItem.tsx     # 导航项
│   │       └── MainLayout.tsx  # 主布局
│   ├── lib/
│   │   ├── utils.ts            # cn() 等工具函数
│   │   ├── platform.ts         # 平台检测
│   │   └── api/
│   │       └── index.ts        # call<T> 封装
│   ├── hooks/
│   │   └── useModule.ts        # 模块状态 hook
│   ├── types/
│   │   └── index.ts            # 全局类型
│   ├── config/
│   │   ├── modules.ts          # 模块注册配置
│   │   └── constants.ts        # 常量定义
│   └── pages/
│       ├── reminder/
│       │   └── PlaceholderPage.tsx
│       ├── timer/
│       │   └── PlaceholderPage.tsx
│       ├── notes/
│       │   └── PlaceholderPage.tsx
│       └── settings/
│           └── PlaceholderPage.tsx
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs              # Tauri 入口
│   │   ├── main.rs             # 主程序
│   │   ├── error.rs            # 错误定义
│   │   └── config.rs           # 配置管理
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── capabilities/
│   │   └── default.json
│   └── icons/
├── package.json
├── vite.config.ts
├── tailwind.config.cjs
├── postcss.config.cjs
├── tsconfig.json
└── tsconfig.node.json
```

---

## Task 1: 初始化前端项目

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `postcss.config.cjs`
- Create: `tailwind.config.cjs`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/index.css`
- Create: `src/vite-env.d.ts`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "tools",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.4",
    "@radix-ui/react-label": "^2.1.1",
    "@radix-ui/react-tabs": "^1.1.2",
    "@radix-ui/react-slot": "^1.1.1",
    "@radix-ui/react-toast": "^1.2.4",
    "@tanstack/react-query": "^5.62.0",
    "@tauri-apps/api": "^2.2.0",
    "@tauri-apps/plugin-shell": "^2.2.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.468.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.1.1",
    "sonner": "^1.7.1",
    "tailwind-merge": "^2.6.0",
    "zustand": "^5.0.2"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.2.0",
    "@types/node": "^22.10.2",
    "@types/react": "^19.0.1",
    "@types/react-dom": "^19.0.2",
    "@vitejs/plugin-react-swc": "^3.7.2",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "tailwindcss-animate": "^1.0.7",
    "typescript": "^5.7.2",
    "vite": "^6.0.5"
  }
}
```

- [ ] **Step 2: 创建 vite.config.ts**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Tauri 要求的配置
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
```

- [ ] **Step 3: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: 创建 tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: 创建 postcss.config.cjs**

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 6: 创建 tailwind.config.cjs**

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
```

- [ ] **Step 7: 创建 src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 48%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}

/* macOS 标题栏拖拽区域 */
.drag-region {
  -webkit-app-region: drag;
}
.no-drag {
  -webkit-app-region: no-drag;
}
```

- [ ] **Step 8: 创建 src/vite-env.d.ts**

```typescript
/// <reference types="vite/client" />
```

- [ ] **Step 9: 创建 src/main.tsx**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 分钟
      retry: 1,
    },
  },
});

// 平台检测，添加 body class
const ua = navigator.userAgent || "";
const isMac = /Mac|iPod|iPhone|iPad/i.test(ua);
if (isMac) {
  document.body.classList.add("is-mac");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <App />
        <Toaster position="top-center" richColors />
      </HashRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
```

- [ ] **Step 10: 创建 src/App.tsx (基础版本)**

```tsx
import { Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import ReminderPage from "@/pages/reminders/PlaceholderPage";
import TimerPage from "@/pages/timer/PlaceholderPage";
import NotesPage from "@/pages/notes/PlaceholderPage";
import SettingsPage from "@/pages/settings/PlaceholderPage";

function App() {
  return (
    <MainLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/reminder" replace />} />
        <Route path="/reminder/*" element={<ReminderPage />} />
        <Route path="/timer" element={<TimerPage />} />
        <Route path="/notes" element={<NotesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </MainLayout>
  );
}

export default App;
```

- [ ] **Step 11: 安装依赖**

Run: `cd /Users/xp/WebstormProjects/tools && npm install`

Expected: 依赖安装成功

- [ ] **Step 12: Commit**

```bash
git add package.json vite.config.ts tsconfig.json tsconfig.node.json postcss.config.cjs tailwind.config.cjs src/
git commit -m "feat: 初始化前端项目

- 配置 Vite + React 19 + TypeScript
- 配置 Tailwind CSS + Radix UI 变量
- 配置 React Router (hash 模式)
- 配置 TanStack Query
- 创建基础目录结构

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: 创建工具函数和类型定义

**Files:**
- Create: `src/lib/utils.ts`
- Create: `src/lib/platform.ts`
- Create: `src/lib/api/index.ts`
- Create: `src/types/index.ts`
- Create: `src/config/constants.ts`

- [ ] **Step 1: 创建 src/lib/utils.ts**

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 合并 Tailwind CSS 类名
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 生成 UUID
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * 格式化时间戳为日期字符串
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * 格式化时间戳为时间字符串
 */
export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 格式化时间戳为日期时间字符串
 */
export function formatDateTime(timestamp: number): string {
  return `${formatDate(timestamp)} ${formatTime(timestamp)}`;
}

/**
 * 相对时间描述
 */
export function relativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = timestamp - now;

  if (diff < 0) {
    return "已过期";
  }

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days > 0) {
    return `${days} 天后`;
  }
  if (hours > 0) {
    return `${hours} 小时后`;
  }
  if (minutes > 0) {
    return `${minutes} 分钟后`;
  }
  return "即将";
}
```

- [ ] **Step 2: 创建 src/lib/platform.ts**

```typescript
const ua = navigator.userAgent || "";

export const isMac = /Mac|iPod|iPhone|iPad/i.test(ua);
export const isWindows = /Windows/i.test(ua);
export const isLinux = /Linux/i.test(ua) && !isMac;

/**
 * 获取平台特定的拖拽区域属性
 * macOS 使用原生标题栏拖拽
 */
export function getDragRegionAttrs() {
  if (isMac) {
    return {
      "data-tauri-drag-region": true,
      className: "drag-region",
    };
  }
  return {};
}

/**
 * 默认拖拽区域高度
 */
export const DEFAULT_DRAG_BAR_HEIGHT = isMac ? 28 : 0;
```

- [ ] **Step 3: 创建 src/lib/api/index.ts**

```typescript
import { invoke } from "@tauri-apps/api/core";

/**
 * 统一的 Tauri invoke 封装
 * 提供类型安全的 API 调用
 */
export async function call<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (error) {
    console.error(`[API Error] ${cmd}:`, error);
    throw error;
  }
}

/**
 * 重新导出 invoke 供特殊场景使用
 */
export { invoke } from "@tauri-apps/api/core";
```

- [ ] **Step 4: 创建 src/types/index.ts**

```typescript
/**
 * 模块配置类型
 */
export interface ModuleConfig {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  enabled: boolean;
  order: number;
}

/**
 * 提醒类型
 */
export type ReminderType = "simple" | "confirm" | "feedback";

/**
 * 任务状态
 */
export type TaskStatus = "active" | "paused" | "completed";

/**
 * 渠道类型
 */
export type ChannelType = "bark" | "feishu" | "wecom" | "dingtalk";

/**
 * 提醒状态
 */
export type ReminderStatus =
  | "pending"
  | "sent"
  | "confirmed"
  | "feedback_done"
  | "failed"
  | "cancelled";

/**
 * 应用设置
 */
export interface AppSettings {
  theme: "light" | "dark" | "system";
  language: "zh" | "en";
  autoLaunch: boolean;
  minimizeToTray: boolean;
  silentStartup: boolean;
  sidebarCollapsed: boolean;
}
```

- [ ] **Step 5: 创建 src/config/constants.ts**

```typescript
/**
 * 应用常量
 */

// 应用名称
export const APP_NAME = "Tools";

// 配置目录名称
export const CONFIG_DIR_NAME = ".tools";

// 数据库文件名
export const DB_FILE_NAME = "tools.db";

// 默认设置
export const DEFAULT_SETTINGS = {
  theme: "system" as const,
  language: "zh" as const,
  autoLaunch: false,
  minimizeToTray: true,
  silentStartup: false,
  sidebarCollapsed: false,
};

// 本地存储键
export const STORAGE_KEYS = {
  THEME: "tools-theme",
  SIDEBAR_COLLAPSED: "tools-sidebar-collapsed",
  LAST_MODULE: "tools-last-module",
} as const;

// 提醒类型显示名称
export const REMINDER_TYPE_LABELS: Record<string, string> = {
  simple: "简单通知",
  confirm: "需要确认",
  feedback: "需要反馈",
};

// 任务状态显示名称
export const TASK_STATUS_LABELS: Record<string, string> = {
  active: "运行中",
  paused: "已暂停",
  completed: "已完成",
};

// 星期显示名称
export const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

// 月份显示名称
export const MONTH_LABELS = [
  "一月", "二月", "三月", "四月", "五月", "六月",
  "七月", "八月", "九月", "十月", "十一月", "十二月",
];
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils.ts src/lib/platform.ts src/lib/api/index.ts src/types/index.ts src/config/constants.ts
git commit -m "feat: 添加工具函数和类型定义

- utils.ts: cn(), 日期格式化, 相对时间
- platform.ts: 平台检测
- api/index.ts: 统一 call<T> 封装
- types/index.ts: 核心类型定义
- constants.ts: 应用常量

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: 创建模块配置

**Files:**
- Create: `src/config/modules.ts`

- [ ] **Step 1: 创建 src/config/modules.ts**

```typescript
import {
  Bell,
  Timer,
  FileText,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { ModuleConfig } from "@/types";

/**
 * 模块注册配置
 * 侧边栏一级导航使用
 */
export const modules: ModuleConfig[] = [
  {
    id: "reminder",
    name: "提醒",
    icon: Bell,
    path: "/reminder",
    enabled: true,
    order: 1,
  },
  {
    id: "timer",
    name: "计时",
    icon: Timer,
    path: "/timer",
    enabled: true,
    order: 2,
  },
  {
    id: "notes",
    name: "笔记",
    icon: FileText,
    path: "/notes",
    enabled: true,
    order: 3,
  },
  {
    id: "settings",
    name: "设置",
    icon: Settings,
    path: "/settings",
    enabled: true,
    order: 99, // 始终在底部
  },
];

/**
 * 获取启用的模块列表
 */
export function getEnabledModules(): ModuleConfig[] {
  return modules
    .filter((m) => m.enabled)
    .sort((a, b) => a.order - b.order);
}

/**
 * 获取主模块（排除设置）
 */
export function getMainModules(): ModuleConfig[] {
  return getEnabledModules().filter((m) => m.id !== "settings");
}

/**
 * 获取设置模块
 */
export function getSettingsModule(): ModuleConfig | undefined {
  return modules.find((m) => m.id === "settings");
}

/**
 * 根据 ID 获取模块
 */
export function getModuleById(id: string): ModuleConfig | undefined {
  return modules.find((m) => m.id === id);
}

/**
 * 根据路径获取模块
 */
export function getModuleByPath(path: string): ModuleConfig | undefined {
  return modules.find((m) => path.startsWith(m.path));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/config/modules.ts
git commit -m "feat: 添加模块注册配置

- 定义提醒/计时/笔记/设置四个模块
- 提供获取模块的辅助函数

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: 创建基础 UI 组件

**Files:**
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/dialog.tsx`
- Create: `src/components/ui/tabs.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/label.tsx`
- Create: `src/components/ui/sonner.tsx`

- [ ] **Step 1: 创建 src/components/ui/button.tsx**

```tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

- [ ] **Step 2: 创建 src/components/ui/dialog.tsx**

```tsx
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">关闭</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
```

- [ ] **Step 3: 创建 src/components/ui/tabs.tsx**

```tsx
import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
```

- [ ] **Step 4: 创建 src/components/ui/input.tsx**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
```

- [ ] **Step 5: 创建 src/components/ui/label.tsx**

```tsx
import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
```

- [ ] **Step 6: 创建 src/components/ui/sonner.tsx**

```tsx
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
```

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/
git commit -m "feat: 创建基础 UI 组件

- Button: 支持 default/outline/ghost 等变体
- Dialog: 基于 Radix UI 的对话框
- Tabs: 基于 Radix UI 的选项卡
- Input: 输入框
- Label: 标签
- Sonner: Toast 通知

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: 创建布局组件

**Files:**
- Create: `src/components/layout/Sidebar.tsx`
- Create: `src/components/layout/NavItem.tsx`
- Create: `src/components/layout/MainLayout.tsx`

- [ ] **Step 1: 创建 src/components/layout/NavItem.tsx**

```tsx
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { ModuleConfig } from "@/types";

interface NavItemProps {
  module: ModuleConfig;
  collapsed: boolean;
  active: boolean;
}

function NavItem({ module, collapsed, active }: NavItemProps) {
  const Icon = module.icon;

  return (
    <NavLink
      to={module.path}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        active && "bg-accent text-accent-foreground",
        collapsed && "justify-center px-2"
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {!collapsed && <span>{module.name}</span>}
    </NavLink>
  );
}

export default NavItem;
```

- [ ] **Step 2: 创建 src/components/layout/Sidebar.tsx**

```tsx
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import NavItem from "./NavItem";
import { getMainModules, getSettingsModule } from "@/config/modules";

interface SidebarProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

function Sidebar({ collapsed, onCollapsedChange }: SidebarProps) {
  const location = useLocation();
  const mainModules = getMainModules();
  const settingsModule = getSettingsModule();

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-muted/30 transition-all duration-300",
        collapsed ? "w-12" : "w-[72px]"
      )}
    >
      {/* 主模块导航 */}
      <nav className="flex-1 space-y-1 p-2">
        {mainModules.map((module) => (
          <NavItem
            key={module.id}
            module={module}
            collapsed={collapsed}
            active={location.pathname.startsWith(module.path)}
          />
        ))}
      </nav>

      {/* 设置模块 */}
      <nav className="border-t p-2">
        {settingsModule && (
          <NavItem
            module={settingsModule}
            collapsed={collapsed}
            active={location.pathname === settingsModule.path}
          />
        )}
      </nav>

      {/* 折叠按钮 */}
      <div className="border-t p-1">
        <Button
          variant="ghost"
          size="icon"
          className="w-full"
          onClick={() => onCollapsedChange(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>
    </aside>
  );
}

export default Sidebar;
```

- [ ] **Step 3: 创建 src/components/layout/MainLayout.tsx**

```tsx
import { useState } from "react";
import { cn } from "@/lib/utils";
import Sidebar from "./Sidebar";

interface MainLayoutProps {
  children: React.ReactNode;
}

function MainLayout({ children }: MainLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

export default MainLayout;
```

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/
git commit -m "feat: 创建布局组件

- Sidebar: 侧边栏，支持折叠
- NavItem: 导航项
- MainLayout: 主布局

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: 创建占位页面

**Files:**
- Create: `src/pages/reminders/PlaceholderPage.tsx`
- Create: `src/pages/timer/PlaceholderPage.tsx`
- Create: `src/pages/notes/PlaceholderPage.tsx`
- Create: `src/pages/settings/PlaceholderPage.tsx`

- [ ] **Step 1: 创建 src/pages/reminders/PlaceholderPage.tsx**

```tsx
import { Bell, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

function PlaceholderPage() {
  return (
    <div className="flex h-full flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          <h1 className="text-lg font-semibold">任务提醒</h1>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          新建任务
        </Button>
      </div>

      {/* 空状态 */}
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>暂无任务</p>
          <p className="text-sm mt-1">点击上方按钮创建第一个提醒任务</p>
        </div>
      </div>
    </div>
  );
}

export default PlaceholderPage;
```

- [ ] **Step 2: 创建 src/pages/timer/PlaceholderPage.tsx**

```tsx
import { Timer } from "lucide-react";

function PlaceholderPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-6 py-4">
        <Timer className="h-5 w-5" />
        <h1 className="text-lg font-semibold">计时器</h1>
      </div>
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <p>计时器功能开发中...</p>
      </div>
    </div>
  );
}

export default PlaceholderPage;
```

- [ ] **Step 3: 创建 src/pages/notes/PlaceholderPage.tsx**

```tsx
import { FileText } from "lucide-react";

function PlaceholderPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-6 py-4">
        <FileText className="h-5 w-5" />
        <h1 className="text-lg font-semibold">笔记</h1>
      </div>
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <p>笔记功能开发中...</p>
      </div>
    </div>
  );
}

export default PlaceholderPage;
```

- [ ] **Step 4: 创建 src/pages/settings/PlaceholderPage.tsx**

```tsx
import { Settings } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

function PlaceholderPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-6 py-4">
        <Settings className="h-5 w-5" />
        <h1 className="text-lg font-semibold">设置</h1>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-6">
          {/* 主题设置 */}
          <div className="space-y-2">
            <Label>主题</Label>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">浅色</Button>
              <Button variant="outline" size="sm">深色</Button>
              <Button variant="outline" size="sm">跟随系统</Button>
            </div>
          </div>

          {/* 开机自启 */}
          <div className="flex items-center justify-between">
            <Label>开机自启动</Label>
            <Button variant="outline" size="sm">启用</Button>
          </div>

          {/* 关闭行为 */}
          <div className="flex items-center justify-between">
            <Label>关闭时最小化到托盘</Label>
            <Button variant="outline" size="sm">启用</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PlaceholderPage;
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/
git commit -m "feat: 创建占位页面

- reminders: 任务提醒占位页
- timer: 计时器占位页
- notes: 笔记占位页
- settings: 设置占位页

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: 初始化 Tauri 后端

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/error.rs`
- Create: `src-tauri/src/config.rs`

- [ ] **Step 1: 创建 src-tauri/Cargo.toml**

```toml
[package]
name = "tools"
version = "0.1.0"
description = "本地工具箱"
authors = ["you"]
edition = "2021"

[lib]
name = "tools_lib"
crate-type = ["staticlib", "cdylib", "rlib"]
doctest = false

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
serde_json = "1.0"
serde = { version = "1.0", features = ["derive"] }
log = "0.4"
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-log = "2"
tauri-plugin-shell = "2"
tauri-plugin-process = "2"
tauri-plugin-opener = "2"
tauri-plugin-store = "2"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "time", "sync"] }
rusqlite = { version = "0.32", features = ["bundled"] }
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4"] }
thiserror = "2"
dirs = "5"
cron = "0.13"

[target.'cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))'.dependencies]
tauri-plugin-single-instance = "2"

[profile.release]
codegen-units = 1
lto = "thin"
opt-level = "s"
panic = "unwind"
strip = "symbols"
```

- [ ] **Step 2: 创建 src-tauri/build.rs**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 3: 创建 src-tauri/tauri.conf.json**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Tools",
  "version": "0.1.0",
  "identifier": "com.tools.desktop",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "Tools",
        "titleBarStyle": "Overlay",
        "width": 1100,
        "height": 700,
        "minWidth": 800,
        "minHeight": 500,
        "visible": false,
        "resizable": true,
        "fullscreen": false,
        "center": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; img-src 'self' data: https: http:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https: http:"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "windows": {
      "wix": {
        "template": "wix/per-user-main.wxs"
      }
    }
  }
}
```

- [ ] **Step 4: 创建 src-tauri/capabilities/default.json**

```json
{
  "$schema": "https://schema.tauri.app/config/2/capability",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "shell:allow-open",
    "shell:allow-execute",
    "process:allow-exit",
    "process:allow-restart",
    "opener:allow-open-url",
    "store:allow-get",
    "store:allow-set",
    "store:allow-save",
    "store:allow-load"
  ]
}
```

- [ ] **Step 5: 创建 src-tauri/src/main.rs**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tools_lib::run()
}
```

- [ ] **Step 6: 创建 src-tauri/src/error.rs**

```rust
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("数据库错误: {0}")]
    Database(String),

    #[error("配置错误: {0}")]
    Config(String),

    #[error("IO 错误: {0}")]
    Io(String),

    #[error("序列化错误: {0}")]
    Serialize(String),

    #[error("未找到: {0}")]
    NotFound(String),

    #[error("验证失败: {0}")]
    Validation(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::Database(e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Serialize(e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
```

- [ ] **Step 7: 创建 src-tauri/src/config.rs**

```rust
use dirs::config_dir;
use std::path::PathBuf;

/// 获取应用配置目录
/// macOS: ~/Library/Application Support/tools
/// Windows: %APPDATA%/tools
/// Linux: ~/.config/tools
pub fn get_app_config_dir() -> PathBuf {
    config_dir()
        .expect("无法获取配置目录")
        .join("tools")
}

/// 获取数据库文件路径
pub fn get_db_path() -> PathBuf {
    get_app_config_dir().join("tools.db")
}

/// 确保配置目录存在
pub fn ensure_config_dir() -> std::io::Result<()> {
    let dir = get_app_config_dir();
    if !dir.exists() {
        std::fs::create_dir_all(&dir)?;
    }
    Ok(())
}
```

- [ ] **Step 8: 创建 src-tauri/src/lib.rs**

```rust
mod config;
mod error;

pub use config::{get_app_config_dir, get_db_path};
pub use error::{AppError, AppResult};

use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind, TimezoneStrategy};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 确保配置目录存在
    if let Err(e) = config::ensure_config_dir() {
        eprintln!("创建配置目录失败: {e}");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::Folder {
                        path: config::get_app_config_dir().join("logs"),
                        file_name: Some("tools".into()),
                    }),
                ])
                .timezone_strategy(TimezoneStrategy::UseLocal)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            // 显示主窗口
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}
```

- [ ] **Step 9: 创建图标目录**

Run: `mkdir -p /Users/xp/WebstormProjects/tools/src-tauri/icons`

- [ ] **Step 10: 创建 wix 目录**

Run: `mkdir -p /Users/xp/WebstormProjects/tools/src-tauri/wix`

- [ ] **Step 11: Commit**

```bash
git add src-tauri/
git commit -m "feat: 初始化 Tauri 后端

- 配置 Cargo.toml 依赖
- 创建 tauri.conf.json 配置
- 创建 capabilities 权限配置
- 实现基础错误处理
- 实现配置目录管理

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: 生成 Tauri 图标

**Files:**
- Create: `src-tauri/icons/32x32.png`
- Create: `src-tauri/icons/128x128.png`
- Create: `src-tauri/icons/128x128@2x.png`
- Create: `src-tauri/icons/icon.icns`
- Create: `src-tauri/icons/icon.ico`

- [ ] **Step 1: 使用 Tauri CLI 生成图标**

Run: `cd /Users/xp/WebstormProjects/tools && npx tauri icon`

Expected: 图标文件生成到 src-tauri/icons/

注意: 如果没有源图标，需要先准备一个 1024x1024 的 PNG 图标，或使用默认图标。

- [ ] **Step 2: Commit**

```bash
git add src-tauri/icons/
git commit -m "feat: 添加 Tauri 应用图标

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: 创建 MSI 打包配置

**Files:**
- Create: `src-tauri/wix/per-user-main.wxs`

- [ ] **Step 1: 创建 src-tauri/wix/per-user-main.wxs**

```xml
<?xml version="1.0" encoding="windows-1252"?>
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <Product
    Id="*"
    Name="Tools"
    UpgradeCode="A1B2C3D4-E5F6-7890-ABCD-EF1234567890"
    Language="1033"
    Codepage="1252"
    Version="$(var.Version)"
    Manufacturer="Tools">
    <Package
      Id="*"
      Keywords="Installer"
      Description="Tools Installer"
      Manufacturer="Tools"
      InstallerVersion="450"
      Languages="1033"
      Compressed="yes"
      InstallScope="perUser"
      InstallPrivileges="limited"/>
    <MajorUpgrade
      DowngradeErrorMessage="A newer version of [ProductName] is already installed. If you are sure you want to downgrade, remove the existing installation via Programs and Features."
      Schedule="afterInstallInitialize"/>
    <Media Id="1" Cabinet="app.cab" EmbedCab="yes"/>
    <Directory Id="TARGETDIR" Name="SourceDir">
      <Directory Id="LocalAppDataFolder">
        <Directory Id="INSTALLFOLDER" Name="Tools"/>
      </Directory>
      <Directory Id="ProgramMenuFolder">
        <Directory Id="ApplicationProgramsFolder" Name="Tools"/>
      </Directory>
    </Directory>
    <DirectoryRef Id="ApplicationProgramsFolder">
      <Component Id="ApplicationShortcut" Guid="B1C2D3E4-F5A6-7890-BCDE-F12345678901">
        <Shortcut
          Id="ApplicationStartMenuShortcut"
          Name="Tools"
          Description="本地工具箱"
          Target="[INSTALLFOLDER]tools.exe"
          WorkingDirectory="INSTALLFOLDER"/>
        <RemoveFolder Id="ApplicationProgramsFolder" On="uninstall"/>
        <RegistryValue
          Root="HKCU"
          Key="Software\Tools"
          Name="installed"
          Type="integer"
          Value="1"
          KeyPath="yes"/>
      </Component>
    </DirectoryRef>
    <Feature Id="MainProgram" Title="Main Program" Level="1">
      <ComponentGroupRef Id="MainProgram"/>
      <ComponentRef Id="ApplicationShortcut"/>
    </Feature>
    <UI>
      <UIRef Id="WixUI_InstallDir"/>
      <Publish Dialog="ExitDialog" Control="Finish" Event="DoAction" Value="LaunchApplication">WIXUI_EXITDIALOGOPTIONALCHECKBOX = 1 and NOT Installed</Publish>
    </UI>
    <Property Id="WIXUI_INSTALLDIR" Value="INSTALLFOLDER"/>
    <Property Id="WIXUI_EXITDIALOGOPTIONALCHECKBOX" Value="1"/>
    <Property Id="WIXUI_EXITDIALOGOPTIONALCHECKBOXTEXT" Value="Launch Tools"/>
    <CustomAction
      Id="LaunchApplication"
      Impersonate="yes"
      FileKey="Path"
      ExeCommand=""
      Return="asyncNoWait"/>
    <InstallExecuteSequence>
      <Custom Action="LaunchApplication" After="InstallFinalize">WIXUI_EXITDIALOGOPTIONALCHECKBOX = 1 and NOT Installed</Custom>
    </InstallExecuteSequence>
  </Product>
</Wix>
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/wix/
git commit -m "feat: 添加 Windows MSI 打包配置

- per-user 安装模式
- 添加开始菜单快捷方式
- 支持安装后自动启动

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 10: 验证项目可运行

**Files:**
- Modify: `src/App.tsx` (修复路由)

- [ ] **Step 1: 修复路由路径**

```tsx
import { Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import ReminderPage from "@/pages/reminders/PlaceholderPage";
import TimerPage from "@/pages/timer/PlaceholderPage";
import NotesPage from "@/pages/notes/PlaceholderPage";
import SettingsPage from "@/pages/settings/PlaceholderPage";

function App() {
  return (
    <MainLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/reminder" replace />} />
        <Route path="/reminder" element={<ReminderPage />} />
        <Route path="/timer" element={<TimerPage />} />
        <Route path="/notes" element={<NotesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </MainLayout>
  );
}

export default App;
```

- [ ] **Step 2: 运行前端开发服务器**

Run: `cd /Users/xp/WebstormProjects/tools && npm run dev`

Expected: Vite 开发服务器在 http://localhost:1420 启动

- [ ] **Step 3: 运行 Tauri 开发模式**

Run: `cd /Users/xp/WebstormProjects/tools && npm run tauri dev`

Expected: Tauri 窗口打开，显示侧边栏和提醒页面

- [ ] **Step 4: 最终 Commit**

```bash
git add -A
git commit -m "feat: 完成基础设施搭建

- 前端: React 19 + Vite + Tailwind CSS
- 后端: Tauri v2 + Rust
- 布局: 侧边栏 + 内容区
- 支持热重载开发

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## 自检清单

**1. Spec 覆盖检查:**
- [x] Tauri v2 + React 19 初始化
- [x] 侧边栏布局
- [x] 模块注册配置
- [x] 基础 UI 组件
- [x] MSI 打包配置

**2. 占位符检查:**
- [x] 无 "TBD" / "TODO"
- [x] 无 "实现类似..." 引用
- [x] 所有代码完整

**3. 类型一致性:**
- [x] ModuleConfig 类型在 types/index.ts 定义
- [x] modules.ts 使用相同类型

---

**Plan complete and saved to `docs/superpowers/plans/2025-05-24-infrastructure.md`.**
