import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { ReminderLayout } from "@/components/modules/reminder/ReminderLayout";
import { GitLabLayout } from "@/components/modules/gitlab/GitLabLayout";
import { WalkinAuthProvider } from "@/components/modules/gitlab/WalkinAuthManager";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useSettings, getSettingValue } from "@/lib/query/settingsQueries";

const DashboardPage = lazy(() => import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const TaskReminderPage = lazy(() => import("@/pages/TaskReminderPage").then((m) => ({ default: m.TaskReminderPage })));
const TemplatesPage = lazy(() => import("@/pages/TemplatesPage").then((m) => ({ default: m.TemplatesPage })));
const ChannelsPage = lazy(() => import("@/pages/ChannelsPage").then((m) => ({ default: m.ChannelsPage })));
const HistoryPage = lazy(() => import("@/pages/HistoryPage").then((m) => ({ default: m.HistoryPage })));
const ReminderSettingsPage = lazy(() => import("@/pages/ReminderSettingsPage").then((m) => ({ default: m.ReminderSettingsPage })));
const PomodoroTimerPage = lazy(() => import("@/pages/PomodoroTimerPage").then((m) => ({ default: m.PomodoroTimerPage })));
const QuickNotesPage = lazy(() => import("@/pages/QuickNotesPage").then((m) => ({ default: m.QuickNotesPage })));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const GitLabOverviewPage = lazy(() => import("@/pages/GitLabOverviewPage").then((m) => ({ default: m.GitLabOverviewPage })));
const GitLabHistoryPage = lazy(() => import("@/pages/GitLabHistoryPage").then((m) => ({ default: m.GitLabHistoryPage })));
const GitLabSettingsPage = lazy(() => import("@/pages/GitLabSettingsPage").then((m) => ({ default: m.GitLabSettingsPage })));
const SonarPromptPage = lazy(() => import("@/pages/SonarPromptPage").then((m) => ({ default: m.SonarPromptPage })));
const AiCoveragePage = lazy(() => import("@/pages/AiCoveragePage").then((m) => ({ default: m.AiCoveragePage })));

function PageGuard({ settingKey, children }: { settingKey: string; children: React.ReactNode }) {
  const { data: settings } = useSettings();
  const visible = getSettingValue(settings, settingKey, "true") === "true";
  if (!visible) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function StartupRedirect() {
  const { data: settings } = useSettings();
  const startup = getSettingValue(settings, "startup_page", "/");
  return <Navigate to={startup} replace />;
}

function App() {
  return (
    <ErrorBoundary>
      <WalkinAuthProvider>
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<StartupRedirect />} />
            <Route path="home" element={<DashboardPage />} />
            <Route path="reminder" element={<PageGuard settingKey="page_reminder_visible"><ReminderLayout /></PageGuard>}>
              <Route index element={<Navigate to="/reminder/tasks" replace />} />
              <Route path="tasks" element={<TaskReminderPage />} />
              <Route path="templates" element={<TemplatesPage />} />
              <Route path="channels" element={<ChannelsPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="settings" element={<ReminderSettingsPage />} />
            </Route>
            <Route path="gitlab" element={<PageGuard settingKey="page_gitlab_visible"><GitLabLayout /></PageGuard>}>
              <Route index element={<Navigate to="/gitlab/overview" replace />} />
              <Route path="overview" element={<GitLabOverviewPage />} />
              <Route path="history" element={<GitLabHistoryPage />} />
              <Route path="settings" element={<GitLabSettingsPage />} />
            </Route>
            <Route path="timer" element={<PageGuard settingKey="page_timer_visible"><PomodoroTimerPage /></PageGuard>} />
            <Route path="sonar" element={<PageGuard settingKey="page_sonar_visible"><SonarPromptPage /></PageGuard>} />
            <Route path="ai-coverage" element={<PageGuard settingKey="page_ai_coverage_visible"><AiCoveragePage /></PageGuard>} />
            <Route path="notes" element={<PageGuard settingKey="page_notes_visible"><QuickNotesPage /></PageGuard>} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </Suspense>
      </WalkinAuthProvider>
    </ErrorBoundary>
  );
}

export default App;
