import type { LucideIcon } from "lucide-react";
import { Bell, Settings } from "lucide-react";

export interface ModuleConfig {
  id: string;
  path: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const modules: ModuleConfig[] = [
  {
    id: "task-reminder",
    path: "/",
    label: "任务提醒",
    icon: Bell,
    description: "管理定时任务和提醒",
  },
  {
    id: "settings",
    path: "/settings",
    label: "设置",
    icon: Settings,
    description: "应用设置和通知渠道配置",
  },
];

export function getModuleById(id: string): ModuleConfig | undefined {
  return modules.find((m) => m.id === id);
}

export function getModuleByPath(path: string): ModuleConfig | undefined {
  return modules.find((m) => m.path === path);
}