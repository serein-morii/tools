import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export function ReminderLayout() {
  const { t } = useTranslation();

  const tabs = [
    { to: "/reminder/tasks", label: t("nav.tasks") },
    { to: "/reminder/templates", label: t("nav.templates") },
    { to: "/reminder/channels", label: t("nav.channels") },
    { to: "/reminder/history", label: t("nav.history") },
  ];

  return (
    <div className="min-h-full bg-background">
      <div className="border-b bg-card px-6 py-4">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold">{t("reminder.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("reminder.description")}</p>
        </div>
        <nav className="flex gap-2">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
