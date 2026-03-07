use crate::error::AppError;
use std::path::Path;

fn home_dir() -> Result<std::path::PathBuf, AppError> {
    dirs::home_dir().ok_or_else(|| AppError::Other("Cannot determine home directory".into()))
}

fn vedrr_files_dir(context_id: &str) -> Result<std::path::PathBuf, AppError> {
    Ok(home_dir()?.join("vedrr/files").join(context_id))
}

pub fn md_file_path(context_id: &str, node_id: &str) -> Result<std::path::PathBuf, AppError> {
    Ok(vedrr_files_dir(context_id)?.join(format!("{node_id}.md")))
}

#[tauri::command]
pub fn write_file_bytes(file_path: String, data: Vec<u8>) -> Result<(), AppError> {
    std::fs::write(&file_path, &data)?;
    Ok(())
}

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
    let dest_dir = vedrr_files_dir(&context_id)?;
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

    let dest_dir = vedrr_files_dir(&context_id)?;
    std::fs::create_dir_all(&dest_dir)?;

    let len = 8.min(node_id.len());
    let filename = format!("{}.{}", &node_id[..len], extension);
    let dest = dest_dir.join(&filename);
    std::fs::copy(src, &dest)?;

    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn save_markdown_file(
    context_id: String,
    node_id: String,
    content: String,
) -> Result<String, AppError> {
    if context_id.contains("..") || node_id.contains("..") {
        return Err(AppError::Other("Invalid context_id or node_id".into()));
    }
    let dir = vedrr_files_dir(&context_id)?;
    std::fs::create_dir_all(&dir)?;
    let dest = md_file_path(&context_id, &node_id)?;
    std::fs::write(&dest, content.as_bytes())?;
    Ok(dest.to_string_lossy().to_string())
}
