import { useState, useMemo, useEffect, Fragment } from "react";
import { RefreshCw, Download, BarChart3, Users, GitCommit, CheckCircle, Plus, GitPullRequest, TrendingUp, TrendingDown, MinusCircle, ExternalLink, Inbox, GitBranch, Clock, User, Filter, ArrowUpDown, ArrowUp, ArrowDown, Copy, FolderGit2, HelpCircle, ShieldAlert, Bug, Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useGitLabConfigured, useGitLabScanHistory, useTriggerGitLabScan, useGitLabConfig } from "@/lib/query/gitlabQueries";
import { FirstTimeSetupModal } from "@/components/modules/gitlab/FirstTimeSetupModal";
import { TrendChart, ContributorRanking } from "@/components/modules/gitlab/TrendChart";
import { ScanProgressModal } from "@/components/modules/gitlab/ScanProgressModal";
import { generateWeeklyReport, downloadReport } from "@/components/modules/gitlab/reportGenerator";
import { useWalkinAuth } from "@/components/modules/gitlab/WalkinAuthManager";
import { gitlabApi } from "@/lib/api/gitlab";
import { toast } from "sonner";
import { CustomSelect } from "@/components/ui/custom-select";
import type { GitLabScanHistory, GitLabProjectResult, MrDetail, UnitBoardData } from "@/types";

function formatNumber(num: number): string {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + "w";
  }
  return num.toLocaleString();
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN");
}

function formatRelativeTime(ts: string): string {
  const now = Date.now();
  const date = new Date(ts).getTime();
  const diff = now - date;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "刚刚";
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return new Date(ts).toLocaleDateString("zh-CN");
}

function TrendIndicator({ current, previous }: { current: number; previous?: number }) {
  if (previous === undefined) return null;
  const diff = current - previous;
  if (diff > 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
        <TrendingUp className="h-3 w-3" />+{diff}
      </span>
    );
  }
  if (diff < 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
        <TrendingDown className="h-3 w-3" />{diff}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
      <MinusCircle className="h-3 w-3" />-
    </span>
  );
}

function SummaryCards({ current, previous }: { current?: GitLabScanHistory; previous?: GitLabScanHistory }) {
  const currentContributors = current ? JSON.parse(current.contributors || "[]").length : 0;
  const previousContributors = previous ? JSON.parse(previous.contributors || "[]").length : undefined;

  const currentCoverage = current && current.total_projects > 0
    ? Math.round((current.test_projects / current.total_projects) * 100)
    : 0;
  const previousCoverage = previous && previous.total_projects > 0
    ? Math.round((previous.test_projects / previous.total_projects) * 100)
    : undefined;

  // Compute Walkin aggregates from projects
  const walkinAggregates = useMemo(() => {
    if (!current) return null;
    const projects: GitLabProjectResult[] = JSON.parse(current.summary || "[]");
    let newCoverageSum = 0;
    let lineCoverageSum = 0;
    let newCoverageCount = 0;
    let lineCoverageCount = 0;
    for (const p of projects) {
      if (p.walkin_metrics?.new_coverage != null) {
        newCoverageSum += p.walkin_metrics.new_coverage;
        newCoverageCount++;
      }
      if (p.walkin_metrics?.line_coverage != null) {
        lineCoverageSum += p.walkin_metrics.line_coverage;
        lineCoverageCount++;
      }
    }
    return {
      newCoverageAvg: newCoverageCount > 0 ? newCoverageSum / newCoverageCount : null,
      lineCoverageAvg: lineCoverageCount > 0 ? lineCoverageSum / lineCoverageCount : null,
    };
  }, [current]);

  const cards = [
    {
      icon: BarChart3,
      label: "变更项目",
      value: current?.total_projects ?? 0,
      previousValue: previous?.total_projects,
    },
    {
      icon: GitCommit,
      label: "提交总数",
      value: current?.total_commits ?? 0,
      previousValue: previous?.total_commits,
    },
    {
      icon: Users,
      label: "参与人数",
      value: currentContributors,
      previousValue: previousContributors,
    },
    {
      icon: CheckCircle,
      label: "单测覆盖应用",
      value: current ? `${current.test_projects}/${current.total_projects}` : "0/0",
      secondaryValue: currentCoverage ? `${currentCoverage}%` : undefined,
      previousValue: previousCoverage,
      tooltip: "改动了代码且有单测用例的应用覆盖率",
    },
    {
      icon: Plus,
      label: "新增代码",
      value: formatNumber(current?.total_lines_added ?? 0),
      previousValue: previous?.total_lines_added,
    },
    {
      icon: GitPullRequest,
      label: "待审核MR",
      value: current?.pending_mrs ?? 0,
      previousValue: previous?.pending_mrs,
      invertTrend: true,
    },
    ...(walkinAggregates?.newCoverageAvg != null ? [{
      icon: TrendingUp as React.ComponentType<{ className?: string }>,
      label: "增量覆盖率",
      value: `${walkinAggregates.newCoverageAvg.toFixed(1)}%`,
      previousValue: undefined as number | undefined,
    }] : []),
    ...(walkinAggregates?.lineCoverageAvg != null ? [{
      icon: BarChart3,
      label: "行覆盖率",
      value: `${walkinAggregates.lineCoverageAvg.toFixed(1)}%`,
      previousValue: undefined as number | undefined,
    }] : []),
  ];

  return (
    <div className="grid grid-cols-3 gap-4 p-6">
      {cards.map((card) => (
        <Card key={card.label} className="bg-card/50">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <card.icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold">{card.value}</p>
                {card.secondaryValue && (
                  <span className="text-sm text-muted-foreground">({card.secondaryValue})</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">{card.label}</p>
                {'tooltip' in card && card.tooltip && (
                  <span title={card.tooltip}>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
                  </span>
                )}
                <TrendIndicator
                  current={card.invertTrend ? -(card.value as number) : (card.value as number)}
                  previous={card.previousValue !== undefined ? (card.invertTrend ? -card.previousValue : card.previousValue) : undefined}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function MrKanban({ projects }: { projects: GitLabProjectResult[] }) {
  const [authorFilter, setAuthorFilter] = useState<string>("all");
  const [timeFilter, setTimeFilter] = useState<string>("all");

  const allMrs: { project: GitLabProjectResult; mr: MrDetail }[] = [];
  for (const project of projects) {
    for (const mr of project.mr_details || []) {
      allMrs.push({ project, mr });
    }
  }

  // Get unique authors for filter
  const uniqueAuthors = useMemo(() => {
    const authors = new Set<string>();
    allMrs.forEach(({ mr }) => authors.add(mr.author));
    return Array.from(authors).sort();
  }, [allMrs.length]);

  // Filter MRs
  const filteredMrs = useMemo(() => {
    return allMrs.filter(({ mr }) => {
      // Author filter
      if (authorFilter !== "all" && mr.author !== authorFilter) return false;

      // Time filter
      if (timeFilter !== "all") {
        const mrDate = new Date(mr.created_at).getTime();
        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;
        if (timeFilter === "today" && mrDate < now - dayMs) return false;
        if (timeFilter === "week" && mrDate < now - 7 * dayMs) return false;
        if (timeFilter === "month" && mrDate < now - 30 * dayMs) return false;
      }

      return true;
    });
  }, [allMrs, authorFilter, timeFilter]);

  if (allMrs.length === 0) {
    return null;
  }

  return (
    <div className="p-6 pt-0">
      <Card className="bg-card/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium flex items-center gap-2">
              <GitPullRequest className="h-4 w-4" />
              MR 看板
            </h4>
            <span className="text-sm text-muted-foreground">共 {filteredMrs.length} 个待处理</span>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <CustomSelect
                value={authorFilter}
                onChange={setAuthorFilter}
                options={[
                  { value: "all", label: "作者" },
                  ...uniqueAuthors.map((author) => ({ value: author, label: author })),
                ]}
                className="w-28"
              />
            </div>
            <CustomSelect
              value={timeFilter}
              onChange={setTimeFilter}
              options={[
                { value: "all", label: "时间" },
                { value: "today", label: "今天" },
                { value: "week", label: "本周" },
                { value: "month", label: "本月" },
              ]}
              className="w-24"
            />
          </div>

          {/* MR list with scroll */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
            {filteredMrs.map(({ project, mr }) => (
              <a
                key={`${project.project_id}-${mr.iid}`}
                href={mr.web_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3 hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <GitPullRequest className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{mr.title}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FolderGit2 className="h-3 w-3" />
                      {project.project_name.split("/").pop()}
                    </span>
                    <span className="flex items-center gap-1">
                      <GitBranch className="h-3 w-3" />
                      {mr.source_branch} → {mr.target_branch}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {mr.author}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(mr.created_at)}
                    </span>
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </a>
            ))}
            {filteredMrs.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                无符合条件的 MR
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectTable({ projects }: { projects: GitLabProjectResult[] }) {
  const [search, setSearch] = useState("");
  const [testFilter, setTestFilter] = useState<string>("all");
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
    let result = projects.filter((p) => {
      // Text search
      if (!p.project_name.toLowerCase().includes(search.toLowerCase())) return false;

      // Test filter
      if (testFilter === "has_test" && !p.has_test) return false;
      if (testFilter === "no_test" && p.has_test) return false;

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
        default:
          cmp = 0;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return result;
  }, [projects, search, testFilter, contributorFilter, sortBy, sortOrder]);

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortBy !== field) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />;
    return sortOrder === "asc"
      ? <ArrowUp className="h-3.5 w-3.5 text-primary" />
      : <ArrowDown className="h-3.5 w-3.5 text-primary" />;
  };

  return (
    <div className="p-6 pt-0">
      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="搜索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded border bg-background px-2.5 py-1 text-sm w-32"
        />
        <CustomSelect
          value={testFilter}
          onChange={setTestFilter}
          options={[
            { value: "all", label: "单测" },
            { value: "has_test", label: "有" },
            { value: "no_test", label: "无" },
          ]}
          className="w-16"
        />
        <CustomSelect
          value={contributorFilter}
          onChange={setContributorFilter}
          options={[
            { value: "all", label: "贡献者" },
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
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-8"></th>
              <th className="px-3 py-2 text-left font-medium">项目</th>
              <th
                className="px-3 py-2 text-right font-medium cursor-pointer hover:bg-muted/80 select-none"
                onClick={() => toggleSort("commits")}
              >
                <div className="flex items-center justify-end gap-1">
                  <SortIcon field="commits" />
                  提交
                </div>
              </th>
              <th
                className="px-3 py-2 text-right font-medium cursor-pointer hover:bg-muted/80 select-none"
                onClick={() => toggleSort("lines_added")}
              >
                <div className="flex items-center justify-end gap-1">
                  <SortIcon field="lines_added" />
                  +/-
                </div>
              </th>
              <th className="px-3 py-2 text-center font-medium">单测</th>
              {hasWalkinData && <th className="px-3 py-2 text-center font-medium">覆盖率</th>}
              <th className="px-3 py-2 text-left font-medium">贡献者</th>
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
                    <td className="px-3 py-2 font-medium">{project.project_name.split("/").pop()}</td>
                    <td className="px-3 py-2 text-right">{project.commits}</td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-green-600">+{formatNumber(project.lines_added)}</span>
                      <span className="text-red-600 ml-1">-{formatNumber(project.lines_removed)}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {project.has_test ? "✓" : <span className="text-muted-foreground">✗</span>}
                    </td>
                    {hasWalkinData && (
                      <td className="px-3 py-2 text-center">
                        {project.walkin_metrics?.coverage != null ? (
                          <span className="text-sm font-medium">{project.walkin_metrics.coverage.toFixed(1)}%</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 text-muted-foreground text-xs">
                      {project.contributors.slice(0, 2).join(", ")}
                      {project.contributors.length > 2 && ` +${project.contributors.length - 2}`}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${project.project_id}-detail`} className="bg-muted/20">
                      <td colSpan={hasWalkinData ? 7 : 6} className="px-3 py-2 pl-10">
                        <div className="text-sm space-y-3">
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
                                    <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="text-muted-foreground">分支:</span>
                                    <CustomSelect
                                      value={selectedBranch || currentMetrics.branch || "master"}
                                      onChange={(v) => setSelectedBranches(prev => ({ ...prev, [project.project_id]: v }))}
                                      options={branchNames.map(b => ({ value: b, label: b }))}
                                      className="w-32 h-6 text-xs"
                                    />
                                  </div>
                                  {currentMetrics.analysis_date && (
                                    <span className="text-muted-foreground">
                                      分析: {new Date(currentMetrics.analysis_date).toLocaleString("zh-CN")}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center gap-4 text-xs">
                                  <div className="flex items-center gap-2">
                                    <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="text-muted-foreground">分支:</span>
                                    <span className="font-medium">{currentMetrics.branch || "master"}</span>
                                  </div>
                                  {currentMetrics.analysis_date && (
                                    <span className="text-muted-foreground">
                                      分析: {new Date(currentMetrics.analysis_date).toLocaleString("zh-CN")}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* 质量指标 */}
                              <div className="flex items-center gap-4 flex-wrap">
                                <span className="flex items-center gap-1 text-xs">
                                  <Bug className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-muted-foreground">Bug</span>
                                  <span className="font-medium">{currentMetrics.bugs}</span>
                                </span>
                                <span className="flex items-center gap-1 text-xs">
                                  <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-muted-foreground">漏洞</span>
                                  <span className="font-medium">{currentMetrics.vulnerabilities}</span>
                                </span>
                                <span className="flex items-center gap-1 text-xs">
                                  <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-muted-foreground">异味</span>
                                  <span className="font-medium">{currentMetrics.code_smells}</span>
                                </span>
                                {currentMetrics.duplicated_lines_density != null && (
                                  <span className="text-xs">
                                    <span className="text-muted-foreground">重复率 </span>
                                    <span className="font-medium">{currentMetrics.duplicated_lines_density.toFixed(1)}%</span>
                                  </span>
                                )}
                              </div>

                              {/* 增量覆盖率 */}
                              <div className="border-t pt-2">
                                <div className="text-xs text-muted-foreground mb-1">【增量】覆盖率</div>
                                <div className="grid grid-cols-3 gap-2 text-xs">
                                  {currentMetrics.new_coverage != null && (
                                    <div>
                                      <span className="text-muted-foreground">综合覆盖率</span>
                                      <span className="ml-1 font-medium">{currentMetrics.new_coverage.toFixed(2)}%</span>
                                    </div>
                                  )}
                                  {currentMetrics.new_line_coverage != null && (
                                    <div>
                                      <span className="text-muted-foreground">行覆盖率</span>
                                      <span className="ml-1 font-medium">{currentMetrics.new_line_coverage.toFixed(2)}%</span>
                                    </div>
                                  )}
                                  {currentMetrics.new_condition_coverage != null && (
                                    <div>
                                      <span className="text-muted-foreground">条件覆盖率</span>
                                      <span className="ml-1 font-medium">{currentMetrics.new_condition_coverage.toFixed(2)}%</span>
                                    </div>
                                  )}
                                  {currentMetrics.new_lines_to_cover != null && (
                                    <div>
                                      <span className="text-muted-foreground">代码行</span>
                                      <span className="ml-1 font-medium">{currentMetrics.new_lines_to_cover}</span>
                                    </div>
                                  )}
                                  {currentMetrics.new_line_cover != null && currentMetrics.new_lines_to_cover != null && (
                                    <div>
                                      <span className="text-muted-foreground">已覆盖</span>
                                      <span className="ml-1 font-medium">{currentMetrics.new_line_cover}/{currentMetrics.new_lines_to_cover}</span>
                                    </div>
                                  )}
                                  {currentMetrics.new_condition_to_cover != null && (
                                    <div>
                                      <span className="text-muted-foreground">条件数</span>
                                      <span className="ml-1 font-medium">
                                        {currentMetrics.new_condition_to_cover - (currentMetrics.new_un_condition_to_cover || 0)}/{currentMetrics.new_condition_to_cover}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* 全量覆盖率 */}
                              <div className="border-t pt-2">
                                <div className="text-xs text-muted-foreground mb-1">【全量】覆盖率</div>
                                <div className="grid grid-cols-3 gap-2 text-xs">
                                  {currentMetrics.coverage != null && (
                                    <div>
                                      <span className="text-muted-foreground">综合覆盖率</span>
                                      <span className="ml-1 font-medium">{currentMetrics.coverage.toFixed(2)}%</span>
                                    </div>
                                  )}
                                  {currentMetrics.line_coverage != null && (
                                    <div>
                                      <span className="text-muted-foreground">行覆盖率</span>
                                      <span className="ml-1 font-medium">{currentMetrics.line_coverage.toFixed(2)}%</span>
                                    </div>
                                  )}
                                  {currentMetrics.branch_coverage != null && (
                                    <div>
                                      <span className="text-muted-foreground">条件覆盖率</span>
                                      <span className="ml-1 font-medium">{currentMetrics.branch_coverage.toFixed(2)}%</span>
                                    </div>
                                  )}
                                  {currentMetrics.lines_to_cover != null && (
                                    <div>
                                      <span className="text-muted-foreground">代码行数</span>
                                      <span className="ml-1 font-medium">{currentMetrics.lines_to_cover}</span>
                                    </div>
                                  )}
                                  {currentMetrics.lines_to_cover != null && currentMetrics.line_coverage != null && (
                                    <div>
                                      <span className="text-muted-foreground">已覆盖</span>
                                      <span className="ml-1 font-medium">{Math.round(currentMetrics.lines_to_cover * currentMetrics.line_coverage / 100)}</span>
                                    </div>
                                  )}
                                  {currentMetrics.conditions_to_cover != null && (
                                    <div>
                                      <span className="text-muted-foreground">条件数</span>
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
                            {project.has_test ? "单测提交记录" : "本周未发现单测提交"}
                          </div>
                          {project.has_test && project.test_commits.length > 0 && (
                            <ul className="space-y-1">
                              {project.test_commits.map((commit, idx) => (
                                <li key={idx} className="flex items-center justify-between gap-4 text-sm">
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    <span>✓</span>
                                    <span className="truncate">{commit.title}</span>
                                  </div>
                                  <div className="text-xs text-muted-foreground shrink-0">
                                    <span>{commit.author}</span>
                                    <span className="mx-2">·</span>
                                    <span>{new Date(commit.created_at).toLocaleDateString("zh-CN")}</span>
                                  </div>
                                </li>
                              ))}
                            </ul>
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
                <td colSpan={hasWalkinData ? 7 : 6} className="px-4 py-8 text-center text-muted-foreground">
                  暂无符合条件的项目
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UnitBoardCard({ config }: { config: import("@/types").GitLabConfig | undefined }) {
  const { isLoggedIn } = useWalkinAuth();
  const [data, setData] = useState<UnitBoardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canFetch = config?.walkin_enabled && config?.walkin_url && config?.walkin_dept_id && config?.walkin_dept_name && isLoggedIn;

  useEffect(() => {
    if (!canFetch) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    gitlabApi.walkinFetchUnitBoard(
      config!.walkin_url,
      {
        csrf_token: config!.walkin_csrf_token,
        project: config!.walkin_project_header,
        workspace: config!.walkin_workspace_name,
        x_auth_token: config!.walkin_x_auth_token,
      },
      config!.walkin_dept_id,
      config!.walkin_dept_name,
    ).then((result) => {
      if (!cancelled) setData(result);
    }).catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [canFetch, config?.walkin_url, config?.walkin_csrf_token, config?.walkin_x_auth_token, config?.walkin_dept_id]);

  if (!config?.walkin_enabled || !config?.walkin_dept_id || !config?.walkin_dept_name) return null;

  return (
    <div className="p-6 pt-0">
      <Card className="bg-card/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              团队覆盖率看板
            </h4>
            {canFetch && (
              <Button variant="ghost" size="sm" onClick={() => {
                setLoading(true);
                gitlabApi.walkinFetchUnitBoard(
                  config!.walkin_url,
                  {
                    csrf_token: config!.walkin_csrf_token,
                    project: config!.walkin_project_header,
                    workspace: config!.walkin_workspace_name,
                    x_auth_token: config!.walkin_x_auth_token,
                  },
                  config!.walkin_dept_id,
                  config!.walkin_dept_name,
                ).then(setData).catch((e) => setError(e instanceof Error ? e.message : String(e))).finally(() => setLoading(false));
              }}>
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
            )}
          </div>
          {!isLoggedIn && (
            <p className="text-sm text-muted-foreground">请先在配置页面登录 Walkin</p>
          )}
          {isLoggedIn && (!config.walkin_dept_id || !config.walkin_dept_name) && (
            <p className="text-sm text-muted-foreground">请先配置部门 ID 和部门名称</p>
          )}
          {loading && (
            <div className="flex items-center gap-2 py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">加载中...</span>
            </div>
          )}
          {error && (
            <p className="text-sm text-red-500">加载失败: {error}</p>
          )}
          {data && !loading && (
            <div className="space-y-3">
              {data.xvalue && (
                <p className="text-xs text-muted-foreground">
                  周期: {data.xvalue}
                  {data.startDateFrom && data.startDateTo && (
                    <span> ({data.startDateFrom} ~ {data.startDateTo})</span>
                  )}
                </p>
              )}
              <div className="grid grid-cols-2 gap-4">
                {/* 增量覆盖率 */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">增量覆盖率</div>
                  <div className="grid grid-cols-3 gap-2">
                    {data.ynewValue != null && (
                      <div className="text-center">
                        <div className="text-lg font-bold text-primary">{data.ynewValue.toFixed(1)}%</div>
                        <div className="text-xs text-muted-foreground">综合</div>
                      </div>
                    )}
                    {data.ynewLineValue != null && (
                      <div className="text-center">
                        <div className="text-lg font-bold text-primary">{data.ynewLineValue.toFixed(1)}%</div>
                        <div className="text-xs text-muted-foreground">行</div>
                      </div>
                    )}
                    {data.ynewBranchValue != null && (
                      <div className="text-center">
                        <div className="text-lg font-bold text-primary">{data.ynewBranchValue.toFixed(1)}%</div>
                        <div className="text-xs text-muted-foreground">条件</div>
                      </div>
                    )}
                  </div>
                </div>
                {/* 全量覆盖率 */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">全量覆盖率</div>
                  <div className="grid grid-cols-3 gap-2">
                    {data.yallValue != null && (
                      <div className="text-center">
                        <div className="text-lg font-bold text-green-600">{data.yallValue.toFixed(1)}%</div>
                        <div className="text-xs text-muted-foreground">综合</div>
                      </div>
                    )}
                    {data.yallLineValue != null && (
                      <div className="text-center">
                        <div className="text-lg font-bold text-green-600">{data.yallLineValue.toFixed(1)}%</div>
                        <div className="text-xs text-muted-foreground">行</div>
                      </div>
                    )}
                    {data.yallBranchValue != null && (
                      <div className="text-center">
                        <div className="text-lg font-bold text-green-600">{data.yallBranchValue.toFixed(1)}%</div>
                        <div className="text-xs text-muted-foreground">条件</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          {!data && !loading && !error && isLoggedIn && (
            <p className="text-sm text-muted-foreground">暂无数据</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function GitLabOverviewPage() {
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
  const projects: GitLabProjectResult[] = selectedHistory
    ? JSON.parse(selectedHistory.summary || "[]")
    : [];

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

  const handleExport = () => {
    if (!selectedHistory) {
      toast.error("暂无扫描数据可导出");
      return;
    }
    const report = generateWeeklyReport(selectedHistory);
    const date = new Date(selectedHistory.scan_at).toISOString().split("T")[0];
    downloadReport(report, `gitlab-weekly-report-${date}.md`);
    toast.success("报告已导出");
  };

  const handleCopyReport = async () => {
    if (!selectedHistory) {
      toast.error("暂无扫描数据可复制");
      return;
    }
    const report = generateWeeklyReport(selectedHistory);
    try {
      await navigator.clipboard.writeText(report);
      toast.success("报告已复制到剪贴板");
    } catch {
      toast.error("复制失败");
    }
  };

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
      toast.error("扫描失败: " + errorMessage);
    }
  };

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
            <p className="text-muted-foreground mb-4">请先配置 GitLab 连接</p>
            <Button onClick={() => setShowSetupModal(true)}>配置 GitLab</Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div>
      <ScanProgressModal
        isOpen={showProgressModal}
        onClose={() => setShowProgressModal(false)}
      />

      {/* Header */}
      <div className="border-b px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {history && history.length > 0 && (
              <CustomSelect
                value={selectedScanIndex.toString()}
                onChange={(v) => setSelectedScanIndex(parseInt(v))}
                options={history.map((scan, idx) => ({
                  value: idx.toString(),
                  label: new Date(scan.scan_at).toLocaleDateString("zh-CN"),
                }))}
                className="w-32"
              />
            )}
            <span className="text-sm text-muted-foreground">
              {selectedHistory ? formatTimestamp(selectedHistory.scan_at) : "暂无记录"}
            </span>
            {latestWalkinDate && (
              <span className="text-sm text-muted-foreground">
                Walkin: {formatTimestamp(latestWalkinDate)}
              </span>
            )}
            {nextScanTime && (
              <span className="text-sm text-muted-foreground">
                下次: {nextScanTime.toLocaleDateString("zh-CN")}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyReport} disabled={!selectedHistory}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              复制
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!selectedHistory}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              导出
            </Button>
            <Button size="sm" onClick={handleScan} disabled={triggerScan.isPending}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${triggerScan.isPending ? "animate-spin" : ""}`} />
              扫描
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <SummaryCards current={selectedHistory} previous={previousHistory} />

      {/* Empty State */}
      {!selectedHistory && (
        <div className="flex flex-col items-center justify-center py-12 px-6">
          <Inbox className="h-16 w-16 text-muted-foreground mb-4" />
          <p className="text-lg font-medium mb-2">暂无扫描数据</p>
          <p className="text-sm text-muted-foreground mb-4">点击"立即扫描"开始第一次扫描</p>
        </div>
      )}

      {selectedHistory && (
        <>
          {/* Trend Charts + Developer Ranking */}
          <div className="border-t flex items-stretch">
            <TrendChart history={history || []} />
            <ContributorRanking history={history || []} />
          </div>

          {/* Walkin Team Coverage Board */}
          <UnitBoardCard config={config} />

          {/* Project Table */}
          <div className="border-t">
            <ProjectTable projects={projects} />
          </div>

          {/* MR Kanban */}
          <MrKanban projects={projects} />
        </>
      )}
    </div>
  );
}
