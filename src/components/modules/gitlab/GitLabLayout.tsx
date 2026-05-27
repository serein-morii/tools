import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { GitBranch, BarChart3, History, Settings } from "lucide-react";

export function GitLabLayout() {
  const { t } = useTranslation();

  const tabs = [
    { to: "/gitlab/overview", label: t("gitlab.overview", "概览"), icon: BarChart3 },
    { to: "/gitlab/history", label: t("gitlab.history", "历史"), icon: History },
    { to: "/gitlab/settings", label: t("gitlab.settings", "配置"), icon: Settings },
  ];

  return (
    <div className="min-h-full bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm">
        <div className="px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-md">
              <GitBranch className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{t("gitlab.title", "GitLab 代码扫描")}</h1>
              <p className="text-sm text-muted-foreground">{t("gitlab.description", "扫描代码提交，检测单测覆盖情况")}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <nav className="flex gap-1 px-6 pb-3">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )
              }
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="animate-in">
        <Outlet />
      </div>
    </div>
  );
}
