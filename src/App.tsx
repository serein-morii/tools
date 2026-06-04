import { lazy, Suspense, useState, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { ReminderLayout } from "@/components/modules/reminder/ReminderLayout";
import { GitLabLayout } from "@/components/modules/gitlab/GitLabLayout";
import { WalkinAuthProvider } from "@/components/modules/gitlab/WalkinAuthManager";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useSettings, getSettingValue } from "@/lib/query/settingsQueries";
import { SetupWizard, useNeedsSetup } from "@/components/SetupWizard";

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

/** Wrap a route element with an ErrorBoundary so a crash in one page doesn't take down the whole app. */
function withErrorBoundary(children: React.ReactNode) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

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
  const [showSetup, setShowSetup] = useState(false);
  const [checkedSetup, setCheckedSetup] = useState(false);

  // Check if setup is needed on mount
  useEffect(() => {
    const needsSetup = useNeedsSetup();
    setShowSetup(needsSetup);
    setCheckedSetup(true);
  }, []);

  const handleSetupComplete = () => {
    setShowSetup(false);
  };

  // Don't render main app until we've checked setup status
  if (!checkedSetup) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Show setup wizard if needed
  if (showSetup) {
    return (
      <ErrorBoundary>
        <WalkinAuthProvider>
          <SetupWizard onComplete={handleSetupComplete} />
        </WalkinAuthProvider>
      </ErrorBoundary>
    );
  }

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
            <Route path="home" element={withErrorBoundary(<DashboardPage />)} />
            <Route path="reminder" element={<PageGuard settingKey="page_reminder_visible"><ReminderLayout /></PageGuard>}>
              <Route index element={<Navigate to="/reminder/tasks" replace />} />
              <Route path="tasks" element={withErrorBoundary(<TaskReminderPage />)} />
              <Route path="templates" element={withErrorBoundary(<TemplatesPage />)} />
              <Route path="channels" element={withErrorBoundary(<ChannelsPage />)} />
              <Route path="history" element={withErrorBoundary(<HistoryPage />)} />
              <Route path="settings" element={withErrorBoundary(<ReminderSettingsPage />)} />
            </Route>
            <Route path="gitlab" element={<PageGuard settingKey="page_gitlab_visible"><GitLabLayout /></PageGuard>}>
              <Route index element={<Navigate to="/gitlab/overview" replace />} />
              <Route path="overview" element={withErrorBoundary(<GitLabOverviewPage />)} />
              <Route path="history" element={withErrorBoundary(<GitLabHistoryPage />)} />
              <Route path="settings" element={withErrorBoundary(<GitLabSettingsPage />)} />
            </Route>
            <Route path="timer" element={<PageGuard settingKey="page_timer_visible">{withErrorBoundary(<PomodoroTimerPage />)}</PageGuard>} />
            <Route path="sonar" element={<PageGuard settingKey="page_sonar_visible">{withErrorBoundary(<SonarPromptPage />)}</PageGuard>} />
            <Route path="ai-coverage" element={<PageGuard settingKey="page_ai_coverage_visible">{withErrorBoundary(<AiCoveragePage />)}</PageGuard>} />
            <Route path="notes" element={<PageGuard settingKey="page_notes_visible">{withErrorBoundary(<QuickNotesPage />)}</PageGuard>} />
            <Route path="settings" element={withErrorBoundary(<SettingsPage />)} />
          </Route>
        </Routes>
      </Suspense>
      </WalkinAuthProvider>
    </ErrorBoundary>
  );
}

export default App;
