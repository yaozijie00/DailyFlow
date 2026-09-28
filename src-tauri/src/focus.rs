//! The desktop process owns Focus. Webviews only send commands and render snapshots.
use serde::{Deserialize, Serialize};
use sqlx_core::{connection::Connection, query::query, row::Row};
use sqlx_sqlite::{SqliteConnectOptions, SqliteConnection, SqliteRow};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        OnceLock,
    },
    time::{Duration, Instant},
};
use tauri::Emitter;

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    action: String,
    operation_id: Option<String>,
    session_id: Option<i64>,
    expected_version: Option<i64>,
    task_id: Option<i64>,
    goal_seconds: Option<i64>,
    mode: Option<String>,
    note: Option<String>,
    next_action: Option<String>,
    complete_task: Option<bool>,
    duration_seconds: Option<i64>,
    started_at: Option<i64>,
    recovery_choice: Option<String>,
    limit: Option<i64>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Record {
    id: i64,
    task_id: Option<i64>,
    task_title: String,
    started_at: i64,
    ended_at: Option<i64>,
    actual_seconds: f64,
    status: String,
    running_since: Option<i64>,
    paused_at: Option<i64>,
    goal_seconds: Option<i64>,
    mode: String,
    note: String,
    next_action: String,
    interruption_count: i64,
    source: String,
    checkpoint_at: i64,
    revision: i64,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    active: Option<Record>,
    sessions: Option<Vec<Record>>,
}
type Result<T> = std::result::Result<T, String>;
const SELECT: &str = "SELECT f.id,f.task_id,d.task_title,f.started_at,f.ended_at,d.elapsed_ms,d.status,d.running_since,d.paused_at,d.goal_seconds,d.mode,d.note,d.next_action,d.interruption_count,d.source,d.checkpoint_at,d.revision FROM focus_sessions f JOIN focus_details d ON d.session_id=f.id";
fn err(e: impl std::fmt::Display) -> String {
    format!("专注记录未能保存，请重试：{e}")
}
fn record(r: SqliteRow) -> Record {
    Record {
        id: r.get("id"),
        task_id: r.get("task_id"),
        task_title: r.get("task_title"),
        started_at: r.get("started_at"),
        ended_at: r.get("ended_at"),
        actual_seconds: r.get::<i64, _>("elapsed_ms") as f64 / 1000.,
        status: r.get("status"),
        running_since: r.get("running_since"),
        paused_at: r.get("paused_at"),
        goal_seconds: r.get("goal_seconds"),
        mode: r.get("mode"),
        note: r.get("note"),
        next_action: r.get("next_action"),
        interruption_count: r.get("interruption_count"),
        source: r.get("source"),
        checkpoint_at: r.get("checkpoint_at"),
        revision: r.get("revision"),
    }
}
async fn active(db: &mut SqliteConnection) -> Result<Option<Record>> {
    query(&format!("{SELECT} WHERE d.status!='finished' ORDER BY CASE WHEN d.status='recovery' THEN 1 ELSE 0 END,f.id LIMIT 1"))
        .fetch_optional(db).await.map(|r|r.map(record)).map_err(err)
}
async fn by_id(db: &mut SqliteConnection, id: i64) -> Result<Record> {
    query(&format!("{SELECT} WHERE f.id=?"))
        .bind(id)
        .fetch_optional(db)
        .await
        .map_err(err)?
        .map(record)
        .ok_or("记录已不存在，请刷新".into())
}
async fn segment(
    db: &mut SqliteConnection,
    id: i64,
    from: i64,
    to: i64,
    effective: i64,
) -> Result<()> {
    if to <= from {
        return Ok(());
    }
    let last =
        query("SELECT id,ended_at FROM focus_segments WHERE session_id=? ORDER BY id DESC LIMIT 1")
            .bind(id)
            .fetch_optional(&mut *db)
            .await
            .map_err(err)?;
    if let Some(row) = last.filter(|r| r.get::<i64, _>("ended_at") == from) {
        query("UPDATE focus_segments SET ended_at=?,effective_ms=effective_ms+? WHERE id=?")
            .bind(to)
            .bind(effective)
            .bind(row.get::<i64, _>("id"))
            .execute(db)
            .await
            .map_err(err)?;
    } else {
        query("INSERT INTO focus_segments(session_id,started_at,ended_at,effective_ms) VALUES(?,?,?,?)").bind(id).bind(from).bind(to).bind(effective).execute(db).await.map_err(err)?;
    }
    Ok(())
}
async fn tick(
    db: &mut SqliteConnection,
    now: i64,
    restore: bool,
    elapsed: Option<i64>,
) -> Result<()> {
    if restore {
        query("UPDATE focus_details SET status='recovery',running_since=NULL,revision=revision+1 WHERE status='running'").execute(&mut *db).await.map_err(err)?;
    }
    if let Some(a) = active(db).await? {
        if a.status == "running" {
            let wall_delta = now - a.checkpoint_at;
            let delta = elapsed.unwrap_or(-1);
            if !(0..=45_000).contains(&delta) || (wall_delta - delta).abs() > 2_000 {
                query("UPDATE focus_details SET status='recovery',running_since=NULL,revision=revision+1 WHERE session_id=?").bind(a.id).execute(db).await.map_err(err)?;
            } else {
                segment(db, a.id, a.checkpoint_at, now, delta).await?;
                query("UPDATE focus_details SET elapsed_ms=elapsed_ms+?,running_since=?,checkpoint_at=? WHERE session_id=?").bind(delta).bind(now).bind(now).bind(a.id).execute(db).await.map_err(err)?;
            }
        }
    }
    Ok(())
}
async fn begin(db: &mut SqliteConnection, r: &Request, now: i64) -> Result<()> {
    if active(db).await?.is_some() {
        return Err("已有未结束的专注，请先结束或切换任务".into());
    }
    let mode = r.mode.as_deref().unwrap_or("stopwatch");
    if !["stopwatch", "countdown", "pomodoro"].contains(&mode) {
        return Err("不支持的计时模式".into());
    }
    let goal = r.goal_seconds;
    if goal.is_some_and(|g| g <= 0 || g > 86400) {
        return Err("本次目标应在1秒到24小时之间".into());
    }
    let mut title = "无关联专注".to_string();
    let mut category: Option<i64> = None;
    if let Some(id) = r.task_id {
        let task = query("SELECT title,status,category_id FROM tasks WHERE id=?")
            .bind(id)
            .fetch_optional(&mut *db)
            .await
            .map_err(err)?
            .ok_or("任务已不存在，请选择其他任务")?;
        if ["COMPLETED", "CANCELLED"].contains(&task.get::<String, _>("status").as_str()) {
            return Err("请先恢复该任务，再开始专注".into());
        }
        title = task.get("title");
        category = task.get("category_id");
    }
    let id=query("INSERT INTO focus_sessions(task_id,category_id,planned_duration,actual_duration,started_at,created_at,completed) VALUES(?,?,?,0,?,?,0)").bind(r.task_id).bind(category).bind(goal.unwrap_or(0)).bind(now).bind(now).execute(&mut *db).await.map_err(err)?.last_insert_rowid();
    query("INSERT INTO focus_details(session_id,task_title,status,mode,source,goal_seconds,running_since,checkpoint_at) VALUES(?,?,'running',?,'timer',?,?,?)").bind(id).bind(title).bind(mode).bind(goal).bind(now).bind(now).execute(db).await.map_err(err)?;
    Ok(())
}
/// Repair the derived cache from saved records, retaining only the separately
/// audited legacy difference. This must run after the session mutation in the transaction.
async fn update_actual(db: &mut SqliteConnection, id: Option<i64>, now: i64) -> Result<()> {
    if let Some(id) = id {
        query("UPDATE tasks SET actual_duration=COALESCE((SELECT untracked_seconds FROM focus_task_baselines WHERE task_id=tasks.id),0)+COALESCE((SELECT SUM(actual_duration) FROM focus_sessions WHERE task_id=tasks.id AND ended_at IS NOT NULL),0),updated_at=? WHERE id=?")
            .bind(now).bind(id).execute(db).await.map_err(err)?;
    }
    Ok(())
}
fn next_occurrence(date: &str, rule: &str) -> Option<String> {
    use chrono::{Datelike, Days, Months, NaiveDate, Weekday};
    let date = NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()?;
    let next = match rule {
        "daily" => date.checked_add_days(Days::new(1))?,
        "weekly" => date.checked_add_days(Days::new(7))?,
        "monthly" => date.checked_add_months(Months::new(1))?,
        "weekdays" => {
            let mut next = date;
            loop {
                next = next.checked_add_days(Days::new(1))?;
                if !matches!(next.weekday(), Weekday::Sat | Weekday::Sun) {
                    break next;
                }
            }
        }
        _ => return None,
    };
    Some(next.format("%Y-%m-%d").to_string())
}
async fn complete_task(db: &mut SqliteConnection, id: Option<i64>, now: i64) -> Result<()> {
    let Some(id) = id else { return Ok(()) };
    let Some(task) =
        query("SELECT status,repeat_rule,scheduled_date,repeat_source_id FROM tasks WHERE id=?")
            .bind(id)
            .fetch_optional(&mut *db)
            .await
            .map_err(err)?
    else {
        return Err("关联任务已不存在，请保留专注记录后刷新".into());
    };
    match task.get::<String, _>("status").as_str() {
        "COMPLETED" => return Ok(()),
        "TODO" => {}
        _ => return Err("任务状态已改变，请保留当前任务状态后保存专注".into()),
    }
    query("UPDATE tasks SET status='COMPLETED',completed_at=?,updated_at=? WHERE id=? AND status='TODO'").bind(now).bind(now).bind(id).execute(&mut *db).await.map_err(err)?;
    let Some(next) = next_occurrence(
        &task.get::<String, _>("scheduled_date"),
        task.get::<Option<String>, _>("repeat_rule")
            .as_deref()
            .unwrap_or(""),
    ) else {
        return Ok(());
    };
    let source = task.get::<Option<i64>, _>("repeat_source_id").unwrap_or(id);
    if query("SELECT id FROM tasks WHERE repeat_source_id=? AND scheduled_date=?")
        .bind(source)
        .bind(&next)
        .fetch_optional(&mut *db)
        .await
        .map_err(err)?
        .is_some()
    {
        return Ok(());
    }
    // Match TaskService's conservative adoption of one unambiguous pre-series occurrence.
    let legacy=query("SELECT c.id FROM tasks c JOIN tasks p ON p.id=? WHERE c.scheduled_date=? AND c.repeat_source_id IS NULL AND c.title=p.title AND c.repeat_rule=p.repeat_rule AND c.category_id IS p.category_id AND c.goal_id IS p.goal_id AND c.project_id IS p.project_id").bind(id).bind(&next).fetch_all(&mut *db).await.map_err(err)?;
    if legacy.len() == 1 {
        query("UPDATE tasks SET repeat_source_id=?,updated_at=? WHERE id=?")
            .bind(source)
            .bind(now)
            .bind(legacy[0].get::<i64, _>(0))
            .execute(&mut *db)
            .await
            .map_err(err)?;
        return Ok(());
    }
    query("INSERT INTO tasks(title,category_id,status,estimated_duration,planned_start,planned_end,actual_duration,scheduled_date,created_at,updated_at,completed_at,notes,goal_id,project_id,phase_id,parent_id,course_id,repeat_rule,repeat_source_id,priority,sort_order) SELECT title,category_id,'TODO',estimated_duration,planned_start,planned_end,0,?,?,?,NULL,notes,goal_id,project_id,phase_id,parent_id,course_id,repeat_rule,?,CASE WHEN priority IN ('low','medium','high') THEN priority ELSE 'medium' END,0 FROM tasks WHERE id=? ON CONFLICT DO NOTHING").bind(&next).bind(now).bind(now).bind(source).bind(id).execute(&mut *db).await.map_err(err)?;
    let ordered=query("SELECT id FROM tasks WHERE scheduled_date=? ORDER BY planned_start IS NULL,planned_start,created_at,id").bind(&next).fetch_all(&mut *db).await.map_err(err)?;
    for (order, row) in ordered.iter().enumerate() {
        query("UPDATE tasks SET sort_order=? WHERE id=?")
            .bind(order as i64)
            .bind(row.get::<i64, _>(0))
            .execute(&mut *db)
            .await
            .map_err(err)?;
    }
    Ok(())
}
async fn finish(db: &mut SqliteConnection, a: &Record, r: &Request, now: i64) -> Result<()> {
    if a.status == "recovery" {
        return Err("请先确认离开期间的时间".into());
    }
    let seconds = a.actual_seconds.floor() as i64;
    query("UPDATE focus_sessions SET ended_at=?,actual_duration=?,completed=? WHERE id=?")
        .bind(now)
        .bind(seconds)
        .bind(a.goal_seconds.is_some_and(|g| seconds >= g))
        .bind(a.id)
        .execute(&mut *db)
        .await
        .map_err(err)?;
    query("UPDATE focus_details SET status='finished',running_since=NULL,note=?,next_action=?,revision=revision+1 WHERE session_id=?").bind(r.note.as_deref().unwrap_or(&a.note)).bind(r.next_action.as_deref().unwrap_or(&a.next_action)).bind(a.id).execute(&mut *db).await.map_err(err)?;
    update_actual(db, a.task_id, now).await?;
    if r.complete_task == Some(true) {
        complete_task(db, a.task_id, now).await?;
    }
    query("DELETE FROM settings WHERE key='active_focus'")
        .execute(db)
        .await
        .map_err(err)?;
    Ok(())
}
async fn execute_timed(
    db: &mut SqliteConnection,
    r: &Request,
    now: i64,
    restore: bool,
    elapsed: Option<i64>,
) -> Result<Response> {
    let mut tx = db.begin().await.map_err(err)?;
    let request_json = serde_json::to_string(r).map_err(err)?;
    if let Some(op) = &r.operation_id {
        if let Some(row) =
            query("SELECT request_json,result_json FROM focus_operations WHERE operation_id=?")
                .bind(op)
                .fetch_optional(&mut *tx)
                .await
                .map_err(err)?
        {
            if row.get::<String, _>(0) != request_json {
                return Err("重复操作内容发生变化，请重新操作".into());
            }
            tick(&mut tx, now, restore, elapsed).await?;
            let response = Response {
                active: active(&mut tx).await?,
                sessions: None,
            };
            tx.commit().await.map_err(err)?;
            return Ok(response);
        }
    }
    // Validate semantic version before checkpoints. Recovery can still reject the command below.
    let before = active(&mut tx).await?;
    let targets_active = matches!(
        r.action.as_str(),
        "pause" | "resume" | "finish" | "switch" | "recover" | "interrupt"
    );
    if targets_active {
        let a = before.as_ref().ok_or("当前没有活动专注")?;
        if r.session_id != Some(a.id) || r.expected_version.is_some_and(|v| v != a.revision) {
            return Err("专注状态已在其他窗口改变，请刷新后重试".into());
        }
    }
    tick(&mut tx, now, restore, elapsed).await?;
    let current = active(&mut tx).await?;
    let mut sessions = None;
    match r.action.as_str() {
        "read" | "heartbeat" => {}
        "start" => begin(&mut tx, r, now).await?,
        "list" => {
            sessions = Some(
                query(&format!(
                    "{SELECT} WHERE d.status='finished' ORDER BY f.started_at DESC LIMIT ?"
                ))
                .bind(r.limit.unwrap_or(100).clamp(1, 1000))
                .fetch_all(&mut *tx)
                .await
                .map_err(err)?
                .into_iter()
                .map(record)
                .collect(),
            );
        }
        "pause" | "resume" | "interrupt" => {
            let a = current.as_ref().ok_or("当前没有活动专注")?;
            if a.status == "recovery" {
                return Err("请先确认离开期间的时间".into());
            }
            if r.action == "interrupt" {
                query("UPDATE focus_details SET interruption_count=interruption_count+1,revision=revision+1 WHERE session_id=?").bind(a.id).execute(&mut *tx).await.map_err(err)?;
            } else if r.action == "pause" && a.status == "running" {
                query("UPDATE focus_details SET status='paused',running_since=NULL,paused_at=?,revision=revision+1 WHERE session_id=?").bind(now).bind(a.id).execute(&mut *tx).await.map_err(err)?;
            } else if r.action == "resume" && a.status == "paused" {
                query("UPDATE focus_details SET status='running',running_since=?,checkpoint_at=?,paused_at=NULL,revision=revision+1 WHERE session_id=?").bind(now).bind(now).bind(a.id).execute(&mut *tx).await.map_err(err)?;
            }
        }
        "finish" | "switch" => {
            finish(&mut tx, current.as_ref().ok_or("当前没有活动专注")?, r, now).await?;
            if r.action == "switch" {
                begin(&mut tx, r, now).await?;
            }
        }
        "recover" => {
            let a = current.as_ref().ok_or("当前没有活动专注")?;
            if a.status != "recovery" {
                return Err("该专注无需恢复".into());
            }
            match r.recovery_choice.as_deref() {
                Some("discard") => {
                    query("DELETE FROM focus_sessions WHERE id=?")
                        .bind(a.id)
                        .execute(&mut *tx)
                        .await
                        .map_err(err)?;
                }
                Some("include") | Some("exclude") => {
                    let extra = if r.recovery_choice.as_deref() == Some("include") {
                        (now - a.checkpoint_at).max(0)
                    } else {
                        0
                    };
                    if extra > 7 * 86400000 {
                        return Err("离开时间超过7天，请排除该区间后手动补录".into());
                    }
                    segment(
                        &mut tx,
                        a.id,
                        a.checkpoint_at,
                        a.checkpoint_at + extra,
                        extra,
                    )
                    .await?;
                    query("UPDATE focus_details SET elapsed_ms=elapsed_ms+?,status='paused',running_since=NULL,paused_at=?,checkpoint_at=?,revision=revision+1 WHERE session_id=?").bind(extra).bind(now).bind(now).bind(a.id).execute(&mut *tx).await.map_err(err)?;
                }
                _ => return Err("请选择如何处理离开期间的时间".into()),
            }
        }
        "manual" | "edit" => {
            let existing = if r.action == "edit" {
                Some(by_id(&mut tx, r.session_id.ok_or("缺少记录ID")?).await?)
            } else {
                None
            };
            let seconds = r
                .duration_seconds
                .or_else(|| existing.as_ref().map(|a| a.actual_seconds.floor() as i64))
                .ok_or("请输入投入时长")?;
            let start = r
                .started_at
                .or_else(|| existing.as_ref().map(|a| a.started_at))
                .ok_or("请选择开始时间")?;
            let timing_changed = existing.as_ref().is_none_or(|a| {
                seconds != a.actual_seconds.floor() as i64 || start != a.started_at
            });
            if timing_changed
                && (seconds <= 0
                    || seconds > 86400
                    || start <= 0
                    || start > now
                    || start.saturating_add(seconds.saturating_mul(1000))
                        > now.saturating_add(60_000))
            {
                return Err("请输入已发生的有效时间（不超过24小时）".into());
            }
            let note = r
                .note
                .as_deref()
                .unwrap_or_else(|| existing.as_ref().map(|a| a.note.as_str()).unwrap_or(""));
            let id = if let Some(ref a) = existing {
                if a.status != "finished" {
                    return Err("请先结束专注再编辑记录".into());
                }
                if r.expected_version.is_some_and(|v| v != a.revision) {
                    return Err("记录已被修改，请刷新".into());
                }
                if !timing_changed {
                    query("UPDATE focus_details SET note=?,revision=revision+1 WHERE session_id=?")
                        .bind(r.note.as_deref().unwrap_or(&a.note))
                        .bind(a.id)
                        .execute(&mut *tx)
                        .await
                        .map_err(err)?;
                } else {
                    query("UPDATE focus_sessions SET actual_duration=?,started_at=?,ended_at=?,completed=0 WHERE id=?").bind(seconds).bind(start).bind(start+seconds*1000).bind(a.id).execute(&mut *tx).await.map_err(err)?;
                }
                update_actual(&mut tx, a.task_id, now).await?;
                a.id
            } else {
                let title = if let Some(task) = r.task_id {
                    query("SELECT title FROM tasks WHERE id=?")
                        .bind(task)
                        .fetch_optional(&mut *tx)
                        .await
                        .map_err(err)?
                        .ok_or("任务已不存在")?
                        .get::<String, _>(0)
                } else {
                    "无关联专注".into()
                };
                let id=query("INSERT INTO focus_sessions(task_id,category_id,planned_duration,actual_duration,started_at,ended_at,created_at,completed) VALUES(?,(SELECT category_id FROM tasks WHERE id=?),0,?,?,?,?,0)").bind(r.task_id).bind(r.task_id).bind(seconds).bind(start).bind(start+seconds*1000).bind(now).execute(&mut *tx).await.map_err(err)?.last_insert_rowid();
                query("INSERT INTO focus_details(session_id,task_title,status,source,checkpoint_at) VALUES(?,?,'finished','manual',?)").bind(id).bind(title).bind(now).execute(&mut *tx).await.map_err(err)?;
                update_actual(&mut tx, r.task_id, now).await?;
                id
            };
            if timing_changed {
                query("DELETE FROM focus_segments WHERE session_id=?")
                    .bind(id)
                    .execute(&mut *tx)
                    .await
                    .map_err(err)?;
                segment(&mut tx, id, start, start + seconds * 1000, seconds * 1000).await?;
                query("UPDATE focus_details SET elapsed_ms=?,source='manual',note=?,revision=revision+1 WHERE session_id=?").bind(seconds*1000).bind(note).bind(id).execute(&mut *tx).await.map_err(err)?;
            }
        }
        "delete" => {
            let a = by_id(&mut tx, r.session_id.ok_or("缺少记录ID")?).await?;
            if a.status != "finished" {
                return Err("不能删除正在进行的专注".into());
            }
            if r.expected_version.is_some_and(|v| v != a.revision) {
                return Err("记录已被修改，请刷新".into());
            }
            query("DELETE FROM focus_sessions WHERE id=?")
                .bind(a.id)
                .execute(&mut *tx)
                .await
                .map_err(err)?;
            update_actual(&mut tx, a.task_id, now).await?;
        }
        _ => return Err("不支持的专注操作".into()),
    }
    let response = Response {
        active: active(&mut tx).await?,
        sessions,
    };
    if let Some(op) = &r.operation_id {
        query("INSERT INTO focus_operations(operation_id,request_json,result_json,created_at) VALUES(?,?,?,?)").bind(op).bind(request_json).bind(serde_json::to_string(&response).map_err(err)?).bind(now).execute(&mut *tx).await.map_err(err)?;
    }
    tx.commit().await.map_err(err)?;
    Ok(response)
}

#[derive(Default)]
struct Runtime {
    path: Option<PathBuf>,
    checkpoint: Option<Instant>,
}
static RUNTIME: OnceLock<tokio::sync::Mutex<Runtime>> = OnceLock::new();
static WORKER: AtomicBool = AtomicBool::new(false);
async fn run(app: &tauri::AppHandle, request: &Request) -> Result<Response> {
    let mut runtime = RUNTIME
        .get_or_init(|| tokio::sync::Mutex::new(Runtime::default()))
        .lock()
        .await;
    let path = super::dailyflow_data_dir(app)?.join("dailyflow.db");
    let mut db = SqliteConnection::connect_with(
        &SqliteConnectOptions::new()
            .filename(&path)
            .foreign_keys(true)
            .busy_timeout(Duration::from_secs(5)),
    )
    .await
    .map_err(err)?;
    let restore = runtime.path.as_ref() != Some(&path);
    let sample = Instant::now();
    let elapsed = runtime.checkpoint.map(|last| {
        sample
            .duration_since(last)
            .as_millis()
            .min(i64::MAX as u128) as i64
    });
    let result = execute_timed(
        &mut db,
        request,
        chrono::Utc::now().timestamp_millis(),
        restore,
        elapsed,
    )
    .await;
    // Release every SQLite handle while still holding the restore/worker lock.
    let _ = db.close().await;
    if result.is_ok() {
        runtime.path = Some(path);
        runtime.checkpoint = Some(sample);
    }
    result
}
/// The backup file swap and native worker share one lock, including same-path restores.
pub async fn with_database_restore<T>(operation: impl FnOnce() -> Result<T>) -> Result<T> {
    let mut runtime = RUNTIME
        .get_or_init(|| tokio::sync::Mutex::new(Runtime::default()))
        .lock()
        .await;
    runtime.path = None;
    runtime.checkpoint = None;
    operation()
}
#[tauri::command]
pub async fn focus_execute(app: tauri::AppHandle, request: Request) -> Result<Response> {
    let result = run(&app, &request).await?;
    if !matches!(request.action.as_str(), "read" | "list") {
        let _ = app.emit("df:focus-changed", ());
    }
    if !WORKER.swap(true, Ordering::SeqCst) {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(15)).await;
                if let Ok(response) = run(
                    &app,
                    &Request {
                        action: "heartbeat".into(),
                        ..Default::default()
                    },
                )
                .await
                {
                    if response.active.is_some() {
                        let _ = app.emit("df:focus-tick", ());
                    }
                }
            }
        });
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    async fn execute_db(
        db: &mut SqliteConnection,
        r: &Request,
        now: i64,
        restore: bool,
    ) -> Result<Response> {
        let elapsed = active(db).await?.map(|a| (now - a.checkpoint_at).max(0));
        execute_timed(db, r, now, restore, elapsed).await
    }
    async fn db() -> SqliteConnection {
        let mut db = SqliteConnection::connect("sqlite::memory:").await.unwrap();
        for sql in ["PRAGMA foreign_keys=ON", "CREATE TABLE tasks(id INTEGER PRIMARY KEY,title TEXT,status TEXT,category_id INTEGER,actual_duration INTEGER DEFAULT 0,updated_at INTEGER,completed_at INTEGER,repeat_rule TEXT,scheduled_date TEXT DEFAULT '2026-09-20',repeat_source_id INTEGER,estimated_duration INTEGER,planned_start INTEGER,planned_end INTEGER,notes TEXT,goal_id INTEGER,project_id INTEGER,phase_id INTEGER,parent_id INTEGER,course_id INTEGER,priority TEXT,created_at INTEGER,sort_order INTEGER DEFAULT 0)","CREATE UNIQUE INDEX task_repeat_once ON tasks(repeat_source_id,scheduled_date) WHERE repeat_source_id IS NOT NULL","CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT)","CREATE TABLE focus_sessions(id INTEGER PRIMARY KEY AUTOINCREMENT,task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,category_id INTEGER,planned_duration INTEGER,actual_duration INTEGER,started_at INTEGER,ended_at INTEGER,created_at INTEGER,completed INTEGER)","INSERT INTO tasks(id,title,status) VALUES(1,'Task A','TODO'),(2,'Task B','TODO')"] { query(sql).execute(&mut db).await.unwrap(); }
        for sql in include_str!("../../src/db/migrations/0032_focus_execution.sql")
            .split("--> statement-breakpoint")
        {
            if !sql.trim().is_empty() {
                query(sql).execute(&mut db).await.unwrap();
            }
        }
        db
    }
    fn cmd(action: &str, id: Option<i64>) -> Request {
        Request {
            action: action.into(),
            session_id: id,
            ..Default::default()
        }
    }
    #[test]
    fn pause_finish_is_atomic_and_idempotent() {
        tauri::async_runtime::block_on(async {
            let mut db = db().await;
            let mut start = cmd("start", None);
            start.task_id = Some(1);
            let id = execute_db(&mut db, &start, 1000, false)
                .await
                .unwrap()
                .active
                .unwrap()
                .id;
            execute_db(&mut db, &cmd("pause", Some(id)), 31_000, false)
                .await
                .unwrap();
            let mut finish = cmd("finish", Some(id));
            finish.operation_id = Some("save-once".into());
            execute_db(&mut db, &finish, 91_000, false).await.unwrap();
            execute_db(&mut db, &finish, 92_000, false).await.unwrap();
            let seconds: i64 = query("SELECT actual_duration FROM tasks WHERE id=1")
                .fetch_one(&mut db)
                .await
                .unwrap()
                .get(0);
            assert_eq!(seconds, 30);
        });
    }
    #[test]
    fn failed_switch_rolls_back_finish() {
        tauri::async_runtime::block_on(async {
            let mut db = db().await;
            let id = execute_db(&mut db, &cmd("start", None), 1000, false)
                .await
                .unwrap()
                .active
                .unwrap()
                .id;
            let mut switch = cmd("switch", Some(id));
            switch.task_id = Some(999);
            assert!(execute_db(&mut db, &switch, 31_000, false).await.is_err());
            assert_eq!(active(&mut db).await.unwrap().unwrap().status, "running");
        });
    }
    #[test]
    fn recovery_does_not_silently_count_sleep_or_restart() {
        tauri::async_runtime::block_on(async {
            let mut db = db().await;
            execute_db(&mut db, &cmd("start", None), 1000, false)
                .await
                .unwrap();
            let result = execute_db(&mut db, &cmd("read", None), 3601000, false)
                .await
                .unwrap()
                .active
                .unwrap();
            assert_eq!(result.status, "recovery");
            assert_eq!(result.actual_seconds, 0.);
            let mut recover = cmd("recover", Some(result.id));
            recover.recovery_choice = Some("exclude".into());
            assert_eq!(
                execute_db(&mut db, &recover, 3602000, false)
                    .await
                    .unwrap()
                    .active
                    .unwrap()
                    .actual_seconds,
                0.
            );
        });
    }
    #[test]
    fn manual_edit_delete_updates_actual_without_duplicates() {
        tauri::async_runtime::block_on(async {
            let mut db = db().await;
            let mut manual = cmd("manual", None);
            manual.task_id = Some(1);
            manual.started_at = Some(1000);
            manual.duration_seconds = Some(60);
            execute_db(&mut db, &manual, 100000, false).await.unwrap();
            let history = execute_db(&mut db, &cmd("list", None), 100001, false)
                .await
                .unwrap()
                .sessions
                .unwrap();
            let mut edit = manual.clone();
            edit.action = "edit".into();
            edit.session_id = Some(history[0].id);
            edit.duration_seconds = Some(30);
            execute_db(&mut db, &edit, 100002, false).await.unwrap();
            execute_db(&mut db, &cmd("delete", edit.session_id), 100003, false)
                .await
                .unwrap();
            assert_eq!(
                query("SELECT actual_duration FROM tasks WHERE id=1")
                    .fetch_one(&mut db)
                    .await
                    .unwrap()
                    .get::<i64, _>(0),
                0
            );
        });
    }
    #[test]
    fn replay_returns_current_active_not_original_start() {
        tauri::async_runtime::block_on(async {
            let mut db = db().await;
            let mut start = cmd("start", None);
            start.operation_id = Some("start-once".into());
            let id = execute_db(&mut db, &start, 1000, false)
                .await
                .unwrap()
                .active
                .unwrap()
                .id;
            execute_db(&mut db, &cmd("pause", Some(id)), 2000, false)
                .await
                .unwrap();
            assert_eq!(
                execute_db(&mut db, &start, 3000, false)
                    .await
                    .unwrap()
                    .active
                    .unwrap()
                    .status,
                "paused"
            );
        });
    }
    #[test]
    fn note_edit_preserves_timer_segments_and_source() {
        tauri::async_runtime::block_on(async {
            let mut db = db().await;
            let id = execute_db(&mut db, &cmd("start", None), 1000, false)
                .await
                .unwrap()
                .active
                .unwrap()
                .id;
            execute_db(&mut db, &cmd("pause", Some(id)), 11000, false)
                .await
                .unwrap();
            execute_db(&mut db, &cmd("resume", Some(id)), 21000, false)
                .await
                .unwrap();
            execute_db(&mut db, &cmd("finish", Some(id)), 31000, false)
                .await
                .unwrap();
            let mut edit = cmd("edit", Some(id));
            edit.duration_seconds = Some(20);
            edit.started_at = Some(1000);
            edit.note = Some("note".into());
            execute_db(&mut db, &edit, 41000, false).await.unwrap();
            let a = by_id(&mut db, id).await.unwrap();
            assert_eq!(a.source, "timer");
            assert_eq!(a.ended_at, Some(31000));
            assert_eq!(
                query("SELECT COUNT(*) FROM focus_segments WHERE session_id=?")
                    .bind(id)
                    .fetch_one(&mut db)
                    .await
                    .unwrap()
                    .get::<i64, _>(0),
                2
            );
        });
    }
    #[test]
    fn finish_does_not_reverse_cancelled_task() {
        tauri::async_runtime::block_on(async {
            let mut db = db().await;
            let mut start = cmd("start", None);
            start.task_id = Some(1);
            let id = execute_db(&mut db, &start, 1000, false)
                .await
                .unwrap()
                .active
                .unwrap()
                .id;
            query("UPDATE tasks SET status='CANCELLED' WHERE id=1")
                .execute(&mut db)
                .await
                .unwrap();
            let mut finish = cmd("finish", Some(id));
            finish.complete_task = Some(true);
            assert!(execute_db(&mut db, &finish, 11000, false).await.is_err());
            assert_eq!(active(&mut db).await.unwrap().unwrap().status, "running");
            assert_eq!(
                query("SELECT status FROM tasks WHERE id=1")
                    .fetch_one(&mut db)
                    .await
                    .unwrap()
                    .get::<String, _>(0),
                "CANCELLED"
            );
        });
    }
    #[test]
    fn finish_repeating_task_creates_next_occurrence() {
        tauri::async_runtime::block_on(async {
            let mut db = db().await;
            query("UPDATE tasks SET repeat_rule='daily' WHERE id=1")
                .execute(&mut db)
                .await
                .unwrap();
            let mut start = cmd("start", None);
            start.task_id = Some(1);
            let id = execute_db(&mut db, &start, 1000, false)
                .await
                .unwrap()
                .active
                .unwrap()
                .id;
            let mut finish = cmd("finish", Some(id));
            finish.complete_task = Some(true);
            finish.operation_id = Some("complete-repeat".into());
            execute_db(&mut db, &finish, 11000, false).await.unwrap();
            execute_db(&mut db, &finish, 12000, false).await.unwrap();
            assert_eq!(
                query("SELECT COUNT(*) FROM tasks")
                    .fetch_one(&mut db)
                    .await
                    .unwrap()
                    .get::<i64, _>(0),
                3
            );
        });
    }

    #[test]
    fn monotonic_elapsed_rejects_clock_jumps_and_sleep() {
        tauri::async_runtime::block_on(async {
            for (now, elapsed) in [(61_000, 15_000), (-4_000, 15_000), (61_000, 60_000)] {
                let mut db = db().await;
                execute_db(&mut db, &cmd("start", None), 1000, false)
                    .await
                    .unwrap();
                let result = execute_timed(&mut db, &cmd("read", None), now, false, Some(elapsed))
                    .await
                    .unwrap()
                    .active
                    .unwrap();
                assert_eq!(result.status, "recovery");
                assert_eq!(result.actual_seconds, 0.);
            }
            let mut db = db().await;
            execute_db(&mut db, &cmd("start", None), 1000, false)
                .await
                .unwrap();
            let a = execute_timed(&mut db, &cmd("read", None), 16_100, false, Some(15_000))
                .await
                .unwrap()
                .active
                .unwrap();
            assert_eq!(a.actual_seconds, 15.);
            assert_eq!(
                query("SELECT SUM(effective_ms) FROM focus_segments")
                    .fetch_one(&mut db)
                    .await
                    .unwrap()
                    .get::<i64, _>(0),
                15_000
            );
        });
    }
    #[test]
    fn legacy_paused_migration_preserves_confirmed_elapsed() {
        tauri::async_runtime::block_on(async {
            let mut db = db().await;
            query("INSERT INTO focus_sessions(id,task_id,planned_duration,actual_duration,started_at,created_at,completed) VALUES(44,1,1500,0,1000,1000,0)").execute(&mut db).await.unwrap();
            query("INSERT INTO settings(key,value) VALUES('active_focus',?)")
                .bind(r#"{"sessionId":44,"pausedAt":91000,"accumulatedPauseMs":30000}"#)
                .execute(&mut db)
                .await
                .unwrap();
            for sql in include_str!("../../src/db/migrations/0032_focus_execution.sql")
                .split("--> statement-breakpoint")
            {
                if !sql.trim().is_empty() {
                    query(sql).execute(&mut db).await.unwrap();
                }
            }
            let a = by_id(&mut db, 44).await.unwrap();
            assert_eq!(a.status, "paused");
            assert_eq!(a.actual_seconds, 60.);
            assert_eq!(a.paused_at, Some(91000));
            let a = execute_timed(&mut db, &cmd("read", None), 3_601_000, true, None)
                .await
                .unwrap()
                .active
                .unwrap();
            assert_eq!(a.status, "paused");
            assert_eq!(a.actual_seconds, 60.);
        });
    }
    #[test]
    fn restore_serializes_worker_and_resets_same_path_clock() {
        tauri::async_runtime::block_on(async {
            let mutex = RUNTIME.get_or_init(|| tokio::sync::Mutex::new(Runtime::default()));
            let mut worker = mutex.lock().await;
            worker.path = Some(PathBuf::from("same.db"));
            worker.checkpoint = Some(Instant::now());
            let restored = std::sync::Arc::new(AtomicBool::new(false));
            let flag = restored.clone();
            let restore = tauri::async_runtime::spawn(async move {
                with_database_restore(|| {
                    flag.store(true, Ordering::SeqCst);
                    Ok(())
                })
                .await
                .unwrap()
            });
            tokio::time::sleep(Duration::from_millis(20)).await;
            assert!(!restored.load(Ordering::SeqCst));
            drop(worker);
            restore.await.unwrap();
            let runtime = mutex.lock().await;
            assert!(runtime.path.is_none());
            assert!(runtime.checkpoint.is_none());
        });
    }
    #[test]
    fn recurrence_matches_calendar_and_adopts_existing_occurrence() {
        tauri::async_runtime::block_on(async {
            assert_eq!(
                next_occurrence("2026-01-31", "monthly"),
                Some("2026-02-28".into())
            );
            assert_eq!(
                next_occurrence("2026-09-18", "weekdays"),
                Some("2026-09-21".into())
            );
            assert_eq!(
                next_occurrence("2026-09-20", "weekly"),
                Some("2026-09-27".into())
            );
            let mut db = db().await;
            query("UPDATE tasks SET repeat_rule='daily' WHERE id=1")
                .execute(&mut db)
                .await
                .unwrap();
            query("INSERT INTO tasks(id,title,status,repeat_rule,scheduled_date) VALUES(3,'Task A','CANCELLED','daily','2026-09-21')").execute(&mut db).await.unwrap();
            complete_task(&mut db, Some(1), 1000).await.unwrap();
            complete_task(&mut db, Some(1), 2000).await.unwrap();
            let row = query("SELECT status,repeat_source_id FROM tasks WHERE id=3")
                .fetch_one(&mut db)
                .await
                .unwrap();
            assert_eq!(row.get::<String, _>(0), "CANCELLED");
            assert_eq!(row.get::<i64, _>(1), 1);
            assert_eq!(
                query("SELECT COUNT(*) FROM tasks")
                    .fetch_one(&mut db)
                    .await
                    .unwrap()
                    .get::<i64, _>(0),
                3
            );
        });
    }

    #[test]
    fn zero_second_note_only_edit_keeps_timing() {
        tauri::async_runtime::block_on(async {
            let mut db = db().await;
            let id = execute_db(&mut db, &cmd("start", None), 1000, false)
                .await
                .unwrap()
                .active
                .unwrap()
                .id;
            execute_db(&mut db, &cmd("finish", Some(id)), 1000, false)
                .await
                .unwrap();
            let mut edit = cmd("edit", Some(id));
            edit.note = Some("Short session".into());
            execute_db(&mut db, &edit, 2000, false).await.unwrap();
            let a = by_id(&mut db, id).await.unwrap();
            assert_eq!(a.note, "Short session");
            assert_eq!(a.source, "timer");
            assert_eq!(a.actual_seconds, 0.);
        });
    }
    #[test]
    fn repeat_creation_failure_rolls_back_focus_and_task_completion() {
        tauri::async_runtime::block_on(async {
            let mut db = db().await;
            query("UPDATE tasks SET repeat_rule='daily' WHERE id=1")
                .execute(&mut db)
                .await
                .unwrap();
            query("CREATE TRIGGER reject_repeat BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT,'test save failure'); END").execute(&mut db).await.unwrap();
            let mut start = cmd("start", None);
            start.task_id = Some(1);
            let id = execute_db(&mut db, &start, 1000, false)
                .await
                .unwrap()
                .active
                .unwrap()
                .id;
            let mut finish = cmd("finish", Some(id));
            finish.complete_task = Some(true);
            assert!(execute_db(&mut db, &finish, 11000, false).await.is_err());
            assert_eq!(active(&mut db).await.unwrap().unwrap().status, "running");
            let row = query("SELECT status,actual_duration FROM tasks WHERE id=1")
                .fetch_one(&mut db)
                .await
                .unwrap();
            assert_eq!(row.get::<String, _>(0), "TODO");
            assert_eq!(row.get::<i64, _>(1), 0);
        });
    }
    #[test]
    fn changing_saved_session_repairs_task_cache_undercount() {
        tauri::async_runtime::block_on(async {
            let mut db = db().await;
            let mut manual = cmd("manual", None);
            manual.task_id = Some(1);
            manual.duration_seconds = Some(60);
            manual.started_at = Some(1000);
            execute_db(&mut db, &manual, 100000, false).await.unwrap();
            query("UPDATE tasks SET actual_duration=5 WHERE id=1")
                .execute(&mut db)
                .await
                .unwrap();
            let mut edit = manual.clone();
            edit.action = "edit".into();
            edit.session_id = Some(1);
            edit.duration_seconds = Some(30);
            execute_db(&mut db, &edit, 100001, false).await.unwrap();
            assert_eq!(
                query("SELECT actual_duration FROM tasks WHERE id=1")
                    .fetch_one(&mut db)
                    .await
                    .unwrap()
                    .get::<i64, _>(0),
                30
            );
        });
    }
    #[test]
    fn migration_preserves_untracked_legacy_time_and_repairs_undercount() {
        tauri::async_runtime::block_on(async {
            let mut db = db().await;
            for task in [1, 2] {
                let mut manual = cmd("manual", None);
                manual.task_id = Some(task);
                manual.duration_seconds = Some(60);
                manual.started_at = Some(1000);
                execute_db(&mut db, &manual, 100000, false).await.unwrap();
            }
            query("UPDATE tasks SET actual_duration=CASE id WHEN 1 THEN 100 ELSE 5 END")
                .execute(&mut db)
                .await
                .unwrap();
            // Re-run the migration against the legacy cache state, before baselines exist.
            query("DROP TABLE IF EXISTS focus_task_baselines")
                .execute(&mut db)
                .await
                .unwrap();
            for sql in include_str!("../../src/db/migrations/0032_focus_execution.sql")
                .split("--> statement-breakpoint")
            {
                if !sql.trim().is_empty() {
                    query(sql).execute(&mut db).await.unwrap();
                }
            }
            assert_eq!(
                query("SELECT actual_duration FROM tasks WHERE id=2")
                    .fetch_one(&mut db)
                    .await
                    .unwrap()
                    .get::<i64, _>(0),
                60
            );
            let mut edit = cmd("edit", Some(1));
            edit.duration_seconds = Some(30);
            edit.started_at = Some(1000);
            execute_db(&mut db, &edit, 100001, false).await.unwrap();
            assert_eq!(
                query("SELECT actual_duration FROM tasks WHERE id=1")
                    .fetch_one(&mut db)
                    .await
                    .unwrap()
                    .get::<i64, _>(0),
                70
            );
            execute_db(&mut db, &cmd("delete", Some(1)), 100002, false)
                .await
                .unwrap();
            assert_eq!(
                query("SELECT actual_duration FROM tasks WHERE id=1")
                    .fetch_one(&mut db)
                    .await
                    .unwrap()
                    .get::<i64, _>(0),
                40
            );
            query("DELETE FROM tasks WHERE id=1")
                .execute(&mut db)
                .await
                .unwrap();
            assert_eq!(
                query("SELECT untracked_seconds FROM focus_task_baselines WHERE task_id=1")
                    .fetch_one(&mut db)
                    .await
                    .unwrap()
                    .get::<i64, _>(0),
                40
            );
        });
    }
}
