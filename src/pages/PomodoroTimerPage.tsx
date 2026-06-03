import { useState, useEffect, useCallback, useRef } from "react";
import { Play, Pause, RotateCcw, Coffee, Focus, Volume2, VolumeX, Timer, Plus, Minus, Flame, CheckCircle2, ListChecks, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type TimerMode = "focus" | "shortBreak" | "longBreak";

interface SessionRecord {
  id: string; mode: TimerMode; duration: number; taskLabel: string; completedAt: number;
}

const DEFAULT_PRESETS = { focus: 25, shortBreak: 5, longBreak: 15 };

function loadHistory(): SessionRecord[] {
  try { return JSON.parse(localStorage.getItem("pomodoro-history") || "[]"); } catch { return []; }
}
function saveHistory(records: SessionRecord[]) {
  localStorage.setItem("pomodoro-history", JSON.stringify(records.slice(-50)));
}

function getTodayKey() { return new Date().toISOString().slice(0, 10); }
function loadTodaySessions(): number { return parseInt(localStorage.getItem(`pomodoro-today-${getTodayKey()}`) || "0"); }
function saveTodaySessions(count: number) { localStorage.setItem(`pomodoro-today-${getTodayKey()}`, count.toString()); }
function loadStreak(): { days: number; last: string } {
  try { return JSON.parse(localStorage.getItem("pomodoro-streak") || '{"days":0,"last":""}'); } catch { return { days: 0, last: "" }; }
}
function saveStreak(s: { days: number; last: string }) { localStorage.setItem("pomodoro-streak", JSON.stringify(s)); }

export function PomodoroTimerPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<TimerMode>("focus");
  const [timeLeft, setTimeLeft] = useState(DEFAULT_PRESETS.focus * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [taskLabel, setTaskLabel] = useState("");
  const [presets, setPresets] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pomodoro-presets") || JSON.stringify(DEFAULT_PRESETS)); } catch { return DEFAULT_PRESETS; }
  });
  const [history, setHistory] = useState<SessionRecord[]>(loadHistory);
  const [todayCount, setTodayCount] = useState(loadTodaySessions);
  const [streak, setStreak] = useState(loadStreak);
  const [totalFocusMin, setTotalFocusMin] = useState(() => history.filter(h => h.mode === "focus").reduce((s, h) => s + h.duration, 0));
  const [showCustom, setShowCustom] = useState(false);

  const totalTime = presets[mode] * 60;
  const progress = ((totalTime - timeLeft) / totalTime) * 100;
  const audioContextRef = useRef<AudioContext | null>(null);

  const playNotificationSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 800; osc.type = "sine";
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
    } catch { /* ignore */ }
  }, [soundEnabled]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          playNotificationSound();
          const record: SessionRecord = { id: Date.now().toString(), mode, duration: presets[mode], taskLabel, completedAt: Date.now() };
          const newHistory = [...history, record];
          setHistory(newHistory); saveHistory(newHistory);
          if (mode === "focus") {
            const ns = sessions + 1;
            setSessions(ns);
            setTotalFocusMin(prev => prev + presets[mode]);
            const tc = todayCount + 1;
            setTodayCount(tc); saveTodaySessions(tc);
            const today = getTodayKey();
            const newStreak = { ...streak };
            if (newStreak.last !== today) {
              const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
              newStreak.days = newStreak.last === yesterday ? newStreak.days + 1 : 1;
              newStreak.last = today;
              setStreak({ ...newStreak }); saveStreak(newStreak);
            }
            if ((ns) % 4 === 0) { setMode("longBreak"); return presets.longBreak * 60; }
            else { setMode("shortBreak"); return presets.shortBreak * 60; }
          } else {
            setMode("focus"); return presets.focus * 60;
          }
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, mode, sessions, playNotificationSound, history, presets, taskLabel, todayCount, streak]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60); const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleStart = () => setIsRunning(true);
  const handlePause = () => setIsRunning(false);
  const handleReset = () => { setIsRunning(false); setTimeLeft(presets[mode] * 60); };
  const handleModeChange = (newMode: TimerMode) => { setIsRunning(false); setMode(newMode); setTimeLeft(presets[newMode] * 60); };

  const updatePreset = (m: TimerMode, delta: number) => {
    const newVal = Math.max(1, Math.min(120, presets[m] + delta));
    const newPresets = { ...presets, [m]: newVal };
    setPresets(newPresets);
    localStorage.setItem("pomodoro-presets", JSON.stringify(newPresets));
    if (mode === m) setTimeLeft(newVal * 60);
  };

  // Keyboard shortcut: Space to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        if (isRunning) handlePause(); else handleStart();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isRunning]);

  const modeConfig = {
    focus: { label: t("timer.focus"), icon: Focus, color: "from-violet-500 to-purple-600", bgClass: "bg-violet-50 dark:bg-violet-950/30" },
    shortBreak: { label: t("timer.shortBreak"), icon: Coffee, color: "from-green-500 to-emerald-600", bgClass: "bg-green-50 dark:bg-green-950/30" },
    longBreak: { label: t("timer.longBreak"), icon: Coffee, color: "from-blue-500 to-cyan-600", bgClass: "bg-blue-50 dark:bg-blue-950/30" },
  };

  const config = modeConfig[mode];
  const Icon = config.icon;
  const focusHistory = history.filter(h => h.mode === "focus");

  return (
    <div className="p-4 max-w-lg mx-auto">
      <div className="mb-3 flex items-center gap-2">
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br", config.color)}>
          <Timer className="h-3.5 w-3.5 text-white" />
        </div>
        <div>
          <h2 className="text-sm font-medium">{t("nav.timer")}</h2>
          <p className="text-xs text-muted-foreground">{t("timer.description")}</p>
        </div>
      </div>

      {/* Mode Tabs + Custom Durations */}
      <div className="space-y-2 mb-3">
        <div className="flex gap-2">
          {(Object.keys(modeConfig) as TimerMode[]).map((m) => (
            <Button key={m} variant={mode === m ? "default" : "outline"} size="sm" onClick={() => handleModeChange(m)} className="flex-1 h-7 text-xs">
              {modeConfig[m].label} ({presets[m]}m)
            </Button>
          ))}
        </div>
        {showCustom && (
          <div className="flex items-center gap-3 p-2 border rounded-lg bg-muted/30">
            <span className="text-[10px] text-muted-foreground">自定义时长:</span>
            {(Object.keys(modeConfig) as TimerMode[]).map((m) => (
              <div key={m} className="flex items-center gap-1">
                <span className="text-[10px]">{modeConfig[m].label}</span>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => updatePreset(m, -5)}><Minus className="h-2.5 w-2.5" /></Button>
                <span className="text-xs font-medium w-6 text-center">{presets[m]}</span>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => updatePreset(m, 5)}><Plus className="h-2.5 w-2.5" /></Button>
              </div>
            ))}
          </div>
        )}
        <button className="text-[10px] text-muted-foreground hover:text-foreground" onClick={() => setShowCustom(!showCustom)}>
          {showCustom ? "收起" : "自定义时长"}
        </button>
      </div>

      {/* Task Input */}
      <div className="flex items-center gap-2 mb-3">
        <Input value={taskLabel} onChange={(e) => setTaskLabel(e.target.value)} placeholder="正在做什么？(可选)" className="h-8 text-xs flex-1" />
      </div>

      {/* Timer Card */}
      <Card className={cn("p-6 mb-3 relative", config.bgClass)}>
        <svg className="absolute w-56 h-56 -rotate-90 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <circle cx="112" cy="112" r="96" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/15" />
          <circle cx="112" cy="112" r="96" fill="none" stroke="url(#pg)" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 96} strokeDashoffset={2 * Math.PI * 96 * (1 - progress / 100)} className="transition-all duration-1000" />
          <defs><linearGradient id="pg" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#8b5cf6" /><stop offset="100%" stopColor="#a855f7" /></linearGradient></defs>
        </svg>
        <div className="text-center relative z-10">
          <div className="text-5xl font-bold font-mono tracking-tight">{formatTime(timeLeft)}</div>
          <div className="mt-1.5 text-xs text-muted-foreground flex items-center justify-center gap-1.5"><Icon className="h-3.5 w-3.5" />{config.label}</div>
          {taskLabel && <p className="text-[10px] text-muted-foreground mt-1 truncate">📋 {taskLabel}</p>}
        </div>
      </Card>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 mb-3">
        <Button variant="outline" size="icon" onClick={handleReset} className="h-10 w-10"><RotateCcw className="h-4 w-4" /></Button>
        <Button onClick={isRunning ? handlePause : handleStart} className={cn("h-12 w-12 rounded-full shadow-lg bg-gradient-to-br", config.color)}>
          {isRunning ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
        </Button>
        <Button variant="outline" size="icon" onClick={() => setSoundEnabled(!soundEnabled)} className={cn("h-10 w-10", !soundEnabled && "opacity-50")}>
          {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </Button>
      </div>
      <p className="text-center text-[9px] text-muted-foreground mb-3">按空格键 开始/暂停</p>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-muted/30 rounded-lg border mb-3">
        <div className="rounded-md bg-card p-2"><div className="text-[9px] text-muted-foreground">今日</div><div className="text-sm font-bold text-primary">{todayCount}</div></div>
        <div className="rounded-md bg-card p-2"><div className="text-[9px] text-muted-foreground">总计</div><div className="text-sm font-bold">{sessions}</div></div>
        <div className="rounded-md bg-card p-2">
          <div className="flex items-center gap-0.5 text-[9px] text-muted-foreground"><Flame className="h-2.5 w-2.5 text-orange-500" />连续</div>
          <div className="text-sm font-bold text-orange-500">{streak.days}天</div>
        </div>
        <div className="rounded-md bg-card p-2"><div className="text-[9px] text-muted-foreground">专注</div><div className="text-sm font-bold text-emerald-600">{totalFocusMin}分</div></div>
      </div>

      {/* Today's timeline */}
      {focusHistory.filter(h => {
        const hd = new Date(h.completedAt).toISOString().slice(0, 10);
        return hd === getTodayKey();
      }).length > 0 && (
        <Card className="p-3 mb-3">
          <div className="text-xs font-medium mb-2 flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" />今日完成</div>
          <div className="space-y-1">
            {focusHistory.filter(h => new Date(h.completedAt).toISOString().slice(0, 10) === getTodayKey()).map(h => (
              <div key={h.id} className="flex items-center justify-between text-[10px] bg-muted/30 rounded px-2 py-1">
                <span>{h.taskLabel || "专注"}</span>
                <span className="text-muted-foreground">{new Date(h.completedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* History */}
      {focusHistory.length > 0 && (
        <Card className="p-3">
          <div className="text-xs font-medium mb-2 flex items-center gap-1.5"><ListChecks className="h-3 w-3 text-muted-foreground" />最近专注</div>
          <div className="space-y-1 max-h-[200px] overflow-auto">
            {focusHistory.slice(-10).reverse().map(h => (
              <div key={h.id} className="flex items-center justify-between text-[10px] bg-muted/30 rounded px-2 py-1">
                <div className="flex items-center gap-1.5">
                  <Clock3 className="h-2.5 w-2.5 text-muted-foreground" />
                  <span className="truncate max-w-[140px]">{h.taskLabel || "专注"}</span>
                </div>
                <span className="text-muted-foreground">{h.duration}分 · {new Date(h.completedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
