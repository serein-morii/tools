import { useState, useEffect, useCallback } from "react";
import { Play, Pause, RotateCcw, Coffee, Focus, Settings2, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type TimerMode = "focus" | "shortBreak" | "longBreak";

const TIMER_PRESETS = {
  focus: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
};

export function PomodoroTimerPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<TimerMode>("focus");
  const [timeLeft, setTimeLeft] = useState(TIMER_PRESETS.focus);
  const [isRunning, setIsRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const totalTime = TIMER_PRESETS[mode];
  const progress = ((totalTime - timeLeft) / totalTime) * 100;

  const playNotificationSound = useCallback(() => {
    if (!soundEnabled) return;
    // Create a simple beep sound using Web Audio API
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = "sine";
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {
      console.log("Audio not available");
    }
  }, [soundEnabled]);

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          playNotificationSound();

          // Auto switch mode
          if (mode === "focus") {
            setSessions((s) => s + 1);
            // Every 4 sessions, take a long break
            if ((sessions + 1) % 4 === 0) {
              setMode("longBreak");
              return TIMER_PRESETS.longBreak;
            } else {
              setMode("shortBreak");
              return TIMER_PRESETS.shortBreak;
            }
          } else {
            setMode("focus");
            return TIMER_PRESETS.focus;
          }
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, mode, sessions, playNotificationSound]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleStart = () => setIsRunning(true);
  const handlePause = () => setIsRunning(false);

  const handleReset = () => {
    setIsRunning(false);
    setTimeLeft(TIMER_PRESETS[mode]);
  };

  const handleModeChange = (newMode: TimerMode) => {
    setIsRunning(false);
    setMode(newMode);
    setTimeLeft(TIMER_PRESETS[newMode]);
  };

  const modeConfig = {
    focus: {
      label: t("timer.focus"),
      icon: Focus,
      color: "from-violet-500 to-purple-600",
      bgClass: "bg-violet-50 dark:bg-violet-950/30",
    },
    shortBreak: {
      label: t("timer.shortBreak"),
      icon: Coffee,
      color: "from-green-500 to-emerald-600",
      bgClass: "bg-green-50 dark:bg-green-950/30",
    },
    longBreak: {
      label: t("timer.longBreak"),
      icon: Coffee,
      color: "from-blue-500 to-cyan-600",
      bgClass: "bg-blue-50 dark:bg-blue-950/30",
    },
  };

  const currentConfig = modeConfig[mode];
  const Icon = currentConfig.icon;

  return (
    <div className="p-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br shadow-md", currentConfig.color)}>
          <Timer className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">{t("nav.timer")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("timer.description")}
          </p>
        </div>
      </div>

      {/* Mode Tabs */}
      <div className="flex gap-2 mb-6">
        {(Object.keys(modeConfig) as TimerMode[]).map((m) => (
          <Button
            key={m}
            variant={mode === m ? "default" : "outline"}
            size="sm"
            onClick={() => handleModeChange(m)}
            className="flex-1"
          >
            {modeConfig[m].label}
          </Button>
        ))}
      </div>

      {/* Timer Display */}
      <Card className={cn("p-8 mb-6", currentConfig.bgClass)}>
        <div className="relative flex items-center justify-center">
          {/* Progress Ring */}
          <svg className="absolute w-64 h-64 -rotate-90">
            <circle
              cx="128"
              cy="128"
              r="110"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-muted/20"
            />
            <circle
              cx="128"
              cy="128"
              r="110"
              fill="none"
              stroke="url(#gradient)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 110}
              strokeDashoffset={2 * Math.PI * 110 * (1 - progress / 100)}
              className="transition-all duration-1000"
            />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--gradient-start, #8b5cf6)" />
                <stop offset="100%" stopColor="var(--gradient-end, #a855f7)" />
              </linearGradient>
            </defs>
          </svg>

          {/* Time */}
          <div className="text-center z-10">
            <div className="text-6xl font-bold font-mono tracking-tight">
              {formatTime(timeLeft)}
            </div>
            <div className="mt-2 text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Icon className="h-4 w-4" />
              {currentConfig.label}
            </div>
          </div>
        </div>
      </Card>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 mb-6">
        <Button
          variant="outline"
          size="icon"
          onClick={handleReset}
          className="h-12 w-12"
        >
          <RotateCcw className="h-5 w-5" />
        </Button>

        <Button
          onClick={isRunning ? handlePause : handleStart}
          className={cn("h-14 w-14 rounded-full shadow-lg", "bg-gradient-to-br", currentConfig.color)}
        >
          {isRunning ? (
            <Pause className="h-6 w-6" />
          ) : (
            <Play className="h-6 w-6 ml-1" />
          )}
        </Button>

        <Button
          variant="outline"
          size="icon"
          onClick={() => setSoundEnabled(!soundEnabled)}
          className={cn("h-12 w-12", !soundEnabled && "opacity-50")}
        >
          {soundEnabled ? (
            <Volume2 className="h-5 w-5" />
          ) : (
            <VolumeX className="h-5 w-5" />
          )}
        </Button>
      </div>

      {/* Stats */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">{t("timer.sessions")}</div>
            <div className="text-2xl font-bold">{sessions}</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">{t("timer.totalTime")}</div>
            <div className="text-2xl font-bold">{sessions * 25} {t("timer.minutes")}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}