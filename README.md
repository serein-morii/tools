# Tools

一个跨平台桌面提醒工具，基于 Tauri v2 + React 19 构建。

## 功能特性

### 📋 任务提醒
- 支持多种 Cron 表达式格式（标准、特殊日期、高级）
- 本地时间语义：时间表达式按本地时区解释
- 任务优先级设置（普通、重要、紧急）
- 提醒类型：简单通知、需要确认、需要反馈
- 支持关联模板和多个通知渠道
- 一键测试任务通知

### 📢 通知渠道
- **Bark**: iOS 推送通知
- **飞书**: 群机器人 Webhook
- **企业微信**: 群机器人 Webhook
- **钉钉**: 群机器人 Webhook（支持 @ 指定用户）
- 支持自定义服务器地址
- 一键测试通知发送

### 📝 消息模板
- 可复用的消息模板
- 支持变量替换：`{task_name}`, `{date}`, `{time}`, `{weekday}` 等
- 默认 Cron 设置

### 📊 提醒历史
- 完整的执行记录追踪
- 支持确认完成、提交反馈、稍后提醒
- 状态过滤和搜索

### ⏱️ 专注计时
- 番茄工作法计时器
- 25分钟专注 + 5分钟短休息 + 15分钟长休息
- 自动模式切换
- 音效提示

### 📒 快捷笔记
- 快速记录想法
- 颜色标签分类
- 置顶功能
- 搜索过滤

### 🎛️ 系统设置
- 主题切换（浅色/深色/跟随系统）
- 多语言支持（中文、英文、日语、韩语）
- 开机自启动（可选静默启动）
- 最小化到托盘
- 数据备份与恢复

## 技术栈

- **前端**: React 19 + TypeScript + TailwindCSS + shadcn/ui
- **后端**: Rust + Tauri v2 + SQLite
- **状态管理**: TanStack Query + Zustand
- **国际化**: i18next

## 安装

### 前置要求

- Node.js 18+
- Rust 1.70+
- pnpm/npm/yarn

### 开发环境

```bash
# 克隆项目
git clone https://github.com/pengchenghui/tools.git
cd tools

# 安装依赖
npm install

# 启动开发模式
npm run tauri dev
```

### 构建

```bash
# 构建生产版本
npm run tauri build
```

## 项目结构

```
tools/
├── src/                    # React 前端代码
│   ├── components/         # UI 组件
│   ├── pages/              # 页面组件
│   ├── lib/                # 工具函数和 API
│   ├── i18n/               # 国际化配置
│   └── types/              # TypeScript 类型定义
├── src-tauri/              # Rust 后端代码
│   ├── src/
│   │   ├── commands/       # Tauri 命令
│   │   ├── database/       # SQLite 数据访问层
│   │   ├── services/       # 业务服务
│   │   └── error.rs        # 错误处理
│   └── capabilities/       # Tauri 权限配置
└── package.json
```

## Cron 表达式支持

### 标准格式
- 每天：`0 9 * * *`（每天 9:00）
- 每周：`0 9 * * 1`（每周一 9:00）
- 每月：`0 9 1 * *`（每月 1 日 9:00）
- 每年：`0 9 1 1 *`（每年 1 月 1 日 9:00）

### 特殊日期
- 第 N 个星期几：每月第 3 个周一
- 倒数第 N 天：每月倒数第 3 天
- 最后一个工作日：每月最后一个工作日
- 时间间隔：每 15 分钟

### 结束条件
- 永不结束
- 执行 N 次后结束
- 指定日期后结束

## 许可证

MIT License

## 作者

pengchenghui