use chrono::{Datelike, Days, NaiveDate, Weekday};
use crate::error::Result;

/// 计算每月第N个星期X的具体日期
/// nth: 第几个（1-5）
/// weekday: 星期几（1=周一, 2=周二, ..., 7=周日，与 Java 保持一致）
/// month: 月份（1-12），如果为None或0则计算当月
pub fn get_nth_weekday_of_month(nth: u32, weekday: u32, month: Option<u32>) -> Result<i64> {
    let today = chrono::Local::now().date_naive();
    // month=0 or None means every month, use current month
    let target_month = month.filter(|m| *m > 0).unwrap_or_else(|| today.month());

    // 计算目标年月
    let (target_year, target_month) = if target_month < today.month() {
        (today.year() + 1, target_month)
    } else {
        (today.year(), target_month)
    };

    // 找到该月第一天
    let first_day = NaiveDate::from_ymd_opt(target_year, target_month, 1)
        .ok_or_else(|| crate::error::ToolsError::InvalidCron("无效日期".to_string()))?;

    // 转换 weekday: Java 用 1-7 (周一到周日), Rust chrono 用 Weekday 枚举
    let target_weekday = match weekday {
        1 => Weekday::Mon,
        2 => Weekday::Tue,
        3 => Weekday::Wed,
        4 => Weekday::Thu,
        5 => Weekday::Fri,
        6 => Weekday::Sat,
        7 => Weekday::Sun,
        _ => Weekday::Mon,
    };

    // 找到该月第一个目标星期
    let first_weekday_in_month = find_first_weekday(first_day, target_weekday);

    // 加上 (nth-1) 周
    let target_date = first_weekday_in_month + Days::new(((nth - 1) * 7) as u64);

    // 检查是否还在该月内
    if target_date.month() != target_month {
        // 该月没有第N个目标星期，跳到下个月
        let next_month = if target_month == 12 { 1 } else { target_month + 1 };
        let next_year = if target_month == 12 { target_year + 1 } else { target_year };
        return get_nth_weekday_of_month_for_date(nth, weekday, next_year, next_month);
    }

    // 如果目标日期已过，计算下个月
    if target_date <= today {
        let next_month = if target_month == 12 { 1 } else { target_month + 1 };
        let next_year = if target_month == 12 { target_year + 1 } else { target_year };
        return get_nth_weekday_of_month_for_date(nth, weekday, next_year, next_month);
    }

    Ok(target_date.and_hms_opt(9, 0, 0).unwrap().and_utc().timestamp_millis())
}

fn get_nth_weekday_of_month_for_date(nth: u32, weekday: u32, year: i32, month: u32) -> Result<i64> {
    let first_day = NaiveDate::from_ymd_opt(year, month, 1)
        .ok_or_else(|| crate::error::ToolsError::InvalidCron("无效日期".to_string()))?;

    let target_weekday = match weekday {
        1 => Weekday::Mon,
        2 => Weekday::Tue,
        3 => Weekday::Wed,
        4 => Weekday::Thu,
        5 => Weekday::Fri,
        6 => Weekday::Sat,
        7 => Weekday::Sun,
        _ => Weekday::Mon,
    };

    let first_weekday_in_month = find_first_weekday(first_day, target_weekday);
    let target_date = first_weekday_in_month + Days::new(((nth - 1) * 7) as u64);

    if target_date.month() != month {
        return Err(crate::error::ToolsError::InvalidCron(
            format!("该月没有第{}个目标星期", nth)
        ));
    }

    Ok(target_date.and_hms_opt(9, 0, 0).unwrap().and_utc().timestamp_millis())
}

/// 计算每月第N天或倒数第N天
/// day: 正数表示第N天，负数表示倒数第N天（如 -3 表示倒数第3天）
/// month: 月份（1-12），如果为None或0则计算当月
pub fn get_nth_day_of_month(day: i32, month: Option<u32>) -> Result<i64> {
    let today = chrono::Local::now().date_naive();
    // month=0 or None means every month, use current month
    let target_month = month.filter(|m| *m > 0).unwrap_or_else(|| today.month());
    let target_year = today.year();

    // 计算该月天数
    let days_in_month = get_days_in_month(target_year, target_month);

    // 计算目标日期
    let target_day = if day > 0 {
        // 正数：第N天
        std::cmp::min(day as u32, days_in_month)
    } else {
        // 负数：倒数第N天（-3 表示倒数第3天 = 31-3+1 = 29）
        let nth_from_end = (-day) as u32;
        let d = days_in_month as i32 - nth_from_end as i32 + 1;
        std::cmp::max(d, 1) as u32
    };

    let target_date = NaiveDate::from_ymd_opt(target_year, target_month, target_day)
        .ok_or_else(|| crate::error::ToolsError::InvalidCron("无效日期".to_string()))?;

    // 如果目标日期已过，计算下个月
    if target_date <= today {
        let next_month = if target_month == 12 { 1 } else { target_month + 1 };
        let next_year = if target_month == 12 { target_year + 1 } else { target_year };
        let days_in_next_month = get_days_in_month(next_year, next_month);

        let next_target_day = if day > 0 {
            std::cmp::min(day as u32, days_in_next_month)
        } else {
            let nth_from_end = (-day) as u32;
            let d = days_in_next_month as i32 - nth_from_end as i32 + 1;
            std::cmp::max(d, 1) as u32
        };

        let next_date = NaiveDate::from_ymd_opt(next_year, next_month, next_target_day)
            .ok_or_else(|| crate::error::ToolsError::InvalidCron("无效日期".to_string()))?;
        return Ok(next_date.and_hms_opt(9, 0, 0).unwrap().and_utc().timestamp_millis());
    }

    Ok(target_date.and_hms_opt(9, 0, 0).unwrap().and_utc().timestamp_millis())
}

/// 保留旧函数名兼容（倒数第N天）
pub fn get_nth_last_day_of_month(nth: u32, month: Option<u32>) -> Result<i64> {
    get_nth_day_of_month(-(nth as i32), month)
}

/// 计算每月最后一个工作日
pub fn get_last_workday_of_month(month: Option<u32>) -> Result<i64> {
    let today = chrono::Local::now().date_naive();
    let target_month = month.filter(|m| *m > 0).unwrap_or_else(|| today.month());
    let target_year = today.year();

    let days_in_month = get_days_in_month(target_year, target_month);

    // 从最后一天往前找工作日
    for day in (1..=days_in_month).rev() {
        let date = NaiveDate::from_ymd_opt(target_year, target_month, day).unwrap();
        if is_workday(date) {
            if date > today {
                return Ok(date.and_hms_opt(9, 0, 0).unwrap().and_utc().timestamp_millis());
            }
            break;
        }
    }

    // 计算下个月最后一个工作日
    let next_month = if target_month == 12 { 1 } else { target_month + 1 };
    let next_year = if target_month == 12 { target_year + 1 } else { target_year };
    let days_in_next_month = get_days_in_month(next_year, next_month);

    for day in (1..=days_in_next_month).rev() {
        let date = NaiveDate::from_ymd_opt(next_year, next_month, day).unwrap();
        if is_workday(date) {
            return Ok(date.and_hms_opt(9, 0, 0).unwrap().and_utc().timestamp_millis());
        }
    }

    Err(crate::error::ToolsError::InvalidCron("无法找到工作日".to_string()))
}

fn find_first_weekday(from_date: NaiveDate, target: Weekday) -> NaiveDate {
    let mut date = from_date;
    while date.weekday() != target {
        date = date + Days::new(1);
    }
    date
}

fn get_days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0) {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

fn is_workday(date: NaiveDate) -> bool {
    let weekday = date.weekday();
    weekday != Weekday::Sat && weekday != Weekday::Sun
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn test_nth_weekday() {
        // 2026年5月第3个周一应该是5月18日 (weekday=1 表示周一)
        let result = get_nth_weekday_of_month_for_date(3, 1, 2026, 5).unwrap();
        let date = chrono::Utc.timestamp_millis_opt(result).single().unwrap();
        assert_eq!(date.day(), 18);
    }

    #[test]
    fn test_nth_last_day() {
        // 2026年5月倒数第3天应该是5月29日（5月有31天）
        let result = get_nth_day_of_month(-3, Some(5)).unwrap();
        let date = chrono::Utc.timestamp_millis_opt(result).single().unwrap();
        assert_eq!(date.day(), 29);
    }

    #[test]
    fn test_nth_day() {
        // 2026年5月第13天应该是5月13日
        let result = get_nth_day_of_month(13, Some(5)).unwrap();
        let date = chrono::Utc.timestamp_millis_opt(result).single().unwrap();
        assert_eq!(date.day(), 13);
    }
}
