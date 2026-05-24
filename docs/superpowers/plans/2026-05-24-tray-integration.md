# Tray Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Minimize the Tools app to the system tray on window close instead of quitting, and allow users to restore the window from the tray icon. Connect the behavior to the persisted `minimize_to_tray` setting.

**Architecture:** Enable Tauri's tray plugin in configuration and setup. Intercept the window close event, read the `minimize_to_tray` setting from SQLite, and hide the window if the preference is true. Provide a tray menu with Show Window and Quit options. The scheduler continues running while the window is hidden.

**Tech Stack:** Tauri v2 tray APIs, Rust, SQLite settings DAO, React 19, Vite.

---

## File Structure

- Modify `src-tauri/tauri.conf.json`: enable tray capabilities.
- Modify `src-tauri/Cargo.toml`: add tray plugin dependency.
- Modify `src-tauri/src/lib.rs`: tray setup, window close interception, setting read.
- Add tray icon file under `src-tauri/icons/` if needed.

---

### Task 1: Enable Tauri tray plugin

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Add tray dependency to Cargo.toml**

Modify `src-tauri/Cargo.toml` dependencies section to include:

```toml
tauri-plugin-tray = { version = "2", features = ["macos", "windows"] }
```

- [ ] **Step 2: Enable tray in tauri.conf.json**

Modify `src-tauri/tauri.conf.json` top-level to add a `tray` section after `plugins`:

```json
  "tray": {
    "iconPath": "icons/icon.png",
    "iconAsTemplate": true,
    "menu": [
      { "id": "show", "text": "显示窗口" },
      { "id": "quit", "text": "退出" }
    ]
  }
```

Adjust `iconPath` to use an existing icon file under `src-tauri/icons/`. Use `icons/32x32.png` if `icon.png` does not exist.

---

### Task 2: Tray setup and window close interception

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Import tray types**

At the top of `src-tauri/src/lib.rs`, add imports:

```rust
use tauri_plugin_tray::{TrayIcon, TrayIconBuilder, MouseButton, MouseButtonState};
use tauri::Manager;
```

- [ ] **Step 2: Create tray and close handler in run()**

Modify `src-tauri/src/lib.rs` `run()` function. After the app builder line `.invoke_handler(...)`, add `.setup()` with tray creation and close interception.

Replace the existing `.setup(|app| { ... })` block with:

```rust
        .setup(|app| {
            // Create tray icon
            let tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&app.handle(), "show", "quit")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            window.show().unwrap();
                            window.set_focus().unwrap();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if event.button == MouseButton::Left && event.button_state == MouseButtonState::Up {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            window.show().unwrap();
                            window.set_focus().unwrap();
                        }
                    }
                })
                .build(app)?;

            // Intercept window close
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        let app_handle = app.handle();
                        let db = app_handle.state::<Arc<Database>>();
                        let conn = db.conn().lock().unwrap();
                        let minimize = crate::database::dao::settings::SettingsDao::get_all(&conn)
                            .ok()
                            .and_then(|settings| settings.iter().find(|item| item.key == "minimize_to_tray"))
                            .map(|item| item.value == "true")
                            .unwrap_or(true);

                        if minimize {
                            api.prevent_close();
                            if let Some(w) = app_handle.get_webview_window("main") {
                                w.hide().unwrap();
                            }
                        }
                    }
                });
            }

            // Existing dev tools check
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }

            Ok(())
        })
```

- [ ] **Step 3: Initialize tray plugin**

Inside `run()`, before `.setup(...)`, add:

```rust
        .plugin(tauri_plugin_tray::init())
```

- [ ] **Step 4: Build and run**

Run:

```bash
cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: Build completes with no errors about tray imports.

---

### Task 3: Runtime verification

**Files:**
- No source edits unless verification exposes a bug.

- [ ] **Step 1: Restart app with tray**

Stop existing dev processes and launch:

```bash
npm run tauri dev
```

Expected: App starts and tray icon appears in macOS menu bar / Windows tray area.

- [ ] **Step 2: Close window and check process**

Close the main window. Verify the process is still running:

```bash
pgrep -fl "target/debug/tools"
```

Expected: Process PID still present.

- [ ] **Step 3: Restore window from tray**

Click the tray icon or select "显示窗口" from tray menu. Expected: Main window reappears and gains focus.

- [ ] **Step 4: Toggle minimize_to_tray setting**

Open `/settings`, disable `minimize_to_tray`, then close the main window. Expected: App process exits.

- [ ] **Step 5: Capture screenshots**

Capture:

- `/tmp/tools-tray-icon.png` showing tray icon.
- `/tmp/tools-settings-tray-toggle.png` showing Settings toggle.

---

## Self-Review Notes

- Spec coverage: tray icon creation, menu, click handler, close interception, setting read, and runtime verification are all covered.
- Placeholder scan: no TBD/TODO/fill-in steps are present.
- Type consistency: using existing `SettingsDao::get_all` and `Database` state; tray APIs match Tauri v2 plugin signatures.
- Scope check: auto-launch registration, tray notifications, badges remain out of scope.