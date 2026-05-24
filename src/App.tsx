import { Navigate, Route, Routes } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { ReminderLayout } from "@/components/modules/reminder/ReminderLayout";
import { TaskReminderPage } from "@/pages/TaskReminderPage";
import { ChannelsPage } from "@/pages/ChannelsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { TemplatesPage } from "@/pages/TemplatesPage";
import { HistoryPage } from "@/pages/HistoryPage";
import { QuickNotesPage } from "@/pages/QuickNotesPage";
import { PomodoroTimerPage } from "@/pages/PomodoroTimerPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Navigate to="/reminder/tasks" replace />} />
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
  );
}

export default App;
