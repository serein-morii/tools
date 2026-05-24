use chrono::{Local, TimeZone, Timelike};
use crate::error::Result;

pub fn get_next_run_time(cron_expr: &str) -> Result<Option<i64>> {
    let normalized = normalize_cron_expr(cron_expr);

    let schedule = cron::Schedule::try_from(normalized.as_str())
        .map_err(|e| crate::error::ToolsError::InvalidCron(e.to_string()))?;

    // 使用本地时区的当前时间
    let now_local = Local::now();
    let now_utc = now_local.with_timezone(&chrono::Utc);

    // cron 库使用 UTC 时间计算下一次执行时间
    let next_utc = schedule
        .after(&now_utc)
        .next();

    match next_utc {
        Some(dt_utc) => {
            // 问题：cron 库把 "0 9 * * *" 解析为 UTC 09:00
            // 但用户期望的是本地时间 09:00 执行
            // 所以我们需要把 UTC 时间的时分秒当作本地时间来处理

            // 从 UTC 时间提取时分秒，构造本地时间
            let hour = dt_utc.hour();
            let minute = dt_utc.minute();
            let second = dt_utc.second();

            // 使用 UTC 时间的日期部分，但时间用本地时区解释
            let local_date = dt_utc.date_naive();
            let local_datetime = local_date.and_hms_opt(hour, minute, second)
                .ok_or_else(|| crate::error::ToolsError::InvalidCron("无效时间".to_string()))?;

            let local_time = Local.from_local_datetime(&local_datetime)
                .single()
                .ok_or_else(|| crate::error::ToolsError::InvalidCron("无效时间".to_string()))?;

            // 如果计算出的时间已经过去，需要找下一个
            if local_time <= now_local {
                // 重新计算下一天
                let next_utc = schedule
                    .after(&dt_utc)
                    .next();

                match next_utc {
                    Some(next_dt_utc) => {
                        let next_hour = next_dt_utc.hour();
                        let next_minute = next_dt_utc.minute();
                        let next_second = next_dt_utc.second();
                        let next_local_date = next_dt_utc.date_naive();
                        let next_local_datetime = next_local_date.and_hms_opt(next_hour, next_minute, next_second)
                            .ok_or_else(|| crate::error::ToolsError::InvalidCron("无效时间".to_string()))?;

                        let next_local_time = Local.from_local_datetime(&next_local_datetime)
                            .single()
                            .ok_or_else(|| crate::error::ToolsError::InvalidCron("无效时间".to_string()))?;

                        Ok(Some(next_local_time.timestamp_millis()))
                    }
                    None => Ok(None),
                }
            } else {
                Ok(Some(local_time.timestamp_millis()))
            }
        }
        None => Ok(None),
    }
}

fn normalize_cron_expr(cron_expr: &str) -> String {
    let fields: Vec<&str> = cron_expr.split_whitespace().collect();

    match fields.len() {
        5 => format!("0 {}", cron_expr),
        6 => cron_expr.to_string(),
        _ => cron_expr.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{TimeZone, Datelike};

    #[test]
    fn standard_five_field_cron_returns_valid_timestamp() {
        let next = get_next_run_time("* * * * *")
            .expect("5字段 cron 应该被接受")
            .expect("应该计算出下次执行时间");

        // 验证时间戳是正数且秒数为0
        let local_time = Local.timestamp_millis_opt(next).single().unwrap();
        assert!(next > 0);
        assert_eq!(local_time.second(), 0);
    }

    #[test]
    fn invalid_cron_still_returns_error() {
        assert!(get_next_run_time("* * *").is_err());
    }

    #[test]
    fn daily_cron_uses_local_timezone() {
        // "0 9 * * *" 应该返回本地时间 9:00 的时间戳
        let next = get_next_run_time("0 9 * * *")
            .expect("cron 表达式应该有效")
            .expect("应该计算出下次执行时间");

        // 验证：转换为本地时间后应该是 9:00
        let local_time = Local.timestamp_millis_opt(next).single().unwrap();
        assert_eq!(local_time.hour(), 9, "应该是本地时间 9:00，实际是 {}:00", local_time.hour());
        assert_eq!(local_time.minute(), 0);
    }

    #[test]
    fn monthly_cron_uses_local_timezone() {
        // "0 9 1 * *" 每月1日 9:00
        let next = get_next_run_time("0 9 1 * *")
            .expect("cron 表达式应该有效")
            .expect("应该计算出下次执行时间");

        let local_time = Local.timestamp_millis_opt(next).single().unwrap();
        assert_eq!(local_time.hour(), 9, "应该是本地时间 9:00，实际是 {}:00", local_time.hour());
        assert_eq!(local_time.day(), 1, "应该是每月1日");
    }
}