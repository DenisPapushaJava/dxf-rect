// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app.get_window("main").unwrap(); // "main" — имя окна, проверьте в tauri.conf.json
            window.listen("tauri://file-drop", |event| {
                println!("Files dropped: {:?}", event.payload());
                // Здесь можно дополнительно обработать событие, если нужно
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}