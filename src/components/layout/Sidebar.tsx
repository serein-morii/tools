import { NavLink } from "react-router-dom";
import { Bell, Settings, ChevronLeft, ChevronRight, Home, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useState } from "react";

const primaryItems = [
  { to: "/", icon: Home, labelKey: "nav.home", match: "/" },
  { to: "/gitlab", icon: GitBranch, labelKey: "nav.gitlab", match: "/gitlab" },
  { to: "/reminder/tasks", icon: Bell, labelKey: "nav.reminder", match: "/reminder" },
];

const settingsItem = { to: "/settings", icon: Settings, labelKey: "nav.settings", match: "/settings" };

export function Sidebar() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r bg-card/50 backdrop-blur-sm transition-all duration-300",
        collapsed ? "w-[64px]" : "w-[200px]"
      )}
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b px-3">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <img
              src="/app-icon.png"
              alt="Dev Tools"
              className="h-8 w-8 rounded-lg shadow-sm"
            />
            <span className="text-sm font-semibold text-foreground">Dev Tools</span>
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
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
            collapsed && "absolute right-2"
          )}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {primaryItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
                collapsed && "justify-center px-2"
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{t(item.labelKey)}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Settings at bottom */}
      <div className="border-t p-2">
        <NavLink
          to={settingsItem.to}
          className={({ isActive }) =>
            cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
              collapsed && "justify-center px-2"
            )
          }
        >
          <settingsItem.icon className="h-5 w-5 shrink-0" />
          {!collapsed && <span>{t(settingsItem.labelKey)}</span>}
        </NavLink>
      </div>
    </aside>
  );
}