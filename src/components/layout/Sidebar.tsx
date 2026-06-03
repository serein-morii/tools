import { NavLink } from "react-router-dom";
import { Bell, Settings, ChevronLeft, ChevronRight, Home, GitBranch, FileCode, Brain, Timer, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { useSettings, useUpdateSetting, getSettingValue } from "@/lib/query/settingsQueries";

const primaryItems = [
  { to: "/home", icon: Home, labelKey: "nav.home", match: "/home", settingKey: null },
  { to: "/gitlab", icon: GitBranch, labelKey: "nav.gitlab", match: "/gitlab", settingKey: "page_gitlab_visible" },
  { to: "/sonar", icon: FileCode, labelKey: "nav.sonar", match: "/sonar", settingKey: "page_sonar_visible" },
  { to: "/ai-coverage", icon: Brain, labelKey: "nav.aiCoverage", match: "/ai-coverage", settingKey: "page_ai_coverage_visible" },
  { to: "/reminder/tasks", icon: Bell, labelKey: "nav.reminder", match: "/reminder", settingKey: "page_reminder_visible" },
  { to: "/timer", icon: Timer, labelKey: "nav.timer", match: "/timer", settingKey: "page_timer_visible" },
  { to: "/notes", icon: StickyNote, labelKey: "nav.notes", match: "/notes", settingKey: "page_notes_visible" },
];

export function Sidebar() {
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  const updateSetting = useUpdateSetting();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = getSettingValue(settings, "sidebar_collapsed", "false");
    if (saved === "true") setCollapsed(true);
  }, [settings]);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    updateSetting.mutate({ key: "sidebar_collapsed", value: next ? "true" : "false" });
  };

  const raw = getSettingValue(settings, "menu_order", "");
  const menuOrder: string[] = raw ? JSON.parse(raw) : [];

  const filtered = primaryItems.filter(item => {
    if (!item.settingKey) return true;
    return getSettingValue(settings, item.settingKey, "true") === "true";
  });

  const visibleItems = [...filtered].sort((a, b) => {
    if (a.to === "/home") return -1;
    if (b.to === "/home") return 1;
    const aId = a.to.replace("/", "").replace("/tasks", "");
    const bId = b.to.replace("/", "").replace("/tasks", "");
    const ai = menuOrder.indexOf(aId); const bi = menuOrder.indexOf(bId);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r bg-card/50 backdrop-blur-sm transition-all duration-300",
        collapsed ? "w-[52px]" : "w-[180px]"
      )}
    >
      {/* Header */}
      <div className="flex h-11 items-center justify-between border-b px-2.5">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <img
              src="/app-icon.png"
              alt="Dev Tools"
              className="h-7 w-7 rounded-md shadow-sm"
            />
            <span className="text-xs font-semibold text-foreground">Dev Tools</span>
          </div>
        )}
        {collapsed && (
          <img
            src="/app-icon.png"
            alt="Dev Tools"
            className="h-8 w-8 rounded-lg shadow-sm mx-auto"
          />
        )}
        <button
          onClick={toggleCollapse}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
            collapsed && "absolute right-2"
          )}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-0.5 p-1.5">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-200",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
                collapsed && "justify-center px-2"
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{t(item.labelKey)}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Settings at bottom */}
      <div className="border-t p-1.5">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              "group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-200",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
              collapsed && "justify-center px-2"
            )
          }
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{t("nav.settings")}</span>}
        </NavLink>
      </div>
    </aside>
  );
}
