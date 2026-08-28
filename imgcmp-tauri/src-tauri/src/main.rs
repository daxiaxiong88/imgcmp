#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::Engine;
use tauri_plugin_dialog::DialogExt;

fn mime_from_ext(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        _ => "image/png",
    }
}

// 读取图片文件为 dataURL（适配器 readFileAsDataURL 用）
#[tauri::command]
async fn read_image(path: String) -> Result<String, String> {
    let data = std::fs::read(&path).map_err(|e| e.to_string())?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
    Ok(format!("data:{};base64,{}", mime_from_ext(&path), b64))
}

// 原生确认对话框（确定/取消）
#[tauri::command]
async fn confirm(app: tauri::AppHandle, text: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message(text)
            .title("图片对比排列器")
            .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancelCustom(
                "确定".into(),
                "取消".into(),
            ))
            .blocking_show()
    })
    .await
    .unwrap_or(false)
}

#[derive(serde::Serialize)]
struct SaveResult {
    saved: bool,
    path: Option<String>,
}

// 原生保存对话框 + 写文件（data 为 base64）
#[tauri::command]
async fn save_blob(app: tauri::AppHandle, name: String, data: String, ext: String) -> SaveResult {
    tauri::async_runtime::spawn_blocking(move || {
        let filter_name = if ext.eq_ignore_ascii_case("jpg") {
            "JPEG 图片"
        } else {
            "PNG 图片"
        };
        let picked = app
            .dialog()
            .file()
            .set_file_name(&name)
            .add_filter(filter_name, &[ext.as_str()])
            .blocking_save_file();
        let Some(picked) = picked else {
            return SaveResult { saved: false, path: None };
        };
        let Ok(path) = picked.into_path() else {
            return SaveResult { saved: false, path: None };
        };
        let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(&data) else {
            return SaveResult { saved: false, path: None };
        };
        if std::fs::write(&path, bytes).is_err() {
            return SaveResult { saved: false, path: None };
        }
        SaveResult {
            saved: true,
            path: Some(path.to_string_lossy().into_owned()),
        }
    })
    .await
    .unwrap_or(SaveResult { saved: false, path: None })
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_image,
            confirm,
            save_blob
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
