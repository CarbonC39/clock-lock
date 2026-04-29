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
];

fn is_blacklisted(cmd: &str) -> bool {
    let lower = cmd.to_lowercase();
    BLACKLIST.iter().any(|bl| lower.contains(bl))
}

fn is_safe_readonly(cmd: &str) -> bool {
    let trimmed = cmd.trim().to_lowercase();
    SAFE_PREFIXES.iter().any(|s| trimmed.starts_with(s))
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

    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = Command::new("cmd");
        c.args(["/C", &command]);
        c
    } else {
        let mut c = Command::new("sh");
        c.args(["-c", &command]);
        c
    };
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
