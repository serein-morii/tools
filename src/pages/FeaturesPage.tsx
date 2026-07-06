import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Bell, GitBranch, FileCode, Brain, Database, Settings, Home,
  Calendar, Clock, Radio, History, BarChart3,
  Zap, CheckCircle2, Code2, GitCommit, User, Users,
  Rocket, Layers, Bot, Sparkles, Play, Pause, Trash2, RotateCcw,
  Eye, Globe, Terminal, Cpu,
  Webhook, Send, Target, FileText,
  Timer, Shield, Key, Lock, ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function FeaturesPage() {
  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight">功能介绍</h1>
            <p className="text-xs text-muted-foreground">Dev Tools 完整功能文档</p>
          </div>
        </div>
      </div>

      <div className="section-spacing animate-in fade-in duration-200 space-y-6">

        {/* 概述卡片 */}
        <Card className="border-2 border-primary/20">
          <CardContent className="p-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                  <Rocket className="h-5 w-5 text-primary" />
                  Dev Tools
                  <Badge variant="outline" className="ml-2">v0.2.3</Badge>
                </h2>
                <p className="text-muted-foreground mb-4 leading-relaxed">
                  开发者桌面效率工具箱，集成代码质量监控、GitLab扫描、定时提醒、DTS任务管理等核心功能。
                  基于 Tauri + React 构建，轻量高效，支持多平台运行。
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem icon={Globe} label="跨平台" value="Win/Mac/Linux" />
                  <InfoItem icon={Cpu} label="框架" value="Tauri 2.x" />
                  <InfoItem icon={Lock} label="数据" value="本地存储" />
                  <InfoItem icon={Zap} label="体积" value="~20MB" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ModuleBadge icon={Home} label="概览面板" color="bg-primary/10 text-primary" />
                <ModuleBadge icon={GitBranch} label="GitLab扫描" color="bg-orange-500/10 text-orange-600" />
                <ModuleBadge icon={FileCode} label="Sonar覆盖率" color="bg-emerald-500/10 text-emerald-600" />
                <ModuleBadge icon={Brain} label="AI覆盖率" color="bg-indigo-500/10 text-indigo-600" />
                <ModuleBadge icon={Database} label="DTS管理" color="bg-violet-500/10 text-violet-600" />
                <ModuleBadge icon={Bell} label="智能提醒" color="bg-amber-500/10 text-amber-600" />
                <ModuleBadge icon={Radio} label="通知渠道" color="bg-blue-500/10 text-blue-600" />
                <ModuleBadge icon={Settings} label="系统设置" color="bg-slate-500/10 text-slate-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 功能模块网格 */}
        <div className="grid md:grid-cols-2 gap-4">

          {/* GitLab代码扫描 */}
          <FeatureCard
            icon={GitBranch}
            title="GitLab 代码扫描"
            color="text-orange-500"
            bg="bg-orange-500/10"
            version="核心模块"
          >
            <FeatureList items={[
              { icon: Calendar, text: "按时间范围扫描代码提交" },
              { icon: Code2, text: "识别无单测覆盖的项目" },
              { icon: BarChart3, text: "增量/全量覆盖率统计" },
              { icon: User, text: "贡献者提交排名" },
              { icon: Globe, text: "Walkin代码质量对接" },
              { icon: Timer, text: "定时自动扫描" },
              { icon: Bell, text: "扫描完成通知推送" },
            ]} />
          </FeatureCard>

          {/* Sonar单测覆盖率 */}
          <FeatureCard
            icon={FileCode}
            title="Sonar 单测覆盖率"
            color="text-emerald-500"
            bg="bg-emerald-500/10"
            version="核心模块"
          >
            <FeatureList items={[
              { icon: Globe, text: "SonarQube API对接" },
              { icon: GitBranch, text: "按项目+分支精准定位" },
              { icon: Target, text: "行覆盖 + 条件覆盖" },
              { icon: Bot, text: "生成AI单测Prompt" },
              { icon: FileText, text: "多种Prompt模板" },
              { icon: ClipboardList, text: "一键复制到剪贴板" },
              { icon: History, text: "查询历史记录" },
            ]} />
          </FeatureCard>

          {/* AI覆盖率统计 */}
          <FeatureCard
            icon={Brain}
            title="AI 覆盖率统计"
            color="text-indigo-500"
            bg="bg-indigo-500/10"
            version="git-ai"
          >
            <FeatureList items={[
              { icon: Bot, text: "git-ai AI代码统计" },
              { icon: BarChart3, text: "整体AI生成率趋势" },
              { icon: Users, text: "按部门/作者维度" },
              { icon: GitCommit, text: "单次提交AI占比" },
              { icon: Code2, text: "测试/非测试分开统计" },
              { icon: Eye, text: "单文件AI详情" },
              { icon: Calendar, text: "自定义时间范围" },
            ]} />
          </FeatureCard>

          {/* DTS任务管理 */}
          <FeatureCard
            icon={Database}
            title="DTS 任务管理"
            color="text-violet-500"
            bg="bg-violet-500/10"
            version="运维工具"
          >
            <FeatureList items={[
              { icon: Play, text: "批量启动任务" },
              { icon: Pause, text: "批量停止任务" },
              { icon: Trash2, text: "批量删除任务" },
              { icon: RotateCcw, text: "批量创建回刷" },
              { icon: Timer, text: "回刷进度追踪" },
              { icon: Globe, text: "5套环境配置" },
              { icon: Key, text: "Token自动获取" },
            ]} />
          </FeatureCard>

          {/* 智能提醒 */}
          <FeatureCard
            icon={Bell}
            title="智能提醒"
            color="text-amber-500"
            bg="bg-amber-500/10"
            version="效率工具"
          >
            <FeatureList items={[
              { icon: Calendar, text: "可视化Cron编辑" },
              { icon: FileText, text: "消息模板复用" },
              { icon: Radio, text: "多渠道通知" },
              { icon: CheckCircle2, text: "简单/确认/反馈模式" },
              { icon: Clock, text: "下次执行预览" },
              { icon: Zap, text: "工作日/周末筛选" },
              { icon: History, text: "执行历史追踪" },
            ]} />
          </FeatureCard>

          {/* 通知渠道 */}
          <FeatureCard
            icon={Radio}
            title="通知渠道"
            color="text-blue-500"
            bg="bg-blue-500/10"
            version="推送服务"
          >
            <div className="grid grid-cols-2 gap-2 mb-3">
              <ChannelBadge name="飞书" />
              <ChannelBadge name="企业微信" />
              <ChannelBadge name="钉钉" />
              <ChannelBadge name="Bark" />
            </div>
            <FeatureList items={[
              { icon: Webhook, text: "群机器人Webhook" },
              { icon: Shield, text: "签名验证支持" },
              { icon: Send, text: "连接测试" },
              { icon: Lock, text: "Token加密存储" },
            ]} />
          </FeatureCard>

        </div>

        {/* 技术架构 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4" />
              技术架构
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <TechCard title="前端" items={["React 19", "TypeScript", "Vite 6", "TailwindCSS"]} />
              <TechCard title="桌面" items={["Tauri 2.x", "Rust", "WebView", "系统托盘"]} />
              <TechCard title="组件" items={["Radix UI", "Lucide", "Sonner", "React Query"]} />
              <TechCard title="存储" items={["SQLite", "JSON", "Zustand", "i18next"]} />
            </div>
          </CardContent>
        </Card>

        {/* 快捷键 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              快捷键
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <ShortcutItem keys="Ctrl+N" desc="新建提醒任务" />
              <ShortcutItem keys="Ctrl+S" desc="触发GitLab扫描" />
              <ShortcutItem keys="Ctrl+D" desc="打开概览页" />
              <ShortcutItem keys="Ctrl+," desc="打开设置页" />
              <ShortcutItem keys="Ctrl+Q" desc="退出应用" />
              <ShortcutItem keys="Ctrl+R" desc="刷新当前页" />
            </div>
          </CardContent>
        </Card>

        {/* 版本信息 */}
        <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground py-4">
          <span className="flex items-center gap-1"><Rocket className="h-3 w-3" />v0.2.3</span>
          <span className="flex items-center gap-1"><Globe className="h-3 w-3" />多平台支持</span>
          <span className="flex items-center gap-1"><User className="h-3 w-3" />by Pedro</span>
          <span>MIT License</span>
        </div>

      </div>
    </div>
  );
}

// 信息项
function InfoItem({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}

// 模块徽章
function ModuleBadge({ icon: Icon, label, color }: { icon: React.ComponentType<{ className?: string }>; label: string; color: string }) {
  return (
    <div className={cn("flex items-center gap-2 p-2 rounded-lg", color)}>
      <Icon className="h-4 w-4" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

// 功能卡片
function FeatureCard({
  icon: Icon,
  title,
  color,
  bg,
  version,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  color: string;
  bg: string;
  version?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", bg)}>
            <Icon className={cn("h-4 w-4", color)} />
          </div>
          <CardTitle className="text-sm">{title}</CardTitle>
          {version && (
            <Badge variant="outline" className="text-xs ml-auto">{version}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pb-3">{children}</CardContent>
    </Card>
  );
}

// 功能列表
function FeatureList({ items }: { items: Array<{ icon: React.ComponentType<{ className?: string }>; text: string }> }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, idx) => (
        <li key={idx} className="flex items-center gap-2 text-sm">
          <item.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

// 渠道徽章
function ChannelBadge({ name }: { name: string }) {
  return (
    <div className="px-2 py-1 rounded bg-muted/50 text-xs font-medium text-center">
      {name}
    </div>
  );
}

// 技术卡片
function TechCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="p-3 rounded-lg bg-muted/30">
      <div className="text-xs font-medium mb-2">{title}</div>
      <div className="flex flex-wrap gap-1">
        {items.map((item, idx) => (
          <span key={idx} className="px-1.5 py-0.5 rounded text-xs bg-background">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

// 快捷键项
function ShortcutItem({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
      <kbd className="px-2 py-1 rounded bg-background text-xs font-mono">{keys}</kbd>
      <span className="text-xs text-muted-foreground">{desc}</span>
    </div>
  );
}

export default FeaturesPage;