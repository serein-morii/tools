import { useMemo } from "react";
import type { GitLabScanHistory, DeveloperStat } from "@/types";
import { CheckCircle, XCircle, GitCommit, Plus, Minus, GitPullRequest } from "lucide-react";

interface TrendChartProps {
  history: GitLabScanHistory[];
}

export function TrendChart({ history }: TrendChartProps) {
  const { maxCommits } = useMemo(() => {
    let maxC = 0;
    history.forEach((h) => {
      if (h.total_commits > maxC) maxC = h.total_commits;
    });
    return { maxCommits: Math.max(maxC, 1) };
  }, [history]);

  const weeks = history.slice(0, 4).reverse();

  if (weeks.length < 2) {
    return (
      <div className="px-6 pb-4 flex-1">
        <div className="rounded-lg border bg-card/50 p-4 h-full flex items-center justify-center">
          <p className="text-sm text-muted-foreground">至少需要2次扫描数据</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 pb-4 flex-1">
      <div className="rounded-lg border bg-card/50 p-4 h-full flex flex-col">
        <h4 className="mb-4 text-sm font-medium flex-shrink-0">提交趋势（近{weeks.length}周）</h4>

        {/* Bar Chart */}
        <div className="mb-6 flex-shrink-0">
          <div className="flex items-end gap-3 h-28">
            {weeks.map((week, i) => {
              const heightPx = Math.max((week.total_commits / maxCommits) * 112, 4);
              return (
                <div key={week.id} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{week.total_commits}</span>
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-violet-500 to-indigo-500"
                    style={{ height: `${heightPx}px` }}
                  />
                  <span className="text-xs text-muted-foreground">W{i + 1}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Coverage Trend */}
        <div className="flex-1 flex flex-col">
          <h4 className="mb-2 text-sm font-medium flex-shrink-0">单测覆盖率趋势</h4>
          <div className="flex-1 relative border-l-2 border-b-2 border-muted-foreground/20 ml-8 min-h-[80px]">
            {/* Y-axis labels */}
            <span className="absolute -left-7 -top-2 text-xs text-muted-foreground">100%</span>
            <span className="absolute -left-5 -bottom-2 text-xs text-muted-foreground">0%</span>
            <span className="absolute -left-5 top-1/4 -translate-y-1/2 text-xs text-muted-foreground/50">75%</span>
            <span className="absolute -left-5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/50">50%</span>
            <span className="absolute -left-5 top-3/4 -translate-y-1/2 text-xs text-muted-foreground/50">25%</span>
            {/* Grid lines */}
            <div className="absolute top-1/4 left-0 right-0 border-t border-dashed border-muted-foreground/10" />
            <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-muted-foreground/10" />
            <div className="absolute top-3/4 left-0 right-0 border-t border-dashed border-muted-foreground/10" />

            {/* SVG line + dots */}
            <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none">
              <polyline
                points={weeks.map((week, i) => {
                  const coverage = week.total_projects > 0
                    ? (week.test_projects / week.total_projects) * 100
                    : 0;
                  const x = weeks.length > 1 ? (i / (weeks.length - 1)) * 100 : 50;
                  const y = 100 - coverage;
                  return `${x},${y}`;
                }).join(" ")}
                fill="none"
                stroke="rgb(34 197 94)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
              {weeks.map((week, i) => {
                const coverage = week.total_projects > 0
                  ? (week.test_projects / week.total_projects) * 100
                  : 0;
                const x = weeks.length > 1 ? (i / (weeks.length - 1)) * 100 : 50;
                const y = 100 - coverage;
                return (
                  <g key={week.id}>
                    <circle cx={x} cy={y} r="4" fill="rgb(34 197 94)" stroke="white" strokeWidth="1" />
                    <text x={x} y={y - 10} textAnchor="middle" className="text-[10px]" fill="currentColor">
                      {Math.round(coverage)}%
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          {/* X-axis labels */}
          <div className="flex justify-between ml-8 mt-1 text-xs text-muted-foreground">
            {weeks.map((_, i) => (
              <span key={i}>W{i + 1}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ContributorRanking({ history }: { history: GitLabScanHistory[] }) {
  if (history.length === 0) {
    return (
      <div className="px-6 pb-4 flex-1">
        <div className="rounded-lg border bg-card/50 p-4 h-full flex items-center justify-center">
          <p className="text-sm text-muted-foreground">暂无扫描数据</p>
        </div>
      </div>
    );
  }

  const latestHistory = history[0];
  const devStats: DeveloperStat[] = JSON.parse(latestHistory.developer_stats || "[]");

  if (devStats.length === 0) {
    return (
      <div className="px-6 pb-4 flex-1">
        <div className="rounded-lg border bg-card/50 p-4 h-full flex items-center justify-center">
          <p className="text-sm text-muted-foreground">暂无开发者数据</p>
        </div>
      </div>
    );
  }

  const maxCommits = Math.max(devStats[0]?.commits || 1, 1);

  return (
    <div className="px-6 pb-4 flex-1">
      <div className="rounded-lg border bg-card/50 p-4 h-full flex flex-col">
        <h4 className="mb-4 text-sm font-medium flex-shrink-0">开发者贡献排行</h4>
        <div className="space-y-2.5 flex-1">
          {devStats.slice(0, 8).map((dev, index) => {
            const barWidth = (dev.commits / maxCommits) * 100;
            return (
              <div key={dev.name} className="flex items-center gap-3">
                <span className="w-5 text-center text-sm font-medium text-muted-foreground flex-shrink-0">
                  {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm font-medium truncate" title={dev.name}>{dev.name}</span>
                    <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">{dev.projects.length}个项目</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                      style={{ width: `${Math.max(barWidth, 3)}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-0.5"><GitCommit className="h-3 w-3" />{dev.commits}</span>
                    <span className="flex items-center gap-0.5 text-green-600"><Plus className="h-3 w-3" />{formatNum(dev.lines_added)}</span>
                    <span className="flex items-center gap-0.5 text-red-600"><Minus className="h-3 w-3" />{formatNum(dev.lines_removed)}</span>
                    {dev.mrs_created > 0 && <span className="flex items-center gap-0.5"><GitPullRequest className="h-3 w-3" />{dev.mrs_created}</span>}
                    {dev.mrs_pipeline_success + dev.mrs_pipeline_failed > 0 && (
                      <span className="flex items-center gap-0.5 ml-auto">
                        <CheckCircle className="h-3 w-3 text-green-500" />{dev.mrs_pipeline_success}
                        <XCircle className="h-3 w-3 text-red-500 ml-0.5" />{dev.mrs_pipeline_failed}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatNum(num: number): string {
  if (num >= 1000) return (num / 1000).toFixed(1) + "k";
  return num.toString();
}
