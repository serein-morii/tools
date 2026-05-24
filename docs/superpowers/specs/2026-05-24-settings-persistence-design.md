# Settings Persistence Design

**Goal:** Make the Settings page persist application and reminder preferences through the existing SQLite `settings` table, and use the configured snooze interval in reminder actions.

**Scope:** This adds a minimal settings loop for values that already exist in the schema: `auto_launch`, `minimize_to_tray`, `snooze_minutes`, and `history_retention_days`. It does not implement OS-level auto-launch registration, tray lifecycle behavior, WebDAV sync, or data import/export.

## Current State

The backend already creates a `settings` table and inserts default keys. The frontend `SettingsPage` currently keeps values in local React state, so changes disappear after navigation or restart. Reminder snooze actions are hardcoded to five minutes in the history action panel.

## Architecture

Settings remain stored as string values in SQLite to match the existing schema. The backend exposes read and write commands over Tauri, and the frontend owns UI-level parsing for booleans and positive integer inputs.

The data flow is:

1. `SettingsPage` calls `get_settings` through React Query.
2. The backend returns all rows from `settings` as key/value pairs.
3. UI controls update one setting at a time through `update_setting`.
4. React Query invalidates the settings query after each successful update.
5. `ReminderActionPanel` reads `snooze_minutes` from the same query and sends that value to `snooze_reminder`.

## Backend Components

- Add a settings DAO under `src-tauri/src/database/dao/settings.rs`.
- Add commands under `src-tauri/src/commands/settings.rs`.
- Register commands in `src-tauri/src/lib.rs`.

The DAO will provide:

- `get_all(conn) -> Result<Vec<Setting>>`
- `update(conn, key, value) -> Result<()>`

`update` uses SQLite upsert so default and newly introduced settings follow the same path.

## Frontend Components

- Add `src/lib/api/settings.ts` for Tauri command calls.
- Add `src/lib/query/settingsQueries.ts` for React Query hooks.
- Replace local-only state in `src/pages/SettingsPage.tsx` with persisted values.
- Update `src/components/modules/reminder/ReminderActionPanel.tsx` to use `snooze_minutes`.

The settings UI will show:

- Startup settings:
  - `auto_launch`
  - `minimize_to_tray`
- Reminder settings:
  - `snooze_minutes`
  - `history_retention_days`
- Data management remains visible but disabled or informational until import/export is implemented.

## Validation and Errors

The frontend validates numeric settings at the system boundary:

- `snooze_minutes`: integer from 1 to 1440.
- `history_retention_days`: integer from 1 to 3650.

Invalid values stay local and do not call the backend. Backend commands accept string values because settings storage is intentionally generic.

If loading fails, the Settings page shows a small destructive-state card. If saving fails, the changed control returns to the last loaded value after query invalidation.

## Testing

Backend tests cover:

- Reading default settings.
- Updating an existing key.
- Upserting a new key.

Frontend verification covers:

- Production build succeeds.
- `/settings` route loads in the running app.
- Changing `snooze_minutes` persists in SQLite.
- `/reminder/history` renders the snooze button with the configured minute count.

## Out of Scope

- OS auto-launch registration.
- Actual tray close/minimize behavior.
- WebDAV sync.
- JSON import/export.
- Secret storage for remote sync credentials.
