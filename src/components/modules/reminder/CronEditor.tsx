import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Clock, Repeat, Settings2 } from "lucide-react";
import type { CronConfig } from "@/types";
import {
  cronConfigToExpression,
  formatCronDescription,
  validateCronConfig,
} from "@/lib/cron";

interface CronEditorProps {
  value: string;
  onChange: (cronExpr: string, cronConfig: string) => void;
}

const WEEKDAY_LABELS = [
  "周一",
  "周二",
  "周三",
  "周四",
  "周五",
  "周六",
  "周日",
];

const MONTH_LABELS = [
  "一月",
  "二月",
  "三月",
  "四月",
  "五月",
  "六月",
  "七月",
  "八月",
  "九月",
  "十月",
  "十一月",
  "十二月",
];

function parseCronConfig(configStr: string): CronConfig {
  try {
    return JSON.parse(configStr);
  } catch {
    return {
      mode: "standard",
      standard: { frequency: "daily", time: "09:00" },
      endCondition: { type: "never" },
    };
  }
}

export function CronEditor({ value, onChange }: CronEditorProps) {
  const [config, setConfig] = useState<CronConfig>(parseCronConfig(value));
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    setConfig(parseCronConfig(value));
  }, [value]);

  const updateConfig = (newConfig: CronConfig) => {
    setConfig(newConfig);

    const validation = validateCronConfig(newConfig);
    setErrors(validation.errors);

    if (validation.valid) {
      const expr = cronConfigToExpression(newConfig);
      onChange(expr, JSON.stringify(newConfig));
    }
  };

  return (
    <div className="space-y-4">
      <Tabs value={config.mode} onValueChange={(v) => updateConfig({ ...config, mode: v as CronConfig["mode"] })}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="standard" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            标准
          </TabsTrigger>
          <TabsTrigger value="special" className="flex items-center gap-1">
            <Repeat className="h-3 w-3" />
            特殊
          </TabsTrigger>
          <TabsTrigger value="advanced" className="flex items-center gap-1">
            <Settings2 className="h-3 w-3" />
            高级
          </TabsTrigger>
        </TabsList>

        <TabsContent value="standard" className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>频率</Label>
            <Select
              value={config.standard?.frequency || "daily"}
              onChange={(e) => {
                const freq = e.target.value as "daily" | "weekly" | "monthly" | "yearly";
                updateConfig({
                  ...config,
                  standard: { ...config.standard!, frequency: freq },
                });
              }}
            >
              <option value="daily">每天</option>
              <option value="weekly">每周</option>
              <option value="monthly">每月</option>
              <option value="yearly">每年</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>时间</Label>
            <Input
              type="time"
              value={config.standard?.time || "09:00"}
              onChange={(e) => updateConfig({
                ...config,
                standard: { ...config.standard!, time: e.target.value },
              })}
            />
          </div>

          {config.standard?.frequency === "weekly" && (
            <div className="space-y-2">
              <Label>星期</Label>
              <Select
                value={config.standard?.dayOfWeek?.toString() || "1"}
                onChange={(e) => updateConfig({
                  ...config,
                  standard: { ...config.standard!, dayOfWeek: parseInt(e.target.value) },
                })}
              >
                {WEEKDAY_LABELS.map((label, idx) => (
                  <option key={idx} value={idx}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {config.standard?.frequency === "monthly" && (
            <div className="space-y-2">
              <Label>日期</Label>
              <Select
                value={config.standard?.dayOfMonth?.toString() || "1"}
                onChange={(e) => updateConfig({
                  ...config,
                  standard: { ...config.standard!, dayOfMonth: parseInt(e.target.value) },
                })}
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>
                    {day} 日
                  </option>
                ))}
              </Select>
            </div>
          )}

          {config.standard?.frequency === "yearly" && (
            <>
              <div className="space-y-2">
                <Label>月份</Label>
                <Select
                  value={config.standard?.month?.toString() || "1"}
                  onChange={(e) => updateConfig({
                    ...config,
                    standard: { ...config.standard!, month: parseInt(e.target.value) },
                  })}
                >
                  {MONTH_LABELS.map((label, idx) => (
                    <option key={idx} value={idx + 1}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>日期</Label>
                <Select
                  value={config.standard?.dayOfMonth?.toString() || "1"}
                  onChange={(e) => updateConfig({
                    ...config,
                    standard: { ...config.standard!, dayOfMonth: parseInt(e.target.value) },
                  })}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={day}>
                      {day} 日
                    </option>
                  ))}
                </Select>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="special" className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>类型</Label>
            <Select
              value={config.special?.type || "interval"}
              onChange={(e) => {
                const type = e.target.value as "nth_weekday" | "last_day" | "offset" | "interval";
                updateConfig({
                  ...config,
                  special: { ...config.special!, type },
                });
              }}
            >
              <option value="interval">间隔重复</option>
              <option value="nth_weekday">第 N 个星期几</option>
              <option value="last_day">月末特定日期</option>
            </Select>
          </div>

          {config.special?.type === "interval" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>间隔值</Label>
                  <Input
                    type="number"
                    min={1}
                    value={config.special?.interval?.value || 1}
                    onChange={(e) => updateConfig({
                      ...config,
                      special: {
                        ...config.special!,
                        type: "interval",
                        interval: {
                          unit: config.special?.interval?.unit || "hours",
                          startTime: config.special?.interval?.startTime || "09:00",
                          value: parseInt(e.target.value) || 1,
                        },
                      },
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>单位</Label>
                  <Select
                    value={config.special?.interval?.unit || "hours"}
                    onChange={(e) => updateConfig({
                      ...config,
                      special: {
                        ...config.special!,
                        type: "interval",
                        interval: {
                          unit: e.target.value as "minutes" | "hours" | "days" | "weeks",
                          startTime: config.special?.interval?.startTime || "09:00",
                          value: config.special?.interval?.value || 1,
                        },
                      },
                    })}
                  >
                    <option value="minutes">分钟</option>
                    <option value="hours">小时</option>
                    <option value="days">天</option>
                    <option value="weeks">周</option>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>起始时间</Label>
                <Input
                  type="time"
                  value={config.special?.interval?.startTime || "09:00"}
                  onChange={(e) => updateConfig({
                    ...config,
                    special: {
                      ...config.special!,
                      type: "interval",
                      interval: {
                        unit: config.special?.interval?.unit || "hours",
                        startTime: e.target.value,
                        value: config.special?.interval?.value || 1,
                      },
                    },
                  })}
                />
              </div>
            </>
          )}

          {config.special?.type === "nth_weekday" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>第几个</Label>
                  <Select
                    value={config.special?.nthWeekday?.nth?.toString() || "1"}
                    onChange={(e) => updateConfig({
                      ...config,
                      special: {
                        ...config.special!,
                        type: "nth_weekday",
                        nthWeekday: {
                          nth: parseInt(e.target.value),
                          weekday: config.special?.nthWeekday?.weekday ?? 1,
                          month: config.special?.nthWeekday?.month ?? 0,
                        },
                      },
                    })}
                  >
                    <option value="1">第 1 个</option>
                    <option value="2">第 2 个</option>
                    <option value="3">第 3 个</option>
                    <option value="4">第 4 个</option>
                    <option value="5">第 5 个</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>星期几</Label>
                  <Select
                    value={config.special?.nthWeekday?.weekday?.toString() || "1"}
                    onChange={(e) => updateConfig({
                      ...config,
                      special: {
                        ...config.special!,
                        type: "nth_weekday",
                        nthWeekday: {
                          nth: config.special?.nthWeekday?.nth ?? 1,
                          weekday: parseInt(e.target.value),
                          month: config.special?.nthWeekday?.month ?? 0,
                        },
                      },
                    })}
                  >
                    {WEEKDAY_LABELS.map((label, idx) => (
                      <option key={idx} value={idx}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>月份 (可选，不选则每月)</Label>
                <Select
                  value={config.special?.nthWeekday?.month?.toString() || ""}
                  onChange={(e) => updateConfig({
                    ...config,
                    special: {
                      ...config.special!,
                      type: "nth_weekday",
                      nthWeekday: {
                        nth: config.special?.nthWeekday?.nth ?? 1,
                        weekday: config.special?.nthWeekday?.weekday ?? 1,
                        month: e.target.value ? parseInt(e.target.value) : 0,
                      },
                    },
                  })}
                >
                  <option value="">每月</option>
                  {MONTH_LABELS.map((label, idx) => (
                    <option key={idx} value={idx + 1}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          )}

          {config.special?.type === "last_day" && (
            <>
              <div className="space-y-2">
                <Label>类型</Label>
                <Select
                  value={config.special?.lastDay?.type || "day"}
                  onChange={(e) => updateConfig({
                    ...config,
                    special: {
                      ...config.special!,
                      type: "last_day",
                      lastDay: {
                        type: e.target.value as "day" | "weekday" | "friday",
                        month: config.special?.lastDay?.month ?? 0,
                      },
                    },
                  })}
                >
                  <option value="day">月末最后一天</option>
                  <option value="weekday">月末最后一个工作日</option>
                  <option value="friday">月末最后一个周五</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>月份 (可选，不选则每月)</Label>
                <Select
                  value={config.special?.lastDay?.month?.toString() || ""}
                  onChange={(e) => updateConfig({
                    ...config,
                    special: {
                      ...config.special!,
                      type: "last_day",
                      lastDay: {
                        type: config.special?.lastDay?.type || "day",
                        month: e.target.value ? parseInt(e.target.value) : 0,
                      },
                    },
                  })}
                >
                  <option value="">每月</option>
                  {MONTH_LABELS.map((label, idx) => (
                    <option key={idx} value={idx + 1}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Cron 表达式</Label>
            <Input
              value={config.advanced?.expression || "0 9 * * *"}
              onChange={(e) => updateConfig({
                ...config,
                advanced: { expression: e.target.value },
              })}
              placeholder="0 9 * * *"
            />
            <p className="text-xs text-muted-foreground">
              格式: 分 时 日 月 周 (例如: 0 9 * * * 表示每天9:00)
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <div className="space-y-2 pt-2 border-t">
        <Label>结束条件</Label>
        <div className="grid grid-cols-2 gap-4">
          <Select
            value={config.endCondition?.type || "never"}
            onChange={(e) => updateConfig({
              ...config,
              endCondition: {
                ...config.endCondition!,
                type: e.target.value as "never" | "after_occurrences" | "until_date",
              },
            })}
          >
            <option value="never">永不结束</option>
            <option value="after_occurrences">执行 N 次后</option>
            <option value="until_date">指定日期后</option>
          </Select>

          {config.endCondition?.type === "after_occurrences" && (
            <Input
              type="number"
              min={1}
              value={config.endCondition?.occurrences || 10}
              onChange={(e) => updateConfig({
                ...config,
                endCondition: {
                  ...config.endCondition!,
                  type: "after_occurrences",
                  occurrences: parseInt(e.target.value) || 10,
                },
              })}
              placeholder="次数"
            />
          )}

          {config.endCondition?.type === "until_date" && (
            <Input
              type="date"
              value={config.endCondition?.untilDate || ""}
              onChange={(e) => updateConfig({
                ...config,
                endCondition: {
                  ...config.endCondition!,
                  type: "until_date",
                  untilDate: e.target.value,
                },
              })}
            />
          )}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="text-sm text-destructive">
          {errors.map((err, idx) => (
            <p key={idx}>{err}</p>
          ))}
        </div>
      )}

      <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
        当前配置: {formatCronDescription(config)}
      </div>
    </div>
  );
}