import { useState } from "react";
import { RefreshCw, Download, BarChart3, Users, GitCommit, CheckCircle, Plus, Minus, GitPullRequest, TrendingUp, TrendingDown, MinusCircle, ExternalLink, Inbox, Circle, GitBranch, Clock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useGitLabConfigured, useGitLabScanHistory, useTriggerGitLabScan } from "@/lib/query/gitlabQueries";
import { FirstTimeSetupModal } from "@/components/modules/gitlab/FirstTimeSetupModal";
import { TrendChart, ContributorRanking } from "@/components/modules/gitlab/TrendChart";
import { generateWeeklyReport, downloadReport } from "@/components/modules/gitlab/reportGenerator";
import { toast } from "sonner";
import type { GitLabScanHistory, GitLabProjectResult, MrDetail } from "@/types";

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

function PipelineBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const config: Record<string, { color: string; bg: string; label: string }> = {
    success: { color: "text-green-600", bg: "bg-green-100", label: "passed" },
    running: { color: "text-blue-600", bg: "bg-blue-100", label: "running" },
    pending: { color: "text-amber-600", bg: "bg-amber-100", label: "pending" },
    failed: { color: "text-red-600", bg: "bg-red-100", label: "failed" },
    canceled: { color: "text-gray-600", bg: "bg-gray-100", label: "canceled" },
    skipped: { color: "text-gray-500", bg: "bg-gray-50", label: "skipped" },
  };
  const c = config[status] || { color: "text-muted-foreground", bg: "bg-muted", label: status };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${c.bg} ${c.color}`}>
      <Circle className={`h-2 w-2 fill-current ${c.color}`} />
      {c.label}
    </span>
  );
}

function PipelineMiniIcon({ status }: { status: string | null }) {
  if (!status) return <Circle className="h-3 w-3 text-muted-foreground" />;
  const colors: Record<string, string> = {
    success: "text-green-500 fill-green-500",
    running: "text-blue-500 fill-blue-500",
    pending: "text-amber-500 fill-amber-500",
    failed: "text-red-500 fill-red-500",
    canceled: "text-gray-400 fill-gray-400",
  };
  return <Circle className={`h-3 w-3 ${colors[status] || "text-muted-foreground"}`} />;
}

function TrendIndicator({ current, previous }: { current: number; previous?: number }) {
  if (previous === undefined) return null;
  const diff = current - previous;
  if (diff > 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs text-green-600">
        <TrendingUp className="h-3 w-3" />+{diff}
      </span>
    );
  }
  if (diff < 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs text-red-600">
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

  const cards = [
    {
      icon: BarChart3,
      label: "扫描项目",
      value: current?.total_projects ?? 0,
      previousValue: previous?.total_projects,
      color: "text-blue-500",
    },
    {
      icon: GitCommit,
      label: "提交总数",
      value: current?.total_commits ?? 0,
      previousValue: previous?.total_commits,
      color: "text-green-500",
    },
    {
      icon: Users,
      label: "参与人数",
      value: currentContributors,
      previousValue: previousContributors,
      color: "text-purple-500",
    },
    {
      icon: CheckCircle,
      label: "单测覆盖",
      value: current ? `${current.test_projects}/${current.total_projects}` : "0/0",
      secondaryValue: currentCoverage ? `${currentCoverage}%` : undefined,
      previousValue: previousCoverage,
      color: "text-amber-500",
    },
    {
      icon: Plus,
      label: "新增代码",
      value: formatNumber(current?.total_lines_added ?? 0),
      previousValue: previous?.total_lines_added,
      color: "text-emerald-500",
    },
    {
      icon: GitPullRequest,
      label: "待审核MR",
      value: current?.pending_mrs ?? 0,
      previousValue: previous?.pending_mrs,
      color: "text-rose-500",
      invertTrend: true,
    },
    {
      icon: Circle,
      label: "Pipeline 成功率",
      value: current && current.pipeline_total > 0
        ? `${Math.round((current.pipeline_success / current.pipeline_total) * 100)}%`
        : "-",
      secondaryValue: current ? `${current.pipeline_success}/${current.pipeline_total}` : undefined,
      color: "text-cyan-500",
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4 p-6">
      {cards.map((card) => (
        <Card key={card.label} className="bg-card/50">
          <CardContent className="flex items-center gap-4 p-4">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-muted ${card.color}`}>
              <card.icon className="h-5 w-5" />
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
  const allMrs: { project: GitLabProjectResult; mr: MrDetail }[] = [];
  for (const project of projects) {
    for (const mr of project.mr_details || []) {
      allMrs.push({ project, mr });
    }
  }

  if (allMrs.length === 0) {
    return null;
  }

  // Group by project
  const grouped = new Map<string, { project: GitLabProjectResult; mrs: MrDetail[] }>();
  for (const { project, mr } of allMrs) {
    const key = project.project_name;
    if (!grouped.has(key)) {
      grouped.set(key, { project, mrs: [] });
    }
    grouped.get(key)!.mrs.push(mr);
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
            <span className="text-sm text-muted-foreground">共 {allMrs.length} 个待处理</span>
          </div>

          <div className="space-y-4">
            {Array.from(grouped.entries()).map(([projectName, { project, mrs }]) => (
              <div key={projectName}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium">{projectName.split("/").pop()}</span>
                  <span className="text-xs text-muted-foreground">({mrs.length} MR)</span>
                </div>
                <div className="space-y-2">
                  {mrs.map((mr) => (
                    <a
                      key={`${project.project_id}-${mr.iid}`}
                      href={mr.web_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      <PipelineMiniIcon status={mr.pipeline_status} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{mr.title}</p>
                          <PipelineBadge status={mr.pipeline_status} />
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
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
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectTable({ projects, previousProjects }: { projects: GitLabProjectResult[]; previousProjects: GitLabProjectResult[] }) {
  const [search, setSearch] = useState("");

  const previousMap = new Map(previousProjects.map(p => [p.project_id, p]));

  const filtered = projects.filter((p) =>
    p.project_name.toLowerCase().includes(search.toLowerCase())
  );

  const getTrend = (project: GitLabProjectResult) => {
    const prev = previousMap.get(project.project_id);
    if (!prev) return null;
    const diff = project.commits - prev.commits;
    if (diff > 0) return { direction: "up" as const, value: `↑${diff}` };
    if (diff < 0) return { direction: "down" as const, value: `↓${Math.abs(diff)}` };
    return { direction: "same" as const, value: "─" };
  };

  return (
    <div className="p-6 pt-0">
      <div className="mb-4">
        <input
          type="text"
          placeholder="搜索项目..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-lg border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">项目名称</th>
              <th className="px-4 py-3 text-right font-medium">提交数</th>
              <th className="px-4 py-3 text-right font-medium">+行数</th>
              <th className="px-4 py-3 text-right font-medium">-行数</th>
              <th className="px-4 py-3 text-center font-medium">单测状态</th>
              <th className="px-4 py-3 text-center font-medium">CI</th>
              <th className="px-4 py-3 text-right font-medium">待审MR</th>
              <th className="px-4 py-3 text-left font-medium">贡献者</th>
              <th className="px-4 py-3 text-center font-medium">趋势</th>
              <th className="px-4 py-3 text-left font-medium">最近提交</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((project) => {
              const trend = getTrend(project);
              return (
                <tr key={project.project_id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{project.project_name}</td>
                  <td className="px-4 py-3 text-right">{project.commits}</td>
                  <td className="px-4 py-3 text-right text-green-600">+{formatNumber(project.lines_added)}</td>
                  <td className="px-4 py-3 text-right text-red-600">-{formatNumber(project.lines_removed)}</td>
                  <td className="px-4 py-3 text-center">
                    {project.has_test ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                        <CheckCircle className="h-3 w-3" /> 已补单测
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                        <Minus className="h-3 w-3" /> 未发现单测
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <PipelineMiniIcon status={project.latest_pipeline_status} />
                  </td>
                  <td className="px-4 py-3 text-right">{project.pending_mrs}</td>
                  <td className="px-4 py-3 text-left text-muted-foreground">
                    {project.contributors.slice(0, 3).join(", ")}
                    {project.contributors.length > 3 && "..."}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {trend && (
                      <span className={
                        trend.direction === "up" ? "text-green-600" :
                        trend.direction === "down" ? "text-red-600" :
                        "text-muted-foreground"
                      }>
                        {trend.value}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-left text-muted-foreground text-xs">
                    {project.last_commit_at ? new Date(project.last_commit_at).toLocaleDateString("zh-CN") : "-"}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                  暂无项目数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function GitLabOverviewPage() {
  const [showSetupModal, setShowSetupModal] = useState(false);
  const { data: isConfigured, refetch } = useGitLabConfigured();
  const { data: history } = useGitLabScanHistory(4);
  const triggerScan = useTriggerGitLabScan();

  const latestHistory = history?.[0];
  const previousHistory = history?.[1];
  const projects: GitLabProjectResult[] = latestHistory
    ? JSON.parse(latestHistory.summary || "[]")
    : [];
  const previousProjects: GitLabProjectResult[] = previousHistory
    ? JSON.parse(previousHistory.summary || "[]")
    : [];

  const handleExport = () => {
    if (!latestHistory) {
      toast.error("暂无扫描数据可导出");
      return;
    }
    const report = generateWeeklyReport(latestHistory);
    const date = new Date(latestHistory.scan_at).toISOString().split("T")[0];
    downloadReport(report, `gitlab-weekly-report-${date}.md`);
    toast.success("报告已导出");
  };

  const handleScan = async () => {
    const scanId = toast.loading("正在扫描，请稍候...");
    try {
      await triggerScan.mutateAsync("manual");
      toast.success("扫描完成", { id: scanId });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: string }).message)
          : String(error);
      toast.error("扫描失败: " + errorMessage, { id: scanId });
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
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <p className="text-sm text-muted-foreground">
            上次扫描: {latestHistory ? formatTimestamp(latestHistory.scan_at) : "暂无记录"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            导出报告
          </Button>
          <Button size="sm" onClick={handleScan} disabled={triggerScan.isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${triggerScan.isPending ? "animate-spin" : ""}`} />
            立即扫描
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <SummaryCards current={latestHistory} previous={previousHistory} />

      {/* Empty State */}
      {!latestHistory && (
        <div className="flex flex-col items-center justify-center py-12 px-6">
          <Inbox className="h-16 w-16 text-muted-foreground mb-4" />
          <p className="text-lg font-medium mb-2">暂无扫描数据</p>
          <p className="text-sm text-muted-foreground mb-4">点击"立即扫描"开始第一次扫描</p>
        </div>
      )}

      {latestHistory && (
        <>
          {/* Trend Charts */}
          <div className="border-t">
            <div className="px-6 py-4">
              <h3 className="font-semibold">趋势分析</h3>
            </div>
            <div className="grid grid-cols-2 gap-0">
              <TrendChart history={history || []} />
              <ContributorRanking history={history || []} />
            </div>
          </div>

          {/* MR Kanban */}
          <div className="border-t">
            <div className="px-6 py-4">
              <h3 className="font-semibold">MR 看板</h3>
            </div>
            <MrKanban projects={projects} />
          </div>

          {/* Project Table */}
          <div className="border-t">
            <div className="px-6 py-4">
              <h3 className="font-semibold">项目详情</h3>
            </div>
            <ProjectTable projects={projects} previousProjects={previousProjects} />
          </div>
        </>
      )}
    </div>
  );
}
