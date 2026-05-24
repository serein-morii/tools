import type { CreateTaskRequest, CronConfig } from "@/types";

export function cronConfigToExpression(config: CronConfig): string {
  if (config.mode === "advanced" && config.advanced?.expression) {
    return config.advanced.expression;
  }

  if (config.mode === "standard" && config.standard) {
    const { frequency, time, dayOfWeek, dayOfMonth, month } = config.standard;
    const [hour, minute] = time.split(":").map(Number);

    switch (frequency) {
      case "daily":
        return `${minute} ${hour} * * *`;
      case "weekly":
        return `${minute} ${hour} * * ${dayOfWeek}`;
      case "monthly":
        return `${minute} ${hour} ${dayOfMonth} * *`;
      case "yearly":
        return `${minute} ${hour} ${dayOfMonth} ${month} *`;
    }
  }

  if (config.mode === "special" && config.special) {
    const { type, interval } = config.special;

    switch (type) {
      case "nth_weekday":
        // Standard cron doesn't support nth weekday well, fallback to daily
        return "0 9 * * *";
      case "last_day":
        // Standard cron doesn't support last day, fallback to daily
        return "0 9 * * *";
      case "offset":
        return "0 9 * * *";
      case "interval":
        if (interval) {
          const [hour, minute] = interval.startTime.split(":").map(Number);
          switch (interval.unit) {
            case "minutes":
              return `*/${interval.value} * * * *`;
            case "hours":
              return `${minute} */${interval.value} * * *`;
            case "days":
              return `${minute} ${hour} */${interval.value} * *`;
            case "weeks":
              // Run on the same day each week
              return `${minute} ${hour} * * 0`;
          }
        }
        break;
    }
  }

  return "0 0 * * *";
}

export function getNextOccurrences(
  config: CronConfig,
  _count: number = 5
): Date[] {
  const expression = cronConfigToExpression(config);
  console.log("Cron expression:", expression);
  return [];
}

export function validateCronConfig(config: CronConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (config.mode === "standard" && config.standard) {
    if (!config.standard.time) {
      errors.push("时间不能为空");
    }
    if (config.standard.frequency === "weekly" && config.standard.dayOfWeek === undefined) {
      errors.push("请选择星期几");
    }
    if (config.standard.frequency === "monthly" && config.standard.dayOfMonth === undefined) {
      errors.push("请选择日期");
    }
  }

  if (config.mode === "advanced" && config.advanced) {
    if (!config.advanced.expression) {
      errors.push("Cron 表达式不能为空");
    }
  }

  if (config.mode === "special" && config.special) {
    switch (config.special.type) {
      case "nth_weekday":
        if (!config.special.nthWeekday) {
          errors.push("请配置第 N 个星期几");
        }
        break;
      case "interval":
        if (!config.special.interval) {
          errors.push("请配置间隔时间");
        }
        break;
    }
  }

  return { valid: errors.length === 0, errors };
}

export function formatCronDescription(config: CronConfig, t?: (key: string) => string): string {
  const endConditionStr = formatEndCondition(config, t);

  if (config.mode === "standard" && config.standard) {
    const { frequency, time, dayOfWeek, dayOfMonth, month } = config.standard;
    const timeStr = time;

    let desc = "";
    switch (frequency) {
      case "daily":
        desc = t ? `${t("cron.daily")} ${timeStr}` : `每天 ${timeStr}`;
        break;
      case "weekly":
        if (t) {
          const weekdays = [t("cron.weekdaySun"), t("cron.weekdayMon"), t("cron.weekdayTue"), t("cron.weekdayWed"), t("cron.weekdayThu"), t("cron.weekdayFri"), t("cron.weekdaySat")];
          desc = `${t("cron.weekly")}${weekdays[dayOfWeek ?? 0]} ${timeStr}`;
        } else {
          const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
          desc = `每${weekdays[dayOfWeek ?? 0]} ${timeStr}`;
        }
        break;
      case "monthly":
        desc = t ? `${t("cron.monthly")} ${dayOfMonth} ${t("cron.day")} ${timeStr}` : `每月 ${dayOfMonth} 日 ${timeStr}`;
        break;
      case "yearly":
        if (t) {
          const months = [t("cron.monthJan"), t("cron.monthFeb"), t("cron.monthMar"), t("cron.monthApr"), t("cron.monthMay"), t("cron.monthJun"), t("cron.monthJul"), t("cron.monthAug"), t("cron.monthSep"), t("cron.monthOct"), t("cron.monthNov"), t("cron.monthDec")];
          desc = `${t("cron.yearly")}${months[month ?? 0]} ${dayOfMonth} ${t("cron.day")} ${timeStr}`;
        } else {
          const months = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
          desc = `每年${months[month ?? 0]} ${dayOfMonth} 日 ${timeStr}`;
        }
        break;
    }
    return endConditionStr ? `${desc}，${endConditionStr}` : desc;
  }

  if (config.mode === "special" && config.special) {
    const { type, interval, nthWeekday, lastDay } = config.special;

    let desc = "";
    switch (type) {
      case "interval":
        if (interval) {
          const unitName = t ? t(`cron.${interval.unit}`) : { minutes: "分钟", hours: "小时", days: "天", weeks: "周" }[interval.unit];
          desc = t
            ? `${t("cron.every")} ${interval.value} ${unitName}，${t("cron.startTime")} ${interval.startTime}`
            : `每 ${interval.value} ${unitName}，从 ${interval.startTime} 开始`;
        }
        break;

      case "nth_weekday":
        if (nthWeekday) {
          const nthName = t ? [t("cron.everyMonth"), t("cron.nth1"), t("cron.nth2"), t("cron.nth3"), t("cron.nth4"), t("cron.nth5")][nthWeekday.nth] : ["", "第 1 个", "第 2 个", "第 3 个", "第 4 个", "第 5 个"][nthWeekday.nth];
          const weekdayName = t
            ? [t("cron.weekdayMon"), t("cron.weekdayTue"), t("cron.weekdayWed"), t("cron.weekdayThu"), t("cron.weekdayFri"), t("cron.weekdaySat"), t("cron.weekdaySun")][nthWeekday.weekday]
            : ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][nthWeekday.weekday];

          if (nthWeekday.month && nthWeekday.month > 0) {
            const monthName = t
              ? [t("cron.monthJan"), t("cron.monthFeb"), t("cron.monthMar"), t("cron.monthApr"), t("cron.monthMay"), t("cron.monthJun"), t("cron.monthJul"), t("cron.monthAug"), t("cron.monthSep"), t("cron.monthOct"), t("cron.monthNov"), t("cron.monthDec")][nthWeekday.month - 1]
              : ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"][nthWeekday.month - 1];
            desc = t ? `${t("cron.yearly")}${monthName}${nthName}${weekdayName}` : `每年${monthName}${nthName}${weekdayName}`;
          } else {
            desc = t ? `${t("cron.monthly")}${nthName}${weekdayName}` : `每月${nthName}${weekdayName}`;
          }
        }
        break;

      case "last_day":
        if (lastDay) {
          if (lastDay.type === "last_nth" && lastDay.nth) {
            if (t) {
              const nthStr = `${t("cron.lastNthLabel").replace("N", String(lastDay.nth))}`;
              if (lastDay.month && lastDay.month > 0) {
                const monthName = [t("cron.monthJan"), t("cron.monthFeb"), t("cron.monthMar"), t("cron.monthApr"), t("cron.monthMay"), t("cron.monthJun"), t("cron.monthJul"), t("cron.monthAug"), t("cron.monthSep"), t("cron.monthOct"), t("cron.monthNov"), t("cron.monthDec")][lastDay.month - 1];
                desc = `${t("cron.yearly")}${monthName}${nthStr}`;
              } else {
                desc = `${t("cron.monthly")}${nthStr}`;
              }
            } else {
              const nthStr = `倒数第${lastDay.nth}天`;
              if (lastDay.month && lastDay.month > 0) {
                const months = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
                desc = `每年${months[lastDay.month - 1]}${nthStr}`;
              } else {
                desc = `每月${nthStr}`;
              }
            }
          } else if (lastDay.type === "last_workday") {
            const typeName = t ? t("cron.lastWorkday") : "最后一个工作日";
            if (lastDay.month && lastDay.month > 0) {
              const monthName = t
                ? [t("cron.monthJan"), t("cron.monthFeb"), t("cron.monthMar"), t("cron.monthApr"), t("cron.monthMay"), t("cron.monthJun"), t("cron.monthJul"), t("cron.monthAug"), t("cron.monthSep"), t("cron.monthOct"), t("cron.monthNov"), t("cron.monthDec")][lastDay.month - 1]
                : ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"][lastDay.month - 1];
              desc = t ? `${t("cron.yearly")}${monthName}${typeName}` : `每年${monthName}${typeName}`;
            } else {
              desc = t ? `${t("cron.monthly")}${typeName}` : `每月${typeName}`;
            }
          } else if (lastDay.type === "last_friday") {
            const typeName = t ? t("cron.lastFriday") : "最后一个周五";
            if (lastDay.month && lastDay.month > 0) {
              const monthName = t
                ? [t("cron.monthJan"), t("cron.monthFeb"), t("cron.monthMar"), t("cron.monthApr"), t("cron.monthMay"), t("cron.monthJun"), t("cron.monthJul"), t("cron.monthAug"), t("cron.monthSep"), t("cron.monthOct"), t("cron.monthNov"), t("cron.monthDec")][lastDay.month - 1]
                : ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"][lastDay.month - 1];
              desc = t ? `${t("cron.yearly")}${monthName}${typeName}` : `每年${monthName}${typeName}`;
            } else {
              desc = t ? `${t("cron.monthly")}${typeName}` : `每月${typeName}`;
            }
          } else {
            const typeName = t ? t("cron.lastDayOfMonth") : "最后一天";
            desc = t ? `${t("cron.monthly")}${typeName}` : `每月${typeName}`;
          }
        }
        break;

      case "offset":
        desc = t ? t("cron.special") : "自定义偏移日期";
        break;
    }

    return endConditionStr ? `${desc}，${endConditionStr}` : desc;
  }

  if (config.mode === "advanced" && config.advanced) {
    return t
      ? `${t("cron.advanced")}: ${config.advanced.expression}${endConditionStr ? `，${endConditionStr}` : ""}`
      : `高级: ${config.advanced.expression}${endConditionStr ? `，${endConditionStr}` : ""}`;
  }

  return t ? t("cron.special") : "自定义时间";
}

function formatEndCondition(config: CronConfig, t?: (key: string) => string): string {
  if (!config.endCondition || config.endCondition.type === "never") {
    return "";
  }

  switch (config.endCondition.type) {
    case "after_occurrences":
      return t
        ? `${t("cron.afterOccurrences").replace("N", String(config.endCondition.occurrences ?? 10))}`
        : `执行 ${config.endCondition.occurrences ?? 10} 次后结束`;
    case "until_date":
      return t
        ? `${config.endCondition.untilDate} ${t("cron.untilDateLabel")}`
        : `${config.endCondition.untilDate} 后结束`;
    default:
      return "";
  }
}

export function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function createDefaultTaskRequest(partial: Partial<CreateTaskRequest> = {}): CreateTaskRequest {
  return {
    name: "",
    reminder_type: "simple",
    cron_expr: "0 9 * * *",
    cron_config: JSON.stringify({
      mode: "standard",
      standard: {
        frequency: "daily",
        time: "09:00",
      },
      endCondition: {
        type: "never",
      },
    }),
    channel_ids: [],
    tags: [],
    priority: 0,
    ...partial,
  };
}