import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Brain, ChevronRight, ChevronDown, Users, GitCommit, Code2,
  Calendar, RefreshCw, Search, User, Trophy,
  GitBranch, ExternalLink, Loader2, FileCode, Settings, FileX,
  CheckCircle2, AlertCircle, Sparkles, ArrowUpRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  aiCoverageApi, type AiCoverageDepartment, type AiCoverageResponse,
  type AiCoverageAuthor, type AiCoverageCommit, type CommitCheckResponse
} from "@/lib/api/aiCoverage";
import { toast } from "sonner";
import { SettingsTab, getConfig, type AiCoverageConfig } from "@/components/modules/aiCoverage/SettingsTab";

const tabs = [
  { key: "coverage", label: "生成率", icon: Brain },
  { key: "settings", label: "配置", icon: Settings },
] as const;

interface DepartmentRowProps {
  dept: AiCoverageDepartment;
  level: number;
  parentDept?: string;
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
  filesExpanded: Set<string>;
  onToggleDept: (name: string) => void;
  onToggleAuthors: (key: string) => void;
  onToggleCommits: (key: string) => void;
  onToggleCommitDetail: (key: string) => void;
  onToggleFiles: (key: string) => void;
  onLoadAuthors: (dept: string, deptL2: string | null, key: string) => void;
  onLoadCommits: (dept: string, deptL2: string | null, authorEmail: string, key: string) => void;
  onLoadCommitDetail: (projectName: string, commitSha: string, gitlabProjectId: number, key: string) => void;
}

function rateColor(rate: number) {
  if (rate >= 80) return { text: "text-emerald-600", bg: "bg-emerald-500/10" };
  if (rate >= 50) return { text: "text-amber-600", bg: "bg-amber-500/10" };
  return { text: "text-rose-600", bg: "bg-rose-500/10" };
}

function formatNumber(n: number): string {
  if (n >= 100000000) return (n / 100000000).toFixed(2) + "亿";
  if (n >= 10000) return (n / 10000).toFixed(2) + "w";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return n.toString();
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    if (days === 0) return "今天";
    if (days === 1) return "昨天";
    if (days < 7) return `${days} 天前`;
    if (days < 30) return `${Math.floor(days / 7)} 周前`;
    return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
  } catch {
    return iso;
  }
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
  filesExpanded,
  onToggleDept,
  onToggleAuthors,
  onToggleCommits,
  onToggleCommitDetail,
  onToggleFiles,
  onLoadAuthors,
  onLoadCommits,
  onLoadCommitDetail,
}: DepartmentRowProps) {
  // 过滤掉混入 children 数组的"作者"对象（API 在某些部门下把单人也放进了 children）
  const realChildren = (dept.children || []).filter(c => !(c as any)._isAuthor);
  const hasChildren = realChildren.length > 0;
  const isExpanded = expanded.has(dept.name);
  const indent = level * 16;

  const authorKey = level === 0 ? dept.name : `${parentDept}|${dept.name}`;
  const showAuthors = authorExpanded.has(authorKey);
  const authors = authorsMap.get(authorKey) || [];
  const isLoadingAuthors = loadingAuthors.has(authorKey);

  const overallColor = rateColor(dept.ai_rate);
  const nonTestColor = rateColor(dept.non_test_ai_rate);

  const handleShowAuthors = () => {
    if (!showAuthors && authors.length === 0 && !isLoadingAuthors) {
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
          "group flex items-center gap-3 px-4 py-2.5 border-b border-border/40 transition-colors hover:bg-muted/40",
          level > 0 && "bg-muted/10",
        )}
        style={{ paddingLeft: `${16 + indent}px` }}
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
          <span className="w-3.5 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {level === 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 shrink-0">
                <Users className="h-3 w-3 text-primary" />
              </span>
            )}
            <p className="text-sm font-medium truncate">{dept.name}</p>
            {dept.department_l3 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                L3
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1">
              <Users className="h-2.5 w-2.5" />
              <span className="font-mono tabular-nums">{dept.contributor_count}</span> 人
            </span>
            <span className="flex items-center gap-1">
              <GitCommit className="h-2.5 w-2.5" />
              <span className="font-mono tabular-nums">{dept.total_commits.toLocaleString()}</span> 提交
            </span>
            <span className="flex items-center gap-1">
              <Code2 className="h-2.5 w-2.5" />
              <span className="font-mono tabular-nums">{formatNumber(dept.total_lines)}</span> 行
            </span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground leading-none">非测试 AI</p>
            <p className={cn("text-xs font-bold font-mono tabular-nums leading-tight", nonTestColor.text)}>
              {dept.non_test_ai_rate.toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cn(
            "rounded-md px-2 py-0.5 text-xs font-bold font-mono tabular-nums",
            overallColor.bg, overallColor.text
          )}>
            {dept.ai_rate.toFixed(1)}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] gap-1"
            onClick={handleShowAuthors}
          >
            {isLoadingAuthors ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : showAuthors ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <User className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {showAuthors && (
        <>
          {/* 显示 API 在 children 中混入的"单飞作者" */}
          {(() => {
            const mixedAuthors = (dept.children || []).filter(c => (c as any)._isAuthor);
            if (mixedAuthors.length === 0) return null;
            return (
              <div className="border-b border-border/30 bg-amber-500/5 py-1.5" style={{ paddingLeft: `${32 + indent}px` }}>
                <div className="flex items-center gap-1.5 mb-1 px-2">
                  <AlertCircle className="h-3 w-3 text-amber-600" />
                  <span className="text-[10px] text-amber-700 dark:text-amber-500 font-medium">
                    API 混入了 {mixedAuthors.length} 位单飞作者（已从部门层级中过滤）
                  </span>
                </div>
                {mixedAuthors.map((a: any) => (
                  <div key={a.author_email} className="flex items-center gap-2 text-[10px] px-2 py-1 mx-2 rounded bg-background/40">
                    <User className="h-3 w-3 text-amber-600 shrink-0" />
                    <span className="font-medium">{a.author_name}</span>
                    <span className="text-muted-foreground">({a.author_email})</span>
                    <span className="ml-auto font-mono tabular-nums text-muted-foreground">
                      {a.total_commits} 提交 · {formatNumber(a.total_lines)} 行
                    </span>
                    <span className={cn(
                      "rounded px-1.5 py-0.5 text-[9px] font-bold font-mono tabular-nums shrink-0",
                      rateColor(a.ai_rate).bg, rateColor(a.ai_rate).text
                    )}>
                      {a.ai_rate.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            );
          })()}

          {isLoadingAuthors ? (
            <div className="flex items-center justify-center py-6 bg-muted/5" style={{ paddingLeft: `${32 + indent}px` }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            </div>
          ) : authors.length === 0 ? (
            <div className="py-3 text-center text-[10px] text-muted-foreground bg-muted/5" style={{ paddingLeft: `${32 + indent}px` }}>
              暂无人员数据
            </div>
          ) : (
            authors.map((author, idx) => {
              const commitKey = `${authorKey}|${author.author_email}`;
              const showCommits = commitsExpanded.has(commitKey);
              const commits = commitsMap.get(commitKey) || [];
              const isLoadingCommits = loadingCommits.has(commitKey);

              const authorOverallColor = rateColor(author.ai_rate);
              const authorNonTestColor = rateColor(author.non_test_ai_rate);

              return (
                <div key={author.author_email}>
                  <div
                    className="flex items-center gap-3 px-4 py-2 border-b border-border/30 bg-muted/5 hover:bg-muted/10 transition-colors"
                    style={{ paddingLeft: `${32 + indent}px` }}
                  >
                    <span className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shrink-0",
                      idx === 0 ? "bg-yellow-500/20 text-yellow-700" :
                      idx === 1 ? "bg-slate-300/40 text-slate-600" :
                      idx === 2 ? "bg-amber-600/20 text-amber-700" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {idx < 3 ? <Trophy className="h-2.5 w-2.5" /> : idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate font-medium">{author.author_name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{author.author_email}</p>
                    </div>
                    <div className="hidden md:flex items-center gap-3 text-[10px] text-muted-foreground shrink-0">
                      <span><span className="font-mono tabular-nums">{author.total_commits}</span> 提交</span>
                      <span><span className="font-mono tabular-nums">{formatNumber(author.total_lines)}</span> 行</span>
                    </div>
                    <div className="hidden md:block shrink-0">
                      <p className="text-[9px] text-muted-foreground leading-none text-right">非测试 AI</p>
                      <p className={cn("text-[10px] font-bold font-mono tabular-nums", authorNonTestColor.text)}>
                        {author.non_test_ai_rate.toFixed(1)}%
                      </p>
                    </div>
                    <span className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold font-mono tabular-nums",
                      authorOverallColor.bg, authorOverallColor.text
                    )}>
                      {author.ai_rate.toFixed(1)}%
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] gap-1"
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
                      <GitCommit className="h-3 w-3" />
                      {author.total_commits}
                    </Button>
                  </div>

                  {showCommits && (
                    <>
                      {isLoadingCommits ? (
                        <div className="flex items-center justify-center py-3 bg-muted/5" style={{ paddingLeft: `${48 + indent}px` }}>
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        </div>
                      ) : commits.length === 0 ? (
                        <div className="py-2 text-center text-[10px] text-muted-foreground bg-muted/5" style={{ paddingLeft: `${48 + indent}px` }}>
                          暂无提交数据
                        </div>
                      ) : (
                        commits.map((commit) => {
                          const detailKey = `${commit.gitlab_id}`;
                          const showDetail = commitDetailExpanded.has(detailKey);
                          const isLoadingDetail = loadingCommitDetails.has(detailKey);
                          const commitDetail = commitDetailsMap.get(detailKey);

                          const commitOverallColor = rateColor(commit.ai_rate);
                          const commitNonTestColor = rateColor(commit.non_test_ai_rate);

                          return (
                            <div key={commit.commit_id}>
                              <div
                                className="flex items-center gap-2 px-4 py-1.5 border-b border-border/20 bg-muted/5 hover:bg-muted/10 transition-colors"
                                style={{ paddingLeft: `${48 + indent}px` }}
                              >
                                <code className="rounded bg-background px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground shrink-0 border border-border/40">
                                  {commit.short_sha}
                                </code>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs truncate">{commit.title}</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {commit.project_name} · {formatTime(commit.committed_at)}
                                  </p>
                                </div>
                                <span className="hidden md:inline font-mono text-[10px] text-muted-foreground shrink-0">
                                  +{commit.additions}
                                </span>
                                <span className="hidden lg:inline shrink-0 text-right">
                                  <p className="text-[9px] text-muted-foreground leading-none">非测试</p>
                                  <p className={cn("text-[10px] font-bold font-mono tabular-nums", commitNonTestColor.text)}>
                                    {commit.non_test_ai_rate.toFixed(0)}%
                                  </p>
                                </span>
                                <span className={cn(
                                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold font-mono tabular-nums",
                                  commitOverallColor.bg, commitOverallColor.text
                                )}>
                                  {commit.ai_rate.toFixed(0)}%
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 w-5 p-0"
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
                                  href={`https://code.jms.com/${commit.project_gitlab_id}/-/commit/${commit.gitlab_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                </a>
                              </div>

                              {showDetail && commitDetail && (
                                <div className="bg-muted/10 border-b border-border/20 px-4 py-3 space-y-2" style={{ paddingLeft: `${56 + indent}px` }}>
                                  <div className="flex items-center gap-3 text-[10px] flex-wrap">
                                    <span className="flex items-center gap-1 text-muted-foreground">
                                      <User className="h-3 w-3" />
                                      {commitDetail.commit.author_name}
                                    </span>
                                    <span className="flex items-center gap-1 text-muted-foreground">
                                      <GitBranch className="h-3 w-3" />
                                      {commitDetail.commit.branch}
                                    </span>
                                    <a
                                      href={commitDetail.commit.web_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1 text-primary hover:underline"
                                    >
                                      <ArrowUpRight className="h-3 w-3" />
                                      GitLab
                                    </a>
                                  </div>

                                  <div className="flex items-center gap-3 text-[10px] flex-wrap">
                                    <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 text-primary">
                                      <Sparkles className="h-3 w-3" />
                                      <span className="font-medium">{commitDetail.ai_note.tool_name}</span>
                                    </span>
                                    <span className="flex items-center gap-1 text-muted-foreground">
                                      <Brain className="h-3 w-3" />
                                      {commitDetail.ai_note.model_name}
                                    </span>
                                    <span className="text-muted-foreground">
                                      v{commitDetail.ai_note.git_ai_version}
                                    </span>
                                    <span className="text-muted-foreground">
                                      Prompts: <span className="font-medium text-foreground">{commitDetail.ai_note.prompts_count}</span>
                                    </span>
                                    <span className="text-muted-foreground">
                                      来源: <span className="font-medium text-foreground">{commitDetail.ai_note.ai_source}</span>
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px]">
                                    <div className="rounded bg-background/50 border border-border/40 p-2">
                                      <p className="text-muted-foreground">总新增</p>
                                      <p className="font-mono font-bold text-sm tabular-nums">
                                        +{commitDetail.stats.total_additions.toLocaleString()}
                                      </p>
                                    </div>
                                    <div className="rounded bg-background/50 border border-border/40 p-2">
                                      <p className="text-muted-foreground">AI 新增</p>
                                      <p className="font-mono font-bold text-sm tabular-nums text-primary">
                                        +{commitDetail.stats.ai_additions.toLocaleString()}
                                      </p>
                                    </div>
                                    <div className="rounded bg-background/50 border border-border/40 p-2">
                                      <p className="text-muted-foreground">人工新增</p>
                                      <p className="font-mono font-bold text-sm tabular-nums text-blue-600">
                                        +{commitDetail.stats.human_additions.toLocaleString()}
                                      </p>
                                    </div>
                                    <div className="rounded bg-background/50 border border-border/40 p-2">
                                      <p className="text-muted-foreground">排除文件</p>
                                      <p className="font-mono font-bold text-sm tabular-nums text-amber-600">
                                        {commitDetail.stats.excluded_files_count}
                                        <span className="text-[9px] text-muted-foreground ml-1">
                                          (+{commitDetail.stats.excluded_additions.toLocaleString()})
                                        </span>
                                      </p>
                                    </div>
                                    <div className="rounded bg-background/50 border border-border/40 p-2">
                                      <p className="text-muted-foreground">有效文件</p>
                                      <p className="font-mono font-bold text-sm tabular-nums text-emerald-600">
                                        {commitDetail.stats.valid_files_count}
                                      </p>
                                    </div>
                                  </div>

                                  {commitDetail.valid_files.length > 0 && (
                                    <div className="space-y-1 pt-1">
                                      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                        变更文件 ({commitDetail.valid_files.length})
                                      </div>
                                      <div className="space-y-0.5 max-h-32 overflow-y-auto">
                                        {commitDetail.valid_files.slice(0, filesExpanded.has(detailKey) ? undefined : 8).map((file, idx) => {
                                          const fileColor = rateColor(file.ai_rate);
                                          return (
                                            <div key={idx} className="flex items-center gap-2 text-[10px] py-1 px-2 rounded bg-background/40 hover:bg-muted/30 transition-colors">
                                              <FileCode className="h-3 w-3 text-muted-foreground shrink-0" />
                                              <span className="truncate flex-1 text-muted-foreground font-mono">{file.path}</span>
                                              <span className="text-emerald-600 font-mono tabular-nums shrink-0">+{file.additions}</span>
                                              <span className="text-rose-500 font-mono tabular-nums shrink-0">-{file.deletions}</span>
                                              <span className={cn(
                                                "rounded px-1 py-0.5 font-mono text-[9px] font-bold shrink-0 min-w-[40px] text-center",
                                                fileColor.bg, fileColor.text
                                              )}>
                                                {file.ai_rate.toFixed(0)}%
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                      {commitDetail.valid_files.length > 8 && (
                                        <button
                                          type="button"
                                          className="text-[10px] text-primary hover:underline pl-2 py-0.5"
                                          onClick={() => onToggleFiles(detailKey)}
                                        >
                                          {filesExpanded.has(detailKey)
                                            ? "收起"
                                            : `还有 ${commitDetail.valid_files.length - 8} 个文件...`}
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {commitDetail.excluded_files.length > 0 && (
                                    <div className="pt-1">
                                      <div className="text-[10px] text-muted-foreground flex items-center gap-1 mb-1">
                                        <FileX className="h-3 w-3 text-amber-600" />
                                        排除文件 ({commitDetail.excluded_files.length})
                                      </div>
                                      <div className="space-y-0.5 max-h-24 overflow-y-auto">
                                        {commitDetail.excluded_files.slice(0, 5).map((file, idx) => (
                                          <div key={idx} className="flex items-center gap-2 text-[10px] py-0.5 px-2 rounded bg-muted/30">
                                            <FileCode className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                                            <span className="truncate flex-1 text-muted-foreground font-mono">{file.path}</span>
                                            <span className="text-emerald-600/70 font-mono tabular-nums shrink-0">+{file.additions}</span>
                                          </div>
                                        ))}
                                        {commitDetail.excluded_files.length > 5 && (
                                          <div className="text-[10px] text-muted-foreground/70 pl-2">
                                            等 {commitDetail.excluded_files.length} 个文件
                                          </div>
                                        )}
                                      </div>
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

      {hasChildren && isExpanded && realChildren.map((child) => (
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
          filesExpanded={filesExpanded}
          onToggleDept={onToggleDept}
          onToggleAuthors={onToggleAuthors}
          onToggleCommits={onToggleCommits}
          onToggleCommitDetail={onToggleCommitDetail}
          onToggleFiles={onToggleFiles}
          onLoadAuthors={onLoadAuthors}
          onLoadCommits={onLoadCommits}
          onLoadCommitDetail={onLoadCommitDetail}
        />
      ))}
    </>
  );
}

export function AiCoveragePage() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"coverage" | "settings">(() => {
    const tab = searchParams.get("tab");
    return tab === "settings" ? "settings" : "coverage";
  });
  const [config, setConfig] = useState<AiCoverageConfig>(getConfig);

  const [data, setData] = useState<AiCoverageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const [authorExpanded, setAuthorExpanded] = useState<Set<string>>(new Set());
  const [authorsMap, setAuthorsMap] = useState<Map<string, AiCoverageAuthor[]>>(new Map());
  const [loadingAuthors, setLoadingAuthors] = useState<Set<string>>(new Set());

  const [commitsExpanded, setCommitsExpanded] = useState<Set<string>>(new Set());
  const [commitsMap, setCommitsMap] = useState<Map<string, AiCoverageCommit[]>>(new Map());
  const [loadingCommits, setLoadingCommits] = useState<Set<string>>(new Set());

  const [commitDetailExpanded, setCommitDetailExpanded] = useState<Set<string>>(new Set());
  const [commitDetailsMap, setCommitDetailsMap] = useState<Map<string, CommitCheckResponse>>(new Map());
  const [loadingCommitDetails, setLoadingCommitDetails] = useState<Set<string>>(new Set());
  const [filesExpanded, setFilesExpanded] = useState<Set<string>>(new Set());

  const today = new Date();
  const defaultEnd = today.toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const defaultStart = thirtyDaysAgo.toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const toggleFilesExpand = (key: string) => {
    setFilesExpanded((prev) => {
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
    if (!data) return [];
    // 顶层也过滤掉 _isAuthor 标记的对象（API 偶尔混入）
    const cleanDepts = data.departments.filter(d => !(d as any)._isAuthor);
    if (!search.trim()) return cleanDepts;
    const term = search.toLowerCase();

    const filterDepts = (depts: AiCoverageDepartment[]): AiCoverageDepartment[] => {
      const result: AiCoverageDepartment[] = [];
      for (const d of depts) {
        // 跳过混入的作者对象
        if ((d as any)._isAuthor) continue;
        // 递归过滤子部门
        const cleanedChildren = (d.children || []).filter(c => !(c as any)._isAuthor);
        const matchedSelf = d.name.toLowerCase().includes(term);
        const filteredChildren = filterDepts(cleanedChildren);
        if (matchedSelf) {
          result.push({ ...d, children: cleanedChildren });
        } else if (filteredChildren.length > 0) {
          result.push({ ...d, children: filteredChildren });
        }
      }
      return result;
    };
    return filterDepts(cleanDepts);
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
    <div className="min-h-full">
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Brain className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold ">AI 生成率</h1>
            </div>
          </div>
          <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-150",
                  activeTab === tab.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === "settings" ? (
        <div className="px-5 py-4 space-y-3">
          <SettingsTab config={config} onConfigChange={setConfig} />
        </div>
      ) : (
        <div className="px-5 py-4 space-y-3 animate-in fade-in duration-200">
          <div className="card-modern overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30 flex-wrap">
              <div className="flex items-center gap-1">
                {datePresets.map((preset) => (
                  <Button
                    key={preset.label}
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-xs"
                    onClick={() => applyPreset(preset)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <div className="h-5 w-px bg-border" />
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="date"
                className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <span className="text-muted-foreground text-xs">→</span>
              <input
                type="date"
                className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              <Button size="sm" className="h-8 text-xs" onClick={fetchData} disabled={loading}>
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
                查询
              </Button>
            </div>

            {data && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 p-4">
                <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-primary/10 p-3">
                  <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                    <Brain className="h-3 w-3" />
                    综合 AI 率
                  </p>
                  <p className="text-xl font-bold text-primary tabular-nums">
                    {data.overall.ai_rate.toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-xl border bg-gradient-to-br from-violet-500/5 to-violet-500/10 p-3">
                  <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    非测试 AI 率
                  </p>
                  <p className="text-xl font-bold text-violet-600 tabular-nums">
                    {data.overall.non_test_ai_rate.toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-3">
                  <p className="text-[10px] text-muted-foreground mb-1">总代码行</p>
                  <p className="text-xl font-bold tabular-nums">
                    {formatNumber(data.overall.total_lines)}
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-3">
                  <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                    <Code2 className="h-3 w-3" />
                    AI 代码行
                  </p>
                  <p className="text-xl font-bold text-primary tabular-nums">
                    {formatNumber(data.overall.ai_lines)}
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-3">
                  <p className="text-[10px] text-muted-foreground mb-1">总提交数</p>
                  <p className="text-xl font-bold tabular-nums">
                    {data.overall.total_commits.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-3">
                  <p className="text-[10px] text-muted-foreground mb-1">AI 提交数</p>
                  <p className="text-xl font-bold text-primary tabular-nums">
                    {data.overall.commits_with_ai.toLocaleString()}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between px-4 py-2.5 border-b flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-8 w-56 pl-7 text-xs"
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
                  共 <span className="font-mono font-medium">{data.departments.length}</span> 个一级部门
                </span>
              )}
            </div>

            <div className="grid grid-cols-12 items-center gap-3 px-4 py-2 bg-muted/30 border-y text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
              <div className="col-span-5">部门 / 团队 / 人员</div>
              <div className="col-span-2 text-right">代码行</div>
              <div className="col-span-2 text-right">提交</div>
              <div className="col-span-1 text-right">非测试 AI</div>
              <div className="col-span-1 text-right">综合 AI</div>
              <div className="col-span-1 text-right">操作</div>
            </div>

            <div className="max-h-[calc(100vh-380px)] overflow-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
                  <p className="text-xs text-muted-foreground">正在获取数据...</p>
                </div>
              ) : filteredDepartments.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">暂无数据</p>
                  <p className="text-xs mt-1">请确认网络连接或选择其他时间范围</p>
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
                    filesExpanded={filesExpanded}
                    onToggleDept={toggleExpand}
                    onToggleAuthors={toggleAuthorExpand}
                    onToggleCommits={toggleCommitExpand}
                    onToggleCommitDetail={toggleCommitDetailExpand}
                    onToggleFiles={toggleFilesExpand}
                    onLoadAuthors={loadAuthors}
                    onLoadCommits={loadCommits}
                    onLoadCommitDetail={loadCommitDetail}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}