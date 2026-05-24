import type { CreateTaskRequest, CronConfig } from "@/types";

const MONTH_NAMES = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

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
    const { type, nthWeekday, lastDay, interval } = config.special;

    switch (type) {
      case "nth_weekday":
        if (nthWeekday) {
          const monthCron = nthWeekday.month ? MONTH_NAMES[nthWeekday.month - 1] : "*";
          return `0 0 ? ${monthCron} ${DAY_NAMES[nthWeekday.weekday]}#${nthWeekday.nth}`;
        }
        break;
      case "last_day":
        if (lastDay) {
          const monthCron = lastDay.month ? MONTH_NAMES[lastDay.month - 1] : "*";
          if (lastDay.type === "day") {
            return `0 0 L ${monthCron} *`;
          } else if (lastDay.type === "weekday") {
            return `0 0 LW ${monthCron} *`;
          } else if (lastDay.type === "friday") {
            return `0 0 ? ${monthCron} 6L`;
          }
        }
        break;
      case "offset":
        break;
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
              return `${minute} ${hour} ? * */${interval.value}`;
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
  if (config.mode === "standard" && config.standard) {
    const { frequency, time, dayOfWeek, dayOfMonth, month } = config.standard;
    const timeStr = time;

    switch (frequency) {
      case "daily":
        return `每天 ${timeStr}`;
      case "weekly":
        const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
        return `每${weekdays[dayOfWeek ?? 0]} ${timeStr}`;
      case "monthly":
        return `每月 ${dayOfMonth} 日 ${timeStr}`;
      case "yearly":
        const months = [
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
        return `每年${months[month ?? 0]} ${dayOfMonth} 日 ${timeStr}`;
    }
  }

  if (config.mode === "special" && config.special) {
    const { type, interval } = config.special;
    if (type === "interval" && interval) {
      const unitNames = {
        minutes: "分钟",
        hours: "小时",
        days: "天",
        weeks: "周",
      };
      return `每 ${interval.value} ${unitNames[interval.unit]}`;
    }
  }

  return "自定义时间";
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