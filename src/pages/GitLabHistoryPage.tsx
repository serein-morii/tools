import { useState } from "react";
import { Calendar, Clock, ChevronRight, X, GitCompare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useGitLabScanHistory } from "@/lib/query/gitlabQueries";
import type { GitLabScanHistory, GitLabProjectResult } from "@/types";

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN");
}

function HistoryCard({ item, selected, onToggleSelect }: {
  item: GitLabScanHistory;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const projects: GitLabProjectResult[] = JSON.parse(item.summary || "[]");
  const contributors: string[] = JSON.parse(item.contributors || "[]");

  const noTestProjects = projects.filter((p) => !p.has_test);
  const pendingMrProjects = projects.filter((p) => p.pending_mrs > 0);

  return (
    <Card className={`bg-card/50 hover:bg-card/80 transition-colors cursor-pointer ${selected ? "ring-2 ring-primary" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="h-4 w-4"
              onClick={(e) => e.stopPropagation()}
            />
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

function CompareView({ left, right, onClose }: {
  left: GitLabScanHistory;
  right: GitLabScanHistory;
  onClose: () => void;
}) {
  const leftProjects: GitLabProjectResult[] = JSON.parse(left.summary || "[]");
  const rightProjects: GitLabProjectResult[] = JSON.parse(right.summary || "[]");

  const leftCoverage = left.total_projects > 0 ? Math.round((left.test_projects / left.total_projects) * 100) : 0;
  const rightCoverage = right.total_projects > 0 ? Math.round((right.test_projects / right.total_projects) * 100) : 0;

  const diff = (a: number, b: number) => {
    const d = a - b;
    if (d > 0) return <span className="text-green-600">+{d}</span>;
    if (d < 0) return <span className="text-red-600">{d}</span>;
    return <span className="text-muted-foreground">-</span>;
  };

  const diffPercent = (a: number, b: number) => {
    const d = a - b;
    if (d > 0) return <span className="text-green-600">+{d}%</span>;
    if (d < 0) return <span className="text-red-600">{d}%</span>;
    return <span className="text-muted-foreground">-</span>;
  };

  // Find new test projects
  const leftTestProjects = new Set(leftProjects.filter(p => p.has_test).map(p => p.project_name));
  const rightTestProjects = new Set(rightProjects.filter(p => p.has_test).map(p => p.project_name));
  const newTestProjects = [...leftTestProjects].filter(p => !rightTestProjects.has(p));
  const lostTestProjects = [...rightTestProjects].filter(p => !leftTestProjects.has(p));

  return (
    <Card className="mb-6">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            扫描对比
          </h4>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="text-muted-foreground"></div>
          <div className="text-center font-medium">{formatTimestamp(right.scan_at)}</div>
          <div className="text-center font-medium">{formatTimestamp(left.scan_at)}</div>

          <div className="text-muted-foreground">项目数</div>
          <div className="text-center">{right.total_projects}</div>
          <div className="text-center">
            {left.total_projects}
            <span className="ml-2">{diff(left.total_projects, right.total_projects)}</span>
          </div>

          <div className="text-muted-foreground">提交数</div>
          <div className="text-center">{right.total_commits}</div>
          <div className="text-center">
            {left.total_commits}
            <span className="ml-2">{diff(left.total_commits, right.total_commits)}</span>
          </div>

          <div className="text-muted-foreground">单测覆盖率</div>
          <div className="text-center">{rightCoverage}%</div>
          <div className="text-center">
            {leftCoverage}%
            <span className="ml-2">{diffPercent(leftCoverage, rightCoverage)}</span>
          </div>

          <div className="text-muted-foreground">待审MR</div>
          <div className="text-center">{right.pending_mrs}</div>
          <div className="text-center">
            {left.pending_mrs}
            <span className="ml-2">{diff(left.pending_mrs, right.pending_mrs)}</span>
          </div>

          <div className="text-muted-foreground">新增代码</div>
          <div className="text-center">+{right.total_lines_added.toLocaleString()}</div>
          <div className="text-center">
            +{left.total_lines_added.toLocaleString()}
            <span className="ml-2">{diff(left.total_lines_added, right.total_lines_added)}</span>
          </div>

          <div className="text-muted-foreground">删除代码</div>
          <div className="text-center">-{right.total_lines_removed.toLocaleString()}</div>
          <div className="text-center">
            -{left.total_lines_removed.toLocaleString()}
            <span className="ml-2 text-red-600">{diff(left.total_lines_removed, right.total_lines_removed)}</span>
          </div>
        </div>

        {(newTestProjects.length > 0 || lostTestProjects.length > 0) && (
          <div className="mt-4 border-t pt-4 text-sm">
            {newTestProjects.length > 0 && (
              <div className="mb-2">
                <span className="text-green-600">新增单测项目: </span>
                <span>{newTestProjects.map(p => p.split("/").pop()).join(", ")}</span>
              </div>
            )}
            {lostTestProjects.length > 0 && (
              <div>
                <span className="text-red-600">未补单测项目: </span>
                <span>{lostTestProjects.map(p => p.split("/").pop()).join(", ")}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function GitLabHistoryPage() {
  const { data: history, isLoading } = useGitLabScanHistory(20);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : prev.length < 2
          ? [...prev, id]
          : [prev[1], id]
    );
  };

  const clearSelection = () => setSelectedIds([]);

  const selectedHistory = history?.filter(h => selectedIds.includes(h.id)) || [];
  const canCompare = selectedHistory.length === 2;

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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">扫描历史</h3>
          <p className="text-sm text-muted-foreground">共 {history.length} 条记录</p>
        </div>
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">已选择 {selectedIds.length}/2</span>
            <Button variant="outline" size="sm" onClick={clearSelection}>
              清除选择
            </Button>
          </div>
        )}
      </div>

      {canCompare && (
        <CompareView
          left={selectedHistory[0]}
          right={selectedHistory[1]}
          onClose={clearSelection}
        />
      )}

      <div className="space-y-4">
        {history.map((item) => (
          <HistoryCard
            key={item.id}
            item={item}
            selected={selectedIds.includes(item.id)}
            onToggleSelect={() => toggleSelect(item.id)}
          />
        ))}
      </div>
    </div>
  );
}
