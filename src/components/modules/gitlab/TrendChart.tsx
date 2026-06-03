import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { GitLabScanHistory, DeveloperStat, GitLabProjectResult } from "@/types";
import { GitCommit, Plus, Minus, ChevronDown } from "lucide-react";

interface TrendChartProps {
  history: GitLabScanHistory[];
}

export function TrendChart({ history }: TrendChartProps) {
  const { t } = useTranslation();
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

  const scans = history.slice(0, dataCount).reverse();

  if (scans.length < 2) {
    return (
      <div className="flex-1">
        <div className="rounded-md border bg-card/50 h-full flex items-center justify-center">
          <p className="text-xs text-muted-foreground">{t("gitlab.chart.needMoreScans")}</p>
        </div>
      </div>
    );
  }

  const getNewCoverage = (scan: GitLabScanHistory): number | null => {
    try {
      const projects: GitLabProjectResult[] = JSON.parse(scan.summary || "[]");
      let sum = 0, count = 0;
      for (const p of projects) {
        if (p.walkin_metrics?.new_coverage != null) { sum += p.walkin_metrics.new_coverage; count++; }
      }
      return count > 0 ? sum / count : null;
    } catch { return null; }
  };

  // Separate Y axes: commits use its own max, coverage is always 0-100
  const maxCommits = Math.max(...scans.map(s => s.total_commits), 1);
  const hasCoverage = scans.some(s => getNewCoverage(s) != null);

  // Use responsive SVG width (100%) instead of fixed pixel width
  const chartHeight = 90;
  const padding = { top: 10, right: 24, bottom: 14, left: 32 };
  const drawingWidth = 200 - padding.left - padding.right;

  // Sample commits for y-axis ticks (4 evenly spaced values)
  const commitTicks = [0, Math.round(maxCommits / 4), Math.round(maxCommits / 2), Math.round(maxCommits * 3 / 4), maxCommits];

  const countOptions = [
    { value: 20, label: t("gitlab.chart.last20") },
    { value: 30, label: t("gitlab.chart.last30") },
    { value: 50, label: t("gitlab.chart.last50") },
  ];

  return (
    <div className="flex-1 min-w-0">
      <div className="rounded-md border bg-card/50 p-3 h-full flex flex-col">
        <div className="mb-1.5 flex items-center justify-between flex-shrink-0">
          <h4 className="text-xs font-medium">{t("gitlab.chart.trendAnalysis")}</h4>
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-1 h-6 rounded-md border border-input bg-background px-2 text-[10px] hover:bg-muted/50 transition-colors"
            >
              {t("gitlab.chart.lastN", { count: dataCount })}
              <ChevronDown className={`h-2.5 w-2.5 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-50 mt-1 min-w-[80px] rounded-md border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95">
                {countOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setDataCount(opt.value as 20 | 30 | 50); setMenuOpen(false); }}
                    className={`flex w-full items-center rounded-sm px-2 py-1 text-[10px] transition-colors hover:bg-accent ${opt.value === dataCount ? "bg-accent/50 font-medium" : ""}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <svg viewBox={`0 0 ${200} ${chartHeight}`} preserveAspectRatio="none" className="w-full h-full">
            {/* Grid lines (4 horizontal) */}
            {[0, 1, 2, 3, 4].map(i => {
              const y = padding.top + (i / 4) * (chartHeight - padding.top - padding.bottom);
              return (
                <g key={`grid-${i}`}>
                  <line x1={padding.left} y1={y} x2={padding.left + drawingWidth} y2={y} stroke="hsl(var(--border))" strokeWidth="0.5" />
                  {/* Y-axis labels (commits on left, coverage on right) */}
                  <text x={padding.left - 4} y={y + 3} textAnchor="end" fontSize="5" fill="hsl(var(--muted-foreground))">
                    {commitTicks[4 - i]}
                  </text>
                  {hasCoverage && (
                    <text x={padding.left + drawingWidth + 4} y={y + 3} textAnchor="start" fontSize="5" fill="hsl(var(--muted-foreground))">
                      {(4 - i) * 25}%
                    </text>
                  )}
                </g>
              );
            })}

            {/* Commit line */}
            <polyline
              points={scans.map((s, i) => {
                const x = padding.left + (i / (scans.length - 1)) * drawingWidth;
                const y = padding.top + (chartHeight - padding.top - padding.bottom) * (1 - s.total_commits / maxCommits);
                return `${x},${y}`;
              }).join(" ")}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Coverage line (dashed, right axis mapped to 0-100%) */}
            {hasCoverage && (
              <polyline
                points={scans.map((s, i) => {
                  const cov = getNewCoverage(s) ?? 0;
                  const x = padding.left + (i / (scans.length - 1)) * drawingWidth;
                  const y = padding.top + (chartHeight - padding.top - padding.bottom) * (1 - cov / 100);
                  return `${x},${y}`;
                }).join(" ")}
                fill="none"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth="1"
                strokeDasharray="3 2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}

            {/* X-axis date labels (first, middle, last) */}
            <text x={padding.left} y={chartHeight - 2} fontSize="6" fill="hsl(var(--muted-foreground))">
              {new Date(scans[0].scan_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
            </text>
            <text x={padding.left + drawingWidth} y={chartHeight - 2} fontSize="6" fill="hsl(var(--muted-foreground))" textAnchor="end">
              {new Date(scans[scans.length - 1].scan_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
            </text>
          </svg>
        </div>

        {/* Legend */}
        <div className="mt-1.5 flex items-center justify-center gap-4 text-[10px] flex-shrink-0">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-[2px] bg-primary rounded" />
            <span className="text-muted-foreground">{t("gitlab.chart.commitCount")}</span>
          </div>
          {hasCoverage && (
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-0" style={{ borderTop: "1.5px dashed hsl(var(--muted-foreground))" }} />
              <span className="text-muted-foreground">{t("gitlab.chart.incrementalCoveragePercent")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ContributorRanking({ history }: { history: GitLabScanHistory[] }) {
  const { t } = useTranslation();

  if (history.length === 0) {
    return (
      <div className="flex-1">
        <div className="rounded-md border bg-card/50 h-full flex items-center justify-center">
          <p className="text-xs text-muted-foreground">{t("gitlab.chart.noScanData")}</p>
        </div>
      </div>
    );
  }

  const latestHistory = history[0];
  let devStats: DeveloperStat[] = JSON.parse(latestHistory.developer_stats || "[]");

  if (devStats.length === 0) {
    return (
      <div className="flex-1">
        <div className="rounded-md border bg-card/50 h-full flex items-center justify-center">
          <p className="text-xs text-muted-foreground">{t("gitlab.chart.noDeveloperData")}</p>
        </div>
      </div>
    );
  }

  devStats = [...devStats].sort((a, b) => {
    const aTotal = a.lines_added + a.lines_removed;
    const bTotal = b.lines_added + b.lines_removed;
    return bTotal - aTotal;
  });

  const maxCodeVolume = Math.max(...devStats.map(d => d.lines_added + d.lines_removed), 1);
  const top5 = devStats.slice(0, 5);

  return (
    <div className="flex-1 min-w-0">
      <div className="rounded-md border bg-card/50 p-3 h-full flex flex-col">
        <div className="mb-1.5 flex items-center justify-between flex-shrink-0">
          <h4 className="text-xs font-medium">🏆 {t("gitlab.chart.contributionTop5")}</h4>
        </div>
        <div className="space-y-1 flex-1 overflow-auto">
          {top5.map((dev, index) => {
            const codeVolume = dev.lines_added + dev.lines_removed;
            const barWidth = (codeVolume / maxCodeVolume) * 100;
            return (
              <div key={dev.name} className="flex items-center gap-1">
                <span className="w-3.5 text-center text-xs flex-shrink-0">
                  {index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] font-medium truncate" title={dev.name}>{dev.name}</span>
                    <span className="text-[10px] font-semibold text-primary ml-1 flex-shrink-0">
                      {formatNum(codeVolume)}{t("gitlab.chart.linesOfCode")}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1">
                    <div className="h-1 rounded-full bg-gradient-to-r from-primary/60 to-primary" style={{ width: `${Math.max(barWidth, 3)}%` }} />
                  </div>
                  <div className="flex items-center gap-2 text-[9px] text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-0.5"><GitCommit className="h-2.5 w-2.5" />{dev.commits}</span>
                    <span className="flex items-center gap-0.5 text-emerald-600"><Plus className="h-2.5 w-2.5" />{formatNum(dev.lines_added)}</span>
                    <span className="flex items-center gap-0.5 text-red-600"><Minus className="h-2.5 w-2.5" />{formatNum(dev.lines_removed)}</span>
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
