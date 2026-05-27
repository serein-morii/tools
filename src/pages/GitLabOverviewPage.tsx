import { useState } from "react";
import { RefreshCw, Download, BarChart3, Users, GitCommit, CheckCircle, Plus, Minus, GitPullRequest } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useGitLabConfigured, useGitLabScanHistory, useTriggerGitLabScan } from "@/lib/query/gitlabQueries";
import { FirstTimeSetupModal } from "@/components/modules/gitlab/FirstTimeSetupModal";
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

function SummaryCards({ history }: { history?: GitLabScanHistory }) {
  const cards = [
    { icon: BarChart3, label: "扫描项目", value: history?.total_projects ?? 0, color: "text-blue-500" },
    { icon: GitCommit, label: "提交总数", value: history?.total_commits ?? 0, color: "text-green-500" },
    { icon: Users, label: "参与人数", value: history ? JSON.parse(history.contributors || "[]").length : 0, color: "text-purple-500" },
    { icon: CheckCircle, label: "单测覆盖", value: history ? `${history.test_projects}/${history.total_projects}` : "0/0", color: "text-amber-500" },
    { icon: Plus, label: "新增代码", value: formatNumber(history?.total_lines_added ?? 0), color: "text-emerald-500" },
    { icon: GitPullRequest, label: "待审核MR", value: history?.pending_mrs ?? 0, color: "text-rose-500" },
  ];

  return (
    <div className="grid grid-cols-3 gap-4 p-6">
      {cards.map((card) => (
        <Card key={card.label} className="bg-card/50">
          <CardContent className="flex items-center gap-4 p-4">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-muted ${card.color}`}>
              <card.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{card.value}</p>
              <p className="text-sm text-muted-foreground">{card.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ProjectTable({ projects }: { projects: GitLabProjectResult[] }) {
  const [search, setSearch] = useState("");

  const filtered = projects.filter((p) =>
    p.project_name.toLowerCase().includes(search.toLowerCase())
  );

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
              <th className="px-4 py-3 text-left font-medium">最近提交</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((project) => (
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
                <td className="px-4 py-3 text-left text-muted-foreground text-xs">
                  {project.last_commit_at ? new Date(project.last_commit_at).toLocaleDateString("zh-CN") : "-"}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
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
  const { data: history } = useGitLabScanHistory(1);
  const triggerScan = useTriggerGitLabScan();

  const latestHistory = history?.[0];
  const projects: GitLabProjectResult[] = latestHistory
    ? JSON.parse(latestHistory.summary || "[]")
    : [];

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
          <Button variant="outline" size="sm">
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
      <SummaryCards history={latestHistory} />

      {/* Project Table */}
      <div className="border-t">
        <div className="px-6 py-4">
          <h3 className="font-semibold">项目详情</h3>
        </div>
        <ProjectTable projects={projects} />
      </div>
    </div>
  );
}
