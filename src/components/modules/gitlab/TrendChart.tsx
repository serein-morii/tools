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

  if (history.length < 2) {
    return null;
  }

  const weeks = history.slice(0, 4).reverse();

  return (
    <div className="px-6 pb-4">
      <div className="rounded-lg border bg-card/50 p-4">
        <h4 className="mb-4 text-sm font-medium">提交趋势（近{weeks.length}周）</h4>

        {/* Bar Chart */}
        <div className="mb-6">
          <div className="flex items-end justify-between gap-4 h-32">
            {weeks.map((week, i) => {
              const height = (week.total_commits / maxCommits) * 100;
              return (
                <div key={week.id} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full bg-muted rounded-t relative" style={{ height: `${Math.max(height, 5)}%` }}>
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-violet-500 to-indigo-500 rounded-t transition-all duration-300"
                      style={{ height: "100%" }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">W{i + 1}</span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            {weeks.map((week) => (
              <span key={week.id} className="flex-1 text-center">{week.total_commits}</span>
            ))}
          </div>
        </div>

        {/* Coverage Trend */}
        <div>
          <h4 className="mb-4 text-sm font-medium">单测覆盖率趋势</h4>
          <div className="relative h-24 border-l border-b">
            <div className="absolute -left-8 top-0 text-xs text-muted-foreground">100%</div>
            <div className="absolute -left-8 bottom-0 text-xs text-muted-foreground">0%</div>
            <div className="absolute top-1/4 left-0 right-0 border-t border-dashed border-muted" />
            <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-muted" />
            <div className="absolute top-3/4 left-0 right-0 border-t border-dashed border-muted" />
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
              <polyline
                points={weeks.map((week, i) => {
                  const coverage = week.total_projects > 0
                    ? (week.test_projects / week.total_projects) * 100
                    : 0;
                  const x = (i / (weeks.length - 1)) * 100;
                  const y = 100 - coverage;
                  return `${x}%,${y}%`;
                }).join(" ")}
                fill="none"
                stroke="rgb(34 197 94)"
                strokeWidth="2"
              />
              {weeks.map((week, i) => {
                const coverage = week.total_projects > 0
                  ? (week.test_projects / week.total_projects) * 100
                  : 0;
                const x = (i / (weeks.length - 1)) * 100;
                const y = 100 - coverage;
                return (
                  <circle
                    key={week.id}
                    cx={`${x}%`}
                    cy={`${y}%`}
                    r="4"
                    fill="rgb(34 197 94)"
                  />
                );
              })}
            </svg>
          </div>
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            {weeks.map((week, i) => (
              <span key={week.id}>W{i + 1}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ContributorRanking({ history }: { history: GitLabScanHistory[] }) {
  if (history.length === 0) return null;

  const latestHistory = history[0];
  const devStats: DeveloperStat[] = JSON.parse(latestHistory.developer_stats || "[]");

  if (devStats.length === 0) return null;

  const maxCommits = Math.max(devStats[0]?.commits || 1, 1);

  return (
    <div className="px-6 pb-4">
      <div className="rounded-lg border bg-card/50 p-4">
        <h4 className="mb-4 text-sm font-medium">开发者贡献排行</h4>
        <div className="space-y-2">
          {devStats.slice(0, 8).map((dev, index) => {
            const barWidth = (dev.commits / maxCommits) * 100;
            return (
              <div key={dev.name} className="flex items-center gap-3">
                <span className="w-6 text-center text-sm font-medium text-muted-foreground">
                  {index === 0 && "🥇"}
                  {index === 1 && "🥈"}
                  {index === 2 && "🥉"}
                  {index > 2 && index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm font-medium truncate" title={dev.name}>
                      {dev.name}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                      {dev.projects.length}个项目
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                      style={{ width: `${Math.max(barWidth, 2)}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <GitCommit className="h-3 w-3" />{dev.commits}
                    </span>
                    <span className="flex items-center gap-0.5 text-green-600">
                      <Plus className="h-3 w-3" />{formatNum(dev.lines_added)}
                    </span>
                    <span className="flex items-center gap-0.5 text-red-600">
                      <Minus className="h-3 w-3" />{formatNum(dev.lines_removed)}
                    </span>
                    {dev.mrs_created > 0 && (
                      <span className="flex items-center gap-0.5">
                        <GitPullRequest className="h-3 w-3" />{dev.mrs_created}
                      </span>
                    )}
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
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "k";
  }
  return num.toString();
}
