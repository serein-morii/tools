import { useEffect, useState, useCallback, useRef } from "react";
import {
  Database, Play, Square, Trash2, RefreshCw, ListTree,
  Trash, CheckCircle2, XCircle, Loader2, AlertCircle,
  Plus, Settings2, Edit3, Save,
  X, FlaskConical, KeyRound, Link2, PlayCircle,
  CheckCheck, Pause, RotateCcw, Terminal, ChevronDown, Search,
  Eye, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { dtsApi, type DtsConfig, type DtsConfigDisplay, type DtsTask, type DtsFlush, type DtsBatchProgress } from "@/lib/api/dts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "", label: "全部" },
  { value: "NEW", label: "NEW" },
  { value: "RUN", label: "RUN" },
  { value: "STOP", label: "STOP" },
  { value: "SUCCESS", label: "SUCCESS" },
  { value: "FAILED", label: "FAILED" },
];

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200];

const STATUS_COLOR: Record<string, string> = {
  NEW: "text-blue-600 bg-blue-500/10",
  RUN: "text-emerald-600 bg-emerald-500/10",
  STOP: "text-slate-600 bg-slate-500/10",
  SUCCESS: "text-cyan-600 bg-cyan-500/10",
  FAILED: "text-rose-600 bg-rose-500/10",
};

// 环境选项类型
interface EnvOption {
  code: string;
  name: string;
}

type Tab = "tasks" | "flush" | "configs" | "history";

// 前端日志类型
interface LogEntry {
  timestamp: Date;
  level: "info" | "warn" | "error" | "debug";
  message: string;
}

// 执行结果类型
interface ExecutionResult {
  total: number;
  success_count: number;
  failed_count: number;
  details: DtsBatchProgress[];
}

export function DtsTaskManagerPage() {
  const [tab, setTab] = useState<Tab>("tasks");
  const [activeConfig, setActiveConfig] = useState<DtsConfig | null>(null);
  const [activeConfigName, setActiveConfigName] = useState<string>("");
  const [envOptions, setEnvOptions] = useState<EnvOption[]>([]);
  const [envMap, setEnvMap] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // 免责声明确认状态
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(() => {
    // 从 localStorage 读取是否已同意且选择不再提示
    return localStorage.getItem("dts-disclaimer-accepted") === "true";
  });

  // 不再提示选项
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // 配置列表（用于环境切换）
  const [configList, setConfigList] = useState<DtsConfigDisplay[]>([]);
  const [showConfigDropdown, setShowConfigDropdown] = useState(false);

  // 日志函数
  const addLog = useCallback((level: LogEntry["level"], message: string) => {
    const entry: LogEntry = { timestamp: new Date(), level, message };
    setLogs((prev) => [entry, ...prev].slice(0, 500));
    const fn = console[level] || console.log;
    fn(`[${entry.timestamp.toLocaleTimeString()}] [${level.toUpperCase()}] ${message}`);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // 加载活跃配置
  const loadActive = useCallback(async () => {
    try {
      const r = await dtsApi.getActiveConfig();
      setActiveConfig(r.config);
      const c = await dtsApi.listConfigs();
      setActiveConfigName(c.current_config);
      setConfigList(c.configs);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // 自动获取 Token（当 token 为空或失效时）
  const autoFetchToken = useCallback(async (configName: string, baseUrl: string): Promise<string | null> => {
    // 从 localStorage 读取记住的凭证
    const stored = localStorage.getItem(`dts-login-credentials-${configName}`);
    if (!stored) return null;

    try {
      const credentials = JSON.parse(stored);
      if (!credentials.user || !credentials.pass) return null;

      addLog("info", `Token 失效或为空，尝试自动获取...`);
      const r = await dtsApi.fetchToken(baseUrl, credentials.user, credentials.pass, credentials.type || "ldap");
      if (r.success && r.token) {
        addLog("info", `自动获取 Token 成功`);
        return r.token;
      }
      return null;
    } catch (e) {
      addLog("error", `自动获取 Token 失败: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }, [addLog]);

  // 尝试自动获取 Token 并更新配置
  const tryAutoRefreshToken = useCallback(async () => {
    if (!activeConfigName || !activeConfig?.base_url) return false;

    // 如果 token 为空，尝试自动获取
    if (!activeConfig?.auth_token) {
      addLog("warn", `当前配置 "${activeConfigName}" 的 Token 为空`);
      const newToken = await autoFetchToken(activeConfigName, activeConfig.base_url);
      if (newToken) {
        // 保存新的 token 到配置
        try {
          const updatedConfig = { ...activeConfig, auth_token: newToken };
          await dtsApi.saveConfig(updatedConfig);
          setActiveConfig(updatedConfig);
          toast.success("Token 已自动刷新");
          return true;
        } catch (e) {
          addLog("error", `保存新 Token 失败: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    return false;
  }, [activeConfigName, activeConfig, autoFetchToken, addLog]);

  // 同意免责声明
  const handleAcceptDisclaimer = useCallback(() => {
    if (dontShowAgain) {
      localStorage.setItem("dts-disclaimer-accepted", "true");
    }
    setDisclaimerAccepted(true);
  }, [dontShowAgain]);

  // 切换配置
  const handleSwitchConfig = useCallback(async (configName: string) => {
    if (configName === activeConfigName) return;
    try {
      await dtsApi.activateConfig(configName);
      loadActive();
      toast.success(`已切换到 ${configName}`);
    } catch (e) {
      toast.error(`切换失败: ${e instanceof Error ? e.message : String(e)}`);
    }
    setShowConfigDropdown(false);
  }, [activeConfigName, loadActive]);

  // 加载环境列表
  const loadEnvironments = useCallback(async () => {
    if (!activeConfig?.base_url) return;

    // 如果 token 为空，先尝试自动获取
    if (!activeConfig?.auth_token) {
      const refreshed = await tryAutoRefreshToken();
      if (!refreshed) {
        addLog("error", `无法自动获取 Token，请手动配置`);
        return;
      }
    }

    try {
      const data = await dtsApi.listEnvironments("启用");
      // 上游 API 返回结构: { success: true, data: { data: [...], total: N } }
      // 或者 Python 格式: { success: true, environments: [...] }
      const rawData = data as any;
      const envs = rawData?.data?.data || rawData?.environments || rawData?.data?.records || [];

      const envList: EnvOption[] = [];
      const map: Record<string, string> = {};
      for (const e of envs) {
        if (e.code) {
          envList.push({ code: e.code, name: e.name || e.code });
          map[e.code] = e.name || e.code;
        }
      }
      setEnvOptions(envList);
      setEnvMap(map);
      addLog("info", `已加载 ${envList.length} 个环境`);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      // 如果是认证失败（401），尝试自动刷新 token
      if (errorMsg.includes("401") || errorMsg.includes("认证失败") || errorMsg.includes("Unauthorized")) {
        addLog("warn", `Token 已失效，尝试自动刷新...`);
        const refreshed = await tryAutoRefreshToken();
        if (refreshed) {
          // 刷新成功后重试
          try {
            const data = await dtsApi.listEnvironments("启用");
            const rawData = data as any;
            const envs = rawData?.data?.data || rawData?.environments || rawData?.data?.records || [];
            const envList: EnvOption[] = [];
            const map: Record<string, string> = {};
            for (const e of envs) {
              if (e.code) {
                envList.push({ code: e.code, name: e.name || e.code });
                map[e.code] = e.name || e.code;
              }
            }
            setEnvOptions(envList);
            setEnvMap(map);
            addLog("info", `Token 刷新后成功加载 ${envList.length} 个环境`);
          } catch (retryError) {
            addLog("error", `Token 刷新后仍失败: ${retryError instanceof Error ? retryError.message : String(retryError)}`);
          }
        } else {
          addLog("error", `加载环境列表失败: ${errorMsg}`);
        }
      } else {
        addLog("error", `加载环境列表失败: ${errorMsg}`);
      }
    }
  }, [activeConfig, addLog, tryAutoRefreshToken]);

  useEffect(() => {
    if (disclaimerAccepted) {
      loadActive();
    }
  }, [loadActive, disclaimerAccepted]);

  useEffect(() => {
    if (disclaimerAccepted && activeConfig?.base_url) {
      // 如果 token 为空，先尝试自动刷新
      if (!activeConfig?.auth_token) {
        tryAutoRefreshToken();
      }
      loadEnvironments();
    }
  }, [activeConfig, loadEnvironments, tryAutoRefreshToken, disclaimerAccepted]);

  // 未同意免责声明时显示免责弹窗
  if (!disclaimerAccepted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-background rounded-lg shadow-xl w-[500px] max-w-[calc(100vw-32px)] overflow-hidden">
          {/* 标题栏 */}
          <div className="px-4 py-3 border-b border-border/50 bg-rose-500/10">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600" />
              <span className="text-sm font-semibold text-rose-700">重要提示 - 使用须知</span>
            </div>
          </div>

          {/* 内容区 */}
          <div className="px-4 py-4 space-y-3 text-sm">
            <div className="bg-rose-500/10 rounded-lg p-3 border border-rose-500/20">
              <p className="text-rose-700 font-medium">⚠️ 本工具涉及生产数据操作，请谨慎使用</p>
            </div>

            <div className="space-y-2 text-muted-foreground">
              <p>本 DTS 任务管理工具用于数据同步任务的管理与操作，包括但不限于：</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>任务的启动、停止、删除等生命周期管理</li>
                <li>数据回刷（全量数据重新同步）</li>
                <li>Binlog 点位重置</li>
                <li>任务配置修改</li>
              </ul>
            </div>

            <div className="bg-muted/50 rounded-lg p-3 text-xs">
              <p className="font-medium mb-2">免责声明：</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>所有操作均由用户自主决定并执行</li>
                <li>任何因误操作导致的数据丢失、同步异常、生产事故等后果，均由操作者自行承担</li>
                <li>本工具开发者不承担任何直接或间接责任</li>
                <li>建议在非生产环境充分测试后再在生产环境使用</li>
              </ul>
            </div>

            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-500/10 rounded-lg p-2">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>请在确保了解操作影响的前提下使用本工具</span>
            </div>

            {/* 不再提示选项 */}
            <div className="flex items-center gap-2 pt-2">
              <Checkbox checked={dontShowAgain} onChange={setDontShowAgain} />
              <Label className="text-xs text-muted-foreground cursor-pointer" onClick={() => setDontShowAgain(!dontShowAgain)}>
                不再提示（下次进入时不再显示此弹窗）
              </Label>
            </div>
          </div>

          {/* 底部按钮 */}
          <div className="px-4 py-3 border-t border-border/50 bg-muted/30 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.history.back();
              }}
            >
              取消并离开
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleAcceptDisclaimer}
            >
              我已知晓并同意
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Database className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold">DTS 任务</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                DTS 任务批量启停 · 全量回刷 · 多环境配置
              </p>
            </div>
          </div>
          <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
            <TabButton active={tab === "tasks"} onClick={() => setTab("tasks")} icon={ListTree} label="任务管理" />
            <TabButton active={tab === "flush"} onClick={() => setTab("flush")} icon={FlaskConical} label="全量回刷" />
            <TabButton active={tab === "configs"} onClick={() => setTab("configs")} icon={Settings2} label="配置" />

            {/* 环境切换下拉 */}
            <div className="relative ml-2">
              <button
                type="button"
                onClick={() => setShowConfigDropdown(!showConfigDropdown)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150",
                  activeConfigName
                    ? "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20"
                    : "bg-amber-500/10 text-amber-700 hover:bg-amber-500/20"
                )}
              >
                {activeConfigName ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <span className="truncate max-w-[120px]">{activeConfigName || "未配置"}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              </button>

              {showConfigDropdown && (
                <div className="absolute top-full right-0 mt-1 z-50 w-48 rounded-lg border bg-background shadow-lg">
                  <div className="py-1">
                    <div className="px-2 py-1 text-[10px] text-muted-foreground font-medium">切换环境配置</div>
                    {configList.length === 0 ? (
                      <div className="px-2 py-2 text-xs text-muted-foreground text-center">暂无配置</div>
                    ) : (
                      configList.map((cfg) => (
                        <div
                          key={cfg.config_name}
                          className={cn(
                            "px-2 py-1.5 hover:bg-muted cursor-pointer text-xs flex items-center justify-between",
                            cfg.config_name === activeConfigName && "bg-primary/10 text-primary font-medium"
                          )}
                          onClick={() => handleSwitchConfig(cfg.config_name)}
                        >
                          <span className="truncate">{cfg.config_name}</span>
                          {cfg.config_name === activeConfigName && (
                            <CheckCheck className="h-3 w-3 text-primary shrink-0" />
                          )}
                        </div>
                      ))
                    )}
                    <div className="border-t border-border/40 mt-1 pt-1">
                      <div
                        className="px-2 py-1.5 hover:bg-muted cursor-pointer text-xs text-muted-foreground flex items-center gap-1"
                        onClick={() => { setTab("configs"); setShowConfigDropdown(false); }}
                      >
                        <Settings2 className="h-3 w-3" />
                        <span>管理配置...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="section-spacing animate-in fade-in duration-200">
        {tab === "tasks" && <TasksTab activeConfig={activeConfig} envOptions={envOptions} envMap={envMap} addLog={addLog} setResult={setResult} />}
        {tab === "flush" && <FlushTab activeConfig={activeConfig} setTab={setTab} envOptions={envOptions} envMap={envMap} addLog={addLog} setResult={setResult} />}
        {tab === "configs" && <ConfigsTab onConfigChange={loadActive} envOptions={envOptions} />}

        {/* 执行结果弹窗 */}
        {result && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-background rounded-lg shadow-xl w-[600px] max-w-[calc(100vw-32px)] max-h-[80vh] overflow-hidden flex flex-col">
              {/* 标题栏 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/30 shrink-0">
                <div className="flex items-center gap-2">
                  {result.failed_count === 0 ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : result.success_count === 0 ? (
                    <XCircle className="h-4 w-4 text-rose-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                  )}
                  <span className="text-sm font-semibold">
                    {result.failed_count === 0 ? "执行成功" : result.success_count === 0 ? "执行失败" : "部分成功"}
                  </span>
                </div>
                <Button variant="ghost" size="icon-xs" onClick={() => setResult(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* 统计概览 */}
              <div className="px-4 py-3 border-b border-border/40 shrink-0">
                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">总计</span>
                    <span className="font-bold">{result.total}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-emerald-600 font-semibold">{result.success_count} 成功</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <XCircle className="h-3.5 w-3.5 text-rose-600" />
                    <span className="text-rose-600 font-semibold">{result.failed_count} 失败</span>
                  </div>
                </div>
              </div>

              {/* 详情列表 */}
              <div className="flex-1 overflow-y-auto px-4 py-2">
                {result.details.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">无详细记录</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-background z-10">
                      <tr className="border-b border-border/40">
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground w-16">#</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground w-24">任务 ID</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">任务名称</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground w-20">结果</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">消息</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.details.map((d, i) => (
                        <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                          <td className="py-2 px-2 text-muted-foreground">{d.index || i + 1}</td>
                          <td className="py-2 px-2 font-mono text-[11px]">{d.task_id}</td>
                          <td className="py-2 px-2 truncate max-w-[180px]" title={d.task_name}>{d.task_name}</td>
                          <td className="py-2 px-2">
                            <span className={cn("inline-flex items-center gap-1", d.success ? "text-emerald-600" : "text-rose-600")}>
                              {d.success ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                              <span className="text-[11px]">{d.success ? "成功" : "失败"}</span>
                            </span>
                          </td>
                          <td className="py-2 px-2 text-muted-foreground truncate max-w-[150px]" title={d.message}>{d.message || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* 底部按钮 */}
              <div className="px-4 py-3 border-t border-border/50 bg-muted/30 shrink-0 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setResult(null)}>
                  关闭
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 前端日志浮窗 - 右下角 */}
        <div className="fixed bottom-4 right-4 z-50">
          {/* 收起状态：只显示一个小按钮 */}
          {!logsExpanded && (
            <button
              onClick={() => setLogsExpanded(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted/80 hover:bg-muted text-xs font-medium shadow-lg border border-border/50 transition-all"
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>日志</span>
              <span className="text-[10px] bg-primary/20 px-1.5 py-0.5 rounded">{logs.length}</span>
            </button>
          )}

          {/* 展开状态：浮窗 */}
          {logsExpanded && (
            <div className="w-[400px] max-w-[calc(100vw-32px)] rounded-lg bg-background/95 backdrop-blur shadow-xl border border-border overflow-hidden">
              {/* 标题栏 */}
              <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border/50">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <Terminal className="h-3.5 w-3.5 text-primary" />
                  <span>前端日志</span>
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{logs.length}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={clearLogs}
                  >
                    清空
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setLogsExpanded(false)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* 日志内容 */}
              <div ref={logRef} className="p-2 max-h-[300px] overflow-y-auto space-y-0.5">
                {logs.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-4">暂无日志</div>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className={cn(
                      "text-[11px] font-mono flex items-start gap-2 py-0.5",
                      log.level === "error" && "text-rose-600",
                      log.level === "warn" && "text-amber-600",
                      log.level === "info" && "text-emerald-600"
                    )}>
                      <span className="text-muted-foreground shrink-0">{log.timestamp.toLocaleTimeString()}</span>
                      <span className={cn(
                        "shrink-0 uppercase font-bold",
                        log.level === "error" && "text-rose-500",
                        log.level === "warn" && "text-amber-500",
                        log.level === "info" && "text-emerald-500"
                      )}>
                        [{log.level}]
                      </span>
                      <span className="break-all">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* 底部免责声明 */}
        <div className="mt-4 py-3 px-4 bg-muted/30 rounded-lg border border-border/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">
                ⚠️ 免责声明：本工具涉及生产数据操作，所有操作由用户自主执行，任何因误操作导致的数据丢失或生产事故等后果均由操作者自行承担，开发者不承担任何责任。
              </span>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem("dts-disclaimer-accepted");
                setDisclaimerAccepted(false);
              }}
              className="text-[10px] text-muted-foreground hover:text-foreground underline"
            >
              重置免责声明
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

// =============== 任务管理 Tab ===============
function TasksTab({
  activeConfig,
  envOptions,
  envMap,
  addLog,
  setResult,
}: {
  activeConfig: DtsConfig | null;
  envOptions: EnvOption[];
  envMap: Record<string, string>;
  addLog: (level: LogEntry["level"], message: string) => void;
  setResult: (r: ExecutionResult | null) => void;
}) {
  const [tasks, setTasks] = useState<DtsTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [taskNameFilter, setTaskNameFilter] = useState(activeConfig?.task_name || "");
  const [envCodeFilter, setEnvCodeFilter] = useState(activeConfig?.env_code || "");
  const [pageSize, setPageSize] = useState(activeConfig?.page_size || 20);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [renameFind, setRenameFind] = useState("");
  const [renameReplace, setRenameReplace] = useState("");
  const [showSingleRename, setShowSingleRename] = useState(false);
  const [singleRenameTask, setSingleRenameTask] = useState<DtsTask | null>(null);
  const [singleRenameNewName, setSingleRenameNewName] = useState("");
  const [showResetOffset, setShowResetOffset] = useState(false);
  const [resetOffsetTask, setResetOffsetTask] = useState<DtsTask | null>(null);
  const [resetOffsetFileName, setResetOffsetFileName] = useState("");
  const [resetOffsetPosition, setResetOffsetPosition] = useState("");
  const [showBatchResetOffset, setShowBatchResetOffset] = useState(false);
  const [batchResetFileName, setBatchResetFileName] = useState("");
  const [batchResetPosition, setBatchResetPosition] = useState("");
  const [showEnvDropdown, setShowEnvDropdown] = useState(false);
  const [envSearchKeyword, setEnvSearchKeyword] = useState("");
  const [showTaskDetail, setShowTaskDetail] = useState(false);
  const [detailTask, setDetailTask] = useState<DtsTask | null>(null);
  const [showCreateFlushDialog, setShowCreateFlushDialog] = useState(false);
  const [flushNamePrefix, setFlushNamePrefix] = useState("【回刷】");

  // 确认弹窗状态
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description?: string;
    variant?: "default" | "danger";
    onConfirm: () => void;
  }>({ open: false, title: "", onConfirm: () => {} });

  const showConfirm = useCallback((title: string, description: string | undefined, onConfirm: () => void, variant?: "default" | "danger") => {
    setConfirmDialog({ open: true, title, description, onConfirm, variant });
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmDialog(prev => ({ ...prev, open: false }));
  }, []);

  const load = useCallback(async () => {
    if (!activeConfig?.base_url) {
      setTasks([]);
      return;
    }
    setLoading(true);
    try {
      const r = await dtsApi.listTasks(page, statusFilter, taskNameFilter, envCodeFilter, pageSize);
      // 上游 API 返回结构: { data: { data: [...], total: N } }
      const rawData = r as any;
      const records = rawData?.data?.data || rawData?.data?.records || [];
      const total = rawData?.data?.total || 0;
      setTasks(records as DtsTask[]);
      setTotal(total);
      setTotalPages(Math.ceil(total / pageSize));
      setSelected(new Set());
      addLog("info", `任务加载成功 · 共 ${total} 条`);
    } catch (e) {
      addLog("error", `加载失败: ${e instanceof Error ? e.message : String(e)}`);
      toast.error(`加载失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [activeConfig, page, statusFilter, taskNameFilter, envCodeFilter, pageSize, addLog]);

  useEffect(() => {
    load();
  }, [load]);

  // 搜索按钮触发
  const handleSearch = () => {
    setPage(1);
    load();
  };

  // 执行单条操作
  const executeOpTask = useCallback(async (op: "start" | "stop" | "delete", task: DtsTask) => {
    closeConfirm();
    try {
      const r = op === "start"
        ? await dtsApi.startTask(String(task.id))
        : op === "stop"
        ? await dtsApi.stopTask(String(task.id))
        : await dtsApi.deleteTask(String(task.id));
      if (r.success) {
        addLog("info", `✓ ${task.name}: ${r.message || "成功"}`);
        toast.success(`${task.name}: ${r.message || "成功"}`);
      } else {
        addLog("error", `✗ ${task.name}: ${r.message || "失败"}`);
        toast.error(`${task.name}: ${r.message || "失败"}`);
      }
      load();
    } catch (e) {
      addLog("error", `${op} 失败: ${e instanceof Error ? e.message : String(e)}`);
      toast.error(`${op} 失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [load, addLog, closeConfirm]);

  // 单条操作 - 先弹出确认
  const opTask = useCallback((op: "start" | "stop" | "delete", task: DtsTask) => {
    const opName = op === "start" ? "启动" : op === "stop" ? "停止" : "删除";
    showConfirm(
      `${opName}任务确认`,
      `确定要${opName}任务 "${task.name}"？`,
      () => executeOpTask(op, task),
      op === "delete" ? "danger" : "default"
    );
  }, [showConfirm, executeOpTask]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(tasks.map((t) => String(t.id))));
  const deselectAll = () => setSelected(new Set());

  const selectedTasks = () => tasks.filter((t) => selected.has(String(t.id)));

  // 执行批量操作
  const executeBatchOp = useCallback(async (op: "start" | "stop" | "delete") => {
    closeConfirm();
    setBatchRunning(true);
    setResult(null);
    addLog("info", `▶ 批量${op === "start" ? "启动" : op === "stop" ? "停止" : "删除"} 开始`);
    try {
      const progresses = await dtsApi.batchOp(op, selectedTasks());
      const summary = progresses.find((p) => p.type === "summary");
      if (summary) {
        addLog("info", `◼ 批量${op === "start" ? "启动" : op === "stop" ? "停止" : "删除"} 完成 · 成功 ${summary.success_count} / 失败 ${summary.failed_count}`);
        setResult({
          total: summary.total || selected.size,
          success_count: summary.success_count || 0,
          failed_count: summary.failed_count || 0,
          details: progresses.filter((p) => p.type === "progress"),
        });
        toast.success(`${op === "start" ? "启动" : op === "stop" ? "停止" : "删除"} 完成: 成功 ${summary.success_count} / 失败 ${summary.failed_count}`);
      }
      load();
    } catch (e) {
      addLog("error", `批量 ${op} 失败: ${e instanceof Error ? e.message : String(e)}`);
      toast.error(`批量 ${op} 失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBatchRunning(false);
    }
  }, [selected, selectedTasks, load, addLog, setResult, closeConfirm]);

  // 批量操作 - 先弹出确认
  const batchOp = useCallback((op: "start" | "stop" | "delete") => {
    if (selected.size === 0) {
      toast.warning("请先选择任务");
      return;
    }
    const opName = op === "start" ? "启动" : op === "stop" ? "停止" : "删除";
    showConfirm(
      `批量${opName}确认`,
      `确定要批量${opName} ${selected.size} 个任务？`,
      () => executeBatchOp(op),
      op === "delete" ? "danger" : "default"
    );
  }, [selected, showConfirm, executeBatchOp]);

  // 执行批量改名
  const executeBatchRename = useCallback(async (items: Array<{ task_id: string; new_name: string; old_name: string }>) => {
    closeConfirm();
    setBatchRunning(true);
    setResult(null);
    addLog("info", `▶ 批量改名开始 (${items.length} 个)`);
    try {
      const progresses = await dtsApi.batchRename(items);
      const summary = progresses.find((p) => p.type === "summary");
      if (summary) {
        addLog("info", `◼ 批量改名完成 · 成功 ${summary.success_count} / 失败 ${summary.failed_count}`);
        setResult({
          total: summary.total || items.length,
          success_count: summary.success_count || 0,
          failed_count: summary.failed_count || 0,
          details: progresses.filter((p) => p.type === "progress"),
        });
        toast.success(`改名完成: 成功 ${summary.success_count} / 失败 ${summary.failed_count}`);
      }
      setShowRename(false);
      setRenameFind("");
      setRenameReplace("");
      load();
    } catch (e) {
      addLog("error", `批量改名失败: ${e instanceof Error ? e.message : String(e)}`);
      toast.error(`批量改名失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBatchRunning(false);
    }
  }, [load, addLog, setResult, closeConfirm]);

  // 批量改名 - 先弹出确认
  const batchRename = useCallback(() => {
    if (selected.size === 0) {
      toast.warning("请先选择任务");
      return;
    }
    if (!renameFind) {
      toast.warning("请输入查找字符串");
      return;
    }
    const items: Array<{ task_id: string; new_name: string; old_name: string }> = [];
    for (const t of selectedTasks()) {
      if (t.name.includes(renameFind)) {
        items.push({
          task_id: String(t.id),
          old_name: t.name,
          new_name: t.name.split(renameFind).join(renameReplace),
        });
      }
    }
    if (items.length === 0) {
      toast.warning(`没有任务名包含 "${renameFind}"`);
      return;
    }
    showConfirm(
      "批量改名确认",
      `将改名 ${items.length} 个任务，确定执行？`,
      () => executeBatchRename(items)
    );
  }, [selected, selectedTasks, renameFind, renameReplace, showConfirm, executeBatchRename]);

  // 单条改名
  // 执行单条改名
  const executeSingleRename = async () => {
    if (!singleRenameTask || !singleRenameNewName.trim()) return;
    closeConfirm();
    try {
      const r = await dtsApi.renameTask(String(singleRenameTask.id), singleRenameNewName.trim());
      if (r.success) {
        addLog("info", `✓ 改名成功: ${singleRenameTask.name} → ${singleRenameNewName}`);
        toast.success("改名成功");
        setShowSingleRename(false);
        load();
      } else {
        addLog("error", `✗ 改名失败: ${r.message}`);
        toast.error(r.message || "改名失败");
      }
    } catch (e) {
      addLog("error", `改名失败: ${e instanceof Error ? e.message : String(e)}`);
      toast.error(`改名失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // 单条改名 - 确认弹窗
  const handleSingleRename = () => {
    if (!singleRenameTask || !singleRenameNewName.trim()) return;
    showConfirm(
      "改名确认",
      `确定将 "${singleRenameTask.name}" 改名为 "${singleRenameNewName}"？`,
      executeSingleRename
    );
  };

  // 执行单条重置点位
  const executeResetOffset = async () => {
    if (!resetOffsetTask || !resetOffsetFileName.trim() || !resetOffsetPosition.trim()) return;
    closeConfirm();
    try {
      const r = await dtsApi.resetOffset(
        String(resetOffsetTask.id),
        resetOffsetFileName.trim(),
        resetOffsetPosition.trim()
      );
      if (r.success) {
        addLog("info", `✓ 重置点位成功: ${resetOffsetTask.name}`);
        toast.success("重置点位成功");
        setShowResetOffset(false);
        load();
      } else {
        addLog("error", `✗ 重置点位失败: ${r.message}`);
        toast.error(r.message || "重置点位失败");
      }
    } catch (e) {
      addLog("error", `重置点位失败: ${e instanceof Error ? e.message : String(e)}`);
      toast.error(`重置点位失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // 单条重置点位 - 确认弹窗
  const handleResetOffset = () => {
    if (!resetOffsetTask || !resetOffsetFileName.trim() || !resetOffsetPosition.trim()) {
      toast.warning("请填写 Binlog 文件名和位置");
      return;
    }
    showConfirm(
      "重置点位确认",
      `确定重置任务 "${resetOffsetTask.name}" 的 Binlog 点位？`,
      executeResetOffset
    );
  };

  // 执行批量重置点位
  const executeBatchResetOffset = async () => {
    const tasksToReset = selectedTasks();
    closeConfirm();
    setShowBatchResetOffset(false);
    setBatchRunning(true);
    setResult(null);
    addLog("info", `▶ 批量重置点位开始 (${tasksToReset.length} 个)`);

    const details: DtsBatchProgress[] = [];
    let successCount = 0;
    for (let idx = 0; idx < tasksToReset.length; idx++) {
      const t = tasksToReset[idx];
      try {
        const r = await dtsApi.resetOffset(String(t.id), batchResetFileName, batchResetPosition);
        const success = r.success;
        if (success) successCount++;
        details.push({
          type: "progress",
          index: idx + 1,
          total: tasksToReset.length,
          task_id: String(t.id),
          task_name: t.name,
          success,
          message: r.message || (success ? "重置成功" : "重置失败"),
        });
        addLog(success ? "info" : "error", `[${idx + 1}/${tasksToReset.length}] ${success ? "✓" : "✗"} ${t.name} - ${r.message || ""}`);
      } catch (e) {
        details.push({
          type: "progress",
          index: idx + 1,
          total: tasksToReset.length,
          task_id: String(t.id),
          task_name: t.name,
          success: false,
          message: String(e),
        });
        addLog("error", `[${idx + 1}/${tasksToReset.length}] ✗ ${t.name} - ${String(e)}`);
      }
    }

    details.push({
      type: "summary",
      total: tasksToReset.length,
      success_count: successCount,
      failed_count: tasksToReset.length - successCount,
    });
    addLog("info", `◼ 批量重置点位完成 · 成功 ${successCount} / 失败 ${tasksToReset.length - successCount}`);
    setResult({
      total: tasksToReset.length,
      success_count: successCount,
      failed_count: tasksToReset.length - successCount,
      details,
    });
    setBatchRunning(false);
    deselectAll();
    load();
  };

  // 批量重置点位 - 确认弹窗
  const handleBatchResetOffset = () => {
    if (!batchResetFileName.trim() || !batchResetPosition.trim()) {
      toast.warning("请填写 Binlog 文件名和位置");
      return;
    }
    const tasksToReset = selectedTasks();
    if (tasksToReset.length === 0) {
      toast.warning("请先选择任务");
      return;
    }
    showConfirm(
      "批量重置点位确认",
      `确定重置 ${tasksToReset.length} 个任务的 Binlog 点位？`,
      executeBatchResetOffset
    );
  };

  // 批量创建回刷 - 打开对话框
  const handleBatchCreateFlush = () => {
    const tasksToFlush = selectedTasks();
    if (tasksToFlush.length === 0) {
      toast.warning("请先选择任务");
      return;
    }
    // 检查缺少源表信息的任务
    const missing = tasksToFlush.filter((t) => !(t.sourceDatabaseAndTableList || []).length);
    if (missing.length > 0) {
      toast.warning(`有 ${missing.length} 个任务缺少源表信息，创建时将被跳过`);
    }
    setFlushNamePrefix("【回刷】");
    setShowCreateFlushDialog(true);
  };

  // 执行批量创建回刷
  const executeBatchCreateFlush = async (namePrefix: string) => {
    const tasksToFlush = selectedTasks().filter((t) => (t.sourceDatabaseAndTableList || []).length > 0);
    if (tasksToFlush.length === 0) {
      toast.warning("没有可创建回刷的任务");
      return;
    }

    setShowCreateFlushDialog(false);
    setBatchRunning(true);
    setResult(null);
    addLog("info", `▶ 批量创建回刷开始 (${tasksToFlush.length} 个)`);
    try {
      // 构造带名称的任务列表
      const tasksWithNames = tasksToFlush.map((t) => ({
        ...t,
        flushName: namePrefix.trim() ? `${namePrefix}${t.name}` : `【回刷】${t.name}`,
      }));
      const progresses = await dtsApi.batchCreateFlush(tasksWithNames as any);
      const summary = progresses.find((p) => p.type === "summary");
      if (summary) {
        addLog("info", `◼ 批量创建回刷完成 · 成功 ${summary.success_count} / 失败 ${summary.failed_count}`);
        setResult({
          total: summary.total || tasksToFlush.length,
          success_count: summary.success_count || 0,
          failed_count: summary.failed_count || 0,
          details: progresses.filter((p) => p.type === "progress"),
        });
        toast.success(`创建完成: 成功 ${summary.success_count} / 失败 ${summary.failed_count}`);
      }
      deselectAll();
    } catch (e) {
      addLog("error", `批量创建回刷失败: ${e instanceof Error ? e.message : String(e)}`);
      toast.error(`批量创建回刷失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBatchRunning(false);
    }
  };

  // 环境下拉过滤
  const filteredEnvOptions = envOptions.filter((e) =>
    e.name.toLowerCase().includes(envSearchKeyword.toLowerCase()) ||
    e.code.toLowerCase().includes(envSearchKeyword.toLowerCase())
  );

  if (!activeConfig?.base_url) {
    return (
      <div className="card-modern p-8 text-center">
        <Settings2 className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-sm font-medium">请先配置 DTS 连接</p>
        <p className="text-xs text-muted-foreground mt-1">切到「配置」标签页添加 BASE_URL 和 AUTH_TOKEN</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 工具栏 */}
      <div className="card-modern p-3 space-y-3">
        {/* 第一行：批量操作按钮 */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            刷新
          </Button>
          <div className="h-5 w-px bg-border mx-1" />
          <Button size="sm" onClick={() => batchOp("start")} disabled={batchRunning || selected.size === 0}>
            <PlayCircle className="h-3.5 w-3.5 mr-1 text-emerald-600" />
            批量启动
          </Button>
          <Button size="sm" onClick={() => batchOp("stop")} disabled={batchRunning || selected.size === 0}>
            <Pause className="h-3.5 w-3.5 mr-1 text-amber-600" />
            批量停止
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowRename(true)} disabled={batchRunning || selected.size === 0}>
            <Edit3 className="h-3.5 w-3.5 mr-1" />
            批量改名
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowBatchResetOffset(true)} disabled={batchRunning || selected.size === 0}>
            <RotateCcw className="h-3.5 w-3.5 mr-1 text-amber-600" />
            批量重置点位
          </Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleBatchCreateFlush} disabled={batchRunning || selected.size === 0}>
            <FlaskConical className="h-3.5 w-3.5 mr-1" />
            批量创建回刷
          </Button>
          <Button size="sm" onClick={() => batchOp("delete")} disabled={batchRunning || selected.size === 0} variant="destructive">
            <Trash className="h-3.5 w-3.5 mr-1" />
            批量删除
          </Button>
          <Button size="sm" variant="ghost" onClick={deselectAll} disabled={selected.size === 0}>
            清空选择
          </Button>
          <div className="ml-auto text-xs text-muted-foreground">
            {selected.size > 0 ? `已选 ${selected.size}` : `共 ${total}`}
          </div>
        </div>

        {/* 第二行：过滤条件 */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Label className="shrink-0">任务名称</Label>
          <Input
            value={taskNameFilter}
            onChange={(e) => setTaskNameFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="过滤任务名称"
            className="w-40 h-7"
          />
          <Label className="shrink-0">环境</Label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowEnvDropdown(!showEnvDropdown)}
              className="flex items-center gap-1 h-8 px-2 rounded-md border bg-background text-xs hover:bg-muted"
            >
              <span className="truncate max-w-[120px]">
                {envCodeFilter ? (envMap[envCodeFilter] || envCodeFilter) : "全部环境"}
              </span>
              <ChevronDown className="h-3 w-3 shrink-0" />
            </button>
            {showEnvDropdown && (
              <div className="absolute top-8 left-0 z-50 w-48 rounded-md border bg-background shadow-lg">
                <div className="p-1.5 border-b">
                  <div className="flex items-center gap-1">
                    <Search className="h-3 w-3 text-muted-foreground" />
                    <Input
                      value={envSearchKeyword}
                      onChange={(e) => setEnvSearchKeyword(e.target.value)}
                      placeholder="搜索环境..."
                      className="h-6 text-xs border-0 shadow-none focus-visible:ring-0"
                    />
                  </div>
                </div>
                <div className="max-h-40 overflow-y-auto">
                  <div
                    className="px-2 py-1.5 hover:bg-muted cursor-pointer text-xs"
                    onClick={() => { setEnvCodeFilter(""); setShowEnvDropdown(false); }}
                  >
                    全部环境
                  </div>
                  {filteredEnvOptions.map((e) => (
                    <div
                      key={e.code}
                      className={cn(
                        "px-2 py-1.5 hover:bg-muted cursor-pointer text-xs flex items-center justify-between",
                        envCodeFilter === e.code && "bg-primary/10"
                      )}
                      onClick={() => { setEnvCodeFilter(e.code); setShowEnvDropdown(false); }}
                    >
                      <span>{e.name}</span>
                      <span className="text-muted-foreground font-mono text-[10px]">{e.code}</span>
                    </div>
                  ))}
                  {filteredEnvOptions.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">无匹配结果</div>
                  )}
                </div>
              </div>
            )}
          </div>
          <Label className="shrink-0">状态</Label>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-24 h-7">
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Label className="shrink-0">每页</Label>
          <Select
            value={pageSize.toString()}
            onChange={(e) => setPageSize(parseInt(e.target.value) || 20)}
            className="w-16 h-7"
          >
            {PAGE_SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Button size="sm" onClick={handleSearch} disabled={loading} className="h-8 px-3">
            <Search className="h-3.5 w-3.5 mr-1" />
            搜索
          </Button>
        </div>
      </div>

      {/* 批量改名弹窗 */}
      {showRename && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl w-[500px] max-w-[calc(100vw-32px)] max-h-[80vh] overflow-hidden flex flex-col">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/30 shrink-0">
              <div className="flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">批量改名</span>
              </div>
              <Button variant="ghost" size="icon-xs" onClick={() => setShowRename(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              <div className="flex items-center gap-3 text-xs">
                <div className="flex-1">
                  <Label className="mb-1 block">查找</Label>
                  <Input value={renameFind} onChange={(e) => setRenameFind(e.target.value)} placeholder="如 UAT" autoFocus />
                </div>
                <div className="flex-1">
                  <Label className="mb-1 block">替换为</Label>
                  <Input value={renameReplace} onChange={(e) => setRenameReplace(e.target.value)} placeholder="如 PROD" />
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-2 max-h-40 overflow-y-auto">
                <div className="text-[10px] text-muted-foreground mb-1">预览：</div>
                {renameFind ? (
                  selectedTasks().map((t) => {
                    const willChange = t.name.includes(renameFind);
                    return (
                      <div key={t.id} className={cn("text-xs flex items-center gap-2 py-0.5", !willChange && "text-muted-foreground")}>
                        {willChange ? (
                          <>
                            <span className="truncate flex-1">{t.name}</span>
                            <span className="text-muted-foreground shrink-0">→</span>
                            <span className="text-emerald-600 font-medium truncate max-w-[180px]">{t.name.split(renameFind).join(renameReplace)}</span>
                          </>
                        ) : (
                          <>
                            <span className="truncate">{t.name}</span>
                            <span className="text-muted-foreground">（不变）</span>
                          </>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-xs text-muted-foreground text-center py-2">填写查找内容后预览</div>
                )}
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="px-4 py-3 border-t border-border/50 bg-muted/30 shrink-0 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowRename(false)}>取消</Button>
              <Button size="sm" onClick={batchRename} disabled={batchRunning || !renameFind}>
                {batchRunning ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                执行改名
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 单条改名弹窗 */}
      {showSingleRename && singleRenameTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl w-[450px] max-w-[calc(100vw-32px)] overflow-hidden flex flex-col">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/30 shrink-0">
              <div className="flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">改名</span>
              </div>
              <Button variant="ghost" size="icon-xs" onClick={() => setShowSingleRename(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* 内容区 */}
            <div className="px-4 py-3 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">原名称</Label>
                <Input value={singleRenameTask.name} disabled className="bg-muted h-8" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">新名称</Label>
                <Input
                  value={singleRenameNewName}
                  onChange={(e) => setSingleRenameNewName(e.target.value)}
                  placeholder="输入新名称"
                  autoFocus
                  className="h-8"
                />
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="px-4 py-3 border-t border-border/50 bg-muted/30 shrink-0 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowSingleRename(false)}>取消</Button>
              <Button size="sm" onClick={handleSingleRename} disabled={!singleRenameNewName.trim()}>
                确定
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 单条重置点位弹窗 */}
      {showResetOffset && resetOffsetTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl w-[450px] max-w-[calc(100vw-32px)] overflow-hidden flex flex-col">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/30 shrink-0">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-semibold">重置点位</span>
              </div>
              <Button variant="ghost" size="icon-xs" onClick={() => setShowResetOffset(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* 内容区 */}
            <div className="px-4 py-3 space-y-3">
              <div className="text-xs bg-muted/50 rounded-lg p-2 flex items-center gap-2">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                任务：<strong>{resetOffsetTask.name}</strong>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Binlog 文件名</Label>
                  <Input
                    value={resetOffsetFileName}
                    onChange={(e) => setResetOffsetFileName(e.target.value)}
                    placeholder="例如：off.000002"
                    autoFocus
                    className="h-8"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Binlog 位置</Label>
                  <Input
                    value={resetOffsetPosition}
                    onChange={(e) => setResetOffsetPosition(e.target.value)}
                    placeholder="例如：4"
                    className="h-8"
                  />
                </div>
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="px-4 py-3 border-t border-border/50 bg-muted/30 shrink-0 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowResetOffset(false)}>取消</Button>
              <Button size="sm" onClick={handleResetOffset} disabled={!resetOffsetFileName.trim() || !resetOffsetPosition.trim()}>
                确定重置
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 批量重置点位弹窗 */}
      {showBatchResetOffset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl w-[500px] max-w-[calc(100vw-32px)] max-h-[80vh] overflow-hidden flex flex-col">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/30 shrink-0">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-semibold">批量重置点位</span>
              </div>
              <Button variant="ghost" size="icon-xs" onClick={() => setShowBatchResetOffset(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              <div className="text-xs bg-muted/50 rounded-lg p-2 flex items-center gap-2">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                已选择 <strong>{selected.size}</strong> 个任务
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Binlog 文件名</Label>
                  <Input
                    value={batchResetFileName}
                    onChange={(e) => setBatchResetFileName(e.target.value)}
                    placeholder="例如：off.000002"
                    autoFocus
                    className="h-8"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Binlog 位置</Label>
                  <Input
                    value={batchResetPosition}
                    onChange={(e) => setBatchResetPosition(e.target.value)}
                    placeholder="例如：4"
                    className="h-8"
                  />
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-2 max-h-32 overflow-y-auto">
                <div className="text-[10px] text-muted-foreground mb-1">任务列表：</div>
                {selectedTasks().map((t) => (
                  <div key={t.id} className="text-xs font-mono py-0.5 truncate">
                    {t.id} · {t.name}
                  </div>
                ))}
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="px-4 py-3 border-t border-border/50 bg-muted/30 shrink-0 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowBatchResetOffset(false)}>取消</Button>
              <Button size="sm" onClick={handleBatchResetOffset} disabled={!batchResetFileName.trim() || !batchResetPosition.trim()}>
                确认批量重置
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 批量创建回刷弹窗 */}
      {showCreateFlushDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl w-[550px] max-w-[calc(100vw-32px)] max-h-[80vh] overflow-hidden flex flex-col">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/30 shrink-0">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">批量创建回刷</span>
              </div>
              <Button variant="ghost" size="icon-xs" onClick={() => setShowCreateFlushDialog(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {/* 提示信息 */}
              <div className="text-xs bg-muted/50 rounded-lg p-2.5 flex items-center gap-2">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                已选择 <strong>{selected.size}</strong> 个任务，将创建回刷记录
              </div>

              {/* 名称前缀输入 */}
              <div className="space-y-1.5">
                <Label className="text-xs">回刷名称前缀</Label>
                <Input
                  value={flushNamePrefix}
                  onChange={(e) => setFlushNamePrefix(e.target.value)}
                  placeholder="默认：【回刷】"
                  autoFocus
                  className="h-8"
                />
                <p className="text-[10px] text-muted-foreground">
                  留空则默认添加【回刷】前缀，最终名称 = 前缀 + 任务名称
                </p>
              </div>

              {/* 预览列表 */}
              <div className="space-y-1.5">
                <Label className="text-xs">预览回刷名称</Label>
                <div className="rounded-lg border bg-muted/30 p-2 max-h-48 overflow-y-auto">
                  {selectedTasks().slice(0, 8).map((t) => (
                    <div key={t.id} className="text-xs py-0.5 flex items-center gap-2">
                      <span className="text-muted-foreground truncate flex-1" title={t.name}>{t.name}</span>
                      <span className="text-muted-foreground shrink-0">→</span>
                      <span className="text-emerald-600 font-medium truncate max-w-[200px]" title={flushNamePrefix.trim() ? `${flushNamePrefix}${t.name}` : `【回刷】${t.name}`}>
                        {flushNamePrefix.trim() ? `${flushNamePrefix}${t.name}` : `【回刷】${t.name}`}
                      </span>
                    </div>
                  ))}
                  {selected.size > 8 && (
                    <div className="text-xs text-muted-foreground py-0.5 text-center">
                      ...还有 {selected.size - 8} 个任务
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="px-4 py-3 border-t border-border/50 bg-muted/30 shrink-0 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowCreateFlushDialog(false)}>取消</Button>
              <Button size="sm" onClick={() => executeBatchCreateFlush(flushNamePrefix)} disabled={batchRunning}>
                {batchRunning ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5 mr-1" />}
                确认创建
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 任务列表 - 自适应 flex 行布局 */}
      <div className="card-modern overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mb-2" />
            加载中...
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-muted-foreground">
            <ListTree className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">暂无任务</p>
          </div>
        ) : (
          <>
            {/* 表头 */}
            <div className="grid grid-cols-[40px_100px_minmax(180px,2fr)_minmax(140px,1fr)_minmax(140px,1fr)_80px_minmax(120px,1fr)_140px_120px] items-center gap-3 px-4 py-2 bg-muted/30 border-b text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
              <div>
                <Checkbox
                  checked={selected.size > 0 && selected.size === tasks.length}
                  onChange={(v) => v ? selectAll() : deselectAll()}
                />
              </div>
              <div>ID</div>
              <div>任务名称</div>
              <div>源数据源</div>
              <div>目标数据源</div>
              <div>状态</div>
              <div>环境</div>
              <div>创建时间</div>
              <div className="text-right">操作</div>
            </div>

            {/* 列表 */}
            <div className="max-h-[calc(100vh-380px)] overflow-auto">
              {tasks.map((task) => {
                const id = String(task.id);
                const isSelected = selected.has(id);
                const t = task as any;
                const sourceDatasourceName = t.sourceDatasource && typeof t.sourceDatasource === 'object'
                  ? (t.sourceDatasource.name || t.sourceDatasource.host || "-")
                  : (t.sourceDatasource || "-");
                const targetDatasourceName = t.targetDatasource && typeof t.targetDatasource === 'object'
                  ? (t.targetDatasource.name || t.targetDatasource.host || "-")
                  : (t.targetDatasource || "-");
                const envCode = t.env || t.envCode || "";
                const envName = envCode ? (envMap[envCode] || "") : "";
                const createTime = t.createTime ? new Date(t.createTime).toLocaleString() : "-";

                return (
                  <div
                    key={id}
                    className={cn(
                      "grid grid-cols-[40px_100px_minmax(180px,2fr)_minmax(140px,1fr)_minmax(140px,1fr)_80px_minmax(120px,1fr)_140px_120px] items-center gap-3 px-4 py-2.5 border-b border-border/30 hover:bg-muted/30 transition-colors group",
                      isSelected && "bg-primary/5"
                    )}
                  >
                    <div>
                      <Checkbox checked={isSelected} onChange={() => toggleSelect(id)} />
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground truncate" title={id}>{id}</div>
                    <div className="text-xs font-medium truncate" title={task.name}>{task.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate" title={sourceDatasourceName}>{sourceDatasourceName}</div>
                    <div className="text-[11px] text-muted-foreground truncate" title={targetDatasourceName}>{targetDatasourceName}</div>
                    <div>
                      <span className={cn("inline-block rounded px-1.5 py-0.5 text-[10px] font-mono font-bold", STATUS_COLOR[task.status] || "text-muted-foreground bg-muted")}>
                        {task.status}
                      </span>
                    </div>
                    <div className="text-[11px] min-w-0">
                      {envCode ? (
                        <>
                          <div className="truncate">{envName || envCode}</div>
                          {envName && <div className="text-muted-foreground font-mono text-[10px] truncate">{envCode}</div>}
                        </>
                      ) : <span className="text-muted-foreground">-</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate" title={createTime}>{createTime}</div>
                    <div className="flex items-center justify-end gap-0.5">
                      <Button variant="ghost" size="icon-xs" onClick={() => { setDetailTask(task); setShowTaskDetail(true); }} title="查看详情">
                        <Eye className="h-3 w-3" />
                      </Button>
                      {task.status !== "RUN" && (
                        <Button variant="ghost" size="icon-xs" onClick={() => opTask("start", task)} title="启动">
                          <Play className="h-3 w-3 text-emerald-600" />
                        </Button>
                      )}
                      {task.status === "RUN" && (
                        <Button variant="ghost" size="icon-xs" onClick={() => opTask("stop", task)} title="停止">
                          <Square className="h-3 w-3 text-amber-600" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => {
                          setSingleRenameTask(task);
                          setSingleRenameNewName(task.name);
                          setShowSingleRename(true);
                        }}
                        title="改名"
                      >
                        <Edit3 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => {
                          setResetOffsetTask(task);
                          setResetOffsetFileName("");
                          setResetOffsetPosition("");
                          setShowResetOffset(true);
                        }}
                        title="重置点位"
                      >
                        <RotateCcw className="h-3 w-3 text-amber-600" />
                      </Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => opTask("delete", task)} title="删除">
                        <Trash2 className="h-3 w-3 text-rose-500" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 py-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            ‹
          </Button>
          {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
            let p: number;
            if (totalPages <= 7) {
              p = i + 1;
            } else if (page <= 4) {
              p = i + 1;
            } else if (page >= totalPages - 3) {
              p = totalPages - 6 + i;
            } else {
              p = page - 3 + i;
            }
            return (
              <Button
                key={p}
                variant={p === page ? "default" : "ghost"}
                size="sm"
                onClick={() => setPage(p)}
              >
                {p}
              </Button>
            );
          })}
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            ›
          </Button>
          <span className="text-xs text-muted-foreground ml-2">
            共 {total} 条 / {totalPages} 页
          </span>
        </div>
      )}

      {/* 任务详情弹窗 */}
      {showTaskDetail && detailTask && (
        <TaskDetailModal
          task={detailTask}
          envMap={envMap}
          onClose={() => { setShowTaskDetail(false); setDetailTask(null); }}
        />
      )}

      {/* 确认弹窗 */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  );
}

// 任务详情弹窗组件
function TaskDetailModal({ task, envMap, onClose }: { task: DtsTask; envMap: Record<string, string>; onClose: () => void }) {
  // 字段名中英文映射 - 中文翻译(英文字段名)
  const fieldLabels: Record<string, string> = {
    // 基本信息
    id: "ID(id)",
    name: "任务名称(name)",
    status: "状态(status)",
    createTime: "创建时间(createTime)",
    updateTime: "更新时间(updateTime)",
    env: "环境代码(env)",
    envCode: "环境代码(envCode)",
    configId: "配置ID(configId)",
    configName: "配置名称(configName)",
    // 任务类型
    taskType: "任务类型(taskType)",
    sourceType: "源类型(sourceType)",
    targetType: "目标类型(targetType)",
    sourceParallelism: "源并行度(sourceParallelism)",
    targetParallelism: "目标并行度(targetParallelism)",
    // 表信息
    sourceDatabaseAndTableList: "源表列表(sourceDatabaseAndTableList)",
    targetDatabaseAndTableList: "目标表列表(targetDatabaseAndTableList)",
    sourceDatabaseAndTable: "源数据库和表(sourceDatabaseAndTable)",
    targetDatabaseAndTable: "目标数据库和表(targetDatabaseAndTable)",
    // 数据源信息
    sourceDatasource: "源数据源(sourceDatasource)",
    targetDatasource: "目标数据源(targetDatasource)",
    sourceDatasourceId: "源数据源ID(sourceDatasourceId)",
    targetDatasourceId: "目标数据源ID(targetDatasourceId)",
    // Kafka 相关
    acks: "ACKS配置(acks)",
    compressionType: "压缩类型(compressionType)",
    retries: "重试次数(retries)",
    batchSize: "批次大小(batchSize)",
    lingerMs: "发送延迟(lingerMs)",
    bufferMemory: "缓冲内存(bufferMemory)",
    maxRequestSize: "最大请求大小(maxRequestSize)",
    requestTimeoutMs: "请求超时(requestTimeoutMs)",
    maxBlockMs: "最大阻塞时间(maxBlockMs)",
    enableIdempotence: "幂等性(enableIdempotence)",
    maxInFlightRequestsPerConnection: "最大未确认请求数",
    // 数据库相关
    sourceDb: "源数据库(sourceDb)",
    targetDb: "目标数据库(targetDb)",
    sourceTable: "源表(sourceTable)",
    targetTable: "目标表(targetTable)",
    // 连接相关
    sourceConnectionId: "源连接ID(sourceConnectionId)",
    targetConnectionId: "目标连接ID(targetConnectionId)",
    pipelineId: "管道ID(pipelineId)",
    pipelineName: "管道名称(pipelineName)",
    // 同步相关
    syncType: "同步类型(syncType)",
    syncMode: "同步模式(syncMode)",
    filterCondition: "过滤条件(filterCondition)",
    flushInterval: "刷新间隔(flushInterval)",
    // 用户相关
    createUser: "创建人(createUser)",
    updateUser: "更新人(updateUser)",
    envManagerUserList: "环境管理员列表(envManagerUserList)",
    projectManagerUserList: "项目管理员列表(projectManagerUserList)",
    // 分组相关
    group: "分组(group)",
    groupId: "分组ID(groupId)",
    groupName: "分组名称(groupName)",
    mistakeGroupList: "异常分组列表(mistakeGroupList)",
    mistakeProcessRuleList: "异常处理规则列表(mistakeProcessRuleList)",
    // 其他
    nodeInfo: "节点信息(nodeInfo)",
    extendConfig: "扩展配置(extendConfig)",
    remark: "备注(remark)",
    description: "描述(description)",
    operator: "操作人(operator)",
    modifier: "修改人(modifier)",
    bizId: "业务ID(bizId)",
    bizName: "业务名称(bizName)",
    tags: "标签(tags)",
    owner: "负责人(owner)",
    department: "部门(department)",
    projectId: "项目ID(projectId)",
    projectName: "项目名称(projectName)",
    // 状态相关
    runStatus: "运行状态(runStatus)",
    lastStartTime: "最后启动时间(lastStartTime)",
    lastStopTime: "最后停止时间(lastStopTime)",
    errorMessage: "错误信息(errorMessage)",
    // 性能相关
    retryTimes: "重试次数(retryTimes)",
    health: "健康状态(health)",
    open: "是否开启(open)",
    isShare: "是否共享(isShare)",
    pkColumn: "主键列(pkColumn)",
    parallelism: "并行度(parallelism)",
    // 其他常见
    taskId: "任务ID(taskId)",
    taskName: "任务名称(taskName)",
    selectSql: "查询SQL(selectSql)",
    gtid: "GTID(gtid)",
    binlogFileName: "Binlog文件名(binlogFileName)",
    binlogFilePosition: "Binlog位置(binlogFilePosition)",
    sourceTopic: "源Topic(sourceTopic)",
    targetTopic: "目标Topic(targetTopic)",
    schemaRegistryUrl: "Schema注册中心URL(schemaRegistryUrl)",
    keyConverter: "Key转换器(keyConverter)",
    valueConverter: "Value转换器(valueConverter)",
    keySerializer: "Key序列化器(keySerializer)",
    valueSerializer: "Value序列化器(valueSerializer)",
    keyDeserializer: "Key反序列化器(keyDeserializer)",
    valueDeserializer: "Value反序列化器(valueDeserializer)",
    // 扩展字段
    extraConfig: "额外配置(extraConfig)",
    customParams: "自定义参数(customParams)",
    memory: "内存配置(memory)",
    cpu: "CPU配置(cpu)",
    // 运行时信息
    taskRuntime: "任务运行时信息(taskRuntime)",
    updateTimeColumn: "更新时间列(updateTimeColumn)",
  };

  // 格式化字段标签：优先使用映射表，否则智能翻译
  const formatLabel = (key: string): string => {
    // 如果映射表中有，直接使用
    if (fieldLabels[key]) {
      return fieldLabels[key];
    }
    // 否则用智能翻译函数生成中文翻译，再加上(英文字段名)
    const chinese = translateFieldName(key);
    return `${chinese}(${key})`;
  };

  const entries: Array<{ label: string; value: React.ReactNode }> = [];

  // 基本信息
  entries.push({ label: "ID(id)", value: String(task.id) });
  entries.push({ label: "任务名称(name)", value: task.name || "-" });
  entries.push({ label: "状态(status)", value: (
    <span className={cn("inline-block rounded px-2 py-0.5 text-[10px] font-mono font-bold", STATUS_COLOR[task.status] || "text-muted-foreground bg-muted")}>
      {task.status}
    </span>
  ) });

  // 从 task 对象提取所有字段
  const t = task as any;
  if (t.createTime) entries.push({ label: formatLabel("createTime"), value: new Date(t.createTime).toLocaleString() });
  if (t.updateTime) entries.push({ label: formatLabel("updateTime"), value: new Date(t.updateTime).toLocaleString() });
  if (t.env || t.envCode) {
    const code = t.env || t.envCode;
    const key = t.env ? "env" : "envCode";
    entries.push({ label: formatLabel(key), value: envMap[code] ? `${envMap[code]} (${code})` : code });
  }
  if (t.configId) entries.push({ label: formatLabel("configId"), value: String(t.configId) });
  if (t.configName) entries.push({ label: formatLabel("configName"), value: t.configName });
  if (t.taskType) entries.push({ label: formatLabel("taskType"), value: t.taskType });
  if (t.sourceType) entries.push({ label: formatLabel("sourceType"), value: t.sourceType });
  if (t.targetType) entries.push({ label: formatLabel("targetType"), value: t.targetType });
  if (t.sourceParallelism) entries.push({ label: formatLabel("sourceParallelism"), value: String(t.sourceParallelism) });
  if (t.targetParallelism) entries.push({ label: formatLabel("targetParallelism"), value: String(t.targetParallelism) });

  // 源表列表
  const rawList = task.sourceDatabaseAndTableList || [];
  if (rawList.length > 0) {
    const sourceTables = typeof rawList[0] === 'string'
      ? rawList.join(', ')
      : rawList.map((t: any) => t.dbName ? `${t.dbName}.${(t.tableNames || []).join(",")}` : "").filter(Boolean).join(', ');
    entries.push({ label: formatLabel("sourceDatabaseAndTableList"), value: sourceTables });
  }

  // 目标表
  if (t.targetDatabaseAndTableList?.length > 0) {
    const targetTables = typeof t.targetDatabaseAndTableList[0] === 'string'
      ? t.targetDatabaseAndTableList.join(', ')
      : t.targetDatabaseAndTableList.map((t: any) => t.dbName ? `${t.dbName}.${(t.tableNames || []).join(",")}` : "").filter(Boolean).join(', ');
    entries.push({ label: formatLabel("targetDatabaseAndTableList"), value: targetTables });
  }

  // 其他常见字段
  if (t.nodeInfo) entries.push({ label: formatLabel("nodeInfo"), value: JSON.stringify(t.nodeInfo, null, 2) });
  if (t.extendConfig) entries.push({ label: formatLabel("extendConfig"), value: JSON.stringify(t.extendConfig, null, 2) });
  if (t.remark) entries.push({ label: formatLabel("remark"), value: t.remark });

  // 数据源字段特殊处理（对象类型，提取关键信息）
  if (t.sourceDatasource && typeof t.sourceDatasource === 'object') {
    const ds = t.sourceDatasource;
    entries.push({ label: formatLabel("sourceDatasource"), value: JSON.stringify(ds, null, 2) });
  }
  if (t.targetDatasource && typeof t.targetDatasource === 'object') {
    entries.push({ label: formatLabel("targetDatasource"), value: JSON.stringify(t.targetDatasource, null, 2) });
  }
  if (t.createUser && typeof t.createUser === 'object') {
    const u = t.createUser;
    entries.push({ label: formatLabel("createUser"), value: `${u.empName || '-'} (${u.empCode || '-'} · ${u.deptName || '-'})` });
  }
  if (t.updateUser && typeof t.updateUser === 'object') {
    const u = t.updateUser;
    entries.push({ label: formatLabel("updateUser"), value: `${u.empName || '-'} (${u.empCode || '-'} · ${u.deptName || '-'})` });
  }
  if (t.envManagerUserList && Array.isArray(t.envManagerUserList)) {
    const users = t.envManagerUserList.map((u: any) => `${u.empName}(${u.empCode})`).join(', ');
    entries.push({ label: formatLabel("envManagerUserList"), value: users || '-' });
  }
  if (t.projectManagerUserList && Array.isArray(t.projectManagerUserList)) {
    const users = t.projectManagerUserList.map((u: any) => `${u.empName}(${u.empCode})`).join(', ');
    entries.push({ label: formatLabel("projectManagerUserList"), value: users || '-' });
  }
  if (t.taskRuntime && typeof t.taskRuntime === 'object') {
    entries.push({ label: formatLabel("taskRuntime"), value: JSON.stringify(t.taskRuntime, null, 2) });
  }
  if (t.sourceDatabaseAndTable && Array.isArray(t.sourceDatabaseAndTable)) {
    const tables = t.sourceDatabaseAndTable.map((item: any) => {
      if (item.name) {
        const children = (item.children || []).map((c: any) => c.name).join(', ');
        return children ? `${item.name}: ${children}` : item.name;
      }
      return '';
    }).filter(Boolean).join('; ');
    entries.push({ label: formatLabel("sourceDatabaseAndTable"), value: tables || '-' });
  }
  if (t.targetDatabaseAndTable && Array.isArray(t.targetDatabaseAndTable)) {
    const tables = t.targetDatabaseAndTable.join(', ');
    entries.push({ label: formatLabel("targetDatabaseAndTable"), value: tables || '-' });
  }

  // 收集其他未处理的字段
  const knownKeys = new Set([
    'id', 'name', 'status', 'createTime', 'updateTime', 'env', 'envCode',
    'configId', 'configName', 'taskType', 'sourceType', 'targetType',
    'sourceParallelism', 'targetParallelism', 'sourceDatabaseAndTableList',
    'targetDatabaseAndTableList', 'nodeInfo', 'extendConfig', 'remark',
    'sourceDatasource', 'targetDatasource', 'sourceDatasourceId', 'targetDatasourceId',
    'createUser', 'updateUser', 'envManagerUserList', 'projectManagerUserList',
    'taskRuntime', 'sourceDatabaseAndTable', 'targetDatabaseAndTable'
  ]);
  const otherKeys = Object.keys(t).filter(k => !knownKeys.has(k) && t[k] !== undefined && t[k] !== null && t[k] !== '');
  for (const key of otherKeys) {
    const value = t[key];
    const label = formatLabel(key);
    if (typeof value === 'object' && value !== null) {
      entries.push({ label, value: JSON.stringify(value, null, 2) });
    } else {
      entries.push({ label, value: String(value) });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-xl w-[700px] max-w-[calc(100vw-32px)] max-h-[85vh] overflow-hidden flex flex-col">
        {/* 标题栏 - 固定 */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/30 shrink-0">
          <div className="flex items-center gap-2">
            <Info className="h-3.5 w-3.5 text-primary" />
            <span className="text-sm font-semibold">任务详情</span>
            <span className="text-[10px] text-muted-foreground font-mono">#{task.id}</span>
          </div>
          <Button variant="ghost" size="icon-xs" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* 内容区 - 可滚动，字体更小 */}
        <div className="flex-1 overflow-y-auto px-3 py-2 text-xs">
          <div className="grid grid-cols-1 gap-0.5">
            {entries.map(({ label, value }, i) => (
              <div key={i} className="grid grid-cols-5 gap-1 py-1 border-b border-border/20 hover:bg-muted/20">
                <div className="text-[11px] text-muted-foreground font-medium pr-2">{label}</div>
                <div className="col-span-4 text-[11px] break-all">
                  {typeof value === 'string' ? (
                    value.startsWith('{') || value.startsWith('[') ? (
                      <pre className="text-[10px] bg-muted/30 p-1.5 rounded overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                        {value}
                      </pre>
                    ) : value
                  ) : value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 底部按钮 - 固定悬浮 */}
        <div className="px-3 py-2 border-t border-border/50 bg-muted/30 shrink-0 flex justify-end sticky bottom-0">
          <Button size="sm" className="h-6 text-xs" onClick={onClose}>关闭</Button>
        </div>
      </div>
    </div>
  );
}

// 字段名智能翻译函数（驼峰转中文）
function translateFieldName(key: string): string {
  // 常见词根翻译
  const wordMap: Record<string, string> = {
    id: "ID",
    name: "名称",
    code: "代码",
    type: "类型",
    status: "状态",
    time: "时间",
    list: "列表",
    info: "信息",
    config: "配置",
    parallelism: "并行度",
    database: "数据库",
    table: "表",
    source: "源",
    target: "目标",
    connection: "连接",
    pipeline: "管道",
    sync: "同步",
    batch: "批次",
    flush: "刷新",
    retry: "重试",
    interval: "间隔",
    filter: "过滤",
    condition: "条件",
    mode: "模式",
    operator: "操作人",
    modifier: "修改人",
    description: "描述",
    remark: "备注",
    error: "错误",
    message: "消息",
    group: "分组",
    biz: "业务",
    project: "项目",
    department: "部门",
    owner: "负责人",
    tag: "标签",
    last: "最后",
    start: "启动",
    stop: "停止",
    run: "运行",
    total: "总数",
    count: "数量",
    size: "大小",
    index: "索引",
    position: "位置",
    file: "文件",
    create: "创建",
    update: "更新",
    delete: "删除",
    modify: "修改",
    extend: "扩展",
    node: "节点",
    data: "数据",
    version: "版本",
    level: "级别",
    priority: "优先级",
    enable: "启用",
    disable: "禁用",
    active: "激活",
    inactive: "未激活",
    lock: "锁定",
    unlock: "解锁",
    schedule: "调度",
    trigger: "触发",
    execute: "执行",
    complete: "完成",
    fail: "失败",
    success: "成功",
    process: "处理",
    result: "结果",
    output: "输出",
    input: "输入",
    parameter: "参数",
    value: "值",
    key: "键",
    map: "映射",
    array: "数组",
    object: "对象",
    string: "字符串",
    number: "数字",
    boolean: "布尔",
    null: "空",
    undefined: "未定义",
    // 新增词根
    user: "用户",
    emp: "员工",
    dept: "部门",
    manager: "管理员",
    env: "环境",
    share: "共享",
    health: "健康",
    open: "开启",
    column: "列",
    pk: "主键",
    runtime: "运行时",
    offset: "偏移量",
    delay: "延迟",
    tps: "TPS",
    mistake: "异常",
    rule: "规则",
    datasource: "数据源",
    topic: "Topic",
    schema: "Schema",
    registry: "注册中心",
    converter: "转换器",
    serializer: "序列化器",
    deserializer: "反序列化器",
    request: "请求",
    response: "响应",
    timeout: "超时",
    buffer: "缓冲",
    memory: "内存",
    cpu: "CPU",
    pool: "池",
    host: "主机",
    port: "端口",
    sid: "SID",
    userName: "用户名",
    password: "密码",
  };

  // 尝试直接匹配
  if (wordMap[key.toLowerCase()]) {
    return wordMap[key.toLowerCase()];
  }

  // 驼峰拆分翻译
  const words = key.replace(/([A-Z])/g, ' $1').toLowerCase().split(' ').filter(w => w);
  const translated = words.map(w => wordMap[w] || w);

  // 如果所有词都翻译成功，返回翻译结果
  if (translated.every(t => wordMap[words[translated.indexOf(t)]])) {
    return translated.join('');
  }

  // 否则返回原字段名（保持可读性）
  return key;
}

// 回刷详情弹窗组件
function FlushDetailModal({ flush, onClose }: { flush: DtsFlush; onClose: () => void }) {
  // 字段名中英文映射 - 中文翻译(英文字段名)
  const fieldLabels: Record<string, string> = {
    id: "ID(id)",
    name: "名称(name)",
    taskName: "任务名称(taskName)",
    status: "状态(status)",
    createTime: "创建时间(createTime)",
    updateTime: "更新时间(updateTime)",
    taskId: "任务ID(taskId)",
    sourceDb: "源数据库(sourceDb)",
    sourceTable: "源表(sourceTable)",
    targetDb: "目标数据库(targetDb)",
    targetTable: "目标表(targetTable)",
    sourceTopic: "源Topic(sourceTopic)",
    targetTopic: "目标Topic(targetTopic)",
    sourceDatasource: "源数据源(sourceDatasource)",
    targetDatasource: "目标数据源(targetDatasource)",
    sql: "SQL(sql)",
    selectSql: "查询SQL(selectSql)",
    flushType: "回刷类型(flushType)",
    flushMode: "回刷模式(flushMode)",
    flushInterval: "刷新间隔(flushInterval)",
    startTime: "开始时间(startTime)",
    endTime: "结束时间(endTime)",
    progress: "进度(progress)",
    totalCount: "总数(totalCount)",
    successCount: "成功数(successCount)",
    failCount: "失败数(failCount)",
    errorMessage: "错误信息(errorMessage)",
    remark: "备注(remark)",
    operator: "操作人(operator)",
    modifier: "修改人(modifier)",
    createUser: "创建人(createUser)",
    updateUser: "更新人(updateUser)",
  };

  // 格式化字段标签
  const formatLabel = (key: string): string => {
    if (fieldLabels[key]) return fieldLabels[key];
    const chinese = translateFieldName(key);
    return `${chinese}(${key})`;
  };

  const entries: Array<{ label: string; value: React.ReactNode }> = [];

  // 基本信息
  entries.push({ label: "ID(id)", value: String(flush.id) });
  entries.push({ label: "任务名称(taskName)", value: flush.taskName || "-" });
  entries.push({ label: "名称(name)", value: flush.name || "-" });
  entries.push({ label: "状态(status)", value: (
    <span className={cn("inline-block rounded px-2 py-0.5 text-[10px] font-mono font-bold", STATUS_COLOR[flush.status] || "text-muted-foreground bg-muted")}>
      {flush.status}
    </span>
  ) });

  // 从 flush 对象提取所有字段
  const f = flush as any;
  if (f.createTime) entries.push({ label: formatLabel("createTime"), value: new Date(f.createTime).toLocaleString() });
  if (f.updateTime) entries.push({ label: formatLabel("updateTime"), value: new Date(f.updateTime).toLocaleString() });
  if (f.taskId) entries.push({ label: formatLabel("taskId"), value: String(f.taskId) });
  if (f.sourceDb) entries.push({ label: formatLabel("sourceDb"), value: f.sourceDb });
  if (f.sourceTable) entries.push({ label: formatLabel("sourceTable"), value: f.sourceTable });
  if (f.targetDb) entries.push({ label: formatLabel("targetDb"), value: f.targetDb });
  if (f.targetTable) entries.push({ label: formatLabel("targetTable"), value: f.targetTable });
  if (f.sourceTopic) entries.push({ label: formatLabel("sourceTopic"), value: f.sourceTopic });
  if (f.targetTopic) entries.push({ label: formatLabel("targetTopic"), value: f.targetTopic });
  if (f.flushType) entries.push({ label: formatLabel("flushType"), value: f.flushType });
  if (f.flushMode) entries.push({ label: formatLabel("flushMode"), value: f.flushMode });
  if (f.flushInterval) entries.push({ label: formatLabel("flushInterval"), value: String(f.flushInterval) });
  if (f.startTime) entries.push({ label: formatLabel("startTime"), value: new Date(f.startTime).toLocaleString() });
  if (f.endTime) entries.push({ label: formatLabel("endTime"), value: new Date(f.endTime).toLocaleString() });
  if (f.progress) entries.push({ label: formatLabel("progress"), value: String(f.progress) });
  if (f.totalCount) entries.push({ label: formatLabel("totalCount"), value: String(f.totalCount) });
  if (f.successCount) entries.push({ label: formatLabel("successCount"), value: String(f.successCount) });
  if (f.failCount) entries.push({ label: formatLabel("failCount"), value: String(f.failCount) });
  if (f.errorMessage) entries.push({ label: formatLabel("errorMessage"), value: f.errorMessage });
  if (f.remark) entries.push({ label: formatLabel("remark"), value: f.remark });
  if (f.operator) entries.push({ label: formatLabel("operator"), value: f.operator });
  if (f.modifier) entries.push({ label: formatLabel("modifier"), value: f.modifier });

  // 对象类型字段特殊处理
  if (f.sourceDatasource && typeof f.sourceDatasource === 'object') {
    entries.push({ label: formatLabel("sourceDatasource"), value: JSON.stringify(f.sourceDatasource, null, 2) });
  }
  if (f.targetDatasource && typeof f.targetDatasource === 'object') {
    entries.push({ label: formatLabel("targetDatasource"), value: JSON.stringify(f.targetDatasource, null, 2) });
  }
  if (f.createUser && typeof f.createUser === 'object') {
    const u = f.createUser;
    entries.push({ label: formatLabel("createUser"), value: `${u.empName || '-'} (${u.empCode || '-'} · ${u.deptName || '-'})` });
  }
  if (f.updateUser && typeof f.updateUser === 'object') {
    const u = f.updateUser;
    entries.push({ label: formatLabel("updateUser"), value: `${u.empName || '-'} (${u.empCode || '-'} · ${u.deptName || '-'})` });
  }

  // 收集其他未处理的字段
  const knownKeys = new Set([
    'id', 'name', 'taskName', 'status', 'createTime', 'updateTime', 'taskId',
    'sourceDb', 'sourceTable', 'targetDb', 'targetTable', 'sourceTopic', 'targetTopic',
    'flushType', 'flushMode', 'flushInterval', 'startTime', 'endTime',
    'progress', 'totalCount', 'successCount', 'failCount', 'errorMessage',
    'remark', 'operator', 'modifier', 'sourceDatasource', 'targetDatasource',
    'createUser', 'updateUser'
  ]);
  const otherKeys = Object.keys(f).filter(k => !knownKeys.has(k) && f[k] !== undefined && f[k] !== null && f[k] !== '');
  for (const key of otherKeys) {
    const value = f[key];
    const label = formatLabel(key);
    if (typeof value === 'object' && value !== null) {
      entries.push({ label, value: JSON.stringify(value, null, 2) });
    } else {
      entries.push({ label, value: String(value) });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-xl w-[700px] max-w-[calc(100vw-32px)] max-h-[85vh] overflow-hidden flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/30 shrink-0">
          <div className="flex items-center gap-2">
            <Info className="h-3.5 w-3.5 text-primary" />
            <span className="text-sm font-semibold">回刷详情</span>
            <span className="text-[10px] text-muted-foreground font-mono">#{flush.id}</span>
          </div>
          <Button variant="ghost" size="icon-xs" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-3 py-2 text-xs">
          <div className="grid grid-cols-1 gap-0.5">
            {entries.map(({ label, value }, i) => (
              <div key={i} className="grid grid-cols-5 gap-1 py-1 border-b border-border/20 hover:bg-muted/20">
                <div className="text-[11px] text-muted-foreground font-medium pr-2">{label}</div>
                <div className="col-span-4 text-[11px] break-all">
                  {typeof value === 'string' ? (
                    value.startsWith('{') || value.startsWith('[') ? (
                      <pre className="text-[10px] bg-muted/30 p-1.5 rounded overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                        {value}
                      </pre>
                    ) : value
                  ) : value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="px-3 py-2 border-t border-border/50 bg-muted/30 shrink-0 flex justify-end sticky bottom-0">
          <Button size="sm" className="h-6 text-xs" onClick={onClose}>关闭</Button>
        </div>
      </div>
    </div>
  );
}

// =============== 全量回刷 Tab ===============
function FlushTab({
  activeConfig,
  setTab,
  envOptions,
  envMap,
  addLog,
  setResult,
}: {
  activeConfig: DtsConfig | null;
  setTab: (t: Tab) => void;
  envOptions: EnvOption[];
  envMap: Record<string, string>;
  addLog: (level: LogEntry["level"], message: string) => void;
  setResult: (r: ExecutionResult | null) => void;
}) {
  const [records, setRecords] = useState<DtsFlush[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [taskNameFilter, setTaskNameFilter] = useState("");
  const [envCodeFilter, setEnvCodeFilter] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [createFromTasks, setCreateFromTasks] = useState<DtsTask[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showEnvDropdown, setShowEnvDropdown] = useState(false);
  const [envSearchKeyword, setEnvSearchKeyword] = useState("");
  const [showFlushDetail, setShowFlushDetail] = useState(false);
  const [detailFlush, setDetailFlush] = useState<DtsFlush | null>(null);

  // 确认弹窗状态
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description?: string;
    variant?: "default" | "danger";
    onConfirm: () => void;
  }>({ open: false, title: "", onConfirm: () => {} });

  const showConfirm = useCallback((title: string, description: string | undefined, onConfirm: () => void, variant?: "default" | "danger") => {
    setConfirmDialog({ open: true, title, description, onConfirm, variant });
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmDialog(prev => ({ ...prev, open: false }));
  }, []);

  const load = useCallback(async () => {
    if (!activeConfig?.base_url) {
      setRecords([]);
      return;
    }
    setLoading(true);
    try {
      const r = await dtsApi.listFlush(page, statusFilter, taskNameFilter, envCodeFilter, pageSize);
      // 上游 API 返回结构: { data: { data: [...], total: N } }
      const rawData = r as any;
      const recs = rawData?.data?.data || rawData?.data?.records || [];
      const total = rawData?.data?.total || 0;
      setRecords(recs as DtsFlush[]);
      setTotal(total);
      setTotalPages(Math.ceil(total / pageSize));
      setSelected(new Set());
      addLog("info", `Flush 加载成功 · 共 ${total} 条`);
    } catch (e) {
      addLog("error", `加载失败: ${e instanceof Error ? e.message : String(e)}`);
      toast.error(`加载失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [activeConfig, page, statusFilter, taskNameFilter, envCodeFilter, pageSize, addLog]);

  useEffect(() => {
    load();
  }, [load]);

  // 监听从任务页跳转过来要创建 flush
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as DtsTask[];
      if (detail && detail.length > 0) {
        setCreateFromTasks(detail);
        setShowCreate(true);
        setTab("flush");
      }
    };
    window.addEventListener("dts-create-flush", handler);
    return () => window.removeEventListener("dts-create-flush", handler);
  }, [setTab]);

  const handleSearch = () => {
    setPage(1);
    load();
  };

  // 执行单条回刷操作
  const executeFlushOp = useCallback(async (op: "start" | "delete", record: DtsFlush) => {
    closeConfirm();
    try {
      const r = op === "start" ? await dtsApi.startFlush(String(record.id)) : await dtsApi.deleteFlush(String(record.id));
      if (r.success) {
        addLog("info", `✓ ${record.taskName || record.name}: ${r.message || "成功"}`);
        toast.success(r.message || "成功");
      } else {
        addLog("error", `✗ ${record.taskName || record.name}: ${r.message || "失败"}`);
        toast.error(r.message || "失败");
      }
      load();
    } catch (e) {
      addLog("error", `${op} 失败: ${e instanceof Error ? e.message : String(e)}`);
      toast.error(`${op} 失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [load, addLog, closeConfirm]);

  // 单条回刷操作 - 确认弹窗
  const flushOp = useCallback((op: "start" | "delete", record: DtsFlush) => {
    const opName = op === "start" ? "启动" : "删除";
    showConfirm(
      `${opName}回刷确认`,
      `确定要${opName}回刷任务 "${record.taskName || record.name}"？`,
      () => executeFlushOp(op, record),
      op === "delete" ? "danger" : "default"
    );
  }, [showConfirm, executeFlushOp]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(records.map((r) => String(r.id))));
  const deselectAll = () => setSelected(new Set());

  // 执行批量回刷操作
  const executeBatchOp = useCallback(async (op: "start" | "delete") => {
    closeConfirm();
    setBatchRunning(true);
    setResult(null);
    addLog("info", `▶ 批量${op === "start" ? "启动" : "删除"}回刷开始 (${selected.size} 个)`);
    try {
      const progresses = await dtsApi.batchFlushOp(op, records.filter((r) => selected.has(String(r.id))));
      const summary = progresses.find((p) => p.type === "summary");
      if (summary) {
        addLog("info", `◼ 批量${op === "start" ? "启动" : "删除"}回刷完成 · 成功 ${summary.success_count} / 失败 ${summary.failed_count}`);
        setResult({
          total: summary.total || selected.size,
          success_count: summary.success_count || 0,
          failed_count: summary.failed_count || 0,
          details: progresses.filter((p) => p.type === "progress"),
        });
        toast.success(`完成: 成功 ${summary.success_count} / 失败 ${summary.failed_count}`);
      }
      load();
    } catch (e) {
      addLog("error", `批量 ${op} 失败: ${e instanceof Error ? e.message : String(e)}`);
      toast.error(`批量 ${op} 失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBatchRunning(false);
    }
  }, [selected, records, load, addLog, setResult, closeConfirm]);

  // 批量回刷操作 - 确认弹窗
  const batchOp = useCallback((op: "start" | "delete") => {
    if (selected.size === 0) {
      toast.warning("请先选择记录");
      return;
    }
    const opName = op === "start" ? "启动" : "删除";
    showConfirm(
      `批量${opName}确认`,
      `确定要批量${opName} ${selected.size} 个回刷记录？`,
      () => executeBatchOp(op),
      op === "delete" ? "danger" : "default"
    );
  }, [selected, showConfirm, executeBatchOp]);

  const createFlush = useCallback(async (tasks: DtsTask[]) => {
    if (tasks.length === 0) return;
    setBatchRunning(true);
    setResult(null);
    addLog("info", `▶ 批量创建回刷开始 (${tasks.length} 个)`);
    try {
      const progresses = await dtsApi.batchCreateFlush(tasks);
      const summary = progresses.find((p) => p.type === "summary");
      if (summary) {
        addLog("info", `◼ 批量创建回刷完成 · 成功 ${summary.success_count} / 失败 ${summary.failed_count}`);
        setResult({
          total: summary.total || tasks.length,
          success_count: summary.success_count || 0,
          failed_count: summary.failed_count || 0,
          details: progresses.filter((p) => p.type === "progress"),
        });
        toast.success(`创建完成: 成功 ${summary.success_count} / 失败 ${summary.failed_count}`);
      }
      setShowCreate(false);
      setCreateFromTasks(null);
      load();
    } catch (e) {
      addLog("error", `创建失败: ${e instanceof Error ? e.message : String(e)}`);
      toast.error(`创建失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBatchRunning(false);
    }
  }, [load, addLog, setResult]);

  // 环境下拉过滤
  const filteredEnvOptions = envOptions.filter((e) =>
    e.name.toLowerCase().includes(envSearchKeyword.toLowerCase()) ||
    e.code.toLowerCase().includes(envSearchKeyword.toLowerCase())
  );

  if (!activeConfig?.base_url) {
    return (
      <div className="card-modern p-8 text-center">
        <Settings2 className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-sm font-medium">请先配置 DTS 连接</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {showCreate && createFromTasks && (
        <CreateFlushPanel
          tasks={createFromTasks}
          onConfirm={() => createFlush(createFromTasks)}
          onCancel={() => { setShowCreate(false); setCreateFromTasks(null); }}
          busy={batchRunning}
        />
      )}

      {/* 工具栏 */}
      <div className="card-modern p-3 space-y-3">
        {/* 第一行：批量操作按钮 */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            刷新
          </Button>
          <Button size="sm" variant="outline" onClick={() => {
            toast.warning("请先在「DTS 任务」页选择任务后创建回刷");
          }}>
            <FlaskConical className="h-3.5 w-3.5 mr-1" />
            基于任务创建 Flush
          </Button>
          <div className="h-5 w-px bg-border mx-1" />
          <Button size="sm" onClick={() => batchOp("start")} disabled={batchRunning || selected.size === 0}>
            <PlayCircle className="h-3.5 w-3.5 mr-1 text-emerald-600" />
            批量启动
          </Button>
          <Button size="sm" onClick={() => batchOp("delete")} disabled={batchRunning || selected.size === 0} variant="destructive">
            <Trash className="h-3.5 w-3.5 mr-1" />
            批量删除
          </Button>
          <Button size="sm" variant="ghost" onClick={deselectAll} disabled={selected.size === 0}>
            清空选择
          </Button>
          <div className="ml-auto text-xs text-muted-foreground">
            {selected.size > 0 ? `已选 ${selected.size}` : `共 ${total}`}
          </div>
        </div>

        {/* 第二行：过滤条件 */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Label className="shrink-0">任务名称</Label>
          <Input
            value={taskNameFilter}
            onChange={(e) => setTaskNameFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="过滤任务名称"
            className="w-40 h-7"
          />
          <Label className="shrink-0">环境</Label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowEnvDropdown(!showEnvDropdown)}
              className="flex items-center gap-1 h-8 px-2 rounded-md border bg-background text-xs hover:bg-muted"
            >
              <span className="truncate max-w-[120px]">
                {envCodeFilter ? (envMap[envCodeFilter] || envCodeFilter) : "全部环境"}
              </span>
              <ChevronDown className="h-3 w-3 shrink-0" />
            </button>
            {showEnvDropdown && (
              <div className="absolute top-8 left-0 z-50 w-48 rounded-md border bg-background shadow-lg">
                <div className="p-1.5 border-b">
                  <div className="flex items-center gap-1">
                    <Search className="h-3 w-3 text-muted-foreground" />
                    <Input
                      value={envSearchKeyword}
                      onChange={(e) => setEnvSearchKeyword(e.target.value)}
                      placeholder="搜索环境..."
                      className="h-6 text-xs border-0 shadow-none focus-visible:ring-0"
                    />
                  </div>
                </div>
                <div className="max-h-40 overflow-y-auto">
                  <div
                    className="px-2 py-1.5 hover:bg-muted cursor-pointer text-xs"
                    onClick={() => { setEnvCodeFilter(""); setShowEnvDropdown(false); }}
                  >
                    全部环境
                  </div>
                  {filteredEnvOptions.map((e) => (
                    <div
                      key={e.code}
                      className={cn(
                        "px-2 py-1.5 hover:bg-muted cursor-pointer text-xs flex items-center justify-between",
                        envCodeFilter === e.code && "bg-primary/10"
                      )}
                      onClick={() => { setEnvCodeFilter(e.code); setShowEnvDropdown(false); }}
                    >
                      <span>{e.name}</span>
                      <span className="text-muted-foreground font-mono text-[10px]">{e.code}</span>
                    </div>
                  ))}
                  {filteredEnvOptions.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">无匹配结果</div>
                  )}
                </div>
              </div>
            )}
          </div>
          <Label className="shrink-0">状态</Label>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-24 h-7">
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Label className="shrink-0">每页</Label>
          <Select
            value={pageSize.toString()}
            onChange={(e) => setPageSize(parseInt(e.target.value) || 20)}
            className="w-16 h-7"
          >
            {PAGE_SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Button size="sm" onClick={handleSearch} disabled={loading} className="h-8 px-3">
            <Search className="h-3.5 w-3.5 mr-1" />
            搜索
          </Button>
        </div>
      </div>

      {/* Flush 列表 - 自适应 flex 行布局 */}
      <div className="card-modern overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mb-2" />
            加载中...
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-muted-foreground">
            <FlaskConical className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">暂无 flush 记录</p>
            <p className="text-xs mt-1">从任务管理页选任务后点「批量创建回刷」</p>
          </div>
        ) : (
          <>
            {/* 表头 */}
            <div className="grid grid-cols-[40px_100px_minmax(160px,1.5fr)_minmax(180px,1.5fr)_minmax(280px,2fr)_80px_140px_100px] items-center gap-3 px-4 py-2 bg-muted/30 border-b text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
              <div>
                <Checkbox
                  checked={selected.size > 0 && selected.size === records.length}
                  onChange={(v) => v ? selectAll() : deselectAll()}
                />
              </div>
              <div>ID</div>
              <div>任务名称</div>
              <div>回刷名称</div>
              <div>SQL</div>
              <div>状态</div>
              <div>创建时间</div>
              <div className="text-right">操作</div>
            </div>

            {/* 列表 */}
            <div className="max-h-[calc(100vh-380px)] overflow-auto">
              {records.map((r) => {
                const id = String(r.id);
                const isSelected = selected.has(id);
                const f = r as any;
                const taskName = r.taskName || "-";
                const flushName = f.name || "-";
                const sql = f.sql || f.selectSql || "-";
                const createTime = f.createTime ? new Date(f.createTime).toLocaleString() : "-";

                return (
                  <div
                    key={id}
                    className={cn(
                      "grid grid-cols-[40px_100px_minmax(160px,1.5fr)_minmax(180px,1.5fr)_minmax(280px,2fr)_80px_140px_100px] items-center gap-3 px-4 py-2.5 border-b border-border/30 hover:bg-muted/30 transition-colors group",
                      isSelected && "bg-primary/5"
                    )}
                  >
                    <div>
                      <Checkbox checked={isSelected} onChange={() => toggleSelect(id)} />
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground truncate" title={id}>{id}</div>
                    <div className="text-xs font-medium truncate" title={taskName}>{taskName}</div>
                    <div className="text-[11px] text-muted-foreground truncate" title={flushName}>{flushName}</div>
                    <div className="text-[11px] text-muted-foreground font-mono truncate" title={sql}>
                      <code className="block truncate">{sql}</code>
                    </div>
                    <div>
                      <span className={cn("inline-block rounded px-1.5 py-0.5 text-[10px] font-mono font-bold", STATUS_COLOR[r.status] || "text-muted-foreground bg-muted")}>
                        {r.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate" title={createTime}>{createTime}</div>
                    <div className="flex items-center justify-end gap-0.5">
                      <Button variant="ghost" size="icon-xs" onClick={() => { setDetailFlush(r); setShowFlushDetail(true); }} title="查看详情">
                        <Eye className="h-3 w-3" />
                      </Button>
                      {r.status !== "RUN" && (
                        <Button variant="ghost" size="icon-xs" onClick={() => flushOp("start", r)} title="启动">
                          <Play className="h-3 w-3 text-emerald-600" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon-xs" onClick={() => flushOp("delete", r)} title="删除">
                        <Trash2 className="h-3 w-3 text-rose-500" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 py-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            ‹
          </Button>
          {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
            let p: number;
            if (totalPages <= 7) {
              p = i + 1;
            } else if (page <= 4) {
              p = i + 1;
            } else if (page >= totalPages - 3) {
              p = totalPages - 6 + i;
            } else {
              p = page - 3 + i;
            }
            return (
              <Button
                key={p}
                variant={p === page ? "default" : "ghost"}
                size="sm"
                onClick={() => setPage(p)}
              >
                {p}
              </Button>
            );
          })}
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            ›
          </Button>
          <span className="text-xs text-muted-foreground ml-2">
            共 {total} 条 / {totalPages} 页
          </span>
        </div>
      )}

      {/* 提示 */}
      <div className="text-xs text-muted-foreground text-center py-1">
        提示：也可以在「DTS 任务」页选中任务后点「批量创建回刷」，自动跳来此页。
      </div>

      {/* 回刷详情弹窗 */}
      {showFlushDetail && detailFlush && (
        <FlushDetailModal
          flush={detailFlush}
          onClose={() => { setShowFlushDetail(false); setDetailFlush(null); }}
        />
      )}

      {/* 确认弹窗 */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  );
}

function CreateFlushPanel({ tasks, onConfirm, onCancel, busy }: { tasks: DtsTask[]; onConfirm: () => void; onCancel: () => void; busy: boolean }) {
  return (
    <div className="card-modern p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">基于任务创建回刷</span>
        <span className="text-xs text-muted-foreground">将使用各任务的第一张源表</span>
      </div>
      <div className="rounded-lg border bg-muted/30 p-2 max-h-32 overflow-y-auto">
        {tasks.map((t, i) => (
          <div key={i} className="text-xs flex items-center gap-2 py-0.5">
            <CheckCheck className="h-3 w-3 text-emerald-600" />
            <span className="truncate">{t.name}</span>
            {t.sourceDatabaseAndTableList?.[0] && (
              <span className="text-muted-foreground font-mono text-[10px] truncate">
                {t.sourceDatabaseAndTableList[0].dbName}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>取消</Button>
        <Button size="sm" onClick={onConfirm} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5 mr-1" />}
          创建 {tasks.length} 个 flush
        </Button>
      </div>
    </div>
  );
}

// =============== 配置 Tab ===============
function ConfigsTab({ onConfigChange, envOptions }: { onConfigChange: () => void; envOptions: EnvOption[] }) {
  const [configs, setConfigs] = useState<DtsConfigDisplay[]>([]);
  const [current, setCurrent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<DtsConfig | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [saving, setSaving] = useState(false);

  // 确认弹窗状态
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description?: string;
    variant?: "default" | "danger";
    onConfirm: () => void;
  }>({ open: false, title: "", onConfirm: () => {} });

  const showConfirm = useCallback((title: string, description: string | undefined, onConfirm: () => void, variant?: "default" | "danger") => {
    setConfirmDialog({ open: true, title, description, onConfirm, variant });
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmDialog(prev => ({ ...prev, open: false }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await dtsApi.listConfigs();
      setConfigs(r.configs);
      setCurrent(r.current_config);
    } catch (e) {
      toast.error(`加载失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startCreate = () => {
    setTestResult(null);
    setShowToken(false);
    setShowLogin(false);
    setEditing({ config_name: "", base_url: "", auth_token: "", login_user: "", login_pass: "", task_name: "", env_code: "", page_size: 20 });
  };

  const startEdit = async (cfg: DtsConfigDisplay) => {
    try {
      const r = await dtsApi.getConfig(cfg.config_name);
      setTestResult(null);
      setShowToken(false);
      setShowLogin(false);
      setEditing(r.config);
    } catch (e) {
      toast.error(`读取配置失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.config_name.trim()) {
      toast.warning("配置名称不能为空");
      return;
    }
    if (!editing.base_url.trim() || !editing.auth_token.trim()) {
      toast.warning("BASE_URL 和 AUTH_TOKEN 不能为空");
      return;
    }
    setSaving(true);
    try {
      const r = await dtsApi.saveConfig(editing);
      if (r.success) {
        toast.success(r.message);
        setEditing(null);
        load();
        onConfigChange();
      } else {
        toast.error(r.message);
      }
    } catch (e) {
      toast.error(`保存失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  // 执行删除配置
  const executeRemove = useCallback(async (name: string) => {
    closeConfirm();
    try {
      const r = await dtsApi.deleteConfig(name);
      if (r.success) { toast.success(r.message); load(); onConfigChange(); }
      else toast.error(r.message);
    } catch (e) {
      toast.error(`删除失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [load, onConfigChange, closeConfirm]);

  // 删除配置 - 确认弹窗
  const remove = useCallback((name: string) => {
    showConfirm(
      "删除配置确认",
      `确定要删除配置 "${name}"？删除后不可恢复。`,
      () => executeRemove(name),
      "danger"
    );
  }, [showConfirm, executeRemove]);

  // 执行激活配置
  const executeActivate = useCallback(async (name: string) => {
    closeConfirm();
    try {
      const r = await dtsApi.activateConfig(name);
      if (r.success) { toast.success(r.message); load(); onConfigChange(); }
    } catch (e) {
      toast.error(`切换失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [load, onConfigChange, closeConfirm]);

  // 激活配置 - 确认弹窗
  const activate = useCallback((name: string) => {
    showConfirm(
      "切换配置确认",
      `确定要激活配置 "${name}"？切换后将使用该配置连接 DTS。`,
      () => executeActivate(name)
    );
  }, [showConfirm, executeActivate]);

  const testConn = async () => {
    if (!editing) return;
    setTestResult(null);
    try {
      const r = await dtsApi.testConnection(editing.base_url, editing.auth_token);
      setTestResult({ ok: r.success, msg: r.message });
    } catch (e) {
      setTestResult({ ok: false, msg: String(e) });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">配置列表（{configs.length}）</div>
        <Button size="sm" onClick={startCreate}>
          <Plus className="h-3.5 w-3.5 mr-1" />新增配置
        </Button>
      </div>
      <div className="card-modern divide-y divide-border/40">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin inline mr-2" />加载中...
          </div>
        ) : configs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            还没有配置，点「新增配置」添加
          </div>
        ) : (
          configs.map((c) => (
            <div key={c.config_name} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
              {c.config_name === current && (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{c.config_name}</p>
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
                  {c.base_url} · token: {c.auth_token || "(未设置)"}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {c.config_name !== current && (
                  <Button variant="outline" size="sm" onClick={() => activate(c.config_name)}>
                    激活
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" onClick={() => startEdit(c)} title="编辑">
                  <Edit3 className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => remove(c.config_name)} title="删除">
                  <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 配置编辑弹窗 */}
      {editing && (
        <ConfigEditorDialog
          config={editing}
          onChange={setEditing}
          onSave={save}
          onCancel={() => setEditing(null)}
          onTest={testConn}
          onLoginFetch={async (username, password, loginType) => {
            try {
              const r = await dtsApi.fetchToken(editing.base_url, username, password, loginType);
              if (r.success && r.token) {
                setEditing({ ...editing, auth_token: r.token });
                toast.success("Token 获取成功");
                return true;
              } else {
                toast.error(r.message || "获取失败");
                return false;
              }
            } catch (e) {
              toast.error(String(e));
              return false;
            }
          }}
          testResult={testResult}
          showToken={showToken}
          setShowToken={setShowToken}
          showLogin={showLogin}
          setShowLogin={setShowLogin}
          envOptions={envOptions}
          saving={saving}
        />
      )}

      {/* 确认弹窗 */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  );
}

// 配置编辑弹窗组件
function ConfigEditorDialog({
  config, onChange, onSave, onCancel, onTest, onLoginFetch,
  testResult, showToken, setShowToken, showLogin, setShowLogin,
  envOptions, saving,
}: {
  config: DtsConfig;
  onChange: (c: DtsConfig) => void;
  onSave: () => void;
  onCancel: () => void;
  onTest: () => void;
  onLoginFetch: (u: string, p: string, t: string) => Promise<boolean>;
  testResult: { ok: boolean; msg: string } | null;
  showToken: boolean;
  setShowToken: (v: boolean) => void;
  showLogin: boolean;
  setShowLogin: (v: boolean) => void;
  envOptions: EnvOption[];
  saving: boolean;
}) {
  // 从 localStorage 读取记住的登录信息（按配置名称区分）
  const getStoredCredentials = useCallback((configName: string) => {
    const stored = localStorage.getItem(`dts-login-credentials-${configName}`);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
    return null;
  }, []);

  const isNew = !config.config_name.trim();
  const credentialKey = isNew ? "default" : config.config_name;

  const [loginUser, setLoginUser] = useState(() => {
    const stored = getStoredCredentials(credentialKey);
    return stored?.user || config.login_user || "";
  });
  const [loginPass, setLoginPass] = useState(() => {
    const stored = getStoredCredentials(credentialKey);
    return stored?.pass || "";
  });
  const [loginType, setLoginType] = useState(() => {
    const stored = getStoredCredentials(credentialKey);
    return stored?.type || "ldap";
  });
  const [rememberPassword, setRememberPassword] = useState(() => {
    const stored = getStoredCredentials(credentialKey);
    return !!stored?.remember;
  });
  const [loginFetching, setLoginFetching] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [showEnvDropdown, setShowEnvDropdown] = useState(false);
  const [envSearchKeyword, setEnvSearchKeyword] = useState("");

  const filteredEnvOptions = envOptions.filter((e) =>
    e.name.toLowerCase().includes(envSearchKeyword.toLowerCase()) ||
    e.code.toLowerCase().includes(envSearchKeyword.toLowerCase())
  );

  // 保存登录凭证到 localStorage（按配置名称区分）
  const saveCredentials = useCallback((configName: string, user: string, pass: string, type: string, remember: boolean) => {
    const key = configName || "default";
    if (remember) {
      localStorage.setItem(`dts-login-credentials-${key}`, JSON.stringify({
        user,
        pass,
        type,
        remember: true,
      }));
    } else {
      localStorage.removeItem(`dts-login-credentials-${key}`);
    }
  }, []);

  // 处理记住密码勾选变化 - 立即保存/清除
  const handleRememberChange = useCallback((checked: boolean) => {
    setRememberPassword(checked);
    if (checked) {
      // 勾选时立即保存当前输入的凭证
      saveCredentials(config.config_name, loginUser, loginPass, loginType, true);
    } else {
      // 取消勾选时清除保存的凭证
      saveCredentials(config.config_name, "", "", "", false);
    }
  }, [config.config_name, loginUser, loginPass, loginType, saveCredentials]);

  // 监听配置名称变化，重新加载对应的凭证
  useEffect(() => {
    if (!isNew && config.config_name) {
      const stored = getStoredCredentials(config.config_name);
      if (stored) {
        setLoginUser(stored.user || "");
        setLoginPass(stored.pass || "");
        setLoginType(stored.type || "ldap");
        setRememberPassword(stored.remember || false);
      } else {
        // 没有保存的凭证时，清空并取消勾选
        setLoginUser("");
        setLoginPass("");
        setLoginType("ldap");
        setRememberPassword(false);
      }
    }
  }, [config.config_name, isNew, getStoredCredentials]);

  // 当用户名、密码、登录类型变化时，如果已勾选记住密码，则自动更新保存
  useEffect(() => {
    if (rememberPassword && config.config_name && (loginUser || loginPass)) {
      saveCredentials(config.config_name, loginUser, loginPass, loginType, true);
    }
  }, [loginUser, loginPass, loginType, rememberPassword, config.config_name, saveCredentials]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-xl w-[600px] max-w-[calc(100vw-32px)] max-h-[85vh] overflow-hidden flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/30 shrink-0">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">{isNew ? "新增配置" : "编辑配置"}</span>
          </div>
          <Button variant="ghost" size="icon-xs" onClick={onCancel}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">配置名称 *</Label>
              <Input
                value={config.config_name}
                onChange={(e) => onChange({ ...config, config_name: e.target.value })}
                placeholder="如 中国FAT环境"
                className="h-8"
                disabled={!isNew}
              />
              {!isNew && (
                <p className="text-[10px] text-muted-foreground">配置名称创建后不可修改</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">BASE_URL *</Label>
              <Input
                value={config.base_url}
                onChange={(e) => onChange({ ...config, base_url: e.target.value })}
                placeholder="如 https://jms-dts-api.jnt-express.com.cn"
                className="h-8"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">AUTH_TOKEN *</Label>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setShowLogin(!showLogin)}>
                  <KeyRound className="h-3 w-3 mr-1" />自动获取
                </Button>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setShowToken(!showToken)}>
                  {showToken ? "隐藏" : "显示"}
                </Button>
              </div>
            </div>
            <Input
              type={showToken ? "text" : "password"}
              value={config.auth_token}
              onChange={(e) => onChange({ ...config, auth_token: e.target.value })}
              placeholder="Bearer eyJ0eXAi..."
              className="h-8"
            />
          </div>

          {showLogin && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="text-xs text-muted-foreground">填账号密码自动获取 Token</div>
              <div className="grid grid-cols-3 gap-2">
                <Input value={loginUser} onChange={(e) => setLoginUser(e.target.value)} placeholder="用户名" className="h-7" />
                <Input type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} placeholder="密码" className="h-7" />
                <Select value={loginType} onChange={(e) => setLoginType(e.target.value)} className="h-7">
                  <option value="ldap">ldap</option>
                  <option value="sso">sso</option>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox checked={rememberPassword} onChange={handleRememberChange} />
                  <Label className="text-xs text-muted-foreground cursor-pointer" onClick={() => handleRememberChange(!rememberPassword)}>
                    记住密码（下次自动填充）
                  </Label>
                </div>
                <Button
                  size="sm"
                  disabled={loginFetching || !loginUser || !loginPass || !config.base_url}
                  onClick={async () => {
                    setLoginFetching(true);
                    setLoginSuccess(false);
                    const success = await onLoginFetch(loginUser, loginPass, loginType);
                    if (success) {
                      setLoginSuccess(true);
                      // 保存凭证
                      saveCredentials(config.config_name, loginUser, loginPass, loginType, rememberPassword);
                      // 2秒后重置成功状态
                      setTimeout(() => setLoginSuccess(false), 2000);
                    }
                    setLoginFetching(false);
                  }}
                  className={cn("h-7", loginSuccess && "bg-emerald-600 hover:bg-emerald-700 text-white")}
                >
                  {loginFetching ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : loginSuccess ? (
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                  ) : (
                    <Link2 className="h-3 w-3 mr-1" />
                  )}
                  {loginFetching ? "获取中..." : loginSuccess ? "获取成功" : "获取"}
                </Button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">任务名过滤（可选）</Label>
              <Input value={config.task_name || ""} onChange={(e) => onChange({ ...config, task_name: e.target.value })} placeholder="支持模糊匹配" className="h-8" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">环境代码（可选）</Label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowEnvDropdown(!showEnvDropdown)}
                  className="flex items-center justify-between w-full h-8 px-3 rounded-md border bg-background text-xs hover:bg-muted"
                >
                  <span className={cn(!config.env_code && "text-muted-foreground")}>
                    {config.env_code ? `${envOptions.find(e => e.code === config.env_code)?.name || config.env_code} (${config.env_code})` : "全部环境"}
                  </span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>
                {showEnvDropdown && (
                  <div className="absolute top-9 left-0 z-50 w-56 rounded-md border bg-background shadow-lg">
                    <div className="p-1.5 border-b">
                      <div className="flex items-center gap-1">
                        <Search className="h-3 w-3 text-muted-foreground" />
                        <Input
                          value={envSearchKeyword}
                          onChange={(e) => setEnvSearchKeyword(e.target.value)}
                          placeholder="搜索环境..."
                          className="h-6 text-xs border-0 shadow-none focus-visible:ring-0"
                        />
                      </div>
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                      <div
                        className={cn(
                          "px-2 py-1.5 hover:bg-muted cursor-pointer text-xs",
                          !config.env_code && "bg-primary/10"
                        )}
                        onClick={() => { onChange({ ...config, env_code: "" }); setShowEnvDropdown(false); }}
                      >
                        全部环境
                      </div>
                      {filteredEnvOptions.map((e) => (
                        <div
                          key={e.code}
                          className={cn(
                            "px-2 py-1.5 hover:bg-muted cursor-pointer text-xs flex items-center justify-between",
                            config.env_code === e.code && "bg-primary/10"
                          )}
                          onClick={() => { onChange({ ...config, env_code: e.code }); setShowEnvDropdown(false); }}
                        >
                          <span>{e.name}</span>
                          <span className="text-muted-foreground font-mono text-[10px]">{e.code}</span>
                        </div>
                      ))}
                      {filteredEnvOptions.length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">无匹配结果</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">分页大小</Label>
              <Select
                value={String(config.page_size || 20)}
                onChange={(e) => onChange({ ...config, page_size: parseInt(e.target.value) || 20 })}
                className="h-8"
              >
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
              </Select>
            </div>
          </div>

          {testResult && (
            <div className={cn("rounded-lg p-2.5 text-xs flex items-center gap-2",
              testResult.ok ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-700")}>
              {testResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
              {testResult.msg}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-4 py-3 border-t border-border/50 bg-muted/30 shrink-0 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onTest}>
            <Link2 className="h-3.5 w-3.5 mr-1" />测试连接
          </Button>
          <Button variant="outline" size="sm" onClick={onCancel}>取消</Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}

// =============== 辅助 ===============
function Checkbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className="flex items-center justify-center w-4 h-4 rounded border transition-colors hover:bg-muted"
      style={{ borderColor: checked ? "hsl(var(--primary))" : "hsl(var(--border))", background: checked ? "hsl(var(--primary))" : "transparent" }}
    >
      {checked && <CheckCheck className="h-3 w-3 text-primary-foreground" />}
    </button>
  );
}

// 通用确认弹窗组件
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-xl w-[400px] max-w-[calc(100vw-32px)] overflow-hidden">
        {/* 标题栏 */}
        <div className="px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            {variant === "danger" ? (
              <AlertCircle className="h-4 w-4 text-rose-600" />
            ) : (
              <Info className="h-4 w-4 text-primary" />
            )}
            <span className="text-sm font-semibold">{title}</span>
          </div>
        </div>

        {/* 内容区 */}
        {description && (
          <div className="px-4 py-3 text-xs text-muted-foreground">
            {description}
          </div>
        )}

        {/* 底部按钮 */}
        <div className="px-4 py-3 border-t border-border/50 bg-muted/30 flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onCancel}>{cancelText}</Button>
          <Button
            size="sm"
            variant={variant === "danger" ? "destructive" : "default"}
            onClick={onConfirm}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
