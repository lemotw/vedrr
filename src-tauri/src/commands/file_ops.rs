use crate::error::AppError;
use std::path::Path;

#[tauri::command]
pub fn read_file_bytes(file_path: String) -> Result<Vec<u8>, AppError> {
    Ok(std::fs::read(&file_path)?)
}

#[tauri::command]
pub fn save_clipboard_image(
    context_id: String,
    node_id: String,
    data: Vec<u8>,
    extension: String,
) -> Result<String, AppError> {
    let dest_dir = dirs::home_dir()
        .unwrap()
        .join("vedrr/files")
        .join(&context_id);
    std::fs::create_dir_all(&dest_dir)?;

    let len = 8.min(node_id.len());
    let filename = format!("{}.{}", &node_id[..len], extension);
    let dest = dest_dir.join(&filename);
    std::fs::write(&dest, &data)?;

    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn import_image(
    context_id: String,
    node_id: String,
    source_path: String,
) -> Result<String, AppError> {
    let src = Path::new(&source_path);
    let extension = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");

    let dest_dir = dirs::home_dir()
        .unwrap()
        .join("vedrr/files")
        .join(&context_id);
    std::fs::create_dir_all(&dest_dir)?;

    let len = 8.min(node_id.len());
    let filename = format!("{}.{}", &node_id[..len], extension);
    let dest = dest_dir.join(&filename);
    std::fs::copy(src, &dest)?;

    Ok(dest.to_string_lossy().to_string())
}
