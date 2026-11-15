// Learn more about Tauri commands at
// https://tauri.app/develop/calling-rust/

#[tauri::command]
fn greet(name: &str) -> String {

    format!(
        "Hello, {}! You've been greeted from Rust!",
        name
    )
}

#[tauri::command]
fn schedule_windows_shutdown() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let status = std::process::Command::new("shutdown.exe")
            .args(["/s", "/t", "60"])
            .status()
            .map_err(|error| format!("No se pudo ejecutar shutdown.exe: {error}"))?;

        if status.success() {
            Ok(())
        } else {
            Err(format!("shutdown.exe terminó con el estado {status}"))
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("El apagado del sistema solo está disponible en Windows.".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {

    tauri::Builder::default()

        // Plugin para abrir URLs y archivos
        .plugin(
            tauri_plugin_opener::init()
        )

        // Plugin filesystem
        .plugin(
            tauri_plugin_fs::init()
        )

        // Plugin dialogs
        .plugin(
            tauri_plugin_dialog::init()
        )        
        .invoke_handler(
            tauri::generate_handler![
                greet,
                schedule_windows_shutdown
            ]
        )

        .run(
            tauri::generate_context!()
        )

        .expect(
            "error while running tauri application"
        );
}