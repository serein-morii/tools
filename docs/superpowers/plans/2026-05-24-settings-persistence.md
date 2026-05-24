# Settings Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist Settings page values through SQLite and use the configured snooze interval in reminder history actions.

**Architecture:** Add a small settings DAO and Tauri command layer over the existing `settings` table. Add React Query settings hooks and replace local-only settings UI state with persisted values. Reuse the settings query in `ReminderActionPanel` so snooze uses `snooze_minutes` instead of a hardcoded five minutes.

**Tech Stack:** Rust, rusqlite, Tauri commands, React 19, TypeScript, React Query, Vite, Tailwind UI components.

---

## File Structure

- Create `src-tauri/src/database/dao/settings.rs`: settings row type, read all settings, update/upsert one setting, unit tests.
- Modify `src-tauri/src/database/dao/mod.rs`: expose the settings DAO module.
- Create `src-tauri/src/commands/settings.rs`: Tauri commands for getting and updating settings.
- Modify `src-tauri/src/commands/mod.rs`: expose settings commands.
- Modify `src-tauri/src/lib.rs`: register settings commands in `generate_handler!`.
- Modify `src/types/index.ts`: keep the existing `Settings` interface or adapt it to the backend shape if needed.
- Create `src/lib/api/settings.ts`: frontend API wrapper for Tauri settings commands.
- Create `src/lib/query/settingsQueries.ts`: React Query hooks for settings read/update.
- Modify `src/pages/SettingsPage.tsx`: replace local-only state with persisted settings controls.
- Modify `src/components/modules/reminder/ReminderActionPanel.tsx`: read `snooze_minutes` and pass it to `snooze_reminder`.

---

### Task 1: Backend settings DAO

**Files:**
- Create: `src-tauri/src/database/dao/settings.rs`
- Modify: `src-tauri/src/database/dao/mod.rs`
- Test: `src-tauri/src/database/dao/settings.rs`

- [ ] **Step 1: Write the failing DAO test and module skeleton**

Create `src-tauri/src/database/dao/settings.rs` with this code:

```rust
use serde::{Deserialize, Serialize};

use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Setting {
    pub key: String,
    pub value: String,
}

pub struct SettingsDao;

impl SettingsDao {
    pub fn get_all(_conn: &rusqlite::Connection) -> Result<Vec<Setting>> {
        unimplemented!("get_all will be implemented after the failing test")
    }

    pub fn update(_conn: &rusqlite::Connection, _key: &str, _value: &str) -> Result<()> {
        unimplemented!("update will be implemented after the failing test")
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
```

Modify `src-tauri/src/database/dao/mod.rs` to include the module:

```rust
pub mod task;
pub mod channel;
pub mod reminder;
pub mod template;
pub mod settings;

pub use task::*;
pub use channel::*;
pub use reminder::*;
```

- [ ] **Step 2: Run the targeted DAO test and verify RED**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml settings_read_update_and_upsert
```

Expected: FAIL because `SettingsDao::get_all` panics at the `unimplemented!` call.

- [ ] **Step 3: Implement the minimal DAO**

Replace the implementation in `src-tauri/src/database/dao/settings.rs` with:

```rust
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
```

- [ ] **Step 4: Run the targeted DAO test and verify GREEN**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml settings_read_update_and_upsert
```

Expected: PASS for `settings_read_update_and_upsert`.

---

### Task 2: Tauri settings commands

**Files:**
- Create: `src-tauri/src/commands/settings.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add command file**

Create `src-tauri/src/commands/settings.rs`:

```rust
use std::sync::Arc;

use serde::Deserialize;
use tauri::State;

use crate::database::{dao::{Setting, SettingsDao}, Database};
use crate::error::Result;

#[derive(Debug, Deserialize)]
pub struct UpdateSettingRequest {
    pub key: String,
    pub value: String,
}

#[tauri::command]
pub fn get_settings(db: State<'_, Arc<Database>>) -> Result<Vec<Setting>> {
    let conn = db.conn().lock().unwrap();
    SettingsDao::get_all(&conn)
}

#[tauri::command]
pub fn update_setting(db: State<'_, Arc<Database>>, request: UpdateSettingRequest) -> Result<()> {
    let conn = db.conn().lock().unwrap();
    SettingsDao::update(&conn, &request.key, &request.value)
}
```

- [ ] **Step 2: Export commands**

Modify `src-tauri/src/commands/mod.rs`:

```rust
pub mod task;
pub mod channel;
pub mod reminder;
pub mod template;
pub mod settings;

pub use task::*;
pub use channel::*;
pub use reminder::*;
pub use template::*;
pub use settings::*;
```

- [ ] **Step 3: Register commands**

Modify `src-tauri/src/lib.rs` so the `generate_handler!` list includes:

```rust
            commands::get_settings,
            commands::update_setting,
```

Place them after the template commands:

```rust
            commands::get_templates,
            commands::get_template,
            commands::create_template,
            commands::update_template,
            commands::delete_template,
            commands::get_settings,
            commands::update_setting,
```

- [ ] **Step 4: Run all Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all Rust tests pass with no new warnings about unused settings functions.

---

### Task 3: Frontend settings data layer

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/api/settings.ts`
- Create: `src/lib/query/settingsQueries.ts`

- [ ] **Step 1: Add frontend setting request type**

Modify `src/types/index.ts` near the existing `Settings` interface so it contains:

```ts
export interface Settings {
  key: string;
  value: string;
}

export interface UpdateSettingRequest {
  key: string;
  value: string;
}
```

- [ ] **Step 2: Add settings API wrapper**

Create `src/lib/api/settings.ts`:

```ts
import { call } from "./index";
import type { Settings, UpdateSettingRequest } from "@/types";

export const settingsApi = {
  getAll: (): Promise<Settings[]> => call<Settings[]>("get_settings"),

  update: (request: UpdateSettingRequest): Promise<void> =>
    call<void>("update_setting", { request }),
};
```

- [ ] **Step 3: Add React Query hooks**

Create `src/lib/query/settingsQueries.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api/settings";
import type { Settings, UpdateSettingRequest } from "@/types";

export const settingsKeys = {
  all: ["settings"] as const,
};

export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: settingsApi.getAll,
  });
}

export function useUpdateSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: UpdateSettingRequest) => settingsApi.update(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}

export function getSettingValue(settings: Settings[] | undefined, key: string, fallback: string) {
  return settings?.find((setting) => setting.key === key)?.value ?? fallback;
}
```

- [ ] **Step 4: Run frontend build**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build pass.

---

### Task 4: Persist Settings page controls

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Replace the Settings page implementation**

Replace `src/pages/SettingsPage.tsx` with:

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useSettings, useUpdateSetting, getSettingValue } from "@/lib/query/settingsQueries";

const DEFAULT_SNOOZE_MINUTES = "5";
const DEFAULT_HISTORY_RETENTION_DAYS = "30";

export function SettingsPage() {
  const { data: settings, isLoading, error } = useSettings();
  const updateSetting = useUpdateSetting();

  const autoLaunch = getSettingValue(settings, "auto_launch", "false") === "true";
  const minimizeToTray = getSettingValue(settings, "minimize_to_tray", "true") === "true";
  const snoozeMinutes = getSettingValue(settings, "snooze_minutes", DEFAULT_SNOOZE_MINUTES);
  const historyRetentionDays = getSettingValue(settings, "history_retention_days", DEFAULT_HISTORY_RETENTION_DAYS);

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">加载设置中...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive/50">
          <CardContent className="pt-6 text-sm text-destructive">设置加载失败</CardContent>
        </Card>
      </div>
    );
  }

  const saveBoolean = (key: string, value: boolean) => {
    updateSetting.mutate({ key, value: value ? "true" : "false" });
  };

  const saveNumber = (key: string, value: string, min: number, max: number) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      return;
    }
    updateSetting.mutate({ key, value });
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-semibold">设置</h2>
        <p className="mt-1 text-sm text-muted-foreground">保存应用行为和提醒偏好</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>启动设置</CardTitle>
          <CardDescription>应用程序启动行为</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>开机自启动</Label>
              <p className="text-xs text-muted-foreground">保存偏好；系统级自启动注册将在后续接入</p>
            </div>
            <Switch
              checked={autoLaunch}
              disabled={updateSetting.isPending}
              onCheckedChange={(value) => saveBoolean("auto_launch", value)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>最小化到托盘</Label>
              <p className="text-xs text-muted-foreground">保存关闭窗口时的偏好</p>
            </div>
            <Switch
              checked={minimizeToTray}
              disabled={updateSetting.isPending}
              onCheckedChange={(value) => saveBoolean("minimize_to_tray", value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>提醒设置</CardTitle>
          <CardDescription>任务提醒相关配置</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="snoozeMinutes">稍后提醒间隔 (分钟)</Label>
            <Input
              id="snoozeMinutes"
              type="number"
              min={1}
              max={1440}
              value={snoozeMinutes}
              onChange={(event) => saveNumber("snooze_minutes", event.target.value, 1, 1440)}
              className="w-32"
              disabled={updateSetting.isPending}
            />
            <p className="text-xs text-muted-foreground">用于历史页中的“稍后提醒”按钮，范围 1-1440 分钟</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="historyRetentionDays">历史保留天数</Label>
            <Input
              id="historyRetentionDays"
              type="number"
              min={1}
              max={3650}
              value={historyRetentionDays}
              onChange={(event) => saveNumber("history_retention_days", event.target.value, 1, 3650)}
              className="w-32"
              disabled={updateSetting.isPending}
            />
            <p className="text-xs text-muted-foreground">保存历史保留偏好，范围 1-3650 天</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>数据管理</CardTitle>
          <CardDescription>数据存储与备份</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" disabled>导出数据</Button>
            <Button variant="outline" disabled>导入数据</Button>
          </div>
          <p className="text-xs text-muted-foreground">导入导出会在数据备份功能中接入</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>关于</CardTitle>
          <CardDescription>应用程序信息</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">版本</span>
            <span>0.1.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">框架</span>
            <span>Tauri v2 + React 19</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">作者</span>
            <span>pengchenghui</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Run frontend build**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build pass.

---

### Task 5: Use configured snooze minutes in reminder actions

**Files:**
- Modify: `src/components/modules/reminder/ReminderActionPanel.tsx`

- [ ] **Step 1: Update ReminderActionPanel imports**

Modify `src/components/modules/reminder/ReminderActionPanel.tsx` imports to include settings:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  useConfirmReminder,
  useSnoozeReminder,
  useSubmitReminderFeedback,
} from "@/lib/query/reminderQueries";
import { getSettingValue, useSettings } from "@/lib/query/settingsQueries";
import type { ReminderHistoryItem } from "@/types";
```

- [ ] **Step 2: Read snooze setting inside the component**

Inside `ReminderActionPanel`, after mutation hooks, add:

```tsx
  const { data: settings } = useSettings();
  const snoozeMinutes = Number(getSettingValue(settings, "snooze_minutes", "5"));
```

- [ ] **Step 3: Use snoozeMinutes for mutate and button copy**

Replace the existing snooze button with:

```tsx
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => snoozeReminder.mutate({ id: item.id, minutes: snoozeMinutes })}
        >
          {snoozeMinutes} 分钟后提醒
        </Button>
```

- [ ] **Step 4: Run frontend build**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build pass.

---

### Task 6: Full verification

**Files:**
- No source edits unless verification exposes a bug.

- [ ] **Step 1: Run full Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all tests pass.

- [ ] **Step 2: Run frontend build**

Run:

```bash
npm run build
```

Expected: build exits 0.

- [ ] **Step 3: Launch or reuse the real app**

If port 1420 is already used by this project, reuse it. If it is stale, stop only this project’s `npm run tauri dev`, `vite`, and `target/debug/tools` processes, then run:

```bash
npm run tauri dev
```

Expected: Tauri app starts and Vite serves on `http://localhost:1420`.

- [ ] **Step 4: Probe routes**

Run a local HTTP probe for:

```text
/settings
/reminder/history
/reminder/tasks
```

Expected:

```text
200 /settings
200 /reminder/history
200 /reminder/tasks
```

- [ ] **Step 5: Verify settings persistence through SQLite**

Use the running app Settings page to set `snooze_minutes` to `12`, or directly call the new command through the UI if available. Then inspect `~/.tools/tools.db` and confirm:

```text
snooze_minutes = 12
```

- [ ] **Step 6: Capture screenshots**

Capture these screenshots from the running app:

```text
/tmp/tools-settings-persistence.png
/tmp/tools-history-configured-snooze.png
```

Expected: Settings page shows persisted reminder settings, and history action panel shows `12 分钟后提醒`.

---

## Self-Review Notes

- Spec coverage: backend settings persistence, frontend Settings page, reminder snooze integration, and runtime verification are all covered.
- Placeholder scan: no TBD/TODO/fill-in steps are present.
- Type consistency: backend `Setting` maps to frontend `Settings`; `UpdateSettingRequest` uses `key` and `value` consistently; Tauri command argument is `{ request }` consistently in frontend and backend.
