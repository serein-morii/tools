import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { useGlobalShortcuts } from "./ShortcutButtons";

export function MainLayout() {
  // 注册全局快捷键监听
  useGlobalShortcuts();
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
