import type { LucideIcon } from "lucide-react";
import {
  Bell, Settings, Home, GitBranch, FileCode, Brain, Database, FolderOpen, Activity, ShieldCheck, FlaskConical,
} from "lucide-react";

export interface ModuleConfig {
  id: string;
  /** Route path (used in NavLink `to`) */
  path: string;
  /** i18n label key */
  labelKey: string;
  label: string;
  icon: LucideIcon;
  description: string;
  /** Settings key to control visibility, null = always visible */
  settingKey: string | null;
  /** Menu category for grouping - defaults by module type */
  category: string;
}

/** Default menu categories - can be customized in settings */
export const DEFAULT_CATEGORIES: { id: string; label: string; labelKey: string }[] = [
  { id: "productivity", label: "效率工具", labelKey: "nav.cat.productivity" },
  { id: "code_quality", label: "代码质量", labelKey: "nav.cat.codeQuality" },
  { id: "ai_tools", label: "AI 工具", labelKey: "nav.cat.aiTools" },
  { id: "reminder", label: "智能提醒", labelKey: "nav.cat.reminder" },
];

/** Default category for each module ID */
export const DEFAULT_MODULE_CATEGORIES: Record<string, string> = {
  home: "", // No category
  features: "",
  reminder: "reminder",
  gitlab: "code_quality",
  sonar: "code_quality",
  "ai-coverage": "ai_tools",
  dts: "productivity",
  organizer: "productivity",
  "activity-tracker": "ai_tools",
  testgen: "code_quality",
  "aes-tool": "productivity",
  settings: "",
};

export const allModules: ModuleConfig[] = [
  {
    id: "home",
    path: "/home",
    labelKey: "nav.home",
    label: "首页",
    icon: Home,
    description: "概览面板",
    settingKey: null,
    category: "",
  },
  {
    id: "gitlab",
    path: "/gitlab",
    labelKey: "nav.gitlab",
    label: "GitLab",
    icon: GitBranch,
    description: "GitLab 代码扫描",
    settingKey: "page_gitlab_visible",
    category: "code_quality",
  },
  {
    id: "sonar",
    path: "/sonar",
    labelKey: "nav.sonar",
    label: "Sonar",
    icon: FileCode,
    description: "Sonar 代码质量",
    settingKey: "page_sonar_visible",
    category: "code_quality",
  },
  {
    id: "ai-coverage",
    path: "/ai-coverage",
    labelKey: "nav.aiCoverage",
    label: "AI 覆盖率",
    icon: Brain,
    description: "AI 覆盖率统计",
    settingKey: "page_ai_coverage_visible",
    category: "ai_tools",
  },
  {
    id: "dts",
    path: "/dts",
    labelKey: "nav.dts",
    label: "DTS 任务",
    icon: Database,
    description: "DTS 任务批量启停 / 全量回刷",
    settingKey: "page_dts_visible",
    category: "productivity",
  },
  {
    id: "organizer",
    path: "/organizer",
    labelKey: "nav.organizer",
    label: "桌面整理",
    icon: FolderOpen,
    description: "一键归类桌面文件到分类文件夹",
    settingKey: "page_organizer_visible",
    category: "productivity",
  },
  {
    id: "activity-tracker",
    path: "/activity-tracker",
    labelKey: "nav.activityTracker",
    label: "AI 活动",
    icon: Activity,
    description: "AI 工具活动追踪与报告",
    settingKey: "page_activity_tracker_visible",
    category: "ai_tools",
  },
  {
    id: "testgen",
    path: "/testgen",
    labelKey: "nav.testgen",
    label: "单测执行",
    icon: FlaskConical,
    description: "AI 自动写单测并提交",
    settingKey: "page_testgen_visible",
    category: "code_quality",
  },
  {
    id: "aes-tool",
    path: "/aes-tool",
    labelKey: "nav.aesTool",
    label: "AES加解密",
    icon: ShieldCheck,
    description: "AES 加解密工具，多密钥管理",
    settingKey: "page_aes_tool_visible",
    category: "productivity",
  },
  {
    id: "reminder",
    path: "/reminder/tasks",
    labelKey: "nav.reminder",
    label: "提醒",
    icon: Bell,
    description: "管理定时任务和提醒",
    settingKey: "page_reminder_visible",
    category: "reminder",
  },
  {
    id: "settings",
    path: "/settings",
    labelKey: "nav.settings",
    label: "设置",
    icon: Settings,
    description: "应用设置和通知渠道配置",
    settingKey: null,
    category: "",
  },
];

export function getModuleById(id: string): ModuleConfig | undefined {
  return allModules.find((m) => m.id === id);
}

export function getModuleByPath(path: string): ModuleConfig | undefined {
  return allModules.find((m) => m.path === path);
}

export function getVisibleModules(
  settings: Array<{ key: string; value: string }> | undefined,
): ModuleConfig[] {
  return allModules.filter((m) => {
    if (!m.settingKey) return true;
    const setting = settings?.find((s) => s.key === m.settingKey);
    return !setting || setting.value === "true";
  });
}
