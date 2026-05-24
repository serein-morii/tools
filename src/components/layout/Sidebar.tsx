import { NavLink, useLocation } from "react-router-dom";
import { Bell, Clock3, NotebookText, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const primaryItems = [
  { to: "/reminder/tasks", icon: Bell, labelKey: "nav.reminder", match: "/reminder" },
  { to: "/timer", icon: Clock3, labelKey: "nav.timer", match: "/timer" },
  { to: "/notes", icon: NotebookText, labelKey: "nav.notes", match: "/notes" },
];

const settingsItem = { to: "/settings", icon: Settings, labelKey: "nav.settings", match: "/settings" };

export function Sidebar() {
  const location = useLocation();
  const { t } = useTranslation();

  return (
    <aside className="flex h-screen w-[72px] shrink-0 flex-col border-r bg-card">
      <div className="flex h-16 items-center justify-center border-b">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
          T
        </div>
      </div>

      <nav className="flex flex-1 flex-col items-center gap-2 py-4">
        {primaryItems.map((item) => (
          <ModuleLink key={item.to} item={item} label={t(item.labelKey)} active={location.pathname.startsWith(item.match)} />
        ))}
      </nav>

      <div className="flex justify-center border-t py-4">
        <ModuleLink item={settingsItem} label={t(settingsItem.labelKey)} active={location.pathname.startsWith(settingsItem.match)} />
      </div>
    </aside>
  );
}

function ModuleLink({
  item,
  label,
  active,
}: {
  item: { to: string; icon: typeof Bell; labelKey: string };
  label: string;
  active: boolean;
}) {
  return (
    <NavLink
      to={item.to}
      className={cn(
        "flex h-14 w-14 flex-col items-center justify-center rounded-xl text-xs transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <item.icon className="mb-1 h-5 w-5" />
      <span>{label}</span>
    </NavLink>
  );
}
