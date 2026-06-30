import { NavLink } from "react-router-dom";
import { Settings, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useSettings, useUpdateSetting, getSettingValue } from "@/lib/query/settingsQueries";
import { getVisibleModules } from "@/config/modules";

export function Sidebar() {
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  const updateSetting = useUpdateSetting();
  const [collapsed, setCollapsed] = useState(
    settings ? getSettingValue(settings, "sidebar_collapsed", "false") === "true" : false
  );

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    updateSetting.mutate({ key: "sidebar_collapsed", value: next ? "true" : "false" });
  };

  const visibleModules = getVisibleModules(settings).filter((m) => m.id !== "settings");

  const raw = getSettingValue(settings, "menu_order", "");
  const menuOrder: string[] = raw ? JSON.parse(raw) : [];

  const sortedModules = [...visibleModules].sort((a, b) => {
    if (a.id === "home") return -1;
    if (b.id === "home") return 1;
    const ai = menuOrder.indexOf(a.id);
    const bi = menuOrder.indexOf(b.id);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r bg-card/50 backdrop-blur-sm transition-all duration-300 ease-out",
        collapsed ? "w-14" : "w-[200px]"
      )}
    >
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b px-3">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <img
              src="/app-icon.png"
              alt="Dev Tools"
              className="h-7 w-7 rounded-lg shadow-sm ring-1 ring-border/50"
            />
            <span className="text-sm font-semibold tracking-tight">Dev Tools</span>
          </div>
        )}
        {collapsed && (
          <img
            src="/app-icon.png"
            alt="Dev Tools"
            className="h-8 w-8 rounded-lg shadow-sm ring-1 ring-border/50 mx-auto"
          />
        )}
        <button
          onClick={toggleCollapse}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-150",
            collapsed && "absolute right-2"
          )}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {sortedModules.map((mod) => {
          const customLabel = getSettingValue(settings, `menu_label_${mod.id}`, "");
          const label = customLabel || t(mod.labelKey);
          return (
            <NavLink
              key={mod.id}
              to={mod.path}
              end={mod.path === "/home"}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  collapsed && "justify-center px-2"
                )
              }
            >
              <mod.icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="truncate" title={label}>{label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Settings at bottom */}
      <div className="border-t p-2">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-150",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
              collapsed && "justify-center px-2"
            )
          }
        >
          <Settings className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span>{t("nav.settings")}</span>}
        </NavLink>
      </div>
    </aside>
  );
}
