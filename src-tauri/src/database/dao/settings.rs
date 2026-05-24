use rusqlite::{Connection, Row};
use serde::{Deserialize, Serialize};

use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Setting {
    pub key: String,
    pub value: String,
}

impl Setting {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Self {
            key: row.get(0)?,
            value: row.get(1)?,
        })
    }
}

pub struct SettingsDao;

impl SettingsDao {
    pub fn get_all(conn: &Connection) -> Result<Vec<Setting>> {
        let mut stmt = conn.prepare("SELECT key, value FROM settings ORDER BY key ASC")?;
        let settings = stmt
            .query_map([], Setting::from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(settings)
    }

    pub fn update(conn: &Connection, key: &str, value: &str) -> Result<()> {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![key, value],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::SettingsDao;
    use rusqlite::Connection;

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            INSERT INTO settings (key, value) VALUES
                ('theme', '\"system\"'),
                ('auto_launch', 'false'),
                ('snooze_minutes', '5');"
        ).unwrap();
        conn
    }

    #[test]
    fn settings_read_update_and_upsert() {
        let conn = setup_conn();

        let settings = SettingsDao::get_all(&conn).unwrap();
        assert_eq!(settings.len(), 3);
        assert_eq!(settings[0].key, "auto_launch");
        assert_eq!(settings[0].value, "false");

        SettingsDao::update(&conn, "snooze_minutes", "15").unwrap();
        SettingsDao::update(&conn, "history_retention_days", "90").unwrap();

        let settings = SettingsDao::get_all(&conn).unwrap();
        let snooze = settings.iter().find(|item| item.key == "snooze_minutes").unwrap();
        let retention = settings.iter().find(|item| item.key == "history_retention_days").unwrap();
        assert_eq!(snooze.value, "15");
        assert_eq!(retention.value, "90");
    }
}
