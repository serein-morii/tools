# Local Backup Restore Design

**Goal:** Turn the Settings page data management section into a working local JSON backup and restore loop for reminder configuration data.

**Scope:** Export and import core configuration tables: `tasks`, `channels`, `templates`, and `settings`. Runtime reminder records and reminder history are intentionally excluded so backups stay focused on portable configuration rather than execution logs.

## Current State

The Settings page shows disabled “导出数据” and “导入数据” buttons. The app stores all reminder configuration locally in SQLite. There is no backup command layer, no backup API, and no UI path to preserve or restore user-defined tasks, channels, templates, and settings.

## Architecture

The backend owns the backup file format and database transaction semantics. The frontend only triggers export/import and displays the result.

The data flow is:

1. User opens `/settings`.
2. User clicks “导出数据”.
3. Frontend calls `export_backup`.
4. Backend reads `tasks`, `channels`, `templates`, and `settings`, writes a JSON file to Downloads by default, and returns the file path plus exported counts.
5. User enters a backup path and clicks “导入数据”.
6. Frontend calls `import_backup` with the path.
7. Backend validates the JSON shape and version, then restores data in one SQLite transaction.
8. Frontend invalidates affected queries so task/channel/template/settings pages refresh.

## Backup File Format

The initial format is versioned:

```json
{
  "version": 1,
  "exported_at": 1779620000000,
  "tasks": [],
  "channels": [],
  "templates": [],
  "settings": []
}
```

Each array contains the same snake_case fields returned by the existing Rust structs. This keeps the format close to the SQLite schema and avoids one-off conversion layers.

## Backend Components

Create a backup service/DAO module that can be tested against an in-memory SQLite database:

- `BackupData`: serialized file structure.
- `BackupCounts`: counts per table.
- `BackupExportResult`: output path and counts.
- `BackupImportResult`: imported counts.
- `BackupDao::export_data(conn) -> BackupData`.
- `BackupDao::import_data(conn, data) -> BackupCounts`.

Create Tauri commands:

- `export_backup(path: Option<String>) -> BackupExportResult`
- `import_backup(path: String) -> BackupImportResult`

Default export path is `~/Downloads/tools-backup-YYYYMMDD-HHMMSS.json`. Import requires an explicit path.

## Import Semantics

Import uses a single transaction. The backend validates `version == 1` before modifying data. Import clears and restores these tables in dependency-safe order:

1. `tasks`
2. `channels`
3. `templates`
4. `settings`

The imported IDs are preserved so task-template/channel references remain meaningful. Reminder runtime tables are not modified.

## Frontend Components

Add:

- `src/lib/api/backup.ts`
- `src/lib/query/backupQueries.ts`

Update `SettingsPage` data management card:

- Enable “导出数据”.
- Add a text input for backup path.
- Enable “导入数据” when a path is present.
- Show the last export path or import summary.
- Disable buttons while a backup mutation is pending.

After import succeeds, invalidate tasks, channels, templates, and settings queries.

## Validation and Errors

Backend validation:

- Export path parent must exist when a custom path is supplied.
- Import path must be readable.
- JSON must parse as `BackupData`.
- `version` must be `1`.

Frontend validation:

- Import path cannot be empty.

Errors are returned through existing Tauri error handling and shown as concise text in the Settings page data management card.

## Testing

Backend tests cover:

- Exporting seeded tasks/channels/templates/settings into `BackupData`.
- Importing that data into an empty database and preserving counts and key fields.
- Rejecting unsupported backup versions without changing the database.

Runtime verification covers:

- Rust test suite passes.
- Frontend production build passes.
- Running app loads `/settings`.
- Export creates a JSON file containing `version: 1`.
- Settings page screenshot shows enabled backup controls.

## Out of Scope

- WebDAV upload/download.
- Native file picker plugin.
- Backup encryption.
- Secret redaction inside channel configs.
- Merging imports with existing records.
- Exporting reminder execution history.
