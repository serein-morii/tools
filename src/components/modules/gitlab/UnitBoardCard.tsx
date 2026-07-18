import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, RefreshCw, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWalkinAuth } from "@/components/modules/gitlab/WalkinAuthManager";
import { gitlabApi } from "@/lib/api/gitlab";
import type { GitLabConfig, UnitBoardData } from "@/types";
import type { WeekOption } from "@/components/modules/gitlab/UnitCoverageList";

export function UnitBoardCard({
  config,
  onDataChange,
  startDate,
  endDate,
  weekOptions,
  weekIndex,
  onWeekIndexChange,
  workspaceName: workspaceNameOverride,
  workspaceId: workspaceIdOverride,
  projectId: projectIdOverride,
  deptId: deptIdOverride,
  deptName: deptNameOverride,
  refreshKey,
}: {
  config: GitLabConfig | undefined;
  onDataChange?: (data: UnitBoardData | null) => void;
  startDate?: string;
  endDate?: string;
  weekOptions?: WeekOption[];
  weekIndex?: number;
  onWeekIndexChange?: (index: number) => void;
  workspaceName?: string;
  workspaceId?: string;
  projectId?: string;
  deptId?: string;
  deptName?: string;
  refreshKey?: number;
}) {
  const { t } = useTranslation();
  const { isLoggedIn } = useWalkinAuth();
  const [data, setData] = useState<UnitBoardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const walkinEnabled = config?.walkin_enabled;
  const walkinUrl = config?.walkin_url;
  const walkinDeptId = deptIdOverride || config?.walkin_dept_id;
  const walkinDeptName = deptNameOverride || config?.walkin_dept_name;
  const csrfToken = config?.walkin_csrf_token;
  const projectHeaderOverride = projectIdOverride || config?.walkin_project_header;
  const workspaceName = workspaceNameOverride || config?.walkin_workspace_name;
  const workspaceHeader = workspaceIdOverride || workspaceName;
  const xAuthToken = config?.walkin_x_auth_token;
  const scanSchedule = config?.scan_schedule || "0 9 * * 1";

  const canFetch = walkinEnabled && walkinUrl && walkinDeptId && walkinDeptName && isLoggedIn;

  const getNextRefreshTime = useCallback((cronExpr: string): Date | null => {
    try {
      const parts = cronExpr.trim().split(/\s+/);
      if (parts.length !== 5) return null;

      const [min, hour, _day, , weekday] = parts;
      const now = new Date();

      let targetMinute = min === "*" ? now.getMinutes() : parseInt(min.replace("*/", ""));
      let targetHour = hour === "*" ? now.getHours() : parseInt(hour.replace("*/", ""));

      if (min.startsWith("*/")) {
        const interval = parseInt(min.replace("*/", ""));
        targetMinute = Math.ceil(now.getMinutes() / interval) * interval;
        if (targetMinute >= 60) {
          targetMinute = 0;
          targetHour = now.getHours() + 1;
        }
      }

      if (hour.startsWith("*/")) {
        const interval = parseInt(hour.replace("*/", ""));
        targetHour = Math.ceil((now.getHours() + 1) / interval) * interval;
        if (targetHour >= 24) {
          targetHour = 0;
          now.setDate(now.getDate() + 1);
        }
      }

      const nextDate = new Date(now);
      nextDate.setHours(targetHour, targetMinute, 0, 0);

      const weekdayNums: number[] = [];
      if (weekday === "*") {
        // all days
      } else if (weekday === "1-5") {
        weekdayNums.push(1, 2, 3, 4, 5);
      } else if (weekday.includes(",")) {
        weekday.split(",").forEach(d => weekdayNums.push(parseInt(d)));
      } else {
        weekdayNums.push(parseInt(weekday));
      }

      if (weekdayNums.length > 0) {
        let attempts = 0;
        while (!weekdayNums.includes(nextDate.getDay()) && attempts < 7) {
          nextDate.setDate(nextDate.getDate() + 1);
          attempts++;
        }
      }

      if (nextDate <= now) {
        if (weekdayNums.length > 0) {
          nextDate.setDate(nextDate.getDate() + 1);
          let attempts = 0;
          while (!weekdayNums.includes(nextDate.getDay()) && attempts < 7) {
            nextDate.setDate(nextDate.getDate() + 1);
            attempts++;
          }
        } else {
          nextDate.setDate(nextDate.getDate() + 1);
        }
      }

      return nextDate;
    } catch {
      return null;
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!canFetch || !csrfToken || !xAuthToken || !walkinUrl || !walkinDeptId || !walkinDeptName) return;

    setLoading(true);
    setError(null);
    try {
      const result = await gitlabApi.walkinFetchUnitBoard(
        walkinUrl,
        {
          csrf_token: csrfToken,
          project: projectHeaderOverride || "",
          workspace: workspaceHeader || "",
          x_auth_token: xAuthToken,
        },
        walkinDeptId,
        walkinDeptName,
        workspaceName,
        startDate,
        endDate,
      );
      setData(result);
      setLastUpdate(new Date());
      onDataChange?.(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      onDataChange?.(null);
    } finally {
      setLoading(false);
    }
  }, [canFetch, csrfToken, xAuthToken, walkinUrl, walkinDeptId, walkinDeptName, projectHeaderOverride, workspaceIdOverride, workspaceName, onDataChange, startDate, endDate, refreshKey]);
  useEffect(() => {
    if (!canFetch || !csrfToken || !xAuthToken) return;
    fetchData();
  }, [canFetch, csrfToken, xAuthToken, walkinUrl, walkinDeptId, walkinDeptName, projectHeaderOverride, workspaceIdOverride, workspaceName, isLoggedIn, fetchData, startDate, endDate, refreshKey]);

  useEffect(() => {
    if (!canFetch || !csrfToken || !xAuthToken) return;

    const nextRefresh = getNextRefreshTime(scanSchedule);
    if (!nextRefresh) return;

    const now = new Date();
    const delay = nextRefresh.getTime() - now.getTime();
    if (delay <= 0) return;

    const timer = setTimeout(() => {
      fetchData();
    }, delay);

    return () => clearTimeout(timer);
  }, [canFetch, csrfToken, xAuthToken, scanSchedule, getNextRefreshTime, fetchData]);

  if (!walkinEnabled || !walkinDeptId || !walkinDeptName) return null;

  const nextRefreshTime = getNextRefreshTime(scanSchedule);

  return (
    <Card className="bg-card/50">
      <CardContent className="p-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <h4 className="font-medium flex items-center gap-1 text-[11px]">
            <BarChart3 className="h-3 w-3" />
            {t("gitlab.overview.teamCoverageBoard")}
          </h4>
          <div className="flex items-center gap-1.5">
            {lastUpdate && (
              <span className="text-[10px] text-muted-foreground">
                {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            {nextRefreshTime && (
              <span className="text-[10px] text-muted-foreground hidden sm:inline">
                {nextRefreshTime.toLocaleTimeString()}
              </span>
            )}
            {canFetch && csrfToken && xAuthToken && (
              <Button variant="ghost" size="icon-xs" onClick={() => fetchData()}>
                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              </Button>
            )}
          </div>
        </div>
        {!isLoggedIn && (
          <p className="text-[10px] text-muted-foreground">{t("gitlab.overview.loginWalkinFirst")}</p>
        )}
        {isLoggedIn && (!walkinDeptId || !walkinDeptName) && (
          <p className="text-[10px] text-muted-foreground">{t("gitlab.overview.configureDeptFirst")}</p>
        )}
        {loading && (
          <div className="flex items-center gap-1.5 py-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="text-[10px] text-muted-foreground">{t("gitlab.overview.loading")}</span>
          </div>
        )}
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
        {data && !loading && (
          <div className="space-y-1">
            {(data.xvalue || weekOptions) && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span>{t("gitlab.overview.period")}</span>
                {weekOptions && weekIndex != null && onWeekIndexChange ? (
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost" size="sm" className="h-4 w-4 p-0"
                      onClick={() => onWeekIndexChange(Math.max(weekIndex - 1, 0))}
                      disabled={weekIndex <= 0}
                    >
                      <ChevronLeft className="h-2.5 w-2.5" />
                    </Button>
                    <select
                      className="h-4 border-0 bg-transparent text-[10px] font-medium text-foreground focus:outline-none cursor-pointer appearance-none"
                      value={weekIndex}
                      onChange={(e) => onWeekIndexChange(parseInt(e.target.value))}
                    >
                      {weekOptions.map((w, i) => (
                        <option key={i} value={i}>{w.label}</option>
                      ))}
                    </select>
                    <Button
                      variant="ghost" size="sm" className="h-4 w-4 p-0"
                      onClick={() => onWeekIndexChange(Math.min(weekIndex + 1, weekOptions.length - 1))}
                      disabled={weekIndex >= weekOptions.length - 1}
                    >
                      <ChevronRight className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span>{data.xvalue}</span>
                    {data.startDateFrom && data.startDateTo && (
                      <span> ({data.startDateFrom} ~ {data.startDateTo})</span>
                    )}
                  </>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-muted-foreground">{t("gitlab.overview.incrementalCoverage")}</div>
                <div className="grid grid-cols-3 gap-1">
                  {data.ynewValue != null && (
                    <div className="text-center">
                      <div className="text-sm font-bold text-primary">{data.ynewValue.toFixed(2)}%</div>
                      <div className="text-[10px] text-muted-foreground">{t("gitlab.overview.overall")}</div>
                    </div>
                  )}
                  {data.ynewLineValue != null && (
                    <div className="text-center">
                      <div className="text-sm font-bold text-primary">{data.ynewLineValue.toFixed(2)}%</div>
                      <div className="text-[10px] text-muted-foreground">{t("gitlab.overview.line")}</div>
                    </div>
                  )}
                  {data.ynewBranchValue != null && (
                    <div className="text-center">
                      <div className="text-sm font-bold text-primary">{data.ynewBranchValue.toFixed(2)}%</div>
                      <div className="text-[10px] text-muted-foreground">{t("gitlab.overview.condition")}</div>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-muted-foreground">{t("gitlab.overview.fullCoverage")}</div>
                <div className="grid grid-cols-3 gap-1">
                  {data.yallValue != null && (
                    <div className="text-center">
                      <div className="text-sm font-bold text-emerald-600">{data.yallValue.toFixed(2)}%</div>
                      <div className="text-[10px] text-muted-foreground">{t("gitlab.overview.overall")}</div>
                    </div>
                  )}
                  {data.yallLineValue != null && (
                    <div className="text-center">
                      <div className="text-sm font-bold text-emerald-600">{data.yallLineValue.toFixed(2)}%</div>
                      <div className="text-[10px] text-muted-foreground">{t("gitlab.overview.line")}</div>
                    </div>
                  )}
                  {data.yallBranchValue != null && (
                    <div className="text-center">
                      <div className="text-sm font-bold text-emerald-600">{data.yallBranchValue.toFixed(2)}%</div>
                      <div className="text-[10px] text-muted-foreground">{t("gitlab.overview.condition")}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {!data && !loading && !error && isLoggedIn && (
          <p className="text-[10px] text-muted-foreground">{t("common.noData")}</p>
        )}
      </CardContent>
    </Card>
  );
}
