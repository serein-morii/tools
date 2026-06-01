import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, Search, ArrowUpDown, ArrowUp, ArrowDown, Bug, Zap, FlaskConical, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { gitlabApi } from "@/lib/api/gitlab";
import { toast } from "sonner";
import type { UnitListItem } from "@/types";
import { cn } from "@/lib/utils";

type SortField = "projectName" | "newCoverage" | "coverage" | "bugs" | "codeSmells" | "tests";
type SortOrder = "asc" | "desc";

export interface WeekOption {
  label: string;
  monday: Date;
  sunday: Date;
}

export function getWeekOptions(count = 24): WeekOption[] {
  const weeks: WeekOption[] = [];
  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentMonday = new Date(now);
  currentMonday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  currentMonday.setHours(0, 0, 0, 0);

  for (let i = 0; i < count; i++) {
    const monday = new Date(currentMonday);
    monday.setDate(currentMonday.getDate() - i * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const jan1 = new Date(monday.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((monday.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
    const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    weeks.push({
      label: `W${weekNum} (${fmtDate(monday)} ~ ${fmtDate(sunday)})`,
      monday,
      sunday,
    });
  }
  return weeks;
}

export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function RatingBadge({ rating, label }: { rating: string | null; label: string }) {
  if (!rating) return null;
  const num = parseFloat(rating);
  const colors: Record<number, string> = {
    1: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    2: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    3: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    4: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    5: "bg-red-200 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  };
  const ratingLabels: Record<number, string> = { 1: "A", 2: "B", 3: "C", 4: "D", 5: "E" };
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold", colors[num] || colors[5])} title={label}>
      {ratingLabels[num] || rating}
    </span>
  );
}

function CoverageBar({ value }: { value: number }) {
  const color = value >= 80 ? "bg-emerald-500" : value >= 60 ? "bg-yellow-500" : value >= 40 ? "bg-orange-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[48px]">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-[11px] font-medium tabular-nums w-10 text-right">{value.toFixed(1)}%</span>
    </div>
  );
}

export function UnitCoverageList({
  startDate, endDate, onPromptGenerate,
}: {
  startDate: string; endDate: string;
  onPromptGenerate?: (projectKey: string, branch: string, author: string, commitId: string) => void;
}) {
  const [items, setItems] = useState<UnitListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("newCoverage");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const config = await gitlabApi.getConfig();
      if (!config.walkin_url || !config.walkin_csrf_token) {
        toast.error("请先配置 Walkin 登录信息");
        return;
      }
      const auth = {
        csrf_token: config.walkin_csrf_token,
        project: config.walkin_project_header,
        workspace: config.walkin_workspace_name,
        x_auth_token: config.walkin_x_auth_token,
      };

      const data = await gitlabApi.walkinFetchUnitList(
        config.walkin_url, auth, config.walkin_dept_name,
        startDate, endDate, 0, 100,
      );
      setItems(data);
    } catch (e) {
      toast.error("获取覆盖率数据失败: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const filteredAndSorted = useMemo(() => {
    let list = items;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((item) =>
        (item.projectName || item.projectKey || "").toLowerCase().includes(q) ||
        (item.branch || "").toLowerCase().includes(q) ||
        (item.triggerPerson || "").toLowerCase().includes(q)
      );
    }
    const getVal = (item: UnitListItem, field: SortField): number | string => {
      switch (field) {
        case "projectName": return (item.projectName || item.projectKey || "").toLowerCase();
        case "newCoverage": return parseFloat(item.newCoverage || "0") || 0;
        case "coverage": return parseFloat(item.coverage || "0") || 0;
        case "bugs": return item.bugs || 0;
        case "codeSmells": return item.codeSmells || 0;
        case "tests": return item.tests || 0;
      }
    };
    return [...list].sort((a, b) => {
      const va = getVal(a, sortField);
      const vb = getVal(b, sortField);
      if (typeof va === "string" && typeof vb === "string") {
        return sortOrder === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortOrder === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [items, search, sortField, sortOrder]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-muted-foreground/40" />;
    return sortOrder === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">加载中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search & summary */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索项目名、分支、触发人..."
            className="pl-9 h-8 text-xs"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          共 {filteredAndSorted.length} 个应用
        </span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-2 py-1.5 text-left font-medium">
                    <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => handleSort("projectName")}>
                      项目 <SortIcon field="projectName" />
                    </button>
                  </th>
                  <th className="px-2 py-1.5 text-left font-medium w-16">分支</th>
                  <th className="px-2 py-1.5 text-center font-medium">
                    <button className="flex items-center gap-1 hover:text-foreground transition-colors mx-auto" onClick={() => handleSort("newCoverage")}>
                      增量 <SortIcon field="newCoverage" />
                    </button>
                  </th>
                  <th className="px-2 py-1.5 text-center font-medium">
                    <button className="flex items-center gap-1 hover:text-foreground transition-colors mx-auto" onClick={() => handleSort("coverage")}>
                      全量 <SortIcon field="coverage" />
                    </button>
                  </th>
                  <th className="px-1.5 py-1.5 text-center font-medium">
                    <button className="flex items-center gap-1 hover:text-foreground transition-colors mx-auto" onClick={() => handleSort("bugs")}>
                      Bug <SortIcon field="bugs" />
                    </button>
                  </th>
                  <th className="px-1.5 py-1.5 text-center font-medium">
                    <button className="flex items-center gap-1 hover:text-foreground transition-colors mx-auto" onClick={() => handleSort("codeSmells")}>
                      Smell <SortIcon field="codeSmells" />
                    </button>
                  </th>
                  <th className="px-1.5 py-1.5 text-center font-medium">评级</th>
                  <th className="px-1.5 py-1.5 text-center font-medium">
                    <button className="flex items-center gap-1 hover:text-foreground transition-colors mx-auto" onClick={() => handleSort("tests")}>
                      单测 <SortIcon field="tests" />
                    </button>
                  </th>
                  <th className="px-1.5 py-1.5 text-center font-medium">通过率</th>
                  <th className="px-1.5 py-1.5 text-center font-medium">未覆盖</th>
                  <th className="px-1.5 py-1.5 text-center font-medium">重复率</th>
                  <th className="px-1.5 py-1.5 text-center font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-12 text-center text-muted-foreground">
                      暂无覆盖率数据
                    </td>
                  </tr>
                ) : (
                  filteredAndSorted.map((item, idx) => (
                    <tr key={item.id || idx} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <FlaskConical className="h-3 w-3 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <span className="font-medium truncate block max-w-[140px]" title={item.projectName || item.projectKey || ""}>
                              {item.projectName || item.projectKey || "-"}
                            </span>
                            {item.triggerPerson && (
                              <span className="text-[10px] text-muted-foreground">{item.triggerPerson}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-1.5 py-1.5 text-muted-foreground">
                        <span className="truncate block max-w-[60px]" title={item.branch || ""}>{item.branch || "-"}</span>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {item.newCoverage ? (
                          <CoverageBar value={parseFloat(item.newCoverage)} />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {item.coverage ? (
                          <CoverageBar value={parseFloat(item.coverage)} />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-1.5 py-1.5 text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          <Bug className="h-3 w-3 text-muted-foreground" />
                          <span className={cn("font-medium", (item.newBugs || 0) > 0 && "text-destructive")}>
                            {item.bugs ?? 0}
                          </span>
                          {(item.newBugs || 0) > 0 && (
                            <span className="text-destructive text-[10px]">+{item.newBugs}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-1.5 py-1.5 text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          <Zap className="h-3 w-3 text-muted-foreground" />
                          <span className={cn("font-medium", (item.newCodeSmells || 0) > 10 && "text-orange-500")}>
                            {item.codeSmells ?? 0}
                          </span>
                          {(item.newCodeSmells || 0) > 0 && (
                            <span className="text-orange-500 text-[10px]">+{item.newCodeSmells}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-1.5 py-1.5">
                        <div className="flex items-center justify-center gap-0.5">
                          <RatingBadge rating={item.reliabilityRating} label="可靠性" />
                          <RatingBadge rating={item.securityRating} label="安全性" />
                          <RatingBadge rating={item.maintainabilityRating} label="可维护性" />
                        </div>
                      </td>
                      <td className="px-1.5 py-1.5 text-center font-medium">
                        {item.tests != null ? item.tests : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-1.5 py-1.5 text-center">
                        {item.testSuccessDensity != null ? (
                          <span className={cn("font-medium", item.testSuccessDensity < 100 && "text-destructive")}>
                            {item.testSuccessDensity.toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-1.5 py-1.5 text-center text-muted-foreground">
                        {item.uncoveredLines != null && item.linesToCover != null ? (
                          <span title={`${item.uncoveredLines} / ${item.linesToCover}`}>
                            {item.uncoveredLines}
                          </span>
                        ) : "-"}
                      </td>
                      <td className="px-1.5 py-1.5 text-center">
                        {item.duplicatedLinesDensity != null ? (
                          <span className={cn(parseFloat(item.duplicatedLinesDensity) > 10 && "text-orange-500")}>
                            {parseFloat(item.duplicatedLinesDensity).toFixed(1)}%
                          </span>
                        ) : "-"}
                      </td>
                      <td className="px-1.5 py-1.5 text-center">
                        {onPromptGenerate && item.projectKey && (
                          <button
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors"
                            onClick={() => onPromptGenerate(
                              item.projectKey || "",
                              item.branch || "master",
                              item.triggerPerson || "",
                              item.commitId || "",
                            )}
                          >
                            <Sparkles className="h-3 w-3" />
                            Prompt
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
