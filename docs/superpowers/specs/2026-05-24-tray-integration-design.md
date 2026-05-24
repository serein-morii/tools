# Tray Integration Design

**Goal:** Make the Tools desktop app minimize to the system tray instead of quitting on window close, and allow users to restore the window from the tray icon. Connect the behavior to the persisted `minimize_to_tray` setting.

**Scope:** This adds a macOS menu bar / Windows system tray icon with a basic menu to show/hide the main window. It does not include tray notifications, badge counters, or multi-window management. The scheduler continues running while the window is hidden.

## Current State

The Settings page stores a `minimize_to_tray` boolean preference through the persistence feature, but the app still quits when the user closes the main window. The scheduler stops when the process exits. There is no tray icon or menu bar item.

## Architecture

Use Tauri's built-in tray support. The tray lifecycle is:

1. App starts → tray icon appears.
2. User clicks the tray icon → show the main window.
3. User closes the window:
   - If `minimize_to_tray == true`, hide the window instead of quitting.
   - If `minimize_to_tray == false`, quit the app.
4. Tray menu provides "Show Window" and "Quit" options.

The Settings toggle `minimize_to_tray` persists the preference and immediately affects close behavior. No restart is required.

## Backend Components

Tauri configuration in `tauri.conf.json`:

- Enable `systemTray` capability.
- Set a default tray icon (use the app icon or a simple indicator).

Tauri setup in `src-tauri/src/lib.rs`:

- Create the tray icon on app startup.
- Register a tray click handler that shows the window.
- Override the window close event:
  - Read `minimize_to_tray` from SQLite.
  - If `true`, hide the window and prevent default close.
  - If `false`, allow the default close which quits the app.

Add a helper command or in-setup logic to read the setting quickly. The existing `get_settings` command can be used, or a dedicated `get_minimize_to_tray` command can avoid loading all settings.

## Frontend Components

No frontend code changes are required for tray behavior. The Settings toggle for `minimize_to_tray` is already wired to persist changes. The backend reads the setting on each close event, so changes apply immediately.

## Validation and Errors

- If the tray icon fails to load, log an error and continue without tray; the app still works.
- If `minimize_to_tray` setting read fails, default to `true` to avoid accidental quit.

## Testing

Backend verification is runtime-only:

- Start the app.
- Confirm tray icon appears.
- Close the window.
- Confirm the app process is still running.
- Click tray icon or menu "Show Window".
- Confirm the window reappears.
- Toggle `minimize_to_tray` to false in Settings.
- Close the window.
- Confirm the app process exits.

Screenshot verification:

- Capture the tray icon region (macOS menu bar or Windows taskbar tray).
- Capture the Settings page showing `minimize_to_tray` toggle.

## Out of Scope

- Tray badge or notification bubbles.
- Per-task tray menu entries.
- Custom tray icon animations.
- Windows-only or macOS-only special menus.
- App launch at login (system-level auto-launch registration).