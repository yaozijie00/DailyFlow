use std::fs;
use tauri::Manager;

/// 备份目录（应用配置目录/backups），不存在则创建。
fn resolve_backups_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let backups = dir.join("backups");
    fs::create_dir_all(&backups).map_err(|e| e.to_string())?;
    Ok(backups)
}

/// 校验备份文件名为安全：仅允许 DailyFlow_Backup_*.db 且不含路径分隔符。
fn is_safe_backup_name(name: &str) -> bool {
    name.starts_with("DailyFlow_Backup_")
        && name.ends_with(".db")
        && !name.contains('/')
        && !name.contains('\\')
}

/// 返回备份目录绝对路径。
#[tauri::command]
fn backups_dir(app: tauri::AppHandle) -> Result<String, String> {
    resolve_backups_dir(&app).map(|p| p.to_string_lossy().into_owned())
}

/// 列出备份目录下可恢复的备份文件（DailyFlow_Backup_*.db，升序）。
#[tauri::command]
fn list_backups(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let dir = resolve_backups_dir(&app)?;
    let mut files: Vec<String> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| is_safe_backup_name(n))
        .collect();
    files.sort();
    Ok(files)
}

/// 删除一个备份文件（同日导出覆盖前调用；目标不存在视为成功）。
#[tauri::command]
fn delete_backup(app: tauri::AppHandle, backup_name: String) -> Result<(), String> {
    if !is_safe_backup_name(&backup_name) {
        return Err("非法的备份文件名".into());
    }
    let path = resolve_backups_dir(&app)?.join(&backup_name);
    match fs::remove_file(&path) {
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// 用备份文件覆盖当前数据库，并清理 WAL/SHM 残留。
/// 前置条件（前端完成）：备份已校验、当前库已自动备份、主库连接已关闭。
#[tauri::command]
fn restore_backup(app: tauri::AppHandle, backup_name: String) -> Result<(), String> {
    if !is_safe_backup_name(&backup_name) {
        return Err("非法的备份文件名".into());
    }
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let src = dir.join("backups").join(&backup_name);
    if !src.is_file() {
        return Err(format!("备份文件不存在：{backup_name}"));
    }
    let db_path = dir.join("dailyflow.db");

    // 先完整写到临时文件，再 rename 原子替换，避免直接覆盖中断导致主库损坏（B3）
    let tmp = dir.join("dailyflow.db.restore-tmp");
    fs::copy(&src, &tmp).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &db_path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })?;

    let _ = fs::remove_file(dir.join("dailyflow.db-wal"));
    let _ = fs::remove_file(dir.join("dailyflow.db-shm"));
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            backups_dir,
            list_backups,
            delete_backup,
            restore_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
