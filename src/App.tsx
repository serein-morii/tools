import { Routes, Route } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { TaskReminderPage } from "@/pages/TaskReminderPage";
import { ChannelsPage } from "@/pages/ChannelsPage";
import { SettingsPage } from "@/pages/SettingsPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<TaskReminderPage />} />
        <Route path="channels" element={<ChannelsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

export default App;