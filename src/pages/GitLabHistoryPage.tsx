import { Calendar, Clock, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useGitLabScanHistory } from "@/lib/query/gitlabQueries";
import type { GitLabScanHistory, GitLabProjectResult } from "@/types";

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN");
}

function HistoryCard({ item }: { item: GitLabScanHistory }) {
  const projects: GitLabProjectResult[] = JSON.parse(item.summary || "[]");
  const contributors: string[] = JSON.parse(item.contributors || "[]");

  const noTestProjects = projects.filter((p) => !p.has_test);
  const pendingMrProjects = projects.filter((p) => p.pending_mrs > 0);

  return (
    <Card className="bg-card/50 hover:bg-card/80 transition-colors cursor-pointer">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Calendar className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{formatTimestamp(item.scan_at)}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {item.scan_type === "weekly" ? "定时扫描" : "手动扫描"}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
                <span>项目: {item.total_projects}</span>
                <span>提交: {item.total_commits}</span>
                <span>单测: {Math.round((item.test_projects / (item.total_projects || 1)) * 100)}%</span>
                <span>MR: {item.pending_mrs}</span>
              </div>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 border-t pt-4 text-sm">
          <div>
            <span className="text-muted-foreground">代码变更: </span>
            <span className="text-green-600">+{item.total_lines_added.toLocaleString()}</span>
            <span className="mx-1">/</span>
            <span className="text-red-600">-{item.total_lines_removed.toLocaleString()}</span>
            <span className="text-muted-foreground"> 行</span>
          </div>
          <div>
            <span className="text-muted-foreground">参与人员: </span>
            <span>{contributors.slice(0, 5).join(", ")}{contributors.length > 5 ? "..." : ""}</span>
          </div>
        </div>

        {(noTestProjects.length > 0 || pendingMrProjects.length > 0) && (
          <div className="mt-3 border-t pt-3">
            <p className="text-sm text-muted-foreground mb-2">需关注项目:</p>
            <div className="flex flex-wrap gap-2">
              {noTestProjects.slice(0, 3).map((p) => (
                <span key={p.project_id} className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
                  {p.project_name.split("/").pop()}: 未发现单测
                </span>
              ))}
              {pendingMrProjects.slice(0, 2).map((p) => (
                <span key={p.project_id} className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                  {p.project_name.split("/").pop()}: {p.pending_mrs}个MR待审核
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function GitLabHistoryPage() {
  const { data: history, isLoading } = useGitLabScanHistory(20);

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="text-center">
          <Clock className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">暂无扫描历史</p>
          <p className="text-sm text-muted-foreground mt-1">点击"立即扫描"开始第一次扫描</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold">扫描历史</h3>
        <p className="text-sm text-muted-foreground">共 {history.length} 条记录</p>
      </div>

      <div className="space-y-4">
        {history.map((item) => (
          <HistoryCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
