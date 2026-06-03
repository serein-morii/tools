import { useState, useEffect, useMemo } from "react";
import {
  Brain, ChevronRight, ChevronDown, Users, GitCommit, Code2,
  Calendar, RefreshCw, Search, ChevronLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { aiCoverageApi, type AiCoverageDepartment, type AiCoverageResponse } from "@/lib/api/aiCoverage";
import { toast } from "sonner";

interface DepartmentRowProps {
  dept: AiCoverageDepartment;
  level: number;
  expanded: Set<string>;
  onToggle: (name: string) => void;
}

function DepartmentRow({ dept, level, expanded, onToggle }: DepartmentRowProps) {
  const hasChildren = dept.children && dept.children.length > 0;
  const isExpanded = expanded.has(dept.name);
  const indent = level * 16;

  const rateColor = dept.ai_rate >= 80
    ? "text-emerald-600 bg-emerald-500/10"
    : dept.ai_rate >= 50
      ? "text-amber-600 bg-amber-500/10"
      : "text-rose-600 bg-rose-500/10";

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
            onClick={() => onToggle(dept.name)}
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
        </div>
      </div>
      {hasChildren && isExpanded && dept.children!.map((child) => (
        <DepartmentRow
          key={child.name}
          dept={child}
          level={level + 1}
          expanded={expanded}
          onToggle={onToggle}
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

  const today = new Date();
  const defaultEnd = today.toISOString().slice(0, 10);
  const defaultStart = new Date(today.setDate(today.getDate() - 30)).toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await aiCoverageApi.getCoverage(startDate, endDate);
      setData(result);
    } catch (e) {
      toast.error(`获取数据失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
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

  const collapseAll = () => setExpanded(new Set());

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
          <div className="flex items-center gap-2">
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

      {/* Department List */}
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
                onToggle={toggleExpand}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
