import { useState, useEffect, useRef } from "react";
import type { GitLabScanHistory, DeveloperStat, GitLabProjectResult } from "@/types";
import { GitCommit, Plus, Minus, ChevronDown } from "lucide-react";

interface TrendChartProps {
  history: GitLabScanHistory[];
}

export function TrendChart({ history }: TrendChartProps) {
  const [dataCount, setDataCount] = useState<20 | 30 | 50>(() => {
    const saved = localStorage.getItem("gitlab-trend-count");
    return (parseInt(saved || "20") as 20 | 30 | 50) || 20;
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem("gitlab-trend-count", dataCount.toString());
  }, [dataCount]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Take last N scans and reverse to chronological order (oldest to newest)
  const scans = history.slice(0, dataCount).reverse();

  if (scans.length < 2) {
    return (
      <div className="px-6 pb-4 flex-1">
        <div className="rounded-lg border bg-card/50 p-4 h-full flex items-center justify-center">
          <p className="text-sm text-muted-foreground">至少需要2次扫描数据</p>
        </div>
      </div>
    );
  }

  // Calculate max values for scaling
  const maxCommits = Math.max(...scans.map(s => s.total_commits), 1);
  const maxCoverage = 100;

  // Calculate incremental coverage from walkin_metrics in summary
  const getNewCoverage = (scan: GitLabScanHistory): number | null => {
    try {
      const projects: GitLabProjectResult[] = JSON.parse(scan.summary || "[]");
      let sum = 0;
      let count = 0;
      for (const p of projects) {
        if (p.walkin_metrics?.new_coverage != null) {
          sum += p.walkin_metrics.new_coverage;
          count++;
        }
      }
      return count > 0 ? sum / count : null;
    } catch {
      return null;
    }
  };

  // Chart dimensions
  const chartWidth = scans.length * 30;
  const chartHeight = 200;
  const padding = { top: 20, right: 10, bottom: 20, left: 30 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // Generate SVG path for commits
  const commitsPoints = scans.map((s, i) => {
    const x = padding.left + (i / (scans.length - 1)) * innerWidth;
    const y = padding.top + innerHeight - (s.total_commits / maxCommits) * innerHeight;
    return `${x},${y}`;
  }).join(" ");

  // Generate SVG path for coverage (incremental coverage from walkin_metrics)
  const coveragePoints = scans.map((s, i) => {
    const coverage = getNewCoverage(s) ?? 0;
    const x = padding.left + (i / (scans.length - 1)) * innerWidth;
    const y = padding.top + innerHeight - (coverage / maxCoverage) * innerHeight;
    return `${x},${y}`;
  }).join(" ");

  const countOptions = [
    { value: 20, label: "最近 20 次" },
    { value: 30, label: "最近 30 次" },
    { value: 50, label: "最近 50 次" },
  ];

  return (
    <div className="px-6 pb-4 flex-1">
      <div className="rounded-lg border bg-card/50 p-4 h-full flex flex-col">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between flex-shrink-0">
          <h4 className="text-sm font-medium">趋势分析</h4>
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-1 h-7 rounded-md border border-input bg-background px-2 text-xs hover:bg-muted/50 transition-colors"
            >
              最近 {dataCount} 次
              <ChevronDown className={`h-3 w-3 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-50 mt-1 min-w-[100px] rounded-md border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95">
                {countOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setDataCount(opt.value as 20 | 30 | 50);
                      setMenuOpen(false);
                    }}
                    className={`flex w-full items-center rounded-sm px-2 py-1.5 text-xs transition-colors hover:bg-accent ${opt.value === dataCount ? "bg-accent/50 font-medium" : ""}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Charts container */}
        <div className="flex-1 overflow-x-auto">
          <svg width={chartWidth} height={chartHeight} className="overflow-visible">
            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map((pct) => (
              <line
                key={pct}
                x1={padding.left}
                y1={padding.top + innerHeight * (1 - pct / 100)}
                x2={chartWidth - padding.right}
                y2={padding.top + innerHeight * (1 - pct / 100)}
                stroke="hsl(var(--muted))"
                strokeDasharray="2,2"
                strokeWidth="0.5"
              />
            ))}

            {/* Commits line */}
            <polyline
              points={commitsPoints}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Commits dots */}
            {scans.map((s, i) => {
              const x = padding.left + (i / (scans.length - 1)) * innerWidth;
              const y = padding.top + innerHeight - (s.total_commits / maxCommits) * innerHeight;
              return (
                <circle key={`c-${s.id}`} cx={x} cy={y} r="3" fill="hsl(var(--primary))" />
              );
            })}

            {/* Coverage line */}
            <polyline
              points={coveragePoints}
              fill="none"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="4,2"
            />

            {/* Coverage dots */}
            {scans.map((s, i) => {
              const coverage = getNewCoverage(s) ?? 0;
              const x = padding.left + (i / (scans.length - 1)) * innerWidth;
              const y = padding.top + innerHeight - (coverage / maxCoverage) * innerHeight;
              return (
                <circle key={`cov-${s.id}`} cx={x} cy={y} r="2.5" fill="hsl(var(--muted-foreground))" />
              );
            })}

            {/* X-axis labels (first, middle, last) */}
            <text x={padding.left} y={chartHeight - 4} fontSize="9" fill="hsl(var(--muted-foreground))" textAnchor="start">
              {new Date(scans[0].scan_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
            </text>
            <text x={chartWidth / 2} y={chartHeight - 4} fontSize="9" fill="hsl(var(--muted-foreground))" textAnchor="middle">
              {new Date(scans[Math.floor(scans.length / 2)].scan_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
            </text>
            <text x={chartWidth - padding.right} y={chartHeight - 4} fontSize="9" fill="hsl(var(--muted-foreground))" textAnchor="end">
              {new Date(scans[scans.length - 1].scan_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
            </text>
          </svg>
        </div>

        {/* Legend */}
        <div className="mt-2 flex items-center justify-center gap-6 text-xs flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-primary rounded" />
            <span className="text-muted-foreground">提交数</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-muted-foreground rounded" style={{ borderStyle: "dashed" }} />
            <span className="text-muted-foreground">增量覆盖率 %</span>
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
  let devStats: DeveloperStat[] = JSON.parse(latestHistory.developer_stats || "[]");

  if (devStats.length === 0) {
    return (
      <div className="px-6 pb-4 flex-1">
        <div className="rounded-lg border bg-card/50 p-4 h-full flex items-center justify-center">
          <p className="text-sm text-muted-foreground">暂无开发者数据</p>
        </div>
      </div>
    );
  }

  // Sort by code volume (lines_added + lines_removed)
  devStats = [...devStats].sort((a, b) => {
    const aTotal = a.lines_added + a.lines_removed;
    const bTotal = b.lines_added + b.lines_removed;
    return bTotal - aTotal;
  });

  // Get max code volume for bar scaling
  const maxCodeVolume = Math.max(...devStats.map(d => d.lines_added + d.lines_removed), 1);

  // Take only TOP 3
  const top3 = devStats.slice(0, 3);

  return (
    <div className="px-6 pb-4 flex-1">
      <div className="rounded-lg border bg-card/50 p-4 h-full flex flex-col">
        <div className="mb-4 flex items-center justify-between flex-shrink-0">
          <h4 className="text-sm font-medium">🏆 本周贡献TOP3</h4>
          <span className="text-xs text-muted-foreground">按代码量排名</span>
        </div>
        <div className="space-y-3 flex-1">
          {top3.map((dev, index) => {
            const codeVolume = dev.lines_added + dev.lines_removed;
            const barWidth = (codeVolume / maxCodeVolume) * 100;
            return (
              <div key={dev.name} className="flex items-center gap-3">
                <span className="w-6 text-center text-lg flex-shrink-0">
                  {index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium truncate" title={dev.name}>{dev.name}</span>
                    <span className="text-xs font-semibold text-primary ml-2 flex-shrink-0">
                      {formatNum(codeVolume)} 行代码
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-primary/80 to-primary"
                      style={{ width: `${Math.max(barWidth, 5)}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-0.5"><GitCommit className="h-3 w-3" />{dev.commits}提交</span>
                    <span className="flex items-center gap-0.5 text-green-600"><Plus className="h-3 w-3" />{formatNum(dev.lines_added)}</span>
                    <span className="flex items-center gap-0.5 text-red-600"><Minus className="h-3 w-3" />{formatNum(dev.lines_removed)}</span>
                    <span className="text-muted-foreground">{dev.projects.length}项目</span>
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
