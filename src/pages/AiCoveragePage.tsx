import { useState, useEffect, useMemo } from "react";
import {
  Brain, ChevronRight, ChevronDown, Users, GitCommit, Code2,
  Calendar, RefreshCw, Search, ChevronLeft, User, Trophy,
  GitBranch, ExternalLink, Loader2, FileCode
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  aiCoverageApi, type AiCoverageDepartment, type AiCoverageResponse,
  type AiCoverageAuthor, type AiCoverageCommit, type CommitCheckResponse
} from "@/lib/api/aiCoverage";
import { toast } from "sonner";

interface DepartmentRowProps {
  dept: AiCoverageDepartment;
  level: number;
  parentDept?: string; // 一级部门名称，用于二级部门时传递
  expanded: Set<string>;
  authorExpanded: Set<string>;
  authorsMap: Map<string, AiCoverageAuthor[]>;
  loadingAuthors: Set<string>;
  commitsExpanded: Set<string>;
  commitsMap: Map<string, AiCoverageCommit[]>;
  loadingCommits: Set<string>;
  commitDetailExpanded: Set<string>;
  commitDetailsMap: Map<string, CommitCheckResponse>;
  loadingCommitDetails: Set<string>;
  onToggleDept: (name: string) => void;
  onToggleAuthors: (key: string) => void;
  onToggleCommits: (key: string) => void;
  onToggleCommitDetail: (key: string) => void;
  onLoadAuthors: (dept: string, deptL2: string | null, key: string) => void;
  onLoadCommits: (dept: string, deptL2: string | null, authorEmail: string, key: string) => void;
  onLoadCommitDetail: (projectName: string, commitSha: string, gitlabProjectId: number, key: string) => void;
}

function DepartmentRow({
  dept,
  level,
  parentDept,
  expanded,
  authorExpanded,
  authorsMap,
  loadingAuthors,
  commitsExpanded,
  commitsMap,
  loadingCommits,
  commitDetailExpanded,
  commitDetailsMap,
  loadingCommitDetails,
  onToggleDept,
  onToggleAuthors,
  onToggleCommits,
  onToggleCommitDetail,
  onLoadAuthors,
  onLoadCommits,
  onLoadCommitDetail,
}: DepartmentRowProps) {
  const hasChildren = dept.children && dept.children.length > 0;
  const isExpanded = expanded.has(dept.name);
  const indent = level * 16;

  // Key for author data: "dept|deptL2" for level 1, just "dept" for level 0
  const authorKey = level === 0 ? dept.name : `${parentDept}|${dept.name}`;
  const showAuthors = authorExpanded.has(authorKey);
  const authors = authorsMap.get(authorKey) || [];
  const isLoadingAuthors = loadingAuthors.has(authorKey);

  const rateColor = dept.ai_rate >= 80
    ? "text-emerald-600 bg-emerald-500/10"
    : dept.ai_rate >= 50
      ? "text-amber-600 bg-amber-500/10"
      : "text-rose-600 bg-rose-500/10";

  const handleShowAuthors = () => {
    if (!showAuthors && authors.length === 0 && !isLoadingAuthors) {
      // level 0: 一级部门, deptL2 = null
      // level 1: 一级部门 + 二级部门
      onLoadAuthors(
        level === 0 ? dept.name : parentDept || "",
        level === 0 ? null : dept.name,
        authorKey
      );
    }
    onToggleAuthors(authorKey);
  };

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-2 px-4 py-2 border-b border-border/50 transition-colors hover:bg-muted/50",
          level > 0 && "bg-muted/20"
        )}
        style={{ paddingLeft: 16 + indent }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggleDept(dept.name)}
            className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
          >
            {isExpanded
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            }
          </button>
        ) : (
          <span className="w-4" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{dept.name}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {dept.contributor_count}
            </span>
            <span className="flex items-center gap-1">
              <GitCommit className="h-3 w-3" />
              {dept.total_commits.toLocaleString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-mono text-xs text-muted-foreground">
              {dept.ai_lines.toLocaleString()} / {dept.total_lines.toLocaleString()}
            </p>
          </div>
          <span className={cn(
            "shrink-0 rounded px-2 py-0.5 text-xs font-bold font-mono",
            rateColor
          )}>
            {dept.ai_rate.toFixed(1)}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={handleShowAuthors}
          >
            {isLoadingAuthors ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : showAuthors ? (
              <ChevronDown className="h-3 w-3 mr-1" />
            ) : (
              <ChevronRight className="h-3 w-3 mr-1" />
            )}
            <User className="h-3 w-3 mr-1" />
            人员
          </Button>
        </div>
      </div>

      {/* Author list (inline expansion) */}
      {showAuthors && (
        <>
          {isLoadingAuthors ? (
            <div className="flex items-center justify-center py-8 bg-muted/10" style={{ paddingLeft: 32 + indent }}>
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : authors.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground bg-muted/10" style={{ paddingLeft: 32 + indent }}>
              暂无人员数据
            </div>
          ) : (
            authors.map((author, idx) => {
              const commitKey = `${authorKey}|${author.author_email}`;
              const showCommits = commitsExpanded.has(commitKey);
              const commits = commitsMap.get(commitKey) || [];
              const isLoadingCommits = loadingCommits.has(commitKey);

              const authorRateColor = author.ai_rate >= 80
                ? "text-emerald-600 bg-emerald-500/10"
                : author.ai_rate >= 50
                  ? "text-amber-600 bg-amber-500/10"
                  : "text-rose-600 bg-rose-500/10";

              return (
                <div key={author.author_email}>
                  {/* Author row */}
                  <div
                    className="flex items-center gap-2 px-4 py-2 border-b border-border/30 bg-muted/10 hover:bg-muted/20 transition-colors"
                    style={{ paddingLeft: 32 + indent }}
                  >
                    <div className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shrink-0",
                      idx === 0 ? "bg-yellow-500/20 text-yellow-600" :
                        idx === 1 ? "bg-gray-300/40 text-gray-600" :
                          idx === 2 ? "bg-amber-600/20 text-amber-700" :
                            "bg-muted text-muted-foreground"
                    )}>
                      {idx < 3 ? <Trophy className="h-2.5 w-2.5" /> : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{author.author_name}</p>
                      <p className="text-xs text-muted-foreground">{author.author_email}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-xs text-muted-foreground">
                        {author.ai_lines.toLocaleString()} / {author.total_lines.toLocaleString()}
                      </p>
                    </div>
                    <span className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold font-mono",
                      authorRateColor
                    )}>
                      {author.ai_rate.toFixed(1)}%
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[10px]"
                      onClick={() => {
                        if (!showCommits && commits.length === 0 && !isLoadingCommits) {
                          onLoadCommits(
                            level === 0 ? dept.name : parentDept || "",
                            level === 0 ? null : dept.name,
                            author.author_email,
                            commitKey
                          );
                        }
                        onToggleCommits(commitKey);
                      }}
                    >
                      {isLoadingCommits ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : showCommits ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      <GitBranch className="h-3 w-3 mx-0.5" />
                      {author.total_commits}
                    </Button>
                  </div>

                  {/* Commits list (inline expansion) */}
                  {showCommits && (
                    <>
                      {isLoadingCommits ? (
                        <div className="flex items-center justify-center py-4 bg-muted/5" style={{ paddingLeft: 48 + indent }}>
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : commits.length === 0 ? (
                        <div className="py-2 text-center text-xs text-muted-foreground bg-muted/5" style={{ paddingLeft: 48 + indent }}>
                          暂无提交数据
                        </div>
                      ) : (
                        commits.map((commit) => {
                          const commitRateColor = commit.ai_rate >= 80
                            ? "text-emerald-600 bg-emerald-500/10"
                            : commit.ai_rate >= 50
                              ? "text-amber-600 bg-amber-500/10"
                              : commit.ai_rate > 0
                                ? "text-rose-600 bg-rose-500/10"
                                : "text-gray-500 bg-gray-500/10";

                          const commitDate = new Date(commit.committed_at).toLocaleDateString("zh-CN", {
                            month: "2-digit", day: "2-digit"
                          });

                          const detailKey = `${commit.gitlab_id}`;
                          const showDetail = commitDetailExpanded.has(detailKey);
                          const isLoadingDetail = loadingCommitDetails.has(detailKey);
                          const commitDetail = commitDetailsMap.get(detailKey);

                          return (
                            <div key={commit.commit_id}>
                              <div
                                className="flex items-center gap-2 px-4 py-1.5 border-b border-border/20 bg-muted/5 hover:bg-muted/10 transition-colors"
                                style={{ paddingLeft: 48 + indent }}
                              >
                                <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono text-muted-foreground shrink-0">
                                  {commit.short_sha}
                                </code>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs truncate">{commit.title}</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {commit.project_name} · {commitDate}
                                  </p>
                                </div>
                                <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                                  +{commit.additions}
                                </span>
                                <span className={cn(
                                  "shrink-0 rounded px-1 py-0.5 text-[10px] font-bold font-mono",
                                  commitRateColor
                                )}>
                                  {commit.ai_rate.toFixed(0)}%
                                </span>
                                {/* Detail button */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 px-1"
                                  onClick={() => {
                                    if (!showDetail && !commitDetail && !isLoadingDetail) {
                                      onLoadCommitDetail(commit.project_name, commit.gitlab_id, commit.project_gitlab_id, detailKey);
                                    }
                                    onToggleCommitDetail(detailKey);
                                  }}
                                >
                                  {isLoadingDetail ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : showDetail ? (
                                    <ChevronDown className="h-3 w-3" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3" />
                                  )}
                                </Button>
                                <a
                                  href={`https://gitlab.jms.com/${commit.project_gitlab_id}/-/commit/${commit.gitlab_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                </a>
                              </div>

                              {/* Commit detail expansion */}
                              {showDetail && commitDetail && (
                                <div className="bg-muted/10 border-b border-border/20 px-4 py-2" style={{ paddingLeft: 60 + indent }}>
                                  {/* AI Info */}
                                  <div className="flex items-center gap-4 mb-2 text-xs">
                                    <span className="flex items-center gap-1 text-muted-foreground">
                                      <Brain className="h-3 w-3" />
                                      {commitDetail.ai_note.tool_name}
                                    </span>
                                    <span className="flex items-center gap-1 text-muted-foreground">
                                      <Code2 className="h-3 w-3" />
                                      {commitDetail.ai_note.model_name}
                                    </span>
                                    <span className="text-muted-foreground">
                                      Prompts: {commitDetail.ai_note.prompts_count}
                                    </span>
                                  </div>

                                  {/* Stats */}
                                  <div className="flex items-center gap-4 mb-2 text-[10px] text-muted-foreground">
                                    <span>有效文件: {commitDetail.stats.valid_files_count}</span>
                                    <span>AI行数: {commitDetail.stats.ai_additions.toLocaleString()}</span>
                                    <span>人工行数: {commitDetail.stats.human_additions}</span>
                                  </div>

                                  {/* Files list */}
                                  {commitDetail.valid_files.length > 0 && (
                                    <div className="space-y-0.5">
                                      {commitDetail.valid_files.slice(0, 10).map((file, idx) => (
                                        <div key={idx} className="flex items-center gap-2 text-[10px]">
                                          <FileCode className="h-3 w-3 text-muted-foreground shrink-0" />
                                          <span className="truncate flex-1 text-muted-foreground">{file.path}</span>
                                          <span className="font-mono text-muted-foreground">+{file.additions}</span>
                                          <span className={cn(
                                            "rounded px-1 py-0.5 font-mono",
                                            file.ai_rate >= 80 ? "text-emerald-600" : file.ai_rate >= 50 ? "text-amber-600" : "text-rose-600"
                                          )}>
                                            {file.ai_rate.toFixed(0)}%
                                          </span>
                                        </div>
                                      ))}
                                      {commitDetail.valid_files.length > 10 && (
                                        <div className="text-[10px] text-muted-foreground pl-5">
                                          还有 {commitDetail.valid_files.length - 10} 个文件...
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </>
      )}

      {/* Child departments */}
      {hasChildren && isExpanded && dept.children!.map((child) => (
        <DepartmentRow
          key={child.name}
          dept={child}
          level={level + 1}
          parentDept={level === 0 ? dept.name : parentDept}
          expanded={expanded}
          authorExpanded={authorExpanded}
          authorsMap={authorsMap}
          loadingAuthors={loadingAuthors}
          commitsExpanded={commitsExpanded}
          commitsMap={commitsMap}
          loadingCommits={loadingCommits}
          commitDetailExpanded={commitDetailExpanded}
          commitDetailsMap={commitDetailsMap}
          loadingCommitDetails={loadingCommitDetails}
          onToggleDept={onToggleDept}
          onToggleAuthors={onToggleAuthors}
          onToggleCommits={onToggleCommits}
          onToggleCommitDetail={onToggleCommitDetail}
          onLoadAuthors={onLoadAuthors}
          onLoadCommits={onLoadCommits}
          onLoadCommitDetail={onLoadCommitDetail}
        />
      ))}
    </>
  );
}

export function AiCoveragePage() {
  const [data, setData] = useState<AiCoverageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // Authors expansion state
  const [authorExpanded, setAuthorExpanded] = useState<Set<string>>(new Set());
  const [authorsMap, setAuthorsMap] = useState<Map<string, AiCoverageAuthor[]>>(new Map());
  const [loadingAuthors, setLoadingAuthors] = useState<Set<string>>(new Set());

  // Commits expansion state
  const [commitsExpanded, setCommitsExpanded] = useState<Set<string>>(new Set());
  const [commitsMap, setCommitsMap] = useState<Map<string, AiCoverageCommit[]>>(new Map());
  const [loadingCommits, setLoadingCommits] = useState<Set<string>>(new Set());

  // Commit detail expansion state
  const [commitDetailExpanded, setCommitDetailExpanded] = useState<Set<string>>(new Set());
  const [commitDetailsMap, setCommitDetailsMap] = useState<Map<string, CommitCheckResponse>>(new Map());
  const [loadingCommitDetails, setLoadingCommitDetails] = useState<Set<string>>(new Set());

  // Default date range: last 30 days
  const today = new Date();
  const defaultEnd = today.toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const defaultStart = thirtyDaysAgo.toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  // Quick date range presets
  const datePresets: { label: string; start: number | "month" | "lastMonth"; end: number | "lastMonthEnd" }[] = [
    { label: "近7天", start: -7, end: 0 },
    { label: "近30天", start: -30, end: 0 },
    { label: "近90天", start: -90, end: 0 },
    { label: "本月", start: "month", end: 0 },
    { label: "上月", start: "lastMonth", end: "lastMonthEnd" },
  ];

  const applyPreset = (preset: typeof datePresets[0]) => {
    const today = new Date();
    let start: Date;
    let end: Date;

    if (preset.start === "month") {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (preset.start === "lastMonth") {
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    } else {
      start = new Date(today);
      start.setDate(start.getDate() + preset.start);
    }

    if (preset.end === "lastMonthEnd") {
      end = new Date(today.getFullYear(), today.getMonth(), 0);
    } else {
      end = new Date(today);
      end.setDate(end.getDate() + preset.end);
    }

    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await aiCoverageApi.getCoverage(startDate, endDate);
      setData(result);
      // Clear expansion states on date change
      setExpanded(new Set());
      setAuthorExpanded(new Set());
      setAuthorsMap(new Map());
      setLoadingAuthors(new Set());
      setCommitsExpanded(new Set());
      setCommitsMap(new Map());
      setLoadingCommits(new Set());
    } catch (e) {
      toast.error(`获取数据失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const loadAuthors = async (dept: string, deptL2: string | null, key: string) => {
    setLoadingAuthors((prev) => new Set(prev).add(key));
    try {
      const result = await aiCoverageApi.getCoverageAuthors(
        dept || "",
        deptL2,
        startDate,
        endDate
      );
      setAuthorsMap((prev) => new Map(prev).set(key, result));
    } catch (e) {
      toast.error(`获取人员数据失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingAuthors((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const loadCommits = async (dept: string, deptL2: string | null, authorEmail: string, key: string) => {
    setLoadingCommits((prev) => new Set(prev).add(key));
    try {
      const result = await aiCoverageApi.getCoverageCommits(
        dept || "",
        deptL2,
        authorEmail,
        startDate,
        endDate
      );
      setCommitsMap((prev) => new Map(prev).set(key, result));
    } catch (e) {
      toast.error(`获取提交数据失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingCommits((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleExpand = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAuthorExpand = (key: string) => {
    setAuthorExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleCommitExpand = (key: string) => {
    setCommitsExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleCommitDetailExpand = (key: string) => {
    setCommitDetailExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const loadCommitDetail = async (projectName: string, commitSha: string, gitlabProjectId: number, key: string) => {
    setLoadingCommitDetails((prev) => new Set(prev).add(key));
    try {
      const result = await aiCoverageApi.getCommitDetail(projectName, commitSha, gitlabProjectId);
      setCommitDetailsMap((prev) => new Map(prev).set(key, result));
    } catch (e) {
      toast.error(`获取提交详情失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingCommitDetails((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const filteredDepartments = useMemo(() => {
    if (!data || !search.trim()) return data?.departments || [];
    const term = search.toLowerCase();

    const filterDepts = (depts: AiCoverageDepartment[]): AiCoverageDepartment[] => {
      const result: AiCoverageDepartment[] = [];
      for (const d of depts) {
        if (d.name.toLowerCase().includes(term)) {
          result.push(d);
        } else if (d.children) {
          const filteredChildren = filterDepts(d.children);
          if (filteredChildren.length > 0) {
            result.push({ ...d, children: filteredChildren });
          }
        }
      }
      return result;
    };
    return filterDepts(data.departments);
  }, [data, search]);

  const expandAll = () => {
    if (!data) return;
    const all = new Set<string>();
    const addNames = (depts: AiCoverageDepartment[]) => {
      for (const d of depts) {
        if (d.children && d.children.length > 0) {
          all.add(d.name);
          addNames(d.children);
        }
      }
    };
    addNames(data.departments);
    setExpanded(all);
  };

  const collapseAll = () => {
    setExpanded(new Set());
    setAuthorExpanded(new Set());
    setCommitsExpanded(new Set());
  };

  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Brain className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold tracking-tight">AI 代码覆盖率</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                各部门 AI 辅助编程代码贡献统计
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Quick presets */}
            <div className="flex items-center gap-1">
              {datePresets.map((preset) => (
                <Button
                  key={preset.label}
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => applyPreset(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <span className="text-muted-foreground mx-1">|</span>
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <ChevronLeft className="h-3 w-3 text-muted-foreground rotate-180" />
            <input
              type="date"
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <Button size="sm" className="h-8" onClick={fetchData} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
              查询
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {data && (
        <div className="grid grid-cols-5 gap-4 p-6 bg-muted/30">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">AI 覆盖率</p>
            <p className="text-2xl font-bold text-primary font-mono">
              {data.overall.ai_rate.toFixed(1)}%
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">总代码行</p>
            <p className="text-2xl font-bold font-mono">
              {(data.overall.total_lines / 1_000_000).toFixed(2)}M
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">AI 代码行</p>
            <p className="text-2xl font-bold text-primary font-mono">
              {(data.overall.ai_lines / 1_000_000).toFixed(2)}M
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">总提交数</p>
            <p className="text-2xl font-bold font-mono">
              {data.overall.total_commits.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">AI 提交数</p>
            <p className="text-2xl font-bold text-primary font-mono">
              {data.overall.commits_with_ai.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 p-6 pt-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between py-3 border-b">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 w-64 pl-8 text-xs"
                placeholder="搜索部门..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={expandAll}>
              展开全部
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={collapseAll}>
              收起全部
            </Button>
          </div>
          {data && (
            <span className="text-xs text-muted-foreground">
              共 {data.departments.length} 个部门
            </span>
          )}
        </div>

        {/* Header Row */}
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b font-medium text-xs text-muted-foreground">
          <span className="flex-1">部门 / 团队</span>
          <span className="w-24 text-right">代码行</span>
          <span className="w-16 text-right">覆盖率</span>
          <span className="w-14" />
        </div>

        {/* List */}
        <div className="border rounded-b-xl divide-y divide-border/50 overflow-auto max-h-[calc(100vh-380px)]">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredDepartments.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <Code2 className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">暂无数据</p>
            </div>
          ) : (
            filteredDepartments.map((dept) => (
              <DepartmentRow
                key={dept.name}
                dept={dept}
                level={0}
                expanded={expanded}
                authorExpanded={authorExpanded}
                authorsMap={authorsMap}
                loadingAuthors={loadingAuthors}
                commitsExpanded={commitsExpanded}
                commitsMap={commitsMap}
                loadingCommits={loadingCommits}
                commitDetailExpanded={commitDetailExpanded}
                commitDetailsMap={commitDetailsMap}
                loadingCommitDetails={loadingCommitDetails}
                onToggleDept={toggleExpand}
                onToggleAuthors={toggleAuthorExpand}
                onToggleCommits={toggleCommitExpand}
                onToggleCommitDetail={toggleCommitDetailExpand}
                onLoadAuthors={loadAuthors}
                onLoadCommits={loadCommits}
                onLoadCommitDetail={loadCommitDetail}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}