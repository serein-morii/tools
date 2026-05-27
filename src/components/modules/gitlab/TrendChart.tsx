import { useMemo } from "react";
import type { GitLabScanHistory, GitLabProjectResult } from "@/types";

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
    <div className="p-6 pt-0">
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
            {/* Y-axis labels */}
            <div className="absolute -left-8 top-0 text-xs text-muted-foreground">100%</div>
            <div className="absolute -left-8 bottom-0 text-xs text-muted-foreground">0%</div>

            {/* Grid lines */}
            <div className="absolute top-1/4 left-0 right-0 border-t border-dashed border-muted" />
            <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-muted" />
            <div className="absolute top-3/4 left-0 right-0 border-t border-dashed border-muted" />

            {/* Line */}
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
  const projects: GitLabProjectResult[] = JSON.parse(latestHistory.summary || "[]");

  // Calculate contribution per person
  const contributionMap = new Map<string, { commits: number; linesAdded: number; linesRemoved: number }>();

  projects.forEach((project) => {
    const perContributor = project.contributors.length > 0
      ? Math.floor(project.commits / project.contributors.length)
      : project.commits;

    const linesPerContributor = project.contributors.length > 0
      ? Math.floor(project.lines_added / project.contributors.length)
      : project.lines_added;

    const linesRemovedPerContributor = project.contributors.length > 0
      ? Math.floor(project.lines_removed / project.contributors.length)
      : project.lines_removed;

    project.contributors.forEach((contributor) => {
      const existing = contributionMap.get(contributor) || { commits: 0, linesAdded: 0, linesRemoved: 0 };
      contributionMap.set(contributor, {
        commits: existing.commits + perContributor,
        linesAdded: existing.linesAdded + linesPerContributor,
        linesRemoved: existing.linesRemoved + linesRemovedPerContributor,
      });
    });
  });

  const sortedContributors = Array.from(contributionMap.entries())
    .sort((a, b) => b[1].commits - a[1].commits)
    .slice(0, 5);

  if (sortedContributors.length === 0) return null;

  return (
    <div className="p-6 pt-0">
      <div className="rounded-lg border bg-card/50 p-4">
        <h4 className="mb-4 text-sm font-medium flex items-center gap-2">
          👥 本周贡献者排行
        </h4>
        <div className="space-y-2">
          {sortedContributors.map(([name, stats], index) => (
            <div key={name} className="flex items-center gap-3 text-sm">
              <span className="w-6 text-center font-medium">
                {index === 0 && "🥇"}
                {index === 1 && "🥈"}
                {index === 2 && "🥉"}
                {index > 2 && index + 1}
              </span>
              <span className="flex-1 truncate">{name}</span>
              <span className="text-muted-foreground">{stats.commits}次提交</span>
              <span className="text-green-600 text-xs">+{stats.linesAdded.toLocaleString()}</span>
              <span className="text-red-600 text-xs">-{stats.linesRemoved.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
