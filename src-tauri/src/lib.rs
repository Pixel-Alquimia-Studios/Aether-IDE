mod ai;
mod chat_history;
mod commands;
mod commands_ai;
mod pty;
mod secrets;

use tauri::Manager;


pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Workspace conocido por el backend: los comandos del agente se
        // contienen contra esta ruta (ignoran la que envíe el frontend)
        .manage(commands::WorkspaceState(std::sync::Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            commands::set_workspace,
            commands::read_file,
            commands::read_file_user,
            commands::read_file_base64,
            commands::read_file_range,
            commands::file_exists,
            commands::write_file,
            commands::write_file_user,
            commands::read_dir,
            commands::pick_workspace_dir,
            commands::watch_workspace,
            commands::load_session,
            commands::save_session,
            commands::search_files,
            commands::execute_command,
            commands::git_status,
            commands::git_diff_lines,
            commands::git_stage,
            commands::git_unstage,
            commands::git_commit,
            commands::git_push,
            commands::git_pull,
            commands::delete_file,
            commands::pick_open_file,
            commands::pick_save_file,
            commands::show_window,
            commands::exit_app,
            commands_ai::list_providers,
    commands_ai::set_custom_base_url,
    commands_ai::get_custom_base_url,
            commands_ai::has_api_key,
            commands_ai::set_api_key,
            commands_ai::delete_api_key,
            commands_ai::fetch_models,
            commands_ai::chat_stream,
            commands_ai::chat_stop,
            commands_ai::inline_completion,
            commands_ai::chat_with_tools,
            chat_history::create_chat,
            chat_history::list_chats,
            chat_history::load_chat,
            chat_history::save_chat,
            chat_history::rename_chat,
            chat_history::delete_chat,
            pty::list_shells,
            pty::terminal_spawn,
            pty::terminal_write,
            pty::terminal_resize,
            pty::terminal_kill,
        ])
        // Respaldo OBLIGATORIO (Parte 3, v0.4.0): la ventana nace oculta y el
        // frontend la muestra al primer render; si el frontend no lo consigue
        // en ~3 s (crash de arranque, JS roto), Rust la muestra igual — una
        // falla de arranque nunca deja la app sin ventana visible. show() es
        // idempotente, así que el orden respecto al frontend da igual.
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                    let _ = window.show();
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error mientras se ejecutaba Aether IDE")
        .run(|_app, event| {
            // M13 (v0.3.1): al cerrar la app, mata TODAS las shells de las
            // terminales — sin procesos huérfanos
            if let tauri::RunEvent::Exit = event {
                pty::kill_all_terminals();
            }
        });
}
