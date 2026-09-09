use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Emitter;
use tauri::Manager;
use windows_core::PCWSTR;

/// 专注结束系统通知调度（V1.4.1 Bug 3 修复）：
/// 由 Rust 侧原生线程在「结束时刻」发送桌面通知，不依赖前端定时器/页面可见性，
/// 因此应用最小化、后台运行、失焦时同样能准时提醒。
/// - schedule：登记 cancel 标志并派生线程 sleep 到 end_at_ms 后发送；
/// - cancel：置标志，线程醒来后跳过发送并自清理；
/// - 多会话安全：id 自增，HashMap 维护活跃调度。
static FOCUS_NOTIFY_NEXT_ID: AtomicU64 = AtomicU64::new(1);
static FOCUS_NOTIFY_CANCEL: LazyLock<Mutex<HashMap<u64, Arc<AtomicBool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 调度一条「专注完成」系统通知：end_at_ms 时刻发送（前端按真实时间计算剩余）。
#[tauri::command]
fn schedule_focus_end_notification(end_at_ms: u64, planned_minutes: u64) -> u64 {
    let id = FOCUS_NOTIFY_NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut map = FOCUS_NOTIFY_CANCEL.lock().unwrap();
        map.insert(id, cancel.clone());
    }
    std::thread::spawn(move || {
        let wait = end_at_ms.saturating_sub(now_ms());
        std::thread::sleep(Duration::from_millis(wait));
        if !cancel.load(Ordering::SeqCst) {
            let body = if planned_minutes > 0 {
                format!("{planned_minutes} 分钟专注已结束，休息一下吧。")
            } else {
                "本次专注已结束，休息一下吧。".to_string()
            };
            let _ = notify_rust::Notification::new()
                .appname("DailyFlow")
                .summary("专注完成")
                .body(&body)
                .show();
        }
        FOCUS_NOTIFY_CANCEL.lock().unwrap().remove(&id);
    });
    id
}

/// 取消已调度的专注结束通知（暂停/提前结束/放弃时调用；幂等）。
#[tauri::command]
fn cancel_focus_notification(timer_id: u64) {
    if let Some(flag) = FOCUS_NOTIFY_CANCEL.lock().unwrap().get(&timer_id) {
        flag.store(true, Ordering::SeqCst);
    }
}

// ---------- 窗口 / 系统托盘（V1.4.1 窗口行为） ----------

/// 显示并聚焦主窗口（托盘「显示 DailyFlow」/ 左键单击托盘图标）。窗口已存在则复用，不重复创建。
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// 隐藏主窗口到系统托盘（应用继续运行，Focus 计时不受影响）。
#[tauri::command]
fn hide_to_tray(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

/// Mini 窗配置（A4）：创建/复用 label="mini" 的窗口，隐藏主窗并显示 Mini。
const MINI_WINDOW_LABEL: &str = "mini";

#[tauri::command]
async fn open_mini_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::WebviewWindowBuilder;
    append_startup_log("open_mini_window: 开始");
    // 隐藏主窗（Mini 模式下最小化 = 主窗退场）
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }
    if let Some(mini) = app.get_webview_window(MINI_WINDOW_LABEL) {
        append_startup_log("open_mini_window: 复用已有 mini");
        let _ = mini.show();
        let _ = mini.set_focus();
        return Ok(());
    }
    // 首次创建：同一前端 bundle（与主窗相同 URL），身份完全由窗口 label="mini" 区分。
    // 不用 query/hash 标记：dev 下 Vite 重定向会丢 query，而 window label 由 Tauri 注入
    // 到前端 __TAURI_INTERNALS__，前端 getCurrentWindow().label === "mini" 稳定可判。
    //
    // 注意：必须是 async command —— 同步 command 在主线程 IPC 内同步 build 第二个
    // WebView2 窗口会死锁（WebView2 初始化需主线程消息循环被 pump，而主线程正被阻塞），
    // 表现为「创建新窗口」日志后无下文 + Mini 白屏/主窗消失。
    let url = "index.html";
    append_startup_log(&format!("open_mini_window: 创建新窗口 url={url}"));
    let win =
        WebviewWindowBuilder::new(&app, MINI_WINDOW_LABEL, tauri::WebviewUrl::App(url.into()))
            .title("DailyFlow Mini")
            .inner_size(360.0, 560.0)
            .resizable(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .decorations(false)
            .build()
            .map_err(|e| {
                append_startup_log(&format!("open_mini_window: 创建失败 {e}"));
                e.to_string()
            })?;
    append_startup_log("open_mini_window: 创建成功，show()");
    win.show().map_err(|e| {
        append_startup_log(&format!("open_mini_window: show 失败 {e}"));
        e.to_string()
    })
}

/// 标题栏按钮：最小化主窗。
#[tauri::command]
fn window_minimize(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.minimize();
    }
}

/// 标题栏按钮：最大化/还原主窗。
#[tauri::command]
fn window_maximize_toggle(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_maximized().unwrap_or(false) {
            let _ = w.unmaximize();
        } else {
            let _ = w.maximize();
        }
    }
}

/// 标题栏 Mini 按钮 / 关闭转 Mini：主窗 ⇄ Mini 切换。
/// - Mini 不可见或未创建 → 隐藏主窗并显示 Mini；
/// - Mini 已可见 → 还原主窗（再次点击相当于返回）。
#[tauri::command]
async fn toggle_mini_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(mini) = app.get_webview_window(MINI_WINDOW_LABEL) {
        if mini.is_visible().unwrap_or(false) {
            close_mini_window(app);
        } else {
            open_mini_window(app).await?;
        }
    } else {
        open_mini_window(app).await?;
    }
    Ok(())
}

/// 关闭/隐藏 Mini 窗并恢复主窗（Mini 关闭按钮或完成后返回主界面）。
#[tauri::command]
fn close_mini_window(app: tauri::AppHandle) {
    if let Some(mini) = app.get_webview_window(MINI_WINDOW_LABEL) {
        let _ = mini.hide();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

/// Mini 窗完成/变更任务后广播给全部窗口（主窗据此刷新 taskStore，实现跨窗同步）。
#[tauri::command]
fn notify_tasks_changed(app: tauri::AppHandle) {
    let _ = app.emit("df:tasks-changed", ());
}

/// 真正退出应用（托盘「退出 DailyFlow」或前端确认退出时调用；不再二次确认）。
#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// 初始化系统托盘：图标 + 右键菜单（显示 / 开始暂停专注 / 退出）+ 左键单击显示窗口。
fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};

    let show_item = MenuItem::with_id(app, "show", "显示 DailyFlow", true, None::<&str>)?;
    let open_today = MenuItem::with_id(app, "open_today", "打开今日", true, None::<&str>)?;
    let open_goals = MenuItem::with_id(app, "open_goals", "打开长期", true, None::<&str>)?;
    let open_stats = MenuItem::with_id(app, "open_statistics", "打开统计", true, None::<&str>)?;
    let open_mini = MenuItem::with_id(app, "open_mini", "切换迷你窗", true, None::<&str>)?;
    let toggle_item =
        MenuItem::with_id(app, "toggle_focus", "开始 / 暂停专注", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出 DailyFlow", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &show_item,
            &open_today,
            &open_goals,
            &open_stats,
            &open_mini,
            &toggle_item,
            &quit_item,
        ],
    )?;

    let builder = TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().expect("窗口图标缺失").clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "open_today" => {
                let _ = app.emit("tray-open-page", "today");
                show_main_window(app);
            }
            "open_goals" => {
                let _ = app.emit("tray-open-page", "goals");
                show_main_window(app);
            }
            "open_statistics" => {
                let _ = app.emit("tray-open-page", "statistics");
                show_main_window(app);
            }
            "open_mini" => {
                // async command：经 async_runtime 执行（同步建窗会死锁主线程）
                let h = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = toggle_mini_window(h).await;
                });
            }
            "toggle_focus" => {
                // 前端监听后调用 pomodoroStore 暂停/恢复（不阻塞托盘线程）
                let _ = app.emit("tray-toggle-focus", ());
            }
            "quit" => app.exit(0), // 用户明确选择退出：直接退出，不二次询问
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });
    builder.build(app)?;
    Ok(())
}

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

/// 安装目录（可执行文件所在目录）。
fn install_dir() -> Result<PathBuf, String> {
    std::env::current_exe()
        .map_err(|e| format!("无法获取可执行文件路径：{e}"))?
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "无法解析可执行文件目录".into())
}

/// 递归复制目录（目标已存在的文件跳过，不覆盖——用于一次性迁移，保证不破坏半程结果）。
fn copy_dir_skip_existing(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_skip_existing(&from, &to)?;
        } else if entry.file_type()?.is_file() && !to.exists() {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

/// 旧默认数据目录：可执行文件同目录 \data（2.x 早期版本；卸载/升级安装目录会删除它）。
fn legacy_install_data_dir() -> Option<PathBuf> {
    install_dir().ok().map(|d| d.join("data"))
}

/**
 * 数据目录（A1 修复）：
 * - 用户在设置里自定义过 data_dir → 用之；
 * - 否则默认 %LOCALAPPDATA%\DailyFlow（与启动日志同目录）；
 *   若该目录尚不存在数据库、而旧位置 <安装目录>\data 存在 dailyflow.db，
 *   则把旧数据目录整体复制迁移到新默认（保留旧目录作为保险，不删除）；
 *   迁移失败时保守回退旧位置（不丢数据，待下次成功）。
 */
fn dailyflow_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let cfg = read_storage_paths(app);
    if !cfg.data_dir.trim().is_empty() {
        let dir = PathBuf::from(cfg.data_dir.trim());
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        recover_interrupted_restore(&dir)?;
        return Ok(dir);
    }
    let target = default_data_dir()?; // %LOCALAPPDATA%\DailyFlow（已创建）
    if !target.join("dailyflow.db").is_file() {
        if let Some(legacy) = legacy_install_data_dir() {
            if legacy.join("dailyflow.db").is_file() {
                match copy_dir_skip_existing(&legacy, &target) {
                    Ok(()) => append_startup_log(&format!(
                        "已迁移数据目录：{} → {}",
                        legacy.display(),
                        target.display()
                    )),
                    Err(e) => {
                        append_startup_log(&format!(
                            "数据目录迁移失败（{e}），本次回退旧位置：{}",
                            legacy.display()
                        ));
                        fs::create_dir_all(&legacy).map_err(|e| e.to_string())?;
                        recover_interrupted_restore(&legacy)?;
                        return Ok(legacy);
                    }
                }
            }
        }
    }
    recover_interrupted_restore(&target)?;
    Ok(target)
}

/// 启动自诊断使用的数据目录（不依赖 AppHandle，始终 %LOCALAPPDATA%\DailyFlow）。
fn default_data_dir() -> Result<PathBuf, String> {
    let local = std::env::var("LOCALAPPDATA").map_err(|e| format!("无法获取 LOCALAPPDATA：{e}"))?;
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
                "=== DailyFlow 启动日志 v{}（{}） ===",
                env!("CARGO_PKG_VERSION"),
                chrono::Local::now().format("%Y-%m-%d %H:%M:%S")
            );
        }
    }
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
    use webview2_com::{
        CoreWebView2EnvironmentOptions, CreateCoreWebView2EnvironmentCompletedHandler,
    };

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
                    let _ = windows_sys::Win32::UI::WindowsAndMessaging::TranslateMessage(&msg);
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

/**
 * 课程扩展独立库绝对路径（A1-P0Fix-③）：
 * - 统一托管到数据目录（course-schedule.db 与主库同目录），随 dataDir/备份/恢复管理；
 * - 旧版本课程库经插件相对路径解析到 app_config_dir（Roaming\com.dailyflow.desktop），
 *   首次启动检测到旧文件且新位置为空时复制迁移（保留旧文件不删除）。
 */
#[tauri::command]
fn course_db_path(app: tauri::AppHandle) -> Result<String, String> {
    let data = dailyflow_data_dir(&app)?;
    let target = data.join("course-schedule.db");
    if !target.is_file() {
        if let Ok(cfg_dir) = app.path().app_config_dir() {
            let legacy = cfg_dir.join("course-schedule.db");
            if legacy.is_file() {
                match fs::copy(&legacy, &target) {
                    Ok(_) => append_startup_log(&format!(
                        "已迁移课程库：{} → {}",
                        legacy.display(),
                        target.display()
                    )),
                    Err(e) => append_startup_log(&format!("课程库迁移失败：{e}")),
                }
            }
        }
    }
    Ok(target.to_string_lossy().into_owned())
}

/// 校验备份文件名为安全：仅允许 DailyFlow_Backup_*.db 且不含路径分隔符。
fn is_safe_backup_name(name: &str) -> bool {
    name.starts_with("DailyFlow_Backup_")
        && name.ends_with(".db")
        && !name.contains('/')
        && !name.contains('\\')
}

fn is_safe_snapshot_name(name: &str) -> bool {
    (name.starts_with("DailyFlow_Backup_")
        || name.starts_with("DailyFlow_BeforeRestore_")
        || name.starts_with("DailyFlow_PreMigration_"))
        && name.ends_with(".db")
        && !name.contains('/')
        && !name.contains('\\')
}

fn is_safe_pending_name(name: &str) -> bool {
    name.ends_with(".db.pending")
        && !name.contains('/')
        && !name.contains('\\')
        && is_safe_snapshot_name(name.trim_end_matches(".pending"))
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
/// 若存在同名伴生课程库备份（<name>.course）一并删除。
#[tauri::command]
fn delete_backup(app: tauri::AppHandle, backup_name: String) -> Result<(), String> {
    if !is_safe_backup_name(&backup_name) {
        return Err("非法的备份文件名".into());
    }
    let dir = resolve_backups_dir(&app)?;
    let remove_if_exists = |name: &str| -> Result<(), String> {
        let path = dir.join(name);
        match fs::remove_file(&path) {
            Ok(_) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    };
    remove_if_exists(&backup_name)?;
    remove_if_exists(&format!("{backup_name}.course"))
}

/// 删除未发布的备份快照。主库和伴生库都按同一暂存名管理。
#[tauri::command]
fn delete_staged_backup(app: tauri::AppHandle, pending_name: String) -> Result<(), String> {
    if !is_safe_pending_name(&pending_name) {
        return Err("非法的暂存备份文件名".into());
    }
    let dir = resolve_backups_dir(&app)?;
    for name in [&pending_name, &format!("{pending_name}.course")] {
        match fs::remove_file(dir.join(name)) {
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}

/// 将完整暂存快照发布为可见备份。伴生库发布失败时撤回主库发布。
#[tauri::command]
fn publish_backup(
    app: tauri::AppHandle,
    pending_name: String,
    backup_name: String,
) -> Result<(), String> {
    if !is_safe_pending_name(&pending_name) || !is_safe_snapshot_name(&backup_name) {
        return Err("非法的备份文件名".into());
    }
    let dir = resolve_backups_dir(&app)?;
    let pending = dir.join(&pending_name);
    let published = dir.join(&backup_name);
    let pending_course = dir.join(format!("{pending_name}.course"));
    let published_course = dir.join(format!("{backup_name}.course"));
    if !pending.is_file() {
        return Err("暂存备份不存在".into());
    }
    if published.exists() || published_course.exists() {
        return Err("备份文件已存在".into());
    }

    fs::rename(&pending, &published).map_err(|e| e.to_string())?;
    if pending_course.is_file() {
        if let Err(e) = fs::rename(&pending_course, &published_course) {
            let rollback = fs::rename(&published, &pending);
            return Err(match rollback {
                Ok(_) => e.to_string(),
                Err(re) => format!("发布伴生备份失败：{e}；撤回主备份也失败：{re}"),
            });
        }
    }
    Ok(())
}

fn recover_interrupted_restore(data_dir: &Path) -> Result<(), String> {
    let journal = data_dir.join("dailyflow.restore-journal");
    if !journal.is_file() {
        return Ok(());
    }
    let state = fs::read_to_string(&journal).map_err(|e| e.to_string())?;
    let main_existed = state.contains("main_existed=1");
    let course_existed = state.contains("course_existed=1");
    let db_path = data_dir.join("dailyflow.db");
    let course_path = data_dir.join("course-schedule.db");
    let db_old = data_dir.join("dailyflow.db.restore-old");
    let course_old = data_dir.join("course-schedule.db.restore-old");

    if main_existed {
        fs::copy(&db_old, &db_path).map_err(|e| format!("恢复主库回滚副本失败：{e}"))?;
    } else {
        let _ = fs::remove_file(&db_path);
    }
    if course_existed {
        fs::copy(&course_old, &course_path).map_err(|e| format!("恢复课程库回滚副本失败：{e}"))?;
    } else {
        let _ = fs::remove_file(&course_path);
    }

    for path in [
        data_dir.join("dailyflow.db.restore-tmp"),
        data_dir.join("course-schedule.db.restore-tmp"),
        db_old,
        course_old,
        data_dir.join("dailyflow.db-wal"),
        data_dir.join("dailyflow.db-shm"),
        data_dir.join("course-schedule.db-wal"),
        data_dir.join("course-schedule.db-shm"),
    ] {
        let _ = fs::remove_file(path);
    }
    fs::remove_file(journal).map_err(|e| e.to_string())
}

/// 带回滚日志的双文件替换。任一步失败会恢复旧版本；进程中断则在下次初始化时恢复。
fn stage_and_swap_restore_files(
    main_db: (&std::path::Path, &std::path::Path),
    course: Option<(&std::path::Path, &std::path::Path)>,
) -> Result<(), String> {
    let (db_path, main_backup) = main_db;
    let data_dir = db_path.parent().ok_or("主库路径缺少父目录")?;
    let db_tmp = data_dir.join("dailyflow.db.restore-tmp");
    let course_tmp = data_dir.join("course-schedule.db.restore-tmp");
    let db_old = data_dir.join("dailyflow.db.restore-old");
    let course_old = data_dir.join("course-schedule.db.restore-old");
    let journal = data_dir.join("dailyflow.restore-journal");

    recover_interrupted_restore(data_dir)?;
    let main_existed = db_path.is_file();
    let course_existed = course.map(|(p, _)| p.is_file()).unwrap_or(false);

    // 阶段 1：准备完整新文件和旧版本回滚副本，尚未修改目标。
    if let Some((_cp, cb)) = course {
        fs::copy(cb, &course_tmp).map_err(|e| e.to_string())?;
    }
    if let Err(e) = fs::copy(main_backup, &db_tmp) {
        let _ = fs::remove_file(&course_tmp);
        return Err(e.to_string());
    }
    if main_existed {
        fs::copy(db_path, &db_old).map_err(|e| e.to_string())?;
    }
    if let Some((cp, _)) = course {
        if course_existed {
            if let Err(e) = fs::copy(cp, &course_old) {
                let _ = fs::remove_file(&db_tmp);
                let _ = fs::remove_file(&course_tmp);
                let _ = fs::remove_file(&db_old);
                return Err(e.to_string());
            }
        }
    }
    fs::write(
        &journal,
        format!(
            "main_existed={}\ncourse_existed={}\n",
            u8::from(main_existed),
            u8::from(course_existed)
        ),
    )
    .map_err(|e| e.to_string())?;

    // 阶段 2：依次发布；任意失败都按日志恢复两个旧文件。
    if let Err(e) = fs::rename(&db_tmp, db_path) {
        let recovery = recover_interrupted_restore(data_dir);
        return Err(match recovery {
            Ok(_) => e.to_string(),
            Err(re) => format!("主库替换失败：{e}；自动回滚失败：{re}"),
        });
    }
    if let Some((cp, _cb)) = course {
        if let Err(e) = fs::rename(&course_tmp, cp) {
            let recovery = recover_interrupted_restore(data_dir);
            return Err(match recovery {
                Ok(_) => e.to_string(),
                Err(re) => format!("课程库替换失败：{e}；自动回滚失败：{re}"),
            });
        }
    }
    // 先删除日志表示提交完成，再清理回滚副本。反向顺序会在崩溃时留下无副本的日志。
    fs::remove_file(&journal).map_err(|e| e.to_string())?;
    for path in [&db_old, &course_old, &db_tmp, &course_tmp] {
        let _ = fs::remove_file(path);
    }
    Ok(())
}

/// 用备份文件覆盖当前数据库，并清理 WAL/SHM 残留。
/// 前置条件（前端完成）：备份已校验、当前库已自动备份、主库连接已关闭（课程库亦已关闭）。
/// 若备份目录存在同名伴生课程库备份（<name>.course），一并替换数据目录下的 course-schedule.db。
/// 原子性：主库与伴生都先复制到 tmp、全部成功后才 rename 替换（stage_and_swap_restore_files），
/// 杜绝「主库已替换、伴生失败」的半恢复状态。
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
    let course_backup = resolve_backups_dir(&app)?.join(format!("{backup_name}.course"));
    let course = course_backup
        .is_file()
        .then(|| (data.join("course-schedule.db"), course_backup.clone()));

    stage_and_swap_restore_files(
        (&db_path, &src),
        course.as_ref().map(|(p, b)| (p.as_path(), b.as_path())),
    )?;

    // 替换成功后清理 WAL/SHM 残留（主库与伴生课程库）
    let _ = fs::remove_file(data.join("dailyflow.db-wal"));
    let _ = fs::remove_file(data.join("dailyflow.db-shm"));
    if course.is_some() {
        let _ = fs::remove_file(data.join("course-schedule.db-wal"));
        let _ = fs::remove_file(data.join("course-schedule.db-shm"));
    }
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
    let cache = if cfg.cache_dir.trim().is_empty() {
        data.join("cache")
    } else {
        std::path::PathBuf::from(cfg.cache_dir.trim())
    };
    std::fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
    Ok(StoragePaths {
        data_dir: data.to_string_lossy().into_owned(),
        cache_dir: cache.to_string_lossy().into_owned(),
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
    std::fs::write(
        &path,
        serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------- Workflow Extension 系统操作（P7/P5 收口） ----------------
// 原则：所有路径必须绝对路径；错误分类返回（不 panic）；启动外部进程不阻塞等待。

fn ensure_absolute_path(path: &str) -> Result<std::path::PathBuf, String> {
    let p = std::path::PathBuf::from(path);
    if !p.is_absolute() {
        return Err(format!("路径必须是绝对路径：{path}"));
    }
    Ok(p)
}

/// 引号感知的命令行参数分词（P5 收口）：
/// 支持用双引号包裹含空格的单参数（如 `--out "C:\My Folder\a.png"`），
/// 双引号本身不保留；未闭合的引号视为普通字符段。
fn split_args(input: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut has_token = false;
    for ch in input.chars() {
        match ch {
            '"' => {
                in_quotes = !in_quotes;
                has_token = true;
            }
            c if c.is_whitespace() && !in_quotes => {
                if has_token {
                    out.push(std::mem::take(&mut current));
                    has_token = false;
                }
            }
            c => {
                current.push(c);
                has_token = true;
            }
        }
    }
    if has_token {
        out.push(current);
    }
    out
}

/// 用 Windows 默认关联打开文件/文件夹（ShellExecuteW "open"）：
/// - 相比 cmd start：参数不经 cmd 解析（无 % 展开/引号边界问题）；
/// - 能识别「无关联程序」（返回值 31 = SE_ERR_NOASSOC）等失败并返回可读错误。
fn open_with_default(path: &str) -> Result<(), String> {
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    let p = ensure_absolute_path(path)?;
    if !p.exists() {
        return Err(format!("路径不存在：{path}"));
    }
    let wide_path: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
    let wide_open: Vec<u16> = "open".encode_utf16().chain(std::iter::once(0)).collect();
    // ShellExecuteW 失败时返回 <=32 的错误码；>32 表示成功
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            wide_open.as_ptr(),
            wide_path.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            1, // SW_SHOWNORMAL
        )
    };
    let code = result as i32;
    if code > 32 {
        Ok(())
    } else if code == 31 {
        Err(format!(
            "没有程序可以打开该文件/文件夹（无默认关联）：{path}"
        ))
    } else {
        Err(format!("打开失败（系统错误码 {code}）：{path}"))
    }
}

/// 启动 Windows 外部程序（用户配置路径，禁止硬编码应用名）。
#[tauri::command]
fn workflow_launch_process(
    executable: String,
    arguments: Option<String>,
    working_directory: Option<String>,
) -> Result<(), String> {
    let exe = ensure_absolute_path(&executable)?;
    if !exe.is_file() {
        return Err(format!("程序不存在：{executable}"));
    }
    let args: Vec<String> = arguments.map(|a| split_args(&a)).unwrap_or_default();
    let mut cmd = std::process::Command::new(&exe);
    cmd.args(&args);
    if let Some(wd) = working_directory {
        if !wd.trim().is_empty() {
            let dir = ensure_absolute_path(&wd)?;
            if !dir.is_dir() {
                return Err(format!("工作目录不存在：{wd}"));
            }
            cmd.current_dir(dir);
        }
    }
    cmd.spawn()
        .map(|_| ())
        .map_err(|e| format!("启动失败：{e}"))
}

/// 用系统默认关联打开文件（.psd → Photoshop 等由系统决定）。
#[tauri::command]
fn workflow_open_file(path: String) -> Result<(), String> {
    open_with_default(&path)
}

/// 在 Windows Explorer 打开文件夹。
#[tauri::command]
fn workflow_open_folder(path: String) -> Result<(), String> {
    open_with_default(&path)
}

/// 路径存在性预检（Engine/UI 校验用；只读）。
#[tauri::command]
fn workflow_path_exists(path: String) -> Result<bool, String> {
    let p = ensure_absolute_path(&path)?;
    Ok(p.exists())
}

/// 启动失败时弹出可读提示（避免「白屏挂起」无从排查）。
fn show_startup_error(message: &str) {
    let title: Vec<u16> = "DailyFlow 启动失败"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let msg: Vec<u16> = message.encode_utf16().chain(std::iter::once(0)).collect();
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
            append_startup_log(&format!(
                "WEBVIEW2_BROWSER_EXECUTABLE_FOLDER={}",
                rt.display()
            ));
        } else {
            append_startup_log(
                "WEBVIEW2_BROWSER_EXECUTABLE_FOLDER 未设置（固定运行时缺失，将回退系统运行时）",
            );
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
        // 单实例保护（置于最前）：重复启动（双击 exe/快捷方式、托盘已运行）时
        // 聚焦并显示已有主窗口，而不是再开一个进程/窗口。
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            setup_tray(app.handle())?;
            Ok(())
        })
        .on_page_load(move |_webview, payload| {
            hook_flag.store(true, std::sync::atomic::Ordering::SeqCst);
            append_startup_log(&format!(
                "page_load: {:?} url={}",
                payload.event(),
                payload.url()
            ));
        })
        // 窗口事件（A4 多窗口分流）：
        // - 主窗 "main"：关闭始终拦截交给前端决策；
        // - Mini 窗 "mini"：关闭 = 隐藏（保留实例）；不触发主窗关闭决策。
        // 注：Tauri 2.11 的 WindowEvent 无 Minimized 变体（平台事件限制），
        // 「最小化→自动转 Mini」以托盘「打开 Mini 窗」/快捷键入口替代（见 open_mini_window）。
        .on_window_event(|window, event| {
            let label = window.label().to_string();
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if label == "main" {
                    api.prevent_close();
                    let _ = window.emit("app-close-requested", ());
                } else {
                    // Mini 窗：关闭即隐藏（保留实例，下次复用）
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            data_dir,
            db_relative_path,
            course_db_path,
            backups_dir,
            list_backups,
            delete_backup,
            delete_staged_backup,
            publish_backup,
            restore_backup,
            append_log,
            get_storage_paths,
            set_storage_paths,
            schedule_focus_end_notification,
            cancel_focus_notification,
            hide_to_tray,
            exit_app,
            open_mini_window,
            close_mini_window,
            toggle_mini_window,
            window_minimize,
            window_maximize_toggle,
            notify_tasks_changed,
            workflow_launch_process,
            workflow_open_file,
            workflow_open_folder,
            workflow_path_exists
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

    // ---- Workflow 系统操作（P7）：校验不 spawn，错误路径可控 ----

    #[test]
    fn workflow_rejects_relative_path() {
        assert!(super::ensure_absolute_path("notepad.exe").is_err());
        assert!(super::ensure_absolute_path(".\\x.txt").is_err());
    }

    #[test]
    fn workflow_accepts_absolute_path() {
        let p = super::ensure_absolute_path("C:\\Windows\\notepad.exe").unwrap();
        assert!(p.is_absolute());
    }

    #[test]
    fn workflow_path_exists_on_temp_file() {
        let dir = std::env::temp_dir().join(format!("wf_test_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("probe.tmp");
        std::fs::write(&f, b"x").unwrap();
        assert!(super::workflow_path_exists(f.to_string_lossy().to_string()).unwrap());
        let missing = dir.join("nope.tmp");
        assert!(!super::workflow_path_exists(missing.to_string_lossy().to_string()).unwrap());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn workflow_path_exists_rejects_relative() {
        assert!(super::workflow_path_exists("relative/path".to_string()).is_err());
    }

    #[test]
    fn workflow_launch_rejects_missing_executable() {
        let missing = std::env::temp_dir()
            .join("definitely_not_an_exe_xyz.exe")
            .to_string_lossy()
            .to_string();
        assert!(super::workflow_launch_process(missing, None, None).is_err());
    }

    #[test]
    fn workflow_open_file_rejects_missing_path() {
        let missing = std::env::temp_dir()
            .join("definitely_missing_file.psd")
            .to_string_lossy()
            .to_string();
        assert!(super::workflow_open_file(missing).is_err());
    }

    // ---- Phase 5 收口测试：参数分词 / working_directory / open_folder ----

    #[test]
    fn split_args_keeps_quoted_spaces_together() {
        // 无引号：按空白切
        assert_eq!(
            super::split_args("--background --no-splash"),
            vec!["--background", "--no-splash"]
        );
        // 引号包裹的空格参数作为一个整体
        assert_eq!(
            super::split_args("--out \"C:\\My Folder\\a b.png\" -v"),
            vec!["--out", "C:\\My Folder\\a b.png", "-v"]
        );
        // 空串 → 无参数
        assert!(super::split_args("").is_empty());
        // 连续空白不产生空参数
        assert_eq!(super::split_args("  a   b  "), vec!["a", "b"]);
    }

    #[test]
    fn workflow_launch_rejects_missing_working_directory() {
        let exe = std::env::temp_dir()
            .join("some_tool.exe")
            .to_string_lossy()
            .to_string();
        // executable 不存在 → 先报程序不存在（错误路径确定性验证）
        let r1 = super::workflow_launch_process(exe.clone(), None, None);
        assert!(r1.is_err());
        assert!(r1.unwrap_err().contains("程序不存在"));

        // 用真实存在的可执行文件 + 不存在的工作目录 → 报工作目录错误
        // （Windows 下 cmd.exe 恒存在，避免 spawn 成功掩盖校验）
        let cmd_exe = std::env::var("WINDIR")
            .map(|w| format!("{w}\\System32\\cmd.exe"))
            .unwrap_or_else(|_| "C:\\Windows\\System32\\cmd.exe".to_string());
        let missing_wd = std::env::temp_dir()
            .join("definitely_no_such_wd_xyz")
            .to_string_lossy()
            .to_string();
        let r2 = super::workflow_launch_process(cmd_exe, None, Some(missing_wd));
        assert!(r2.is_err());
        assert!(r2.unwrap_err().contains("工作目录不存在"));
    }

    #[test]
    fn workflow_open_folder_rejects_missing_path() {
        let missing = std::env::temp_dir()
            .join("definitely_missing_folder_xyz")
            .to_string_lossy()
            .to_string();
        let r = super::workflow_open_folder(missing);
        assert!(r.is_err());
        assert!(r.unwrap_err().contains("路径不存在"));
    }

    // ---- A1-P0Fix-①：默认数据目录迁移 ----

    #[test]
    fn copy_dir_skip_existing_copies_missing_and_keeps_existing() {
        let base = std::env::temp_dir().join(format!("wf_copy_test_{}", std::process::id()));
        let src = base.join("src");
        let dst = base.join("dst");
        std::fs::create_dir_all(src.join("sub")).unwrap();
        std::fs::write(src.join("dailyflow.db"), b"db-content").unwrap();
        std::fs::write(src.join("sub").join("nested.txt"), b"nested").unwrap();
        std::fs::create_dir_all(dst.join("sub")).unwrap();
        // 目标已存在同名文件（模拟目标已有更新数据）→ 不应被覆盖
        std::fs::write(dst.join("dailyflow.db"), b"existing-newer").unwrap();

        super::copy_dir_skip_existing(&src, &dst).unwrap();
        assert_eq!(
            std::fs::read(dst.join("dailyflow.db")).unwrap(),
            b"existing-newer"
        );
        assert_eq!(
            std::fs::read(dst.join("sub").join("nested.txt")).unwrap(),
            b"nested"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn legacy_data_migration_picks_target_when_db_present() {
        // 模拟：目标默认目录已有 dailyflow.db → 即使旧位置存在也不触发复制覆盖
        let base = std::env::temp_dir().join(format!("wf_legacy_test_{}", std::process::id()));
        let legacy = base.join("install").join("data");
        let target = base.join("localappdata").join("DailyFlow");
        std::fs::create_dir_all(&legacy).unwrap();
        std::fs::write(legacy.join("dailyflow.db"), b"legacy").unwrap();
        std::fs::create_dir_all(&target).unwrap();
        std::fs::write(target.join("dailyflow.db"), b"target").unwrap();

        super::copy_dir_skip_existing(&legacy, &target).unwrap();
        // 目标文件保持（不覆盖已有）
        assert_eq!(
            std::fs::read(target.join("dailyflow.db")).unwrap(),
            b"target"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn legacy_data_migration_copies_into_empty_target() {
        let base = std::env::temp_dir().join(format!("wf_legacy_empty_{}", std::process::id()));
        let legacy = base.join("install").join("data");
        let target = base.join("localappdata").join("DailyFlow");
        std::fs::create_dir_all(legacy.join("backups")).unwrap();
        std::fs::write(legacy.join("dailyflow.db"), b"legacy").unwrap();
        std::fs::write(legacy.join("backups").join("x.db"), b"x").unwrap();

        super::copy_dir_skip_existing(&legacy, &target).unwrap();
        assert_eq!(
            std::fs::read(target.join("dailyflow.db")).unwrap(),
            b"legacy"
        );
        assert_eq!(
            std::fs::read(target.join("backups").join("x.db")).unwrap(),
            b"x"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    // ---- 恢复原子性（A1-P0Fix-③ 加固）：主库与伴生要么都替换、要么都不动 ----

    #[test]
    fn stage_swap_success_replaces_both_main_and_course() {
        let base = std::env::temp_dir().join(format!("wf_restore_ok_{}", std::process::id()));
        let data = base.join("data");
        let back = base.join("backups");
        std::fs::create_dir_all(&data).unwrap();
        std::fs::create_dir_all(&back).unwrap();
        // 当前库（将被替换）
        let db_path = data.join("dailyflow.db");
        std::fs::write(&db_path, b"old-main").unwrap();
        let course_path = data.join("course-schedule.db");
        std::fs::write(&course_path, b"old-course").unwrap();
        // 备份
        let main_backup = back.join("DailyFlow_Backup_x.db");
        std::fs::write(&main_backup, b"new-main").unwrap();
        let course_backup = back.join("DailyFlow_Backup_x.db.course");
        std::fs::write(&course_backup, b"new-course").unwrap();

        super::stage_and_swap_restore_files(
            (&db_path, &main_backup),
            Some((&course_path, &course_backup)),
        )
        .unwrap();

        assert_eq!(std::fs::read(&db_path).unwrap(), b"new-main");
        assert_eq!(std::fs::read(&course_path).unwrap(), b"new-course");
        // 无 tmp 残留
        assert!(!data.join("dailyflow.db.restore-tmp").exists());
        assert!(!data.join("course-schedule.db.restore-tmp").exists());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn stage_swap_without_course_replaces_main_only() {
        let base = std::env::temp_dir().join(format!("wf_restore_main_{}", std::process::id()));
        let data = base.join("data");
        std::fs::create_dir_all(&data).unwrap();
        let db_path = data.join("dailyflow.db");
        std::fs::write(&db_path, b"old-main").unwrap();
        let course_path = data.join("course-schedule.db");
        std::fs::write(&course_path, b"keep-course").unwrap();
        let main_backup = data.join("backup.db");
        std::fs::write(&main_backup, b"new-main").unwrap();

        super::stage_and_swap_restore_files((&db_path, &main_backup), None).unwrap();

        assert_eq!(std::fs::read(&db_path).unwrap(), b"new-main");
        assert_eq!(std::fs::read(&course_path).unwrap(), b"keep-course"); // 伴生不动
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn stage_swap_main_copy_failure_leaves_targets_untouched() {
        let base = std::env::temp_dir().join(format!("wf_restore_fail_{}", std::process::id()));
        let data = base.join("data");
        std::fs::create_dir_all(&data).unwrap();
        let db_path = data.join("dailyflow.db");
        std::fs::write(&db_path, b"old-main").unwrap();
        let course_path = data.join("course-schedule.db");
        std::fs::write(&course_path, b"old-course").unwrap();
        // 主库备份源不存在 → copy 失败
        let missing = data.join("no_such_backup.db");

        let result = super::stage_and_swap_restore_files(
            (&db_path, &missing),
            Some((&course_path, &missing)),
        );
        assert!(result.is_err());
        // 两个目标都保持原状（无半恢复）
        assert_eq!(std::fs::read(&db_path).unwrap(), b"old-main");
        assert_eq!(std::fs::read(&course_path).unwrap(), b"old-course");
        // 无 tmp 残留
        assert!(!data.join("dailyflow.db.restore-tmp").exists());
        assert!(!data.join("course-schedule.db.restore-tmp").exists());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[cfg(windows)]
    #[test]
    fn stage_swap_course_publish_failure_rolls_main_back() {
        use std::os::windows::fs::OpenOptionsExt;

        let base = std::env::temp_dir().join(format!("wf_restore_locked_{}", std::process::id()));
        let data = base.join("data");
        let back = base.join("backups");
        std::fs::create_dir_all(&data).unwrap();
        std::fs::create_dir_all(&back).unwrap();
        let db_path = data.join("dailyflow.db");
        let course_path = data.join("course-schedule.db");
        let main_backup = back.join("DailyFlow_Backup_x.db");
        let course_backup = back.join("DailyFlow_Backup_x.db.course");
        std::fs::write(&db_path, b"old-main").unwrap();
        std::fs::write(&course_path, b"old-course").unwrap();
        std::fs::write(&main_backup, b"new-main").unwrap();
        std::fs::write(&course_backup, b"new-course").unwrap();

        let lock = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&course_path)
            .unwrap();
        let result = super::stage_and_swap_restore_files(
            (&db_path, &main_backup),
            Some((&course_path, &course_backup)),
        );
        assert!(result.is_err());
        assert_eq!(std::fs::read(&db_path).unwrap(), b"old-main");
        drop(lock);
        assert_eq!(std::fs::read(&course_path).unwrap(), b"old-course");
        super::recover_interrupted_restore(&data).unwrap();
        assert!(!data.join("dailyflow.restore-journal").exists());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn interrupted_restore_is_recovered_from_journal() {
        let base = std::env::temp_dir().join(format!("wf_restore_recover_{}", std::process::id()));
        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(base.join("dailyflow.db"), b"new-main").unwrap();
        std::fs::write(base.join("course-schedule.db"), b"new-course").unwrap();
        std::fs::write(base.join("dailyflow.db.restore-old"), b"old-main").unwrap();
        std::fs::write(base.join("course-schedule.db.restore-old"), b"old-course").unwrap();
        std::fs::write(
            base.join("dailyflow.restore-journal"),
            b"main_existed=1\ncourse_existed=1\n",
        )
        .unwrap();

        super::recover_interrupted_restore(&base).unwrap();
        assert_eq!(
            std::fs::read(base.join("dailyflow.db")).unwrap(),
            b"old-main"
        );
        assert_eq!(
            std::fs::read(base.join("course-schedule.db")).unwrap(),
            b"old-course"
        );
        assert!(!base.join("dailyflow.restore-journal").exists());
        let _ = std::fs::remove_dir_all(&base);
    }
}
