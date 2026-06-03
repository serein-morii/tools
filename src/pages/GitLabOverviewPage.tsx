import { useState, useMemo, useEffect, Fragment } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, BarChart3, Users, GitCommit, TrendingUp, TrendingDown, MinusCircle, Inbox, GitBranch, ArrowUpDown, ArrowUp, ArrowDown, ShieldAlert, Bug, Zap, Loader2, GitMerge, ExternalLink, Shield, CheckCircle2, XCircle, Clock3, AlertTriangle, Activity, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";

import { useGitLabConfigured, useGitLabScanHistory, useTriggerGitLabScan, useGitLabConfig } from "@/lib/query/gitlabQueries";
import { FirstTimeSetupModal } from "@/components/modules/gitlab/FirstTimeSetupModal";
import { TrendChart, ContributorRanking } from "@/components/modules/gitlab/TrendChart";
import { ScanProgressModal } from "@/components/modules/gitlab/ScanProgressModal";
import { toast } from "sonner";
import { CustomSelect } from "@/components/ui/custom-select";
import { formatTimestamp, formatNumber } from "@/lib/gitlab/format";
import type { GitLabScanHistory, GitLabProjectResult, DeveloperStat } from "@/types";

function TrendIndicator({ current, previous, isPercent = false }: { current: number; previous?: number; isPercent?: boolean }) {
  if (previous === undefined) return null;
  const diff = current - previous;
  const formatValue = (v: number) => isPercent ? v.toFixed(2) : v;
  if (diff > 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
        <TrendingUp className="h-3 w-3" />+{formatValue(diff)}
      </span>
    );
  }
  if (diff < 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
        <TrendingDown className="h-3 w-3" />{formatValue(diff)}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
      <MinusCircle className="h-3 w-3" />-
    </span>
  );
}

function SummaryCards({
  current,
  previous,
}: {
  current?: GitLabScanHistory;
  previous?: GitLabScanHistory;
}) {
  const { t } = useTranslation();
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  const currentContributors = useMemo(
    () => current ? JSON.parse(current.contributors || "[]").length : 0,
    [current],
  );
  const previousContributors = useMemo(
    () => previous ? JSON.parse(previous.contributors || "[]").length : undefined,
    [previous],
  );
  const currentContributorList = useMemo(
    () => current ? JSON.parse(current.contributors || "[]") as string[] : [],
    [current],
  );
  const currentDevStats: DeveloperStat[] = useMemo(
    () => current ? JSON.parse(current.developer_stats || "[]") : [],
    [current],
  );
  const currentProjects: GitLabProjectResult[] = useMemo(
    () => current ? JSON.parse(current.summary || "[]") : [],
    [current],
  );

  const cards = [
    {
      id: "projects",
      icon: BarChart3,
      label: t("gitlab.overview.changedProjects"),
      value: current?.total_projects ?? 0,
      previousValue: previous?.total_projects,
    },
    {
      id: "commits",
      icon: GitCommit,
      label: t("gitlab.overview.totalCommits"),
      value: current?.total_commits ?? 0,
      previousValue: previous?.total_commits,
    },
    {
      id: "contributors",
      icon: Users,
      label: t("gitlab.overview.contributors"),
      value: currentContributors,
      previousValue: previousContributors,
    },
    {
      id: "coverage",
      icon: FlaskConical,
      label: "单测覆盖项目",
      value: current?.test_projects ?? 0,
      previousValue: previous?.test_projects,
    },
  ];

  const toggleCard = (id: string) => {
    setExpandedCard(expandedCard === id ? null : id);
  };

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-4 gap-2">
        {cards.map((card) => (
          <div
            key={card.id}
            className="rounded-md border bg-card p-2 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => toggleCard(card.id)}
          >
            <div className="flex items-center gap-1.5">
              <card.icon className="h-3 w-3 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-bold">{card.value}</span>
                  <TrendIndicator
                    current={typeof card.value === 'string' ? parseFloat(card.value) || 0 : card.value}
                    previous={card.previousValue}
                  />
                </div>
                <p className="text-[9px] text-muted-foreground truncate">{card.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 下探详情面板 */}
      {expandedCard && current && (
        <div className="rounded-lg border bg-card/50 px-3 py-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
          {expandedCard === "projects" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>项目列表 ({current.total_projects})</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 max-h-48 overflow-y-auto">
                {currentProjects.map((p) => (
                  <div key={p.project_id} className="flex items-center gap-1.5 rounded bg-muted/30 px-2 py-1">
                    <span className="text-[10px] truncate flex-1" title={p.project_name}>{p.project_name.split("/").pop()}</span>
                    {p.has_test && <span className="shrink-0 text-[10px] text-emerald-600 font-medium">{p.commits}c</span>}
                    {!p.has_test && <span className="shrink-0 text-[10px] text-muted-foreground">✗</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {expandedCard === "commits" && (
            <div className="space-y-2">
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                <span>总提交: <strong className="text-foreground">{current.total_commits}</strong></span>
                <span>+行: <strong className="text-emerald-600">{current.total_lines_added.toLocaleString()}</strong></span>
                <span>-行: <strong className="text-red-600">{current.total_lines_removed.toLocaleString()}</strong></span>
              </div>
              {currentDevStats.length > 0 && (
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  <div className="text-[10px] text-muted-foreground">开发者贡献明细</div>
                  {currentDevStats.slice(0, 10).map((dev, i) => (
                    <div key={dev.name} className="flex items-center gap-2 text-[10px] bg-muted/20 rounded px-2 py-1">
                      <span className="w-3.5 text-center shrink-0">{["🥇","🥈","🥉","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"][i]}</span>
                      <span className="flex-1 truncate">{dev.name}</span>
                      <span className="text-muted-foreground">{dev.commits} commits</span>
                      <span className="text-emerald-600">+{dev.lines_added.toLocaleString()}</span>
                      <span className="text-red-600">-{dev.lines_removed.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {expandedCard === "contributors" && (
            <div className="space-y-2">
              <div className="text-[10px] text-muted-foreground">
                贡献者 ({currentContributors} 人)
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {currentContributorList.map((name) => (
                  <span key={name} className="rounded-md bg-muted/50 px-2 py-0.5 text-[10px]">{name}</span>
                ))}
              </div>
            </div>
          )}
          {expandedCard === "coverage" && (
            <div className="space-y-2">
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                <span>有单测: <strong className="text-emerald-600">{current.test_projects}</strong></span>
                <span>无单测: <strong className="text-destructive">{current.total_projects - current.test_projects}</strong></span>
                <span>覆盖率: <strong>{current.total_projects > 0 ? Math.round((current.test_projects / current.total_projects) * 100) : 0}%</strong></span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full bg-emerald-500"
                  style={{ width: `${current.total_projects > 0 ? (current.test_projects / current.total_projects) * 100 : 0}%` }}
                />
              </div>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                <div className="text-[10px] text-muted-foreground">无单测项目</div>
                {currentProjects.filter(p => !p.has_test).slice(0, 10).map((p) => (
                  <div key={p.project_id} className="flex items-center text-[10px] text-muted-foreground bg-muted/20 rounded px-2 py-0.5">
                    <span className="flex-1 truncate">{p.project_name.split("/").pop()}</span>
                    <span>{p.commits} commits</span>
                  </div>
                ))}
                {currentProjects.filter(p => !p.has_test).length > 10 && (
                  <div className="text-[10px] text-muted-foreground text-center">...还有 {currentProjects.filter(p => !p.has_test).length - 10} 个</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RatingBadge({ label, rating }: { label: string; rating: string }) {
  const numMap: Record<string, number> = { "1.0": 5, "2.0": 4, "3.0": 3, "4.0": 2, "5.0": 1, "A": 5, "B": 4, "C": 3, "D": 2, "E": 1 };
  const num = numMap[rating] ?? 0;
  const color = num >= 4 ? "bg-emerald-500/10 text-emerald-600" : num >= 3 ? "bg-amber-500/10 text-amber-600" : "bg-destructive/10 text-destructive";
  const displayLabel = rating.replace(".0", "");
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {label}: {displayLabel}
    </span>
  );
}

function PipelineStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const config: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
    success: { icon: CheckCircle2, color: "text-emerald-600", label: t("gitlab.history.pipelineSuccess") },
    failed: { icon: XCircle, color: "text-destructive", label: t("gitlab.history.pipelineFailed") },
    running: { icon: Loader2, color: "text-blue-500", label: t("gitlab.history.pipelineRunning") },
    pending: { icon: Clock3, color: "text-amber-500", label: t("gitlab.history.pipelinePending") },
    canceled: { icon: MinusCircle, color: "text-muted-foreground", label: t("gitlab.history.pipelineCanceled") },
    skipped: { icon: MinusCircle, color: "text-muted-foreground", label: t("gitlab.history.pipelineSkipped") },
  };
  const c = config[status] || { icon: Clock3, color: "text-muted-foreground", label: status };
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${c.color}`}>
      <Icon className={`h-3 w-3 ${status === "running" ? "animate-spin" : ""}`} />
      {c.label}
    </span>
  );
}

function ProjectTable({ projects, gitlabUrl }: { projects: GitLabProjectResult[]; gitlabUrl?: string }) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");
  const [testFilter, setTestFilter] = useState<string>("all");
  const [walkinFilter, setWalkinFilter] = useState<string>("all");
  const [contributorFilter, setContributorFilter] = useState<string>("all");
  const [expandedProject, setExpandedProject] = useState<number | null>(null);
  const [selectedBranches, setSelectedBranches] = useState<Record<number, string>>({});

  // Sort state with localStorage persistence
  const [sortBy, setSortBy] = useState<string>(() => {
    return localStorage.getItem("gitlab-project-sort-by") || "name";
  });
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(() => {
    return (localStorage.getItem("gitlab-project-sort-order") as "asc" | "desc") || "asc";
  });

  // Persist sort settings
  useEffect(() => {
    localStorage.setItem("gitlab-project-sort-by", sortBy);
  }, [sortBy]);

  useEffect(() => {
    localStorage.setItem("gitlab-project-sort-order", sortOrder);
  }, [sortOrder]);

  // Get unique contributors for filter
  const allContributors = useMemo(() => {
    const contributors = new Set<string>();
    projects.forEach((p) => p.contributors.forEach((c) => contributors.add(c)));
    return Array.from(contributors).sort();
  }, [projects]);

  // Check if any project has Walkin data
  const hasWalkinData = useMemo(() => projects.some((p) => p.walkin_metrics != null), [projects]);

  // Filter and sort projects
  const filtered = useMemo(() => {
    const result = projects.filter((p) => {
      // Text search
      if (!p.project_name.toLowerCase().includes(search.toLowerCase())) return false;

      // Test filter
      if (testFilter === "has_test" && !p.has_test) return false;
      if (testFilter === "no_test" && p.has_test) return false;

      // Walkin filter
      if (walkinFilter === "has_walkin" && !p.walkin_metrics) return false;
      if (walkinFilter === "no_walkin" && p.walkin_metrics) return false;

      // Contributor filter
      if (contributorFilter !== "all" && !p.contributors.includes(contributorFilter)) return false;

      return true;
    });

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "name":
          cmp = a.project_name.localeCompare(b.project_name);
          break;
        case "commits":
          cmp = a.commits - b.commits;
          break;
        case "lines_added":
          cmp = a.lines_added - b.lines_added;
          break;
        case "lines_removed":
          cmp = a.lines_removed - b.lines_removed;
          break;
        case "coverage": {
          const aCov = getMaxNewCoverage(a) ?? -1;
          const bCov = getMaxNewCoverage(b) ?? -1;
          cmp = aCov - bCov;
          break;
        }
        default:
          cmp = 0;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return result;
  }, [projects, search, testFilter, walkinFilter, contributorFilter, sortBy, sortOrder]);

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  // Get max incremental coverage from all branches
  const getMaxNewCoverage = (project: GitLabProjectResult): number | null => {
    const branches = project.walkin_metrics_by_branch;
    if (branches && Object.keys(branches).length > 0) {
      // Multiple branches: get max new_coverage
      let maxCoverage: number | null = null;
      for (const metrics of Object.values(branches)) {
        if (metrics.new_coverage != null) {
          if (maxCoverage === null || metrics.new_coverage > maxCoverage) {
            maxCoverage = metrics.new_coverage;
          }
        }
      }
      return maxCoverage;
    }
    // Single branch or no branch: use walkin_metrics
    return project.walkin_metrics?.new_coverage ?? null;
  };


  return (
    <div>
      {/* Filters */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder={t("common.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded border bg-background px-2 py-1 text-xs w-28"
        />
        <CustomSelect
          value={testFilter}
          onChange={setTestFilter}
          options={[
            { value: "all", label: t("gitlab.overview.unitTest") },
            { value: "has_test", label: t("gitlab.overview.hasTest") || "✓" },
            { value: "no_test", label: t("gitlab.overview.noTest") || "✗" },
          ]}
          className="w-16"
        />
        <CustomSelect
          value={walkinFilter}
          onChange={setWalkinFilter}
          options={[
            { value: "all", label: "Walkin" },
            { value: "has_walkin", label: "✓" },
            { value: "no_walkin", label: "✗" },
          ]}
          className="w-20"
        />
        <CustomSelect
          value={contributorFilter}
          onChange={setContributorFilter}
          options={[
            { value: "all", label: t("gitlab.overview.contributorsFilter") },
            ...allContributors.map((c) => ({ value: c, label: c })),
          ]}
          className="w-24"
        />
        {filtered.length !== projects.length && (
          <span className="text-xs text-muted-foreground">
            {filtered.length}/{projects.length}
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-8"></th>
              <th className="px-2 py-1 text-left font-medium">{t("gitlab.overview.project")}</th>
              <th
                className="px-2 py-1 text-right font-medium cursor-pointer hover:bg-muted/80 select-none"
                onClick={() => toggleSort("commits")}
              >
                <div className="flex items-center justify-end gap-1">
                  <SortIcon field="commits" sortBy={sortBy} sortOrder={sortOrder} />
                  {t("gitlab.overview.commits")}
                </div>
              </th>
              <th
                className="px-2 py-1 text-right font-medium cursor-pointer hover:bg-muted/80 select-none"
                onClick={() => toggleSort("lines_added")}
              >
                <div className="flex items-center justify-end gap-1">
                  <SortIcon field="lines_added" sortBy={sortBy} sortOrder={sortOrder} />
                  +/-
                </div>
              </th>
              <th className="px-2 py-1 text-center font-medium">{t("gitlab.overview.unitTest")}</th>
              <th className="px-2 py-1 text-center font-medium">Walkin</th>
              {hasWalkinData && (
                <th
                  className="px-2 py-1 text-center font-medium cursor-pointer hover:bg-muted/80 select-none"
                  onClick={() => toggleSort("coverage")}
                >
                  <div className="flex items-center justify-center gap-1">
                    <SortIcon field="coverage" sortBy={sortBy} sortOrder={sortOrder} />
                    {t("gitlab.overview.incrementalCoverage")}
                  </div>
                </th>
              )}
              <th className="px-2 py-1 text-left font-medium">{t("gitlab.overview.contributorsFilter")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((project) => {
              const isExpanded = expandedProject === project.project_id;
              return (
                <Fragment key={project.project_id}>
                  <tr
                    className="hover:bg-muted/30 cursor-pointer"
                    onClick={() => setExpandedProject(isExpanded ? null : project.project_id)}
                  >
                    <td className="w-8 text-center">
                      <span className={`inline-block transition-transform text-xs ${isExpanded ? "rotate-90" : ""}`}>
                        ▶
                      </span>
                    </td>
                    <td className="px-2 py-1 font-medium">
                      {gitlabUrl ? (
                        <a
                          href={`${gitlabUrl}/${project.project_name}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-primary hover:underline inline-flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {project.project_name.split("/").pop()}
                          <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                        </a>
                      ) : (
                        project.project_name.split("/").pop()
                      )}
                    </td>
                    <td className="px-2 py-1 text-right">{project.commits}</td>
                    <td className="px-2 py-1 text-right">
                      <span className="text-emerald-600">+{formatNumber(project.lines_added)}</span>
                      <span className="text-red-600 ml-1">-{formatNumber(project.lines_removed)}</span>
                    </td>
                    <td className="px-2 py-1 text-center">
                      {project.has_test ? "✓" : <span className="text-muted-foreground">✗</span>}
                    </td>
                    <td className="px-2 py-1 text-center">
                      {project.walkin_metrics ? "✓" : <span className="text-muted-foreground">✗</span>}
                    </td>
                    {hasWalkinData && (
                      <td className="px-2 py-1 text-center">
                        {(() => {
                          const coverage = getMaxNewCoverage(project);
                          return coverage != null ? (
                            <span className="text-xs font-medium">{coverage.toFixed(1)}%</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          );
                        })()}
                      </td>
                    )}
                    <td className="px-2 py-1 text-muted-foreground text-xs">
                      {project.contributors.slice(0, 2).join(", ")}
                      {project.contributors.length > 2 && ` +${project.contributors.length - 2}`}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${project.project_id}-detail`} className="bg-muted/20">
                      <td colSpan={hasWalkinData ? 8 : 7} className="px-2 py-1 pl-10">
                        <div className="text-xs space-y-2">
                          {/* Walkin quality metrics */}
                          {project.walkin_metrics && (() => {
                            // Determine current metrics to display
                            const branches = project.walkin_metrics_by_branch;
                            const selectedBranch = selectedBranches[project.project_id];
                            const currentMetrics = branches && selectedBranch && branches[selectedBranch]
                              ? branches[selectedBranch]
                              : project.walkin_metrics;
                            const branchNames = branches ? Object.keys(branches) : [];

                            return (
                            <div className="space-y-2">
                              {/* 分支选择器 + 分析时间 */}
                              {branches && branchNames.length > 1 ? (
                                <div className="flex items-center gap-4 text-xs">
                                  <div className="flex items-center gap-2">
                                    <GitBranch className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-muted-foreground">{t("gitlab.overview.branch")}</span>
                                    <CustomSelect
                                      value={selectedBranch || currentMetrics.branch || "master"}
                                      onChange={(v) => setSelectedBranches(prev => ({ ...prev, [project.project_id]: v }))}
                                      options={branchNames.map(b => ({ value: b, label: b }))}
                                      className="w-32 h-6 text-xs"
                                    />
                                  </div>
                                  {currentMetrics.analysis_date && (
                                    <span className="text-muted-foreground">
                                      {t("gitlab.overview.analysis")}{new Date(currentMetrics.analysis_date).toLocaleString(i18n.language)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center gap-4 text-xs">
                                  <div className="flex items-center gap-2">
                                    <GitBranch className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-muted-foreground">{t("gitlab.overview.branch")}</span>
                                    <span className="font-medium">{currentMetrics.branch || "master"}</span>
                                  </div>
                                  {currentMetrics.analysis_date && (
                                    <span className="text-muted-foreground">
                                      {t("gitlab.overview.analysis")}{new Date(currentMetrics.analysis_date).toLocaleString(i18n.language)}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* 质量指标 */}
                              <div className="flex items-center gap-4 flex-wrap">
                                <span className="flex items-center gap-1 text-xs">
                                  <Bug className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">Bug</span>
                                  <span className="font-medium">{currentMetrics.bugs}</span>
                                </span>
                                <span className="flex items-center gap-1 text-xs">
                                  <ShieldAlert className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">{t("gitlab.overview.vulnerabilities")}</span>
                                  <span className="font-medium">{currentMetrics.vulnerabilities}</span>
                                </span>
                                <span className="flex items-center gap-1 text-xs">
                                  <Zap className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">{t("gitlab.overview.codeSmells")}</span>
                                  <span className="font-medium">{currentMetrics.code_smells}</span>
                                </span>
                                {currentMetrics.duplicated_lines_density != null && (
                                  <span className="text-xs">
                                    <span className="text-muted-foreground">{t("gitlab.overview.duplicatedRate")}</span>
                                    <span className="font-medium">{currentMetrics.duplicated_lines_density.toFixed(1)}%</span>
                                  </span>
                                )}
                              </div>

                              <div className="border-t pt-2">
                                <div className="text-xs text-muted-foreground mb-1">{t("gitlab.overview.incrementalCoverageSection")}</div>
                                <div className="grid grid-cols-3 gap-2 text-xs">
                                  {currentMetrics.new_coverage != null && (
                                    <div>
                                      <span className="text-muted-foreground">{t("gitlab.overview.overallCoverage")}</span>
                                      <span className="ml-1 font-medium">{currentMetrics.new_coverage.toFixed(2)}%</span>
                                    </div>
                                  )}
                                  {currentMetrics.new_line_coverage != null && (
                                    <div>
                                      <span className="text-muted-foreground">{t("gitlab.overview.lineCoverage")}</span>
                                      <span className="ml-1 font-medium">{currentMetrics.new_line_coverage.toFixed(2)}%</span>
                                    </div>
                                  )}
                                  {currentMetrics.new_condition_coverage != null && (
                                    <div>
                                      <span className="text-muted-foreground">{t("gitlab.overview.conditionCoverage")}</span>
                                      <span className="ml-1 font-medium">{currentMetrics.new_condition_coverage.toFixed(2)}%</span>
                                    </div>
                                  )}
                                  {currentMetrics.new_lines_to_cover != null && (
                                    <div>
                                      <span className="text-muted-foreground">{t("gitlab.overview.codeLines")}</span>
                                      <span className="ml-1 font-medium">{currentMetrics.new_lines_to_cover}</span>
                                    </div>
                                  )}
                                  {currentMetrics.new_line_cover != null && currentMetrics.new_lines_to_cover != null && (
                                    <div>
                                      <span className="text-muted-foreground">{t("gitlab.overview.covered")}</span>
                                      <span className="ml-1 font-medium">{currentMetrics.new_line_cover}/{currentMetrics.new_lines_to_cover}</span>
                                    </div>
                                  )}
                                  {currentMetrics.new_condition_to_cover != null && (
                                    <div>
                                      <span className="text-muted-foreground">{t("gitlab.overview.conditions")}</span>
                                      <span className="ml-1 font-medium">
                                        {currentMetrics.new_condition_to_cover - (currentMetrics.new_un_condition_to_cover || 0)}/{currentMetrics.new_condition_to_cover}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="border-t pt-2">
                                <div className="text-xs text-muted-foreground mb-1">{t("gitlab.overview.fullCoverageSection")}</div>
                                <div className="grid grid-cols-3 gap-2 text-xs">
                                  {currentMetrics.coverage != null && (
                                    <div>
                                      <span className="text-muted-foreground">{t("gitlab.overview.overallCoverage")}</span>
                                      <span className="ml-1 font-medium">{currentMetrics.coverage.toFixed(2)}%</span>
                                    </div>
                                  )}
                                  {currentMetrics.line_coverage != null && (
                                    <div>
                                      <span className="text-muted-foreground">{t("gitlab.overview.lineCoverage")}</span>
                                      <span className="ml-1 font-medium">{currentMetrics.line_coverage.toFixed(2)}%</span>
                                    </div>
                                  )}
                                  {currentMetrics.branch_coverage != null && (
                                    <div>
                                      <span className="text-muted-foreground">{t("gitlab.overview.conditionCoverage")}</span>
                                      <span className="ml-1 font-medium">{currentMetrics.branch_coverage.toFixed(2)}%</span>
                                    </div>
                                  )}
                                  {currentMetrics.lines_to_cover != null && (
                                    <div>
                                      <span className="text-muted-foreground">{t("gitlab.overview.codeLineCount")}</span>
                                      <span className="ml-1 font-medium">{currentMetrics.lines_to_cover}</span>
                                    </div>
                                  )}
                                  {currentMetrics.lines_to_cover != null && currentMetrics.line_coverage != null && (
                                    <div>
                                      <span className="text-muted-foreground">{t("gitlab.overview.covered")}</span>
                                      <span className="ml-1 font-medium">{Math.round(currentMetrics.lines_to_cover * currentMetrics.line_coverage / 100)}</span>
                                    </div>
                                  )}
                                  {currentMetrics.conditions_to_cover != null && (
                                    <div>
                                      <span className="text-muted-foreground">{t("gitlab.overview.conditions")}</span>
                                      <span className="ml-1 font-medium">
                                        {currentMetrics.conditions_to_cover - (currentMetrics.uncovered_conditions || 0)}/{currentMetrics.conditions_to_cover}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            );
                          })()}
                          <div className="text-muted-foreground mb-1 border-t pt-2">
                            {project.has_test ? t("gitlab.overview.testCommitRecords") : t("gitlab.overview.noTestCommits")}
                          </div>
                          {project.has_test && project.test_commits.length > 0 && (
                            <ul className="space-y-1">
                              {project.test_commits.map((commit, idx) => (
                                <li key={idx} className="flex items-center justify-between gap-2 text-xs">
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    <span>✓</span>
                                    <span className="truncate">{commit.title}</span>
                                  </div>
                                  <div className="text-xs text-muted-foreground shrink-0">
                                    <span>{commit.author}</span>
                                    <span className="mx-2">·</span>
                                    <span>{new Date(commit.created_at).toLocaleDateString(i18n.language)}</span>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}

                          {/* Quality Ratings */}
                          {project.walkin_metrics && (project.walkin_metrics.reliability_rating || project.walkin_metrics.security_rating || project.walkin_metrics.maintainability_rating) && (
                            <div className="border-t pt-2">
                              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                                <Shield className="h-3 w-3" /> {t("gitlab.overview.qualityRatings")}
                              </div>
                              <div className="flex items-center gap-3">
                                {project.walkin_metrics.reliability_rating && (
                                  <RatingBadge label={t("gitlab.overview.reliability")} rating={project.walkin_metrics.reliability_rating} />
                                )}
                                {project.walkin_metrics.security_rating && (
                                  <RatingBadge label={t("gitlab.overview.security")} rating={project.walkin_metrics.security_rating} />
                                )}
                                {project.walkin_metrics.maintainability_rating && (
                                  <RatingBadge label={t("gitlab.overview.maintainability")} rating={project.walkin_metrics.maintainability_rating} />
                                )}
                              </div>
                            </div>
                          )}

                          {/* Incremental Quality Issues */}
                          {project.walkin_metrics && (project.walkin_metrics.new_bugs > 0 || project.walkin_metrics.new_vulnerabilities > 0 || project.walkin_metrics.new_code_smells > 0) && (
                            <div className="border-t pt-2">
                              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                                <AlertTriangle className="h-3 w-3" /> {t("gitlab.overview.incrementalIssues")}
                              </div>
                              <div className="flex items-center gap-3 text-xs">
                                {project.walkin_metrics.new_bugs > 0 && (
                                  <span className="flex items-center gap-1 text-destructive">
                                    <Bug className="h-3 w-3" /> {project.walkin_metrics.new_bugs} {t("gitlab.overview.newBugs")}
                                  </span>
                                )}
                                {project.walkin_metrics.new_vulnerabilities > 0 && (
                                  <span className="flex items-center gap-1 text-amber-600">
                                    <ShieldAlert className="h-3 w-3" /> {project.walkin_metrics.new_vulnerabilities} {t("gitlab.overview.newVulnerabilities")}
                                  </span>
                                )}
                                {project.walkin_metrics.new_code_smells > 0 && (
                                  <span className="flex items-center gap-1 text-muted-foreground">
                                    <Zap className="h-3 w-3" /> {project.walkin_metrics.new_code_smells} {t("gitlab.overview.newCodeSmells")}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Pipeline Status */}
                          {project.latest_pipeline_status && (
                            <div className="border-t pt-2">
                              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
                                <Activity className="h-3 w-3" /> {t("gitlab.overview.latestPipeline")}
                              </div>
                              <PipelineStatusBadge status={project.latest_pipeline_status} />
                            </div>
                          )}

                          {/* MR Details */}
                          {project.mr_details && project.mr_details.length > 0 && (
                            <div className="border-t pt-2">
                              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                                <GitMerge className="h-3 w-3" /> {t("gitlab.overview.mergeRequests")} ({project.mr_details.length})
                                {project.pending_mrs > 0 && (
                                  <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600">
                                    {project.pending_mrs} {t("gitlab.overview.pendingMerge")}
                                  </span>
                                )}
                              </div>
                              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                {project.mr_details.map((mr) => (
                                  <div key={mr.iid} className="flex items-center justify-between rounded bg-muted/30 px-2.5 py-1.5 text-xs">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-muted-foreground shrink-0">!{mr.iid}</span>
                                      <span className="font-medium truncate">{mr.title}</span>
                                      <span className="text-muted-foreground shrink-0">
                                        {mr.source_branch} → {mr.target_branch}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 ml-2">
                                      {mr.pipeline_status && <PipelineStatusBadge status={mr.pipeline_status} />}
                                      <span className="text-muted-foreground">{mr.author}</span>
                                      <span className="text-muted-foreground">{new Date(mr.created_at).toLocaleDateString(i18n.language, { month: "numeric", day: "numeric" })}</span>
                                      {mr.web_url && (
                                        <a href={mr.web_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                                          <ExternalLink className="h-3 w-3" />
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Last Commit */}
                          {project.last_commit_at && (
                            <div className="border-t pt-2 text-xs text-muted-foreground">
                              {t("gitlab.overview.lastCommit")} {new Date(project.last_commit_at).toLocaleString(i18n.language)}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={hasWalkinData ? 8 : 7} className="px-4 py-4 text-center text-xs text-muted-foreground">
                  {t("gitlab.overview.noMatchingProjects")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


  function SortIcon({ field, sortBy, sortOrder }: { field: string; sortBy: string; sortOrder: "asc" | "desc" }) {
    if (sortBy !== field) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />;
    return sortOrder === "asc"
      ? <ArrowUp className="h-3.5 w-3.5 text-primary" />
      : <ArrowDown className="h-3.5 w-3.5 text-primary" />;
  }
export function GitLabOverviewPage() {
  const { t, i18n } = useTranslation();
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [selectedScanIndex, setSelectedScanIndex] = useState<number>(0);
  const { data: isConfigured, refetch } = useGitLabConfigured();
  const { data: config } = useGitLabConfig();
  const { data: history, refetch: refetchHistory } = useGitLabScanHistory(10);
  const triggerScan = useTriggerGitLabScan();

  // Selected scan data (defaults to latest)
  const selectedHistory = history?.[selectedScanIndex];
  const previousHistory = history?.[selectedScanIndex + 1];
  const projects: GitLabProjectResult[] = useMemo(
    () => selectedHistory ? JSON.parse(selectedHistory.summary || "[]") : [],
    [selectedHistory],
  );

  // Latest Walkin analysis date across all projects
  const latestWalkinDate = useMemo(() => {
    let latest = 0;
    for (const p of projects) {
      if (p.walkin_metrics?.analysis_date && p.walkin_metrics.analysis_date > latest) {
        latest = p.walkin_metrics.analysis_date;
      }
    }
    return latest > 0 ? latest : null;
  }, [projects]);

  // Calculate next scan time from cron
  const getNextScanTime = () => {
    if (!config?.scan_schedule) return null;
    try {
      // Parse cron: "0 9 * * 1" means every Monday at 9:00
      const parts = config.scan_schedule.split(" ");
      if (parts.length !== 5) return null;
      const hour = parseInt(parts[1]);
      const dayOfWeek = parseInt(parts[4]); // 0-6, 0=Sunday
      const now = new Date();
      const targetDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert to 0-6 (Mon=0)
      const currentDay = now.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      const nextDate = new Date(now);
      nextDate.setDate(now.getDate() + daysUntil);
      nextDate.setHours(hour, 0, 0, 0);
      return nextDate;
    } catch {
      return null;
    }
  };

  const nextScanTime = getNextScanTime();

  const handleScan = async () => {
    setShowProgressModal(true);
    try {
      await triggerScan.mutateAsync("manual");
      // Reset to latest scan after new scan
      setSelectedScanIndex(0);
      // Refetch history
      refetchHistory();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: string }).message)
          : String(error);
      toast.error(t("gitlab.overview.scanFailed") + errorMessage);
    }
  };

  // Listen for tray scan shortcut
  useEffect(() => {
    const handler = () => {
      if (isConfigured) {
        handleScan();
      }
    };
    window.addEventListener("tray-scan", handler);
    return () => window.removeEventListener("tray-scan", handler);
  }, [isConfigured]);

  if (isConfigured === false) {
    return (
      <>
        {showSetupModal && (
          <FirstTimeSetupModal
            onComplete={() => {
              setShowSetupModal(false);
              refetch();
            }}
            onSkip={() => setShowSetupModal(false)}
          />
        )}
        <div className="flex h-[400px] items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">{t("gitlab.overview.configureGitLabFirst")}</p>
            <Button onClick={() => setShowSetupModal(true)}>{t("gitlab.overview.configureGitLab")}</Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-full bg-background">
      {/* Header */}
      <div className="border-b px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-medium">GitLab 概览</h1>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1400px] space-y-3 px-3 py-3 animate-in fade-in duration-200">
      <ScanProgressModal
        isOpen={showProgressModal}
        onClose={() => setShowProgressModal(false)}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {history && history.length > 0 && (
            <CustomSelect
              value={selectedScanIndex.toString()}
              onChange={(v) => setSelectedScanIndex(parseInt(v))}
              options={history.map((scan, idx) => ({
                value: idx.toString(),
                label: new Date(scan.scan_at).toLocaleDateString(i18n.language),
              }))}
              className="w-32"
            />
          )}
          <span className="text-xs text-muted-foreground">
            {selectedHistory ? formatTimestamp(selectedHistory.scan_at) : t("gitlab.overview.noRecords")}
          </span>
          {latestWalkinDate && (
            <span className="text-xs text-muted-foreground">
              Walkin: {formatTimestamp(latestWalkinDate)}
            </span>
          )}
          {nextScanTime && (
            <span className="text-xs text-muted-foreground">
              {t("gitlab.overview.nextScan")}{nextScanTime.toLocaleDateString(i18n.language)}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="h-7 text-xs" onClick={handleScan} disabled={triggerScan.isPending}>
            <RefreshCw className={`mr-1 h-3 w-3 ${triggerScan.isPending ? "animate-spin" : ""}`} />
            {t("gitlab.overview.scan")}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <SummaryCards current={selectedHistory} previous={previousHistory} />

      {/* Empty State */}
      {!selectedHistory && (
        <div className="flex flex-col items-center justify-center py-8">
          <Inbox className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-xs font-medium mb-1.5">{t("gitlab.overview.noScanData")}</p>
          <p className="text-xs text-muted-foreground mb-3">{t("gitlab.overview.clickToScan")}</p>
        </div>
      )}

      {selectedHistory && (
        <>
          {/* Trend Charts + Developer Ranking */}
          <div className="flex items-stretch gap-3">
            <TrendChart history={history || []} />
            <ContributorRanking history={history || []} />
          </div>

          {/* Trend Detail - incremental issues summary */}
          {selectedHistory && (() => {
            const projects: GitLabProjectResult[] = JSON.parse(selectedHistory.summary || "[]");
            const walkinProjects = projects.filter(p => p.walkin_metrics);
            if (walkinProjects.length === 0) return null;

            let totalBugs = 0, totalVulns = 0, totalSmells = 0, totalDup = 0;
            for (const p of walkinProjects) {
              totalBugs += p.walkin_metrics?.bugs || 0;
              totalVulns += p.walkin_metrics?.vulnerabilities || 0;
              totalSmells += p.walkin_metrics?.code_smells || 0;
              if (p.walkin_metrics?.duplicated_lines_density != null) totalDup++;
            }
            const avgDup = totalDup > 0
              ? (walkinProjects.reduce((s, p) => s + (p.walkin_metrics?.duplicated_lines_density || 0), 0) / totalDup).toFixed(1)
              : "-";
            return (
              <div className="rounded-lg border bg-card/50 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <ShieldAlert className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-medium">Walkin 代码质量汇总</span>
                  <span className="text-[10px] text-muted-foreground">({walkinProjects.length} 项目)</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                  <div className="rounded bg-muted/30 p-2 text-center">
                    <Bug className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground" />
                    <div className="font-medium">{totalBugs}</div>
                    <div className="text-muted-foreground">Bug</div>
                  </div>
                  <div className="rounded bg-muted/30 p-2 text-center">
                    <ShieldAlert className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground" />
                    <div className="font-medium">{totalVulns}</div>
                    <div className="text-muted-foreground">漏洞</div>
                  </div>
                  <div className="rounded bg-muted/30 p-2 text-center">
                    <Zap className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground" />
                    <div className="font-medium">{totalSmells}</div>
                    <div className="text-muted-foreground">异味</div>
                  </div>
                  <div className="rounded bg-muted/30 p-2 text-center">
                    <BarChart3 className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground" />
                    <div className="font-medium">{avgDup}%</div>
                    <div className="text-muted-foreground">重复率</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Project Table */}
          <ProjectTable projects={projects} gitlabUrl={config?.url} />
        </>
      )}
    </div>
    </div>
  );

}
