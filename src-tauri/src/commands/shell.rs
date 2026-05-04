use tokio::process::Command;

const BLACKLIST: &[&str] = &[
    "rm -rf", "rm -fr", "del /s", "del /f",
    "dd if=", "mkfs", ":(){:|:&};:",
    "curl|", "curl |", "wget|", "wget |",
    "|bash", "| bash", "|sh", "| sh",
    "shutdown", "reboot", "halt", "poweroff",
    "format c:", "format c:", "rmdir /s",
    "> /dev/", ">/dev/",
];

const SAFE_PREFIXES: &[&str] = &[
    "ls", "dir", "cat", "type", "echo", "pwd",
    "git log", "git status", "git diff", "git show", "git branch",
    "head", "tail", "find", "grep", "rg", "wc",
    "tree", "df", "du", "ps", "top",
    "cargo --version", "node --version", "python --version",
    "npm list", "cargo metadata",
    // PowerShell read-only cmdlets (is_safe_readonly lowercases input before matching)
    "get-content", "select-string", "get-item",
    "get-childitem", "test-path", "get-location",
    "resolve-path", "write-output",
];

fn is_blacklisted(cmd: &str) -> bool {
    let lower = cmd.to_lowercase();
    BLACKLIST.iter().any(|bl| lower.contains(bl))
}

fn is_safe_readonly(cmd: &str) -> bool {
    let trimmed = cmd.trim().to_lowercase();
    SAFE_PREFIXES.iter().any(|s| trimmed.starts_with(s))
}

/// Sync classification used by other modules (e.g. tools.rs).
pub fn classify_sync(cmd: &str) -> &'static str {
    if is_blacklisted(cmd) { "blocked" }
    else if is_safe_readonly(cmd) { "safe" }
    else { "unsafe" }
}

#[derive(serde::Serialize)]
pub struct CommandResult {
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
    pub blocked: bool,
}

#[tauri::command]
pub async fn classify_command(command: String) -> String {
    if is_blacklisted(&command) {
        "blocked".to_string()
    } else if is_safe_readonly(&command) {
        "safe".to_string()
    } else {
        "unsafe".to_string()
    }
}

#[tauri::command]
pub async fn run_command(
    workspace_path: Option<String>,
    command: String,
    shell_path: Option<String>,
) -> Result<CommandResult, String> {
    if is_blacklisted(&command) {
        return Ok(CommandResult {
            stdout: String::new(),
            stderr: "Blocked by security policy.".to_string(),
            success: false,
            blocked: true,
        });
    }

    let dir = workspace_path
        .filter(|p| !p.is_empty())
        .unwrap_or_else(|| std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default());

    let shell = shell_path
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| if cfg!(target_os = "windows") { "cmd".into() } else { "sh".into() });

    let (shell_exe, shell_flag): (String, String) = if cfg!(target_os = "windows") {
        let lower = shell.to_lowercase();
        if lower.contains("powershell") || lower.contains("pwsh") {
            (shell, "-Command".into())
        } else if lower.contains("bash") {
            (shell, "-c".into())
        } else {
            (shell, "/C".into()) // cmd
        }
    } else {
        (shell, "-c".into())
    };

    let mut cmd = Command::new(&shell_exe);
    cmd.arg(&shell_flag).arg(&command);
    let output = cmd
        .current_dir(&dir)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    Ok(CommandResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        success: output.status.success(),
        blocked: false,
    })
}
