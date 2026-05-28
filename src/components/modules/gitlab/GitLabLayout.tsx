import { useCallback } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { GitBranch, BarChart3, History, Settings } from "lucide-react";
import { useGitLabConfig, useSaveGitLabConfig } from "@/lib/query/gitlabQueries";
import { WalkinAuthProvider } from "@/components/modules/gitlab/WalkinAuthManager";

export function GitLabLayout() {
  const { t } = useTranslation();
  const { data: config, refetch } = useGitLabConfig();
  const saveConfig = useSaveGitLabConfig();

  const handleWalkinAuthUpdate = useCallback((tokens: { csrf_token: string; project: string; workspace: string; x_auth_token: string }) => {
    if (config) {
      const updatedConfig = {
        ...config,
        walkin_csrf_token: tokens.csrf_token,
        walkin_project_header: tokens.project,
        walkin_workspace_name: tokens.workspace,
        walkin_x_auth_token: tokens.x_auth_token,
      };
      saveConfig.mutateAsync(updatedConfig).then(() => {
        refetch();
      });
    }
  }, [config, saveConfig, refetch]);

  const tabs = [
    { to: "/gitlab/overview", label: t("gitlab.overviewLabel", "概览"), icon: BarChart3 },
    { to: "/gitlab/history", label: t("gitlab.historyLabel", "历史"), icon: History },
    { to: "/gitlab/settings", label: t("gitlab.settingsLabel", "配置"), icon: Settings },
  ];

  return (
    <WalkinAuthProvider config={config || null} onAuthUpdate={handleWalkinAuthUpdate}>
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

          {/* Tabs - pill style like cc-switch AppSwitcher */}
          <nav className="flex gap-1 px-6 pb-3">
            <div className="inline-flex gap-1 rounded-xl bg-muted p-1">
              {tabs.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                    )
                  }
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>

        {/* Content */}
        <div className="animate-in">
          <Outlet />
        </div>
      </div>
    </WalkinAuthProvider>
  );
}
