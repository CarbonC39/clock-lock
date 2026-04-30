use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use sqlx::Row;
use tauri::AppHandle;
use tauri::Manager as _;

use crate::db;

pub struct DbPoolCache(pub Mutex<HashMap<String, SqlitePool>>);

/// Returns the per-workspace database pool, using an in-memory cache
async fn get_pool(app: &AppHandle, workspace_hash: &str) -> Result<SqlitePool, String> {
    {
        let cache = app.state::<DbPoolCache>();
        let map = cache.0.lock().unwrap();
        if let Some(pool) = map.get(workspace_hash) {
            return Ok(pool.clone());
        }
    }

    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = base.join("workspaces").join(workspace_hash).join("memory.db");
    let pool = db::open_db(&db_path).await?;

    {
        let cache = app.state::<DbPoolCache>();
        let mut map = cache.0.lock().unwrap();
        map.insert(workspace_hash.to_string(), pool.clone());
    }

    Ok(pool)
}

// ── Frontend types ──

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MsgRecord {
    pub id: i64,
    pub role: String,
    pub content: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EventRecord {
    pub id: i64,
    pub r#type: String,
    pub description: String,
    pub created_at: i64,
}

// ── Conversation ──

#[tauri::command]
pub async fn ensure_conversation(
    app: AppHandle,
    workspace_hash: String,
) -> Result<String, String> {
    let pool = get_pool(&app, &workspace_hash).await?;

    let existing = sqlx::query_scalar::<_, String>(
        "SELECT id FROM conversations WHERE project_hash = ? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(&workspace_hash)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(id) = existing {
        return Ok(id);
    }

    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO conversations (id, project_hash) VALUES (?, ?)")
        .bind(&id)
        .bind(&workspace_hash)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(id)
}

// ── Messages ──

#[tauri::command]
pub async fn save_message(
    app: AppHandle,
    workspace_hash: String,
    conv_id: String,
    role: String,
    content: String,
) -> Result<i64, String> {
    let pool = get_pool(&app, &workspace_hash).await?;
    let row = sqlx::query(
        "INSERT INTO messages (conv_id, role, content) VALUES (?, ?, ?) RETURNING id",
    )
    .bind(&conv_id)
    .bind(&role)
    .bind(&content)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.get::<i64, _>("id"))
}

#[tauri::command]
pub async fn load_messages(
    app: AppHandle,
    workspace_hash: String,
    conv_id: String,
    limit: u32,
) -> Result<Vec<MsgRecord>, String> {
    let pool = get_pool(&app, &workspace_hash).await?;
    let rows = sqlx::query(
        "SELECT id, role, content FROM messages
         WHERE conv_id = ?
         ORDER BY created_at ASC, id ASC
         LIMIT ?",
    )
    .bind(&conv_id)
    .bind(limit as i64)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|r| MsgRecord {
            id: r.get("id"),
            role: r.get("role"),
            content: r.get("content"),
        })
        .collect())
}

#[tauri::command]
pub async fn search_messages(
    app: AppHandle,
    workspace_hash: String,
    query: String,
    limit: u32,
) -> Result<Vec<MsgRecord>, String> {
    let pool = get_pool(&app, &workspace_hash).await?;
    let rows = sqlx::query(
        "SELECT m.id, m.role, m.content FROM messages m
         JOIN messages_fts f ON m.id = f.rowid
         WHERE messages_fts MATCH ?
         ORDER BY rank
         LIMIT ?",
    )
    .bind(&query)
    .bind(limit as i64)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|r| MsgRecord {
            id: r.get("id"),
            role: r.get("role"),
            content: r.get("content"),
        })
        .collect())
}

#[tauri::command]
pub async fn clear_conversation(
    app: AppHandle,
    workspace_hash: String,
    conv_id: String,
) -> Result<(), String> {
    let pool = get_pool(&app, &workspace_hash).await?;
    sqlx::query("DELETE FROM messages WHERE conv_id = ?")
        .bind(&conv_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Events ──

#[tauri::command]
pub async fn log_event(
    app: AppHandle,
    workspace_hash: String,
    event_type: String,
    description: String,
) -> Result<(), String> {
    let pool = get_pool(&app, &workspace_hash).await?;
    sqlx::query("INSERT INTO events (project_hash, type, description) VALUES (?, ?, ?)")
        .bind(&workspace_hash)
        .bind(&event_type)
        .bind(&description)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_events(
    app: AppHandle,
    workspace_hash: String,
    limit: u32,
) -> Result<Vec<EventRecord>, String> {
    let pool = get_pool(&app, &workspace_hash).await?;
    let rows = sqlx::query(
        "SELECT id, type, description, created_at FROM events
         WHERE project_hash = ?
         ORDER BY created_at DESC
         LIMIT ?",
    )
    .bind(&workspace_hash)
    .bind(limit as i64)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|r| EventRecord {
            id: r.get("id"),
            r#type: r.get("type"),
            description: r.get("description"),
            created_at: r.get("created_at"),
        })
        .collect())
}
