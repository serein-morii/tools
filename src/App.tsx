import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { ReminderLayout } from "@/components/modules/reminder/ReminderLayout";

const DashboardPage = lazy(() => import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const TaskReminderPage = lazy(() => import("@/pages/TaskReminderPage").then((m) => ({ default: m.TaskReminderPage })));
const TemplatesPage = lazy(() => import("@/pages/TemplatesPage").then((m) => ({ default: m.TemplatesPage })));
const ChannelsPage = lazy(() => import("@/pages/ChannelsPage").then((m) => ({ default: m.ChannelsPage })));
const HistoryPage = lazy(() => import("@/pages/HistoryPage").then((m) => ({ default: m.HistoryPage })));
const PomodoroTimerPage = lazy(() => import("@/pages/PomodoroTimerPage").then((m) => ({ default: m.PomodoroTimerPage })));
const QuickNotesPage = lazy(() => import("@/pages/QuickNotesPage").then((m) => ({ default: m.QuickNotesPage })));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));

function App() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="reminder" element={<ReminderLayout />}>
            <Route index element={<Navigate to="/reminder/tasks" replace />} />
            <Route path="tasks" element={<TaskReminderPage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="channels" element={<ChannelsPage />} />
            <Route path="history" element={<HistoryPage />} />
          </Route>
          <Route path="timer" element={<PomodoroTimerPage />} />
          <Route path="notes" element={<QuickNotesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
