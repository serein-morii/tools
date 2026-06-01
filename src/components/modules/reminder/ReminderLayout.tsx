import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { Bell, FileText, Radio, History, Settings } from "lucide-react";

export function ReminderLayout() {
  const { t } = useTranslation();

  const tabs = [
    { to: "/reminder/tasks", label: t("nav.tasks"), icon: Bell },
    { to: "/reminder/templates", label: t("nav.templates"), icon: FileText },
    { to: "/reminder/channels", label: t("nav.channels"), icon: Radio },
    { to: "/reminder/history", label: t("nav.history"), icon: History },
    { to: "/reminder/settings", label: "配置", icon: Settings },
  ];

  return (
    <div className="min-h-full bg-background">
      <div className="border-b px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
              <Bell className="h-3.5 w-3.5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-medium">{t("reminder.title")}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{t("reminder.description")}</p>
            </div>
          </div>
          <div className="inline-flex gap-1 rounded-lg bg-muted p-0.5">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                    isActive
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )
                }
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </NavLink>
            ))}
          </div>
        </div>
      </div>

      <div className="animate-in">
        <Outlet />
      </div>
    </div>
  );
}
