import { useState, useMemo } from "react";
import { Calendar, Clock, ChevronRight, X, GitCompare, GitCommit, Plus, Minus, FolderGit2, User, Bug, ShieldAlert, Zap, BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useGitLabScanHistory } from "@/lib/query/gitlabQueries";
import type { GitLabScanHistory, GitLabProjectResult, DeveloperStat } from "@/types";

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN");
}

function computeWalkinAggregates(projects: GitLabProjectResult[]) {
  let totalBugs = 0;
  let totalVulnerabilities = 0;
  let totalCodeSmells = 0;
  let coverageSum = 0;
  let coverageCount = 0;
  let newCoverageSum = 0;
  let newCoverageCount = 0;
  let matched = 0;

  for (const p of projects) {
    if (p.walkin_metrics) {
      matched++;
      totalBugs += p.walkin_metrics.bugs;
      totalVulnerabilities += p.walkin_metrics.vulnerabilities;
      totalCodeSmells += p.walkin_metrics.code_smells;
      if (p.walkin_metrics.coverage != null) {
        coverageSum += p.walkin_metrics.coverage;
        coverageCount++;
      }
      if (p.walkin_metrics.new_coverage != null) {
        newCoverageSum += p.walkin_metrics.new_coverage;
        newCoverageCount++;
      }
    }
  }

  return {
    matched,
    totalBugs,
    totalVulnerabilities,
    totalCodeSmells,
    avgCoverage: coverageCount > 0 ? coverageSum / coverageCount : null,
    avgNewCoverage: newCoverageCount > 0 ? newCoverageSum / newCoverageCount : null,
  };
}

function ScanDetailDialog({ item, open, onClose }: {
  item: GitLabScanHistory | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!item || !open) return null;

  const projects: GitLabProjectResult[] = JSON.parse(item.summary || "[]");
  const contributors: string[] = JSON.parse(item.contributors || "[]");
  let devStats: DeveloperStat[] = [];
  try {
    devStats = JSON.parse(item.developer_stats || "[]");
  } catch { /* ignore */ }

  const coverage = item.total_projects > 0 ? Math.round((item.test_projects / item.total_projects) * 100) : 0;
  const sortedProjects = [...projects].sort((a, b) => b.commits - a.commits);
  const noTestProjects = sortedProjects.filter(p => !p.has_test);
  const walkin = computeWalkinAggregates(projects);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-background rounded-lg shadow-lg max-w-3xl w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            扫描详情
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-6">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-sm text-muted-foreground">扫描时间</div>
              <div className="font-medium">{formatTimestamp(item.scan_at)}</div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-sm text-muted-foreground">扫描类型</div>
              <div className="font-medium">{item.scan_type === "weekly" ? "定时扫描" : "手动扫描"}</div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-sm text-muted-foreground">变更项目</div>
              <div className="font-medium">{item.total_projects} 个</div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-sm text-muted-foreground">单测覆盖</div>
              <div className="font-medium">{coverage}% ({item.test_projects}/{item.total_projects})</div>
            </div>
          </div>

          {/* Walkin 代码质量 */}
          {walkin.matched > 0 && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Walkin 代码质量 ({walkin.matched} 个项目有数据)
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Bug</span>
                  <div className="font-medium">{walkin.totalBugs}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">漏洞</span>
                  <div className="font-medium">{walkin.totalVulnerabilities}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">异味</span>
                  <div className="font-medium">{walkin.totalCodeSmells}</div>
                </div>
                {walkin.avgCoverage != null && (
                  <div>
                    <span className="text-muted-foreground">全量覆盖率</span>
                    <div className="font-medium">{walkin.avgCoverage.toFixed(1)}%</div>
                  </div>
                )}
                {walkin.avgNewCoverage != null && (
                  <div>
                    <span className="text-muted-foreground">增量覆盖率</span>
                    <div className="font-medium">{walkin.avgNewCoverage.toFixed(1)}%</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 代码变更统计 */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <h4 className="font-medium mb-3">代码变更</h4>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <GitCommit className="h-4 w-4 text-muted-foreground" />
                <span>{item.total_commits} 次提交</span>
              </div>
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-green-600" />
                <span className="text-green-600">+{item.total_lines_added.toLocaleString()} 行</span>
              </div>
              <div className="flex items-center gap-2">
                <Minus className="h-4 w-4 text-red-600" />
                <span className="text-red-600">-{item.total_lines_removed.toLocaleString()} 行</span>
              </div>
            </div>
          </div>

          {/* 开发者贡献排行 */}
          {devStats.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <h4 className="font-medium mb-3">开发者贡献 TOP5</h4>
              <div className="space-y-2">
                {devStats.slice(0, 5).map((dev, idx) => (
                  <div key={dev.name} className="flex items-center gap-3">
                    <span className="w-6 text-center font-medium text-muted-foreground">
                      {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{dev.name}</span>
                        <span className="text-sm text-muted-foreground">{dev.projects.length} 个项目</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1"><GitCommit className="h-3 w-3" />{dev.commits}</span>
                        <span className="flex items-center gap-1 text-green-600"><Plus className="h-3 w-3" />{dev.lines_added}</span>
                        <span className="flex items-center gap-1 text-red-600"><Minus className="h-3 w-3" />{dev.lines_removed}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 无单测项目 */}
          {noTestProjects.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <h4 className="font-medium mb-3">无单测项目 ({noTestProjects.length})</h4>
              <div className="space-y-2">
                {noTestProjects.map((p) => (
                  <div key={p.project_id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <FolderGit2 className="h-4 w-4 text-muted-foreground" />
                      <span>{p.project_name.split("/").pop()}</span>
                    </div>
                    <span className="text-muted-foreground">{p.commits} 次提交</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 项目详情 */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <h4 className="font-medium mb-3">项目列表 ({sortedProjects.length})</h4>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {sortedProjects.map((p) => (
                <div key={p.project_id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <FolderGit2 className="h-4 w-4 text-muted-foreground" />
                    <span>{p.project_name.split("/").pop()}</span>
                    {p.has_test ? (
                      <span className="text-xs">有单测</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">无单测</span>
                    )}
                    {p.walkin_metrics?.coverage != null && (
                      <span className="text-xs text-blue-600">覆盖 {p.walkin_metrics.coverage.toFixed(1)}%</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-muted-foreground">
                    <span>{p.commits} 提交</span>
                    <span className="text-green-600">+{p.lines_added}</span>
                    <span className="text-red-600">-{p.lines_removed}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 参与人员 */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <h4 className="font-medium mb-3">参与人员 ({contributors.length})</h4>
            <div className="flex flex-wrap gap-2">
              {contributors.map((name) => (
                <span key={name} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-sm">
                  <User className="h-3 w-3" />
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryCard({ item, selected, onToggleSelect, onClick }: {
  item: GitLabScanHistory;
  selected: boolean;
  onToggleSelect: () => void;
  onClick: () => void;
}) {
  const projects: GitLabProjectResult[] = useMemo(
    () => JSON.parse(item.summary || "[]"),
    [item.summary],
  );
  const contributors: string[] = useMemo(
    () => JSON.parse(item.contributors || "[]"),
    [item.contributors],
  );

  const noTestProjects = useMemo(() => projects.filter((p) => !p.has_test), [projects]);
  const coverage = item.total_projects > 0 ? Math.round((item.test_projects / item.total_projects) * 100) : 0;
  const walkin = useMemo(() => computeWalkinAggregates(projects), [projects]);

  return (
    <Card
      className={`bg-card/50 hover:bg-card/80 transition-colors cursor-pointer ${selected ? "ring-2 ring-primary" : ""}`}
      onClick={onClick}
    >
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
                <span>单测覆盖: {coverage}% ({item.test_projects}/{item.total_projects})</span>
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

        {/* Walkin quality summary */}
        {walkin.matched > 0 && (
          <div className="mt-3 border-t pt-3">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Bug className="h-3 w-3" /> Bug {walkin.totalBugs}
              </span>
              <span className="flex items-center gap-1">
                <ShieldAlert className="h-3 w-3" /> 漏洞 {walkin.totalVulnerabilities}
              </span>
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" /> 异味 {walkin.totalCodeSmells}
              </span>
              {walkin.avgCoverage != null && (
                <span>全量覆盖 {walkin.avgCoverage.toFixed(1)}%</span>
              )}
              {walkin.avgNewCoverage != null && (
                <span>增量覆盖 {walkin.avgNewCoverage.toFixed(1)}%</span>
              )}
            </div>
          </div>
        )}

        {noTestProjects.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <p className="text-sm text-muted-foreground mb-2">无单测项目:</p>
            <div className="flex flex-wrap gap-2">
              {noTestProjects.slice(0, 5).map((p) => (
                <span key={p.project_id} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {p.project_name.split("/").pop()}
                </span>
              ))}
              {noTestProjects.length > 5 && (
                <span className="text-xs text-muted-foreground">+{noTestProjects.length - 5}个</span>
              )}
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
  const leftProjects: GitLabProjectResult[] = useMemo(
    () => JSON.parse(left.summary || "[]"),
    [left.summary],
  );
  const rightProjects: GitLabProjectResult[] = useMemo(
    () => JSON.parse(right.summary || "[]"),
    [right.summary],
  );

  const leftCoverage = left.total_projects > 0 ? Math.round((left.test_projects / left.total_projects) * 100) : 0;
  const rightCoverage = right.total_projects > 0 ? Math.round((right.test_projects / right.total_projects) * 100) : 0;

  const leftWalkin = useMemo(() => computeWalkinAggregates(leftProjects), [leftProjects]);
  const rightWalkin = useMemo(() => computeWalkinAggregates(rightProjects), [rightProjects]);

  const diff = (a: number, b: number) => {
    const d = a - b;
    if (d > 0) return <span className="text-green-600">+{d}</span>;
    if (d < 0) return <span className="text-red-600">{d}</span>;
    return <span className="text-muted-foreground">-</span>;
  };

  const diffPercent = (a: number | null, b: number | null) => {
    if (a == null || b == null) return <span className="text-muted-foreground">-</span>;
    const d = a - b;
    if (Math.abs(d) < 0.01) return <span className="text-muted-foreground">-</span>;
    if (d > 0) return <span className="text-green-600">+{d.toFixed(1)}%</span>;
    return <span className="text-red-600">{d.toFixed(1)}%</span>;
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
          <div className="text-center">{rightCoverage}% ({right.test_projects}/{right.total_projects})</div>
          <div className="text-center">
            {leftCoverage}% ({left.test_projects}/{left.total_projects})
            <span className="ml-2">{diffPercent(leftCoverage, rightCoverage)}</span>
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

          {/* Walkin comparison */}
          {(leftWalkin.matched > 0 || rightWalkin.matched > 0) && (
            <>
              <div className="col-span-3 border-t pt-2 mt-2 text-xs font-medium text-muted-foreground">Walkin 代码质量</div>

              <div className="text-muted-foreground">Bug</div>
              <div className="text-center">{rightWalkin.totalBugs}</div>
              <div className="text-center">
                {leftWalkin.totalBugs}
                <span className="ml-2">{diff(leftWalkin.totalBugs, rightWalkin.totalBugs)}</span>
              </div>

              <div className="text-muted-foreground">漏洞</div>
              <div className="text-center">{rightWalkin.totalVulnerabilities}</div>
              <div className="text-center">
                {leftWalkin.totalVulnerabilities}
                <span className="ml-2">{diff(leftWalkin.totalVulnerabilities, rightWalkin.totalVulnerabilities)}</span>
              </div>

              <div className="text-muted-foreground">异味</div>
              <div className="text-center">{rightWalkin.totalCodeSmells}</div>
              <div className="text-center">
                {leftWalkin.totalCodeSmells}
                <span className="ml-2">{diff(leftWalkin.totalCodeSmells, rightWalkin.totalCodeSmells)}</span>
              </div>

              <div className="text-muted-foreground">全量覆盖率</div>
              <div className="text-center">{rightWalkin.avgCoverage != null ? `${rightWalkin.avgCoverage.toFixed(1)}%` : "-"}</div>
              <div className="text-center">
                {leftWalkin.avgCoverage != null ? `${leftWalkin.avgCoverage.toFixed(1)}%` : "-"}
                <span className="ml-2">{diffPercent(leftWalkin.avgCoverage, rightWalkin.avgCoverage)}</span>
              </div>

              <div className="text-muted-foreground">增量覆盖率</div>
              <div className="text-center">{rightWalkin.avgNewCoverage != null ? `${rightWalkin.avgNewCoverage.toFixed(1)}%` : "-"}</div>
              <div className="text-center">
                {leftWalkin.avgNewCoverage != null ? `${leftWalkin.avgNewCoverage.toFixed(1)}%` : "-"}
                <span className="ml-2">{diffPercent(leftWalkin.avgNewCoverage, rightWalkin.avgNewCoverage)}</span>
              </div>
            </>
          )}
        </div>

        {(newTestProjects.length > 0 || lostTestProjects.length > 0) && (
          <div className="mt-4 border-t pt-4 text-sm">
            {newTestProjects.length > 0 && (
              <div className="mb-2">
                <span className="text-muted-foreground">新增单测项目: </span>
                <span>{newTestProjects.map(p => p.split("/").pop()).join(", ")}</span>
              </div>
            )}
            {lostTestProjects.length > 0 && (
              <div>
                <span className="text-muted-foreground">未补单测项目: </span>
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
  const [detailItem, setDetailItem] = useState<GitLabScanHistory | null>(null);

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
            onClick={() => setDetailItem(item)}
          />
        ))}
      </div>

      <ScanDetailDialog
        item={detailItem}
        open={!!detailItem}
        onClose={() => setDetailItem(null)}
      />
    </div>
  );
}
