import { useState } from "react";
import { RefreshCw, Download, BarChart3, Users, GitCommit, CheckCircle, Plus, Minus, GitPullRequest, TrendingUp, TrendingDown, MinusCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useGitLabConfigured, useGitLabScanHistory, useTriggerGitLabScan } from "@/lib/query/gitlabQueries";
import { FirstTimeSetupModal } from "@/components/modules/gitlab/FirstTimeSetupModal";
import { TrendChart, ContributorRanking } from "@/components/modules/gitlab/TrendChart";
import { generateWeeklyReport, downloadReport } from "@/components/modules/gitlab/reportGenerator";
import { toast } from "sonner";
import type { GitLabScanHistory, GitLabProjectResult } from "@/types";

function formatNumber(num: number): string {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + "w";
  }
  return num.toLocaleString();
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN");
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
  ];

  return (
    <div className="grid grid-cols-3 gap-4 p-6">
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
  const mrProjects = projects.filter(p => p.pending_mrs > 0);

  if (mrProjects.length === 0) {
    return null;
  }

  const totalMrs = mrProjects.reduce((sum, p) => sum + p.pending_mrs, 0);

  return (
    <div className="p-6 pt-0">
      <Card className="bg-card/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium flex items-center gap-2">
              <GitPullRequest className="h-4 w-4" />
              待审核 MR
            </h4>
            <span className="text-sm text-muted-foreground">共 {totalMrs} 个待处理</span>
          </div>

          <div className="space-y-3">
            {mrProjects.map((project) => (
              <div
                key={project.project_id}
                className="flex items-center justify-between rounded-lg border bg-muted/30 p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-100">
                    <GitPullRequest className="h-4 w-4 text-rose-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {project.project_name.split("/").pop()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {project.contributors.slice(0, 2).join(", ")}
                      {project.contributors.length > 2 && "..."}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-medium">{project.pending_mrs} 个 MR</p>
                    <p className="text-xs text-muted-foreground">
                      {project.commits} 次提交
                    </p>
                  </div>
                  <Button variant="ghost" size="sm">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
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
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
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
    try {
      toast.loading("正在扫描...");
      await triggerScan.mutateAsync("manual");
      toast.success("扫描完成");
    } catch (error) {
      toast.error("扫描失败: " + String(error));
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
    </div>
  );
}
