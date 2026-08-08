use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::Manager;

#[derive(Clone, serde::Serialize)]
pub struct GitTrackerPayload {
    pub workspace: String,
    pub count: u32,
    pub branch: Option<String>,
    pub head_short: Option<String>,
    pub commits: Vec<CommitLine>,
}

#[derive(Clone, serde::Serialize)]
pub struct CommitLine {
    pub short: String,   // 8 chars
    pub summary: String, // 已截断 60
}

pub struct GitTrackerState {
    pub last_head: Mutex<Option<String>>,
    pub pending_count: Mutex<u32>,
    pub last_fired_at: Mutex<Option<Instant>>,
}

impl GitTrackerState {
    pub fn new() -> Self {
        Self {
            last_head: Mutex::new(None),
            pending_count: Mutex::new(0),
            last_fired_at: Mutex::new(None),
        }
    }
}

/// Set the baseline head and clear the pending counter. Called on workspace load.
pub fn reset(state: &GitTrackerState, head: Option<String>) {
    *state.last_head.lock().unwrap() = head;
    *state.pending_count.lock().unwrap() = 0;
    *state.last_fired_at.lock().unwrap() = None;
}

/// Inspect the repo for new commits since the last check. Returns
/// `Some((payload, log_desc))` when the accumulated count crossed the threshold
/// and the minimum interval since the last fire has elapsed; `None` otherwise.
///
/// The caller (supervision tick) is responsible for emitting the payload and
/// logging the event — this stays sync and git2-only.
pub fn check_git(
    state: &GitTrackerState,
    workspace_path: &str,
    threshold: u32,
    min_interval_secs: u64,
) -> Option<(GitTrackerPayload, String)> {
    let repo = git2::Repository::open(workspace_path).ok()?;
    let head_commit = repo.head().ok()?.peel_to_commit().ok()?;
    let head_id = head_commit.id().to_string();
    let head_short: String = head_id.chars().take(8).collect();
    let branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(str::to_string));

    let last_head = state.last_head.lock().unwrap().clone();

    // First check after workspace load — just establish the baseline.
    let Some(prev) = last_head else {
        *state.last_head.lock().unwrap() = Some(head_id);
        *state.pending_count.lock().unwrap() = 0;
        return None;
    };

    if prev == head_id {
        return None;
    }

    // Walk new commits: revwalk from last_head..head. If last_head is no longer
    // reachable (e.g. rebase/force-push), reset the baseline instead of treating
    // the whole history as "new" and triggering forever.
    let head_oid = head_commit.id();
    let Ok(prev_oid) = git2::Oid::from_str(&prev) else {
        reset(state, Some(head_id));
        return None;
    };
    // `hide()` on a commit that is not an ancestor silently hides nothing, so
    // verify ancestry explicitly before walking.
    let is_ancestor = repo.graph_descendant_of(head_oid, prev_oid).unwrap_or(false);
    if !is_ancestor {
        reset(state, Some(head_id));
        return None;
    }

    let mut commits: Vec<CommitLine> = Vec::new();
    let mut revwalk = repo.revwalk().ok()?;
    if revwalk.push_head().is_err() {
        return None;
    }
    if revwalk.hide(prev_oid).is_err() {
        reset(state, Some(head_id));
        return None;
    }

    let mut count = 0u32;
    for oid in revwalk {
        let Ok(oid) = oid else { continue };
        let Ok(commit) = repo.find_commit(oid) else { continue };
        count += 1;
        if commits.len() < 20 {
            let short: String = oid.to_string().chars().take(8).collect();
            let summary: String = commit.summary().unwrap_or("").chars().take(60).collect();
            commits.push(CommitLine { short, summary });
        }
    }

    {
        let mut pc = state.pending_count.lock().unwrap();
        *pc += count;
    }
    *state.last_head.lock().unwrap() = Some(head_id);

    let log_desc = format!("{count} new commits, head={head_short}");

    let pending = *state.pending_count.lock().unwrap();
    let interval_ok = match *state.last_fired_at.lock().unwrap() {
        Some(at) => at.elapsed() >= Duration::from_secs(min_interval_secs),
        None => true,
    };

    if pending >= threshold && interval_ok {
        *state.pending_count.lock().unwrap() = 0;
        *state.last_fired_at.lock().unwrap() = Some(Instant::now());
        Some((
            GitTrackerPayload {
                workspace: workspace_path.to_string(),
                count: pending,
                branch,
                head_short: Some(head_short),
                commits,
            },
            log_desc,
        ))
    } else {
        None
    }
}

#[tauri::command]
pub fn reset_git_tracker(app: tauri::AppHandle, workspace_path: String) {
    let state = app.state::<GitTrackerState>();
    let head = current_head(&workspace_path);
    reset(&state, head);
}

fn current_head(workspace_path: &str) -> Option<String> {
    let repo = git2::Repository::open(workspace_path).ok()?;
    let head = repo.head().ok()?;
    let commit = head.peel_to_commit().ok()?;
    Some(commit.id().to_string())
}
