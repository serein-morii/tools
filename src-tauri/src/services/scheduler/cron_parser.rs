use chrono::{Local, TimeZone, Timelike, Utc};
use crate::error::Result;

pub fn get_next_run_time(cron_expr: &str) -> Result<Option<i64>> {
    let normalized = normalize_cron_expr(cron_expr);

    let schedule = cron::Schedule::try_from(normalized.as_str())
        .map_err(|e| crate::error::ToolsError::InvalidCron(e.to_string()))?;

    // 获取当前本地时间
    let now_local = Local::now();

    // 核心策略：
    // 用户期望 cron 表达式中的时间是本地时间
    // 例如 "0 9 * * *" 表示本地时间 9:00
    //
    // 我们需要把"本地时间"当作 UTC 时间来查询 cron schedule
    // 这样 cron 返回的时分秒就是"本地时间语义"的
    //
    // 实现：创建一个 DateTime<Utc>，其时分秒与本地时间相同

    // 方法：直接用本地时间的 naive datetime 创建 UTC datetime
    let local_naive = now_local.naive_local();
    let local_as_utc = Utc.from_utc_datetime(&local_naive);

    // 从这个时间开始查询
    if let Some(next_local_as_utc) = schedule.after(&local_as_utc).next() {
        // next_local_as_utc 的时分秒就是我们期望的本地时间
        let hour = next_local_as_utc.hour();
        let minute = next_local_as_utc.minute();
        let second = next_local_as_utc.second();

        // 使用返回的日期部分作为本地日期
        let local_date = next_local_as_utc.date_naive();

        // 构造本地时间
        if let Some(candidate) = local_date.and_hms_opt(hour, minute, second)
            .and_then(|dt| Local.from_local_datetime(&dt).single()) {
            if candidate > now_local {
                return Ok(Some(candidate.timestamp_millis()));
            }
        }

        // 如果已经过去（可能在边界情况），获取下一个
        if let Some(next_next) = schedule.after(&next_local_as_utc).next() {
            let next_hour = next_next.hour();
            let next_minute = next_next.minute();
            let next_second = next_next.second();
            let next_date = next_next.date_naive();

            if let Some(candidate) = next_date.and_hms_opt(next_hour, next_minute, next_second)
                .and_then(|dt| Local.from_local_datetime(&dt).single()) {
                return Ok(Some(candidate.timestamp_millis()));
            }
        }
    }

    Ok(None)
}

fn normalize_cron_expr(cron_expr: &str) -> String {
    let fields: Vec<&str> = cron_expr.split_whitespace().collect();

    match fields.len() {
        5 => format!("0 {}", cron_expr),  // 添加秒字段
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
    fn every_minute_cron_returns_next_minute() {
        // "* * * * *" 每分钟执行
        let next = get_next_run_time("* * * * *")
            .expect("cron 表达式应该有效")
            .expect("应该计算出下次执行时间");

        let now = Local::now();
        let next_local = Local.timestamp_millis_opt(next).single().unwrap();

        println!("当前时间: {:?}", now);
        println!("下次执行: {:?}", next_local);
        println!("差值秒数: {:?}", next_local.signed_duration_since(now).num_seconds());

        // 下一次执行应该在下一分钟整点
        assert!(next_local > now);
        assert_eq!(next_local.second(), 0);

        // 应该是当前时间后的下一分钟整点
        let diff = next_local.signed_duration_since(now);
        // 每分钟执行，下一次应该在当前分钟结束后的下一分钟开始
        // 最大差值应该是不到60秒（如果当前是 XX:YY:00）
        // 或者更少（如果当前时间不是整分钟）
        assert!(diff.num_seconds() < 60, "应该在60秒内，实际是 {} 秒", diff.num_seconds());
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

    #[test]
    fn hourly_cron_uses_local_timezone() {
        // "0 * * * *" 每小时整点
        let next = get_next_run_time("0 * * * *")
            .expect("cron 表达式应该有效")
            .expect("应该计算出下次执行时间");

        let local_time = Local.timestamp_millis_opt(next).single().unwrap();
        assert_eq!(local_time.minute(), 0, "应该是整点，分钟应为0");
        assert_eq!(local_time.second(), 0);
    }
}