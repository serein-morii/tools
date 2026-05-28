import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import type { GitLabScanProgress } from "@/types";
import { Loader2, CheckCircle, GitBranch, Shield } from "lucide-react";

interface ScanProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ScanProgressModal({ isOpen, onClose }: ScanProgressModalProps) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<GitLabScanProgress | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setProgress(null);
      setIsComplete(false);
      return;
    }

    const unlisten = listen<GitLabScanProgress>("gitlab-scan-progress", (event) => {
      setProgress(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [isOpen]);

  useEffect(() => {
    if (isComplete) {
      const timer = setTimeout(onClose, 2000);
      return () => clearTimeout(timer);
    }
  }, [isComplete, onClose]);

  // Listen for scan completion
  useEffect(() => {
    if (!isOpen) return;

    const unlisten = listen<unknown>("gitlab-scan-complete", () => {
      setIsComplete(true);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isWalkinPhase = progress?.phase === "walkin";
  const percent = progress ? Math.round((progress.current / progress.total) * 100) : 0;
  const projectName = progress?.project_name?.split("/").pop() || "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[400px] rounded-lg border bg-card p-6 shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          {isComplete ? (
            <CheckCircle className="h-5 w-5 text-green-500" />
          ) : isWalkinPhase ? (
            <Shield className="h-5 w-5 animate-pulse text-amber-500" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
          )}
          <h3 className="font-medium">
            {isComplete ? t("gitlab.scan.completed") : isWalkinPhase ? t("gitlab.scan.loadingWalkin") : t("gitlab.scan.scanningGitLab")}
          </h3>
        </div>

        {/* GitLab scan progress */}
        {!isWalkinPhase && !isComplete && (
          <div className="mb-4">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300 bg-blue-500"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
              <span>{progress ? `${progress.current}/${progress.total}${t("gitlab.scan.projectsSuffix")}` : t("gitlab.scan.preparing")}</span>
              <span>{percent}%</span>
            </div>
          </div>
        )}

        {/* Walkin phase progress */}
        {isWalkinPhase && !isComplete && (
          <div className="mb-4">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300 bg-amber-500 animate-pulse" style={{ width: "100%" }} />
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>{t("gitlab.scan.fetchingWalkinData")}</span>
            </div>
          </div>
        )}

        {/* Completed progress */}
        {isComplete && (
          <div className="mb-4">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-green-500" style={{ width: "100%" }} />
            </div>
            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
              <span>{t("gitlab.scan.allDone")}</span>
              <span>100%</span>
            </div>
          </div>
        )}

        {/* Current project */}
        {progress && !isComplete && !isWalkinPhase && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <GitBranch className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="font-medium text-foreground">{projectName}</span>
            {progress.commits_scanned > 0 && (
              <span>{t("gitlab.scan.commitsScanned", { count: progress.commits_scanned })}</span>
            )}
          </div>
        )}

        {/* Walkin phase detail */}
        {isWalkinPhase && !isComplete && (
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{progress?.project_name}</span>
          </div>
        )}

        {/* Completion message */}
        {isComplete && (
          <div className="text-sm text-green-600 font-medium">
            {t("gitlab.scan.dataUpdated")}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors"
          >
            {isComplete ? t("common.close") : t("gitlab.scan.runInBackground")}
          </button>
        </div>
      </div>
    </div>
  );
}
