mod audio;

use serde::Serialize;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

#[cfg(desktop)]
use tauri::{
    menu::{CheckMenuItem, MenuBuilder},
    tray::TrayIconBuilder,
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VisualSettings {
    show_glow: bool,
    show_main: bool,
    show_fine: bool,
    smoothing: bool,
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(desktop)]
            configure_tray(app)?;

            let handle = app.handle().clone();

            audio::start_loopback_capture(move |frame| {
                let _ = handle.emit("audio-frame", frame);
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run tauri application");
}

#[cfg(desktop)]
fn configure_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let always_on_top =
        CheckMenuItem::with_id(app, "always_on_top", "保持置顶", true, true, None::<&str>)?;
    let show_main =
        CheckMenuItem::with_id(app, "show_main", "显示主波形", true, true, None::<&str>)?;
    let show_glow = CheckMenuItem::with_id(app, "show_glow", "显示光晕", true, true, None::<&str>)?;
    let show_fine =
        CheckMenuItem::with_id(app, "show_fine", "显示辅助细线", true, false, None::<&str>)?;
    let smoothing = CheckMenuItem::with_id(app, "smoothing", "平滑波形", true, true, None::<&str>)?;

    let menu = MenuBuilder::new(app)
        .item(&always_on_top)
        .separator()
        .item(&show_main)
        .item(&show_glow)
        .item(&show_fine)
        .item(&smoothing)
        .separator()
        .text("open_style_settings", "打开样式设置")
        .separator()
        .text("quit", "退出")
        .build()?;

    let always_on_top_state = Arc::new(Mutex::new(true));
    let visual_settings = Arc::new(Mutex::new(VisualSettings {
        show_glow: true,
        show_main: true,
        show_fine: false,
        smoothing: true,
    }));

    let always_on_top_item = always_on_top.clone();
    let show_main_item = show_main.clone();
    let show_glow_item = show_glow.clone();
    let show_fine_item = show_fine.clone();
    let smoothing_item = smoothing.clone();

    let always_on_top_state_for_menu = Arc::clone(&always_on_top_state);
    let visual_settings_for_menu = Arc::clone(&visual_settings);

    let mut tray = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Audio Visualizer Widget")
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "always_on_top" => {
                let next = {
                    let mut state = always_on_top_state_for_menu.lock().unwrap();
                    *state = !*state;
                    *state
                };

                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_always_on_top(next);
                }

                let _ = always_on_top_item.set_checked(next);
            }
            "show_main" => {
                let settings = update_visual_settings(&visual_settings_for_menu, |settings| {
                    settings.show_main = !settings.show_main;
                });
                let _ = show_main_item.set_checked(settings.show_main);
                let _ = app.emit("visual-settings", settings);
            }
            "show_glow" => {
                let settings = update_visual_settings(&visual_settings_for_menu, |settings| {
                    settings.show_glow = !settings.show_glow;
                });
                let _ = show_glow_item.set_checked(settings.show_glow);
                let _ = app.emit("visual-settings", settings);
            }
            "show_fine" => {
                let settings = update_visual_settings(&visual_settings_for_menu, |settings| {
                    settings.show_fine = !settings.show_fine;
                });
                let _ = show_fine_item.set_checked(settings.show_fine);
                let _ = app.emit("visual-settings", settings);
            }
            "smoothing" => {
                let settings = update_visual_settings(&visual_settings_for_menu, |settings| {
                    settings.smoothing = !settings.smoothing;
                });
                let _ = smoothing_item.set_checked(settings.smoothing);
                let _ = app.emit("visual-settings", settings);
            }
            "open_style_settings" => {
                let _ = app.emit("open-style-settings", ());
            }
            "quit" => app.exit(0),
            _ => {}
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    tray.build(app)?;

    Ok(())
}

#[cfg(desktop)]
fn update_visual_settings<F>(state: &Arc<Mutex<VisualSettings>>, update: F) -> VisualSettings
where
    F: FnOnce(&mut VisualSettings),
{
    let mut settings = state.lock().unwrap();
    update(&mut settings);
    settings.clone()
}
