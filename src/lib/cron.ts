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

export function formatCronDescription(config: CronConfig): string {
  const endConditionStr = formatEndCondition(config);

  if (config.mode === "standard" && config.standard) {
    const { frequency, time, dayOfWeek, dayOfMonth, month } = config.standard;
    const timeStr = time;

    let desc = "";
    switch (frequency) {
      case "daily":
        desc = `每天 ${timeStr}`;
        break;
      case "weekly":
        const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
        desc = `每${weekdays[dayOfWeek ?? 0]} ${timeStr}`;
        break;
      case "monthly":
        desc = `每月 ${dayOfMonth} 日 ${timeStr}`;
        break;
      case "yearly":
        const months = [
          "一月", "二月", "三月", "四月", "五月", "六月",
          "七月", "八月", "九月", "十月", "十一月", "十二月",
        ];
        desc = `每年${months[month ?? 0]} ${dayOfMonth} 日 ${timeStr}`;
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
          const unitNames = {
            minutes: "分钟",
            hours: "小时",
            days: "天",
            weeks: "周",
          };
          desc = `每 ${interval.value} ${unitNames[interval.unit]}，从 ${interval.startTime} 开始`;
        }
        break;

      case "nth_weekday":
        if (nthWeekday) {
          const nthNames = ["", "第 1 个", "第 2 个", "第 3 个", "第 4 个", "第 5 个"];
          const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
          const nthStr = nthNames[nthWeekday.nth] || "";
          const weekdayStr = weekdays[nthWeekday.weekday] || "";

          if (nthWeekday.month && nthWeekday.month > 0) {
            const months = [
              "一月", "二月", "三月", "四月", "五月", "六月",
              "七月", "八月", "九月", "十月", "十一月", "十二月",
            ];
            desc = `每年${months[nthWeekday.month - 1]}${nthStr}${weekdayStr}`;
          } else {
            desc = `每月${nthStr}${weekdayStr}`;
          }
        }
        break;

      case "last_day":
        if (lastDay) {
          const typeNames: Record<string, string> = {
            last_nth: "倒数第N天",
            last_workday: "最后一个工作日",
            last_friday: "最后一个周五",
            day: "最后一天",
            weekday: "最后一个工作日",
            friday: "最后一个周五",
          };
          const typeStr = typeNames[lastDay.type] || "最后一天";

          if (lastDay.type === "last_nth" && lastDay.nth) {
            const nthStr = `倒数第${lastDay.nth}天`;
            if (lastDay.month && lastDay.month > 0) {
              const months = [
                "一月", "二月", "三月", "四月", "五月", "六月",
                "七月", "八月", "九月", "十月", "十一月", "十二月",
              ];
              desc = `每年${months[lastDay.month - 1]}${nthStr}`;
            } else {
              desc = `每月${nthStr}`;
            }
          } else if (lastDay.month && lastDay.month > 0) {
            const months = [
              "一月", "二月", "三月", "四月", "五月", "六月",
              "七月", "八月", "九月", "十月", "十一月", "十二月",
            ];
            desc = `每年${months[lastDay.month - 1]}${typeStr}`;
          } else {
            desc = `每月${typeStr}`;
          }
        }
        break;

      case "offset":
        desc = "自定义偏移日期";
        break;
    }

    return endConditionStr ? `${desc}，${endConditionStr}` : desc;
  }

  if (config.mode === "advanced" && config.advanced) {
    return `高级: ${config.advanced.expression}${endConditionStr ? `，${endConditionStr}` : ""}`;
  }

  return "自定义时间";
}

function formatEndCondition(config: CronConfig): string {
  if (!config.endCondition || config.endCondition.type === "never") {
    return "";
  }

  switch (config.endCondition.type) {
    case "after_occurrences":
      return `执行 ${config.endCondition.occurrences ?? 10} 次后结束`;
    case "until_date":
      return `${config.endCondition.untilDate} 后结束`;
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