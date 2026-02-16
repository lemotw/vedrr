use crate::error::MindFlowError;

#[tauri::command]
pub fn read_file_bytes(file_path: String) -> Result<Vec<u8>, MindFlowError> {
    Ok(std::fs::read(&file_path)?)
}

#[tauri::command]
pub fn save_clipboard_image(
    context_id: String,
    node_id: String,
    data: Vec<u8>,
    extension: String,
) -> Result<String, MindFlowError> {
    let dest_dir = dirs::home_dir()
        .unwrap()
        .join("MindFlow/files")
        .join(&context_id);
    std::fs::create_dir_all(&dest_dir)?;

    let len = 8.min(node_id.len());
    let filename = format!("{}.{}", &node_id[..len], extension);
    let dest = dest_dir.join(&filename);
    std::fs::write(&dest, &data)?;

    Ok(dest.to_string_lossy().to_string())
}
