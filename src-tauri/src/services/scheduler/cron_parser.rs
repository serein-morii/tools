use chrono::{DateTime, Utc, TimeZone};
use crate::error::Result;

pub fn get_next_run_time(cron_expr: &str) -> Result<Option<i64>> {
    // Parse cron expression (5 fields: minute hour day month weekday)
    let schedule = cron::Schedule::try_from(cron_expr)
        .map_err(|e| crate::error::ToolsError::InvalidCron(e.to_string()))?;

    let now = Utc::now();
    let next = schedule
        .after(&now)
        .next();

    match next {
        Some(dt) => Ok(Some(dt.timestamp_millis())),
        None => Ok(None),
    }
}

pub fn validate_cron(cron_expr: &str) -> Result<()> {
    cron::Schedule::try_from(cron_expr)
        .map_err(|e| crate::error::ToolsError::InvalidCron(e.to_string()))?;
    Ok(())
}