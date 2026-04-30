use std::path::Path;

use serde_json::Value;
use tauri::AppHandle;

#[tauri::command]
pub async fn invoke_tool(
    app: AppHandle,
    tool_name: String,
    args: serde_json::Value,
) -> Result<String, String> {
    execute_tool(&app, &tool_name, &args).await
}

/// Runs a tool by name and returns the result text.
pub async fn execute_tool(app: &AppHandle, name: &str, args: &Value) -> Result<String, String> {
    match name {
        "read_file" => {
            let path = args["path"].as_str().ok_or("missing path")?;
            crate::commands::fs::read_file(path.into())
        }
        "list_dir" => {
            let ws = args["workspace_path"]
                .as_str()
                .unwrap_or(".");
            crate::commands::fs::list_dir(ws.into())
                .map(|nodes| format_tree(&nodes))
        }
        "search_files" => {
            let ws = args["workspace_path"]
                .as_str()
                .unwrap_or(".");
            let pattern = args["pattern"].as_str().unwrap_or("");
            let limit = args["limit"].as_u64().unwrap_or(20) as usize;
            search_files(ws, pattern, limit)
        }
        "read_home_md" => {
            let ws = args["workspace_path"]
                .as_str()
                .ok_or("missing workspace_path")?;
            read_home_md(app, ws).await
        }
        "write_home_md" => {
            let ws = args["workspace_path"]
                .as_str()
                .ok_or("missing workspace_path")?;
            let content = args["content"].as_str().ok_or("missing content")?;
            write_home_md(app, ws, content).await?;
            Ok("home.md updated successfully".into())
        }
        "append_section" => {
            let ws = args["workspace_path"]
                .as_str()
                .ok_or("missing workspace_path")?;
            let heading = args["heading"].as_str().ok_or("missing heading")?;
            let text = args["text"].as_str().ok_or("missing text")?;
            append_section(app, ws, heading, text).await?;
            Ok(format!("Appended to section \"{heading}\""))
        }
        "get_git_status" => {
            let ws = args["workspace_path"]
                .as_str()
                .ok_or("missing workspace_path")?;
            let status = crate::commands::fs::get_git_status(ws.into())?;
            Ok(format!(
                "is_repo={} branch={:?} modified={} added={} deleted={} untracked={}",
                status.is_repo,
                status.branch,
                status.modified,
                status.added,
                status.deleted,
                status.untracked,
            ))
        }
        "search_memory" => {
            let ws_hash = args["workspace_hash"]
                .as_str()
                .ok_or("missing workspace_hash")?;
            let query = args["query"].as_str().unwrap_or("");
            let limit = args["limit"].as_u64().unwrap_or(5) as u32;
            // This is async, so we use the direct helper
            search_memory(app, ws_hash, query, limit).await
        }
        "run_bash" => {
            let ws = args["workspace_path"].as_str().map(|s| s.to_string());
            let cmd = args["command"].as_str().ok_or("missing command")?;
            let shell = args["shell_path"]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());
            let result = crate::commands::shell::run_command(ws, cmd.into(), shell).await?;
            if result.blocked {
                Ok("BLOCKED by security policy".into())
            } else if result.success {
                Ok(result.stdout)
            } else {
                Ok(format!("{}\n{}", result.stdout, result.stderr))
            }
        }
        _ => Err(format!("unknown tool: {name}")),
    }
}

// ── Tool helpers ──

fn format_tree(nodes: &[crate::commands::fs::FileNode]) -> String {
    let mut out = String::new();
    fn recurse(nodes: &[crate::commands::fs::FileNode], depth: usize, out: &mut String) {
        for n in nodes {
            for _ in 0..depth {
                out.push_str("  ");
            }
            let tag = n
                .git_status
                .as_deref()
                .map(|s| format!(" [{}]", s))
                .unwrap_or_default();
            if n.is_dir {
                out.push_str(&format!("📁 {}/{}\n", n.name, tag));
                if let Some(children) = &n.children {
                    recurse(children, depth + 1, out);
                }
            } else {
                out.push_str(&format!("  {}{}\n", n.name, tag));
            }
        }
    }
    recurse(nodes, 0, &mut out);
    out
}

fn search_files(workspace_path: &str, pattern: &str, limit: usize) -> Result<String, String> {
    let root = Path::new(workspace_path);
    let mut results = Vec::new();
    let lower = pattern.to_lowercase();
    search_recursive(root, root, &lower, &mut results, limit)?;

    if results.is_empty() {
        Ok("No matching files found.".into())
    } else {
        Ok(results.join("\n"))
    }
}

fn search_recursive(
    base: &Path,
    dir: &Path,
    pattern: &str,
    results: &mut Vec<String>,
    limit: usize,
) -> Result<(), String> {
    if results.len() >= limit {
        return Ok(());
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.filter_map(|e: Result<std::fs::DirEntry, std::io::Error>| e.ok()) {
            if results.len() >= limit {
                break;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if matches!(name.as_str(), ".git" | ".clocklock") {
                continue;
            }
            let path = entry.path();
            let rel = path
                .strip_prefix(base)
                .map(|p: &Path| p.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default();
            if name.to_lowercase().contains(pattern) || rel.to_lowercase().contains(pattern) {
                let kind = if entry.file_type().map(|t: std::fs::FileType| t.is_dir()).unwrap_or(false) {
                    "📁"
                } else {
                    "📄"
                };
                results.push(format!("{kind} {rel}"));
            }
            if entry.file_type().map(|t: std::fs::FileType| t.is_dir()).unwrap_or(false) {
                search_recursive(base, &path, pattern, results, limit)?;
            }
        }
    }
    Ok(())
}

async fn read_home_md(app: &AppHandle, workspace_path: &str) -> Result<String, String> {
    let (_, content) =
        crate::commands::fs::ensure_home_md(app.clone(), workspace_path.into())?;
    Ok(content)
}

async fn write_home_md(
    app: &AppHandle,
    workspace_path: &str,
    content: &str,
) -> Result<(), String> {
    let (path, _) = crate::commands::fs::ensure_home_md(app.clone(), workspace_path.into())?;
    crate::commands::fs::write_file(path, content.into())
}

async fn append_section(
    app: &AppHandle,
    workspace_path: &str,
    heading: &str,
    text: &str,
) -> Result<(), String> {
    let (path, current) =
        crate::commands::fs::ensure_home_md(app.clone(), workspace_path.into())?;
    let lines: Vec<&str> = current.lines().collect();
    let hl = format!("# {}", heading);
    let mut new_content = String::new();
    let mut found = false;

    for (_i, line) in lines.iter().enumerate() {
        new_content.push_str(line);
        if line.trim() == hl.trim() {
            found = true;
        } else if found && line.starts_with('#') && line != &hl {
            // Reached next heading — insert before it
            new_content.push_str(&format!("\n{}", text));
            found = false;
        }
        new_content.push('\n');
    }
    if found {
        // Heading was the last section — append at end
        new_content.push_str(&format!("{}\n", text));
    }
    crate::commands::fs::write_file(path, new_content)
}

async fn search_memory(
    app: &AppHandle,
    workspace_hash: &str,
    query: &str,
    limit: u32,
) -> Result<String, String> {
    let records = crate::commands::memory::search_messages_direct(app, workspace_hash, query, limit).await?;
    if records.is_empty() {
        Ok("No relevant past messages found.".into())
    } else {
        Ok(records
            .iter()
            .map(|r| format!("[{}] {}", r.role, r.content))
            .collect::<Vec<_>>()
            .join("\n"))
    }
}
