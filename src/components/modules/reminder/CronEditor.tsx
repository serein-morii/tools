import { useState, useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Clock, Repeat, Settings2, CalendarClock } from "lucide-react";
import type { CronConfig } from "@/types";
import {
  cronConfigToExpression,
  formatCronDescription,
  getNextOccurrences,
  validateCronConfig,
} from "@/lib/cron";
import { useTranslation } from "react-i18next";

interface CronEditorProps {
  value: string;
  onChange: (cronExpr: string, cronConfig: string) => void;
}

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
  const { t } = useTranslation();

  const WEEKDAY_LABELS = [
    t("cron.weekdayMon"),
    t("cron.weekdayTue"),
    t("cron.weekdayWed"),
    t("cron.weekdayThu"),
    t("cron.weekdayFri"),
    t("cron.weekdaySat"),
    t("cron.weekdaySun"),
  ];

  const MONTH_LABELS = [
    t("cron.monthJan"),
    t("cron.monthFeb"),
    t("cron.monthMar"),
    t("cron.monthApr"),
    t("cron.monthMay"),
    t("cron.monthJun"),
    t("cron.monthJul"),
    t("cron.monthAug"),
    t("cron.monthSep"),
    t("cron.monthOct"),
    t("cron.monthNov"),
    t("cron.monthDec"),
  ];

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
            {t("cron.standard")}
          </TabsTrigger>
          <TabsTrigger value="special" className="flex items-center gap-1">
            <Repeat className="h-3 w-3" />
            {t("cron.special")}
          </TabsTrigger>
          <TabsTrigger value="advanced" className="flex items-center gap-1">
            <Settings2 className="h-3 w-3" />
            {t("cron.advanced")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="standard" className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>{t("cron.frequency")}</Label>
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
              <option value="daily">{t("cron.daily")}</option>
              <option value="weekly">{t("cron.weekly")}</option>
              <option value="monthly">{t("cron.monthly")}</option>
              <option value="yearly">{t("cron.yearly")}</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("cron.time")}</Label>
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
              <Label>{t("cron.weekday")}</Label>
              <Select
                value={config.standard?.dayOfWeek?.toString() || "1"}
                onChange={(e) => updateConfig({
                  ...config,
                  standard: { ...config.standard!, dayOfWeek: parseInt(e.target.value) },
                })}
              >
                {WEEKDAY_LABELS.map((label, idx) => (
                  <option key={idx} value={idx + 1}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {config.standard?.frequency === "monthly" && (
            <div className="space-y-2">
              <Label>{t("cron.dayOfMonth")}</Label>
              <Select
                value={config.standard?.dayOfMonth?.toString() || "1"}
                onChange={(e) => updateConfig({
                  ...config,
                  standard: { ...config.standard!, dayOfMonth: parseInt(e.target.value) },
                })}
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>
                    {day} {t("cron.day")}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {config.standard?.frequency === "yearly" && (
            <>
              <div className="space-y-2">
                <Label>{t("cron.month")}</Label>
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
                <Label>{t("cron.dayOfMonth")}</Label>
                <Select
                  value={config.standard?.dayOfMonth?.toString() || "1"}
                  onChange={(e) => updateConfig({
                    ...config,
                    standard: { ...config.standard!, dayOfMonth: parseInt(e.target.value) },
                  })}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={day}>
                      {day} {t("cron.day")}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="special" className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>{t("cron.type")}</Label>
            <Select
              value={config.special?.type || "interval"}
              onChange={(e) => {
                const type = e.target.value as "nth_weekday" | "last_day" | "offset" | "interval";
                updateConfig({
                  ...config,
                  special: { ...config.special!, type, time: config.special?.time || "09:00" },
                });
              }}
            >
              <option value="interval">{t("cron.intervalRepeat")}</option>
              <option value="nth_weekday">{t("cron.nthWeekday")}</option>
              <option value="last_day">{t("cron.lastDayOfMonth")}</option>
            </Select>
          </div>

          {/* 时间设置 - 对 nth_weekday 和 last_day 都需要 */}
          {(config.special?.type === "nth_weekday" || config.special?.type === "last_day") && (
            <div className="space-y-2">
              <Label>{t("cron.time")}</Label>
              <Input
                type="time"
                value={config.special?.time || "09:00"}
                onChange={(e) => updateConfig({
                  ...config,
                  special: { ...config.special!, time: e.target.value },
                })}
              />
            </div>
          )}

          {config.special?.type === "interval" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("cron.intervalValue")}</Label>
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
                  <Label>{t("cron.unit")}</Label>
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
                    <option value="minutes">{t("cron.minutes")}</option>
                    <option value="hours">{t("cron.hours")}</option>
                    <option value="days">{t("cron.days")}</option>
                    <option value="weeks">{t("cron.weeks")}</option>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("cron.startTime")}</Label>
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
                  <Label>{t("cron.nthLabel")}</Label>
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
                    <option value="1">{t("cron.nth1")}</option>
                    <option value="2">{t("cron.nth2")}</option>
                    <option value="3">{t("cron.nth3")}</option>
                    <option value="4">{t("cron.nth4")}</option>
                    <option value="5">{t("cron.nth5")}</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("cron.weekday")}</Label>
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
                      <option key={idx} value={idx + 1}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("cron.monthOptional")}</Label>
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
                  <option value="">{t("cron.everyMonth")}</option>
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
                <Label>{t("cron.type")}</Label>
                <Select
                  value={config.special?.lastDay?.type || "last_nth"}
                  onChange={(e) => updateConfig({
                    ...config,
                    special: {
                      ...config.special!,
                      type: "last_day",
                      lastDay: {
                        type: e.target.value as "last_nth" | "last_workday" | "last_friday",
                        nth: config.special?.lastDay?.nth ?? 1,
                        month: config.special?.lastDay?.month ?? 0,
                      },
                    },
                  })}
                >
                  <option value="last_nth">{t("cron.lastNthDay")}</option>
                  <option value="last_workday">{t("cron.lastWorkday")}</option>
                  <option value="last_friday">{t("cron.lastFriday")}</option>
                </Select>
              </div>

              {config.special?.lastDay?.type === "last_nth" && (
                <div className="space-y-2">
                  <Label>{t("cron.lastNthLabel")}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={config.special?.lastDay?.nth ?? 1}
                    onChange={(e) => updateConfig({
                      ...config,
                      special: {
                        ...config.special!,
                        type: "last_day",
                        lastDay: {
                          type: "last_nth",
                          nth: parseInt(e.target.value) || 1,
                          month: config.special?.lastDay?.month ?? 0,
                        },
                      },
                    })}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("cron.lastNthHint")}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>{t("cron.monthOptional")}</Label>
                <Select
                  value={config.special?.lastDay?.month?.toString() || ""}
                  onChange={(e) => updateConfig({
                    ...config,
                    special: {
                      ...config.special!,
                      type: "last_day",
                      lastDay: {
                        type: config.special?.lastDay?.type || "last_nth",
                        nth: config.special?.lastDay?.nth ?? 1,
                        month: e.target.value ? parseInt(e.target.value) : 0,
                      },
                    },
                  })}
                >
                  <option value="">{t("cron.everyMonth")}</option>
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
            <Label>{t("cron.cronExpression")}</Label>
            <Input
              value={config.advanced?.expression || "0 9 * * *"}
              onChange={(e) => updateConfig({
                ...config,
                advanced: { expression: e.target.value },
              })}
              placeholder="0 9 * * *"
            />
            <div className="text-xs text-muted-foreground space-y-1">
              <p>{t("cron.cronHint")}</p>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <span className="font-medium">{t("cron.examples")}:</span>
                <span></span>
                <span>0 9 * * *</span>
                <span>{t("cron.example1")}</span>
                <span>30 9 * * *</span>
                <span>{t("cron.example2")}</span>
                <span>0 9 * * 1</span>
                <span>{t("cron.example3")}</span>
                <span>0 9 1 * *</span>
                <span>{t("cron.example4")}</span>
                <span>0 9,18 * * *</span>
                <span>{t("cron.example5")}</span>
                <span>*/15 * * * *</span>
                <span>{t("cron.example6")}</span>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="space-y-2 pt-2 border-t">
        <Label>{t("cron.endCondition")}</Label>
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
            <option value="never">{t("cron.neverEnd")}</option>
            <option value="after_occurrences">{t("cron.afterOccurrences")}</option>
            <option value="until_date">{t("cron.untilDate")}</option>
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
              placeholder={t("cron.occurrences")}
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
        {t("cron.currentConfig")}: {formatCronDescription(config)}
      </div>

      <NextOccurrencesPreview config={config} />
    </div>
  );
}

function NextOccurrencesPreview({ config }: { config: CronConfig }) {
  const { t } = useTranslation();

  const occurrences = useMemo(() => getNextOccurrences(config, 5), [config]);

  if (occurrences.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <CalendarClock className="h-3.5 w-3.5" />
        {t("cron.nextRuns")}
      </div>
      <div className="grid gap-1">
        {occurrences.map((date, i) => (
          <div key={i} className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="text-foreground font-mono">{i + 1}.</span>
            <span>
              {date.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                weekday: "short",
              })}
            </span>
            <span className="font-mono">
              {date.toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}