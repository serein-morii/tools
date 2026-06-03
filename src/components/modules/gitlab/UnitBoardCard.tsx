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
  deptId: deptIdOverride,
  deptName: deptNameOverride,
}: {
  config: GitLabConfig | undefined;
  onDataChange?: (data: UnitBoardData | null) => void;
  startDate?: string;
  endDate?: string;
  weekOptions?: WeekOption[];
  weekIndex?: number;
  onWeekIndexChange?: (index: number) => void;
  workspaceName?: string;
  deptId?: string;
  deptName?: string;
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
  const projectHeader = config?.walkin_project_header;
  const workspaceName = workspaceNameOverride || config?.walkin_workspace_name;
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

      let nextDate = new Date(now);
      nextDate.setHours(targetHour, targetMinute, 0, 0);

      const weekdayNums: number[] = [];
      if (weekday === "*") {
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
          project: projectHeader || "",
          workspace: workspaceName || "",
          x_auth_token: xAuthToken,
        },
        walkinDeptId,
        walkinDeptName,
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
  }, [canFetch, csrfToken, xAuthToken, walkinUrl, walkinDeptId, walkinDeptName, projectHeader, workspaceName, onDataChange, startDate, endDate]);

  useEffect(() => {
    if (!canFetch || !csrfToken || !xAuthToken) return;
    fetchData();
  }, [canFetch, csrfToken, xAuthToken, walkinUrl, walkinDeptId, walkinDeptName, projectHeader, workspaceName, isLoggedIn, fetchData, startDate, endDate]);

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
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium flex items-center gap-2 text-sm">
            <BarChart3 className="h-4 w-4" />
            {t("gitlab.overview.teamCoverageBoard")}
          </h4>
          <div className="flex items-center gap-2">
            {lastUpdate && (
              <span className="text-xs text-muted-foreground">
                {t("gitlab.overview.updatedAt")}{lastUpdate.toLocaleTimeString()}
              </span>
            )}
            {nextRefreshTime && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {t("gitlab.overview.nextRefresh")}{nextRefreshTime.toLocaleTimeString()}
              </span>
            )}
            {canFetch && csrfToken && xAuthToken && (
              <Button variant="ghost" size="sm" onClick={() => fetchData()}>
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
            )}
          </div>
        </div>
        {!isLoggedIn && (
          <p className="text-sm text-muted-foreground">{t("gitlab.overview.loginWalkinFirst")}</p>
        )}
        {isLoggedIn && (!walkinDeptId || !walkinDeptName) && (
          <p className="text-sm text-muted-foreground">{t("gitlab.overview.configureDeptFirst")}</p>
        )}
        {loading && (
          <div className="flex items-center gap-2 py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm text-muted-foreground">{t("gitlab.overview.loading")}</span>
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive">{t("gitlab.overview.loadFailed")}{error}</p>
        )}
        {data && !loading && (
          <div className="space-y-3">
            {(data.xvalue || weekOptions) && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>{t("gitlab.overview.period")}</span>
                {weekOptions && weekIndex != null && onWeekIndexChange ? (
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost" size="sm" className="h-5 w-5 p-0"
                      onClick={() => onWeekIndexChange(Math.max(weekIndex - 1, 0))}
                      disabled={weekIndex <= 0}
                    >
                      <ChevronLeft className="h-3 w-3" />
                    </Button>
                    <select
                      className="h-5 border-0 bg-transparent text-xs font-medium text-foreground focus:outline-none cursor-pointer appearance-none"
                      value={weekIndex}
                      onChange={(e) => onWeekIndexChange(parseInt(e.target.value))}
                    >
                      {weekOptions.map((w, i) => (
                        <option key={i} value={i}>{w.label}</option>
                      ))}
                    </select>
                    <Button
                      variant="ghost" size="sm" className="h-5 w-5 p-0"
                      onClick={() => onWeekIndexChange(Math.min(weekIndex + 1, weekOptions.length - 1))}
                      disabled={weekIndex >= weekOptions.length - 1}
                    >
                      <ChevronRight className="h-3 w-3" />
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">{t("gitlab.overview.incrementalCoverage")}</div>
                <div className="grid grid-cols-3 gap-2">
                  {data.ynewValue != null && (
                    <div className="text-center">
                      <div className="text-lg font-bold text-primary">{data.ynewValue.toFixed(2)}%</div>
                      <div className="text-xs text-muted-foreground">{t("gitlab.overview.overall")}</div>
                    </div>
                  )}
                  {data.ynewLineValue != null && (
                    <div className="text-center">
                      <div className="text-lg font-bold text-primary">{data.ynewLineValue.toFixed(2)}%</div>
                      <div className="text-xs text-muted-foreground">{t("gitlab.overview.line")}</div>
                    </div>
                  )}
                  {data.ynewBranchValue != null && (
                    <div className="text-center">
                      <div className="text-lg font-bold text-primary">{data.ynewBranchValue.toFixed(2)}%</div>
                      <div className="text-xs text-muted-foreground">{t("gitlab.overview.condition")}</div>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">{t("gitlab.overview.fullCoverage")}</div>
                <div className="grid grid-cols-3 gap-2">
                  {data.yallValue != null && (
                    <div className="text-center">
                      <div className="text-lg font-bold text-emerald-600">{data.yallValue.toFixed(2)}%</div>
                      <div className="text-xs text-muted-foreground">{t("gitlab.overview.overall")}</div>
                    </div>
                  )}
                  {data.yallLineValue != null && (
                    <div className="text-center">
                      <div className="text-lg font-bold text-emerald-600">{data.yallLineValue.toFixed(2)}%</div>
                      <div className="text-xs text-muted-foreground">{t("gitlab.overview.line")}</div>
                    </div>
                  )}
                  {data.yallBranchValue != null && (
                    <div className="text-center">
                      <div className="text-lg font-bold text-emerald-600">{data.yallBranchValue.toFixed(2)}%</div>
                      <div className="text-xs text-muted-foreground">{t("gitlab.overview.condition")}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {!data && !loading && !error && isLoggedIn && (
          <p className="text-sm text-muted-foreground">{t("common.noData")}</p>
        )}
      </CardContent>
    </Card>
  );
}
