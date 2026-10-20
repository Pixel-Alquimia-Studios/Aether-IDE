mod ai;
mod chat_history;
mod commands;
mod commands_ai;
mod pty;
mod secrets;

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
            commands::exit_app,
            commands_ai::list_providers,
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
            pty::terminal_spawn,
            pty::terminal_write,
            pty::terminal_resize,
            pty::terminal_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error mientras se ejecutaba Aether IDE");
}
