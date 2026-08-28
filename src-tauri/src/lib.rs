use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use tauri::Manager;
use windows_core::PCWSTR;

/// 存储路径配置（storage.json）：dataDir / cacheDir / backupDir。
#[derive(Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct StoragePaths {
    data_dir: String,
    cache_dir: String,
    backup_dir: String,
}

fn storage_config_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("storage.json")
}

fn read_storage_paths(app: &tauri::AppHandle) -> StoragePaths {
    match std::fs::read_to_string(storage_config_path(app)) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => StoragePaths::default(),
    }
}

/// 数据目录：配置了 data_dir 用之，否则 %LOCALAPPDATA%\DailyFlow。
fn dailyflow_data_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let cfg = read_storage_paths(app);
    let dir = if cfg.data_dir.trim().is_empty() {
        let local = std::env::var("LOCALAPPDATA")
            .map_err(|e| format!("无法获取 LOCALAPPDATA：{e}"))?;
        std::path::Path::new(&local).join("DailyFlow")
    } else {
        std::path::PathBuf::from(cfg.data_dir.trim())
    };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// 启动自诊断使用的数据目录（不依赖 AppHandle，始终 %LOCALAPPDATA%\DailyFlow）。
fn default_data_dir() -> Result<PathBuf, String> {
    let local = std::env::var("LOCALAPPDATA")
        .map_err(|e| format!("无法获取 LOCALAPPDATA：{e}"))?;
    let dir = Path::new(&local).join("DailyFlow");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

// ---------------- 启动自诊断（startup.log） ----------------
// 用于跨机白屏排查：Rust 层（本文件）与前端层（main.tsx）都把启动过程写入
// %LOCALAPPDATA%\DailyFlow\startup.log，哪一层失败一目了然。

static LOG_LOCK: Mutex<()> = Mutex::new(());

/// 追加一行启动日志（文件不存在则创建）。
fn append_startup_log(line: &str) {
    let _guard = LOG_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    if let Ok(dir) = default_data_dir() {
        if let Ok(mut f) = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join("startup.log"))
        {
            let _ = writeln!(f, "{line}");
        }
    }
}

/// 启动开始时清空旧日志并写入头部。
fn reset_startup_log() {
    let _guard = LOG_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    if let Ok(dir) = default_data_dir() {
        if let Ok(mut f) = fs::File::create(dir.join("startup.log")) {
            let _ = writeln!(
                f,
                "=== DailyFlow 启动日志 v1.0.0（{}） ===",
                chrono_like_now()
            );
        }
    }
}

/// 简易本地时间戳（不引第三方依赖）。
fn chrono_like_now() -> String {
    let d = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let days = d / 86_400;
    let (y, m, day) = civil_from_days(days);
    let secs = d % 86_400;
    format!(
        "{y:04}-{m:02}-{day:02} {:02}:{:02}:{:02}",
        secs / 3600,
        (secs % 3600) / 60,
        secs % 60
    )
}

/// 儒略日数 → (年,月,日)。Howard Hinnant 算法。
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as i64;
    (if m <= 2 { y + 1 } else { y }, m, d as i64)
}

/// 前端追加日志命令（main.tsx 调用）。
#[tauri::command]
fn append_log(text: String) {
    append_startup_log(&text);
}

/// 探测 WebView2 加载器当前将使用的运行时版本。
/// 读取 WEBVIEW2_BROWSER_EXECUTABLE_FOLDER（fixedRuntime 模式由应用设置），
/// 返回 "OK <版本>" 或 "ERR <HRESULT>"。
fn probe_webview2_version() -> String {
    unsafe {
        let mut version = windows_core::PWSTR::null();
        let hr = webview2_com_sys::Microsoft::Web::WebView2::Win32::
            GetAvailableCoreWebView2BrowserVersionString(PCWSTR::null(), &mut version);
        match hr {
            Ok(()) => {
                let text = if version.is_null() {
                    "<null>".to_string()
                } else {
                    let mut chars = Vec::new();
                    let mut i = 0usize;
                    loop {
                        let c = *version.as_ptr().add(i);
                        if c == 0 {
                            break;
                        }
                        chars.push(c);
                        i += 1;
                    }
                    String::from_utf16_lossy(&chars)
                };
                // 释放加载器分配的字符串（CoTaskMemAlloc 分配的须用 CoTaskMemFree 释放）
                if !version.is_null() {
                    windows_sys::Win32::System::Com::CoTaskMemFree(version.as_ptr() as _);
                }
                format!("OK {text}")
            }
            Err(e) => format!("ERR hr=0x{:08X}", e.code().0 as u32),
        }
    }
}

/// 深度环境探测：在后台线程中真实调用 CreateCoreWebView2EnvironmentWithOptions，
/// 直接拿到「环境创建」成功与否及 HRESULT（浅探测 GetAvailableCoreWebView2BrowserVersionString
/// 只查版本字符串，不启动浏览器进程；白屏机器往往是环境创建这一步失败）。
fn probe_webview2_env_async() {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        CreateCoreWebView2EnvironmentWithOptions, ICoreWebView2EnvironmentOptions,
    };
    use webview2_com::{CoreWebView2EnvironmentOptions, CreateCoreWebView2EnvironmentCompletedHandler};

    std::thread::spawn(move || {
        unsafe {
            // COM 初始化（COINIT_APARTMENTTHREADED = 0x2）
            let _ = windows_sys::Win32::System::Com::CoInitializeEx(std::ptr::null(), 0x2);
        }

        // 独立测试用用户数据目录（不污染真实数据）
        let user_data = default_data_dir()
            .map(|d| d.join("env-probe"))
            .unwrap_or_else(|_| std::env::temp_dir().join("df-env-probe"));
        let _ = fs::create_dir_all(&user_data);
        let user_data_os = user_data.to_string_lossy().into_owned();
        let user_data_h = windows_core::HSTRING::from(user_data_os.as_str());

        let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();

        let handler = CreateCoreWebView2EnvironmentCompletedHandler::create(Box::new(
            move |error_code, _environment| {
                let outcome: Result<String, String> = match error_code {
                    Ok(()) => Ok("env-created".to_string()),
                    Err(e) => Err(format!("hr=0x{:08X}", e.code().0 as u32)),
                };
                let _ = tx.send(outcome);
                Ok(())
            },
        ));

        let options = CoreWebView2EnvironmentOptions::default();
        let call_result = unsafe {
            CreateCoreWebView2EnvironmentWithOptions(
                windows_core::PCWSTR::null(),
                &user_data_h,
                &ICoreWebView2EnvironmentOptions::from(options),
                &handler,
            )
        };

        // 手动消息泵 + 15 秒超时（WebView2 回调经 PostMessage 送达）
        let started = std::time::Instant::now();
        let outcome: Result<String, String> = loop {
            if let Ok(r) = rx.try_recv() {
                break r;
            }
            if started.elapsed().as_secs() > 15 {
                break Err("timeout(15s)".to_string());
            }
            let mut msg: windows_sys::Win32::UI::WindowsAndMessaging::MSG =
                unsafe { std::mem::zeroed() };
            let has = unsafe {
                windows_sys::Win32::UI::WindowsAndMessaging::PeekMessageW(
                    &mut msg,
                    std::ptr::null_mut(),
                    0,
                    0,
                    windows_sys::Win32::UI::WindowsAndMessaging::PM_REMOVE,
                )
            };
            if has != 0 {
                unsafe {
                    let _ =
                        windows_sys::Win32::UI::WindowsAndMessaging::TranslateMessage(&msg);
                    windows_sys::Win32::UI::WindowsAndMessaging::DispatchMessageW(&msg);
                }
            } else {
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
        };

        match (&call_result, &outcome) {
            (Ok(()), Ok(v)) => append_startup_log(&format!("env probe: OK {v}")),
            (Ok(()), Err(e)) => append_startup_log(&format!("env probe: callback ERR {e}")),
            (Err(e), _) => append_startup_log(&format!(
                "env probe: call ERR hr=0x{:08X}",
                e.code().0 as u32
            )),
        }
        unsafe {
            windows_sys::Win32::System::Com::CoUninitialize();
        }
    });
}

/// 备份目录：配置了 backup_dir 用之，否则 <数据目录>\backups。
fn resolve_backups_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let cfg = read_storage_paths(app);
    if !cfg.backup_dir.trim().is_empty() {
        let dir = PathBuf::from(cfg.backup_dir.trim());
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        return Ok(dir);
    }
    let backups = dailyflow_data_dir(app)?.join("backups");
    fs::create_dir_all(&backups).map_err(|e| e.to_string())?;
    Ok(backups)
}

/// 计算从 from_dir 到 to_file 的相对路径（含必要的 ".." 上溯）。
fn relative_path(from_dir: &Path, to_file: &Path) -> Option<PathBuf> {
    let ancestors: Vec<&Path> = from_dir.ancestors().collect();
    for (i, anc) in ancestors.iter().enumerate() {
        if let Ok(rest) = to_file.strip_prefix(anc) {
            let mut rel = PathBuf::new();
            for _ in 0..i {
                rel.push("..");
            }
            rel.push(rest);
            return Some(rel);
        }
    }
    None
}

/// 返回用户数据目录绝对路径（并创建）。
#[tauri::command]
fn data_dir(app: tauri::AppHandle) -> Result<String, String> {
    dailyflow_data_dir(&app).map(|p| p.to_string_lossy().into_owned())
}

/// 返回数据库相对路径（相对 app 配置目录，供 sqlite 插件解析到数据目录）。
/// 同盘时返回相对路径（..\..\...）；跨盘符/UNC 时 relative_path 无法上溯，
/// 回退绝对路径（插件 path_mapper 的 PathBuf::push 遇绝对路径会整体替换，可正确解析）。
#[tauri::command]
fn db_relative_path(app: tauri::AppHandle) -> Result<String, String> {
    let app_config = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let db_file = dailyflow_data_dir(&app)?.join("dailyflow.db");
    let path = relative_path(&app_config, &db_file).unwrap_or(db_file);
    Ok(path.to_string_lossy().into_owned())
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
    let data = dailyflow_data_dir(&app)?;
    let src = resolve_backups_dir(&app)?.join(&backup_name);
    if !src.is_file() {
        return Err(format!("备份文件不存在：{backup_name}"));
    }
    let db_path = data.join("dailyflow.db");

    // 先完整写到临时文件，再 rename 原子替换，避免直接覆盖中断导致主库损坏（B3）
    let tmp = data.join("dailyflow.db.restore-tmp");
    fs::copy(&src, &tmp).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &db_path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })?;

    let _ = fs::remove_file(data.join("dailyflow.db-wal"));
    let _ = fs::remove_file(data.join("dailyflow.db-shm"));
    Ok(())
}

/// 校验并创建目录；空串返回空（表示用默认值）。
fn validate_dir(path: &str) -> Result<std::path::PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Ok(std::path::PathBuf::new());
    }
    let p = std::path::PathBuf::from(trimmed);
    if !p.is_absolute() {
        return Err(format!("路径必须是绝对路径：{path}"));
    }
    std::fs::create_dir_all(&p).map_err(|e| format!("无法创建目录：{e}"))?;
    let probe = p.join(".dailyflow-write-test");
    std::fs::write(&probe, b"ok").map_err(|e| format!("目录不可写：{e}"))?;
    let _ = std::fs::remove_file(&probe);
    Ok(p)
}

/// 返回当前生效的存储路径（未配置的项回退到默认值）。
#[tauri::command]
fn get_storage_paths(app: tauri::AppHandle) -> Result<StoragePaths, String> {
    let cfg = read_storage_paths(&app);
    let data = if cfg.data_dir.trim().is_empty() {
        dailyflow_data_dir(&app)?
    } else {
        std::path::PathBuf::from(cfg.data_dir.trim())
    };
    let backup = if cfg.backup_dir.trim().is_empty() {
        data.join("backups")
    } else {
        std::path::PathBuf::from(cfg.backup_dir.trim())
    };
    Ok(StoragePaths {
        data_dir: data.to_string_lossy().into_owned(),
        cache_dir: cfg.cache_dir.clone(),
        backup_dir: backup.to_string_lossy().into_owned(),
    })
}

/// 校验并保存存储路径配置（storage.json）；空串表示用默认值。
#[tauri::command]
fn set_storage_paths(
    app: tauri::AppHandle,
    data_dir: String,
    cache_dir: String,
    backup_dir: String,
) -> Result<(), String> {
    let _ = validate_dir(&data_dir)?;
    let _ = validate_dir(&cache_dir)?;
    let _ = validate_dir(&backup_dir)?;
    let cfg = StoragePaths {
        data_dir: data_dir.trim().to_string(),
        cache_dir: cache_dir.trim().to_string(),
        backup_dir: backup_dir.trim().to_string(),
    };
    let path = storage_config_path(&app);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 启动失败时弹出可读提示（避免「白屏挂起」无从排查）。
fn show_startup_error(message: &str) {
    let title: Vec<u16> = "DailyFlow 启动失败"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let msg: Vec<u16> = message
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        windows_sys::Win32::UI::WindowsAndMessaging::MessageBoxW(
            std::ptr::null_mut(),
            msg.as_ptr(),
            title.as_ptr(),
            windows_sys::Win32::UI::WindowsAndMessaging::MB_OK
                | windows_sys::Win32::UI::WindowsAndMessaging::MB_ICONERROR,
        );
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // ---- 启动自诊断：写入 startup.log ----
    reset_startup_log();
    append_startup_log(&format!(
        "OS: {} {} (arch {})",
        std::env::consts::OS,
        std::env::consts::ARCH,
        std::env::consts::ARCH
    ));

    // 固定运行时（fixedRuntime）检查：webview2 文件夹须与 exe 同目录。
    // 与 Tauri 内部行为一致：设置 WEBVIEW2_BROWSER_EXECUTABLE_FOLDER 后探测版本。
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()));
    if let Some(dir) = &exe_dir {
        append_startup_log(&format!("exe_dir: {}", dir.display()));
        let rt = dir.join("webview2");
        let rt_ok = rt.join("msedgewebview2.exe").exists();
        append_startup_log(&format!(
            "fixed runtime dir: {} (msedgewebview2.exe present = {rt_ok})",
            rt.display()
        ));
        if rt_ok {
            // 设置环境变量，使探测结果与实际运行一致（Tauri 随后也会设置）
            std::env::set_var("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER", &rt);
            append_startup_log(&format!("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER={}", rt.display()));
        } else {
            append_startup_log("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER 未设置（固定运行时缺失，将回退系统运行时）");
        }
    } else {
        append_startup_log("无法解析 exe 目录");
    }
    append_startup_log(&format!("WebView2 probe: {}", probe_webview2_version()));
    probe_webview2_env_async();
    append_startup_log("=== 开始创建窗口 ===");

    // 看门狗：15 秒内页面仍未加载 → 弹窗提示（把「白屏挂死」变成可读警告）。
    // 正常机器 page_load 1~2 秒内触发，不会打扰；异常机器（安全软件拦截/系统钩子死锁）
    // 用户能看到明确指引而不是无限白屏。
    let page_loaded = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let hook_flag = page_loaded.clone();
    let watch_flag = page_loaded.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(15));
        if !watch_flag.load(std::sync::atomic::Ordering::SeqCst) {
            append_startup_log("page timeout watchdog fired: webview never loaded within 15s");
            show_startup_error(
                "WebView2 页面初始化超时（15 秒）。\n\n\
                 可能原因：安全软件（360/腾讯电脑管家等）拦截了 WebView2 浏览器进程，\
                 或系统组件被修改（如激活破解补丁）。\n\n\
                 请尝试：把本程序安装目录加入安全软件信任区，或退出安全软件后重试。",
            );
        }
    });

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .on_page_load(move |_webview, payload| {
            hook_flag.store(true, std::sync::atomic::Ordering::SeqCst);
            append_startup_log(&format!(
                "page_load: {:?} url={}",
                payload.event(),
                payload.url()
            ));
        })
        .invoke_handler(tauri::generate_handler![
            data_dir,
            db_relative_path,
            backups_dir,
            list_backups,
            delete_backup,
            restore_backup,
            append_log,
            get_storage_paths,
            set_storage_paths
        ])
        .run(tauri::generate_context!());

    match &result {
        Ok(()) => append_startup_log("run() 正常结束"),
        Err(e) => {
            append_startup_log(&format!("run() 出错: {e}"));
            // 常见原因：缺少 / 过旧的 Microsoft Edge WebView2 Runtime
            show_startup_error(&format!(
                "无法创建应用窗口。\n\n请安装最新版「Microsoft Edge WebView2 Runtime」后重试（可联系开发人员获取离线运行库）。\n\n详细信息：{e}"
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn validate_dir_rejects_relative() {
        let p = std::path::Path::new("DailyFlow");
        assert!(!p.is_absolute());
    }

    #[test]
    fn relative_path_cross_drive_returns_none() {
        let from = std::path::Path::new("C:\\Users\\me\\AppData\\Roaming\\com.dailyflow.desktop");
        let to = std::path::Path::new("D:\\Data\\dailyflow.db");
        assert!(super::relative_path(from, to).is_none());
    }
}
