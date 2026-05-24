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
  count: number = 5
): Date[] {
  try {
    const expression = cronConfigToExpression(config);
    const parts = expression.split(" ");
    if (parts.length !== 5) return [];

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    const now = new Date();
    const results: Date[] = [];

    // Simple implementation - iterate through next 365 days and check matches
    for (let i = 0; i < 365 && results.length < count; i++) {
      const candidate = new Date(now);
      candidate.setDate(candidate.getDate() + i);

      // Check if this day matches the cron pattern
      const candHour = candidate.getHours();
      const candDayOfMonth = candidate.getDate();
      const candMonth = candidate.getMonth() + 1;
      const candDayOfWeek = candidate.getDay();

      // Parse cron field - handle *, specific values, and ranges
      const matches = (field: string, value: number): boolean => {
        if (field === "*") return true;
        if (field.startsWith("*/")) {
          const step = parseInt(field.slice(2));
          return value % step === 0;
        }
        const values = field.split(",").map(v => parseInt(v));
        return values.includes(value);
      };

      if (
        matches(minute, parseMinuteField(minute)) &&
        matches(hour, candHour) &&
        matches(dayOfMonth, candDayOfMonth) &&
        matches(month, candMonth) &&
        matches(dayOfWeek, candDayOfWeek)
      ) {
        // Set the correct time
        candidate.setHours(
          parseHourField(hour),
          parseMinuteField(minute),
          0, 0
        );

        // Skip if time has already passed today
        if (i === 0 && candidate <= now) continue;

        results.push(new Date(candidate));
      }
    }

    return results;
  } catch {
    return [];
  }
}

function parseMinuteField(field: string): number {
  if (field === "*") return 0;
  if (field.startsWith("*/")) return 0;
  return parseInt(field.split(",")[0]) || 0;
}

function parseHourField(field: string): number {
  if (field === "*") return 9;
  if (field.startsWith("*/")) return 0;
  return parseInt(field.split(",")[0]) || 9;
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