# Clock Lock

An AI-powered workspace companion for personal developers. Combines a project knowledge base, an AI agent chat, and a supervision/emotional-support system into a minimal, non-IDE-like desktop interface.

Built with **Tauri v2 + Vue 3 + Rust**.

## Features

### Workspace & Knowledge Base
- **Project home (`home.md`)** — a living document with Overview, Notes, and Progress sections. Edit in-place with double-click on headings, interactive task checklists with checkable toggles.
- **File tree** — browse the workspace directory with git status badges (M/A/D). Filters `.gitignore`-ignored files.
- **Binary annotations** — attach free-text notes to images, models, and other binary assets.
- **File watcher** — live-refreshes the tree on filesystem changes (debounced, ignores gitignored paths).

### AI Agent Chat
- **Streaming responses** — real-time token-by-token rendering via SSE, OpenAI-compatible (OpenAI, DeepSeek, etc.) and Ollama local models.
- **Interactive bash blocks** — suggested shell commands are classified as safe (auto-run) or unsafe (Approve & Run required). High-risk commands are blocked. Execution is workspace-locked.
- **Diff view** — agent-proposed file edits rendered as syntax-highlighted unified diffs with an "Apply changes" button. Originals backed up to `.clocklock/drafts/`.
- **Markdown rendering** — agent responses support GitHub-flavored Markdown with syntax-highlighted code blocks.

### Memory & Knowledge (SQLite + FTS5)
- **Conversation persistence** — every message auto-saved per workspace. Reloads on startup.
- **Full-text search** — FTS5 index on conversation history. Relevant past messages injected into the system prompt as context.
- **Event log** — file changes and user-approved bash runs are recorded.

### Supervision & Companionship
- **Idle detection** — if no activity for a configurable threshold (default 48 h), the agent sends a friendly check-in notification.
- **Do Not Disturb** — toggle in Settings to suppress all supervision messages.
- **Natural language snooze** — reply to a check-in with "skip for a week" or "I have exams" and the agent parses and reschedules.
- **Tamagotchi pet** — 5-state kaomoji face (idle, thinking, happy, sleepy, excited) with CSS animations, driven by agent activity.
- **Customizable personality** — free-text personality prompt injected into the system prompt.

### Widget Mode
- Click the widget button in the top bar to shrink the window to a 240×360 compact floating view.
- **Companion view** — large pet face, personality-driven status text, and the next pending task.
- **Tasks view** — full interactive checklist with toggles and add-task input.
- **Mini chat** — functional streaming chat with markdown rendering, resizable.

### Design
- Catppuccin-inspired dark (Mocha) and light (Latte) theme palettes with low-saturation blue/pink/purple accents.
- System-following theme mode.
- Smooth 0.15 s transitions, minimal hover effects.
- Custom title bar (frameless window).

## Tech Stack

| Layer | Stack |
|-------|-------|
| **Desktop shell** | Tauri v2 |
| **Frontend** | Vue 3 (Composition API), Pinia, Vue Router, TypeScript, Vite |
| **Backend** | Rust (`git2`, `notify`, `sqlx` + SQLite FTS5, `reqwest`) |
| **Markdown** | `marked` (chat rendering), section-based editor (home.md) |
| **Icons** | Lucide Vue Next |
| **Fonts** | Nunito (UI), JetBrains Mono (code) |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Vue 3)                     │
│  App.vue → RouterView                                  │
│    └── AppLayout                                       │
│        ├── Topbar (custom titlebar, widget toggle)     │
│        ├── FileTree ← FileTreeNode (recursive)         │
│        ├── WorkspaceHome                               │
│        │    └── MarkdownEditor (section-based)         │
│        └── AgentChat                                   │
│             ├── ChatMessage ← BashBlock · DiffView     │
│             └── AgentPet (kaomoji state machine)       │
│                                                        │
│  WidgetWindow ← widget mode compact overlay            │
│                                                        │
│  Pinia stores: workspace · agent · settings · ui · sv  │
├─────────────────────────────────────────────────────────┤
│                  Backend (Rust / Tauri)                 │
│  commands/fs.rs       — filesystem, git, annotations   │
│  commands/agent.rs    — OpenAI SSE streaming           │
│  commands/shell.rs    — sandboxed bash + blacklist      │
│  commands/memory.rs   — SQLite CRUD, FTS search         │
│  commands/settings.rs — encrypted config persistence   │
│  supervision.rs       — idle detection background task │
│  watcher.rs           — notify filesystem watcher      │
│  db/mod.rs            — SQLite init, migrations, FTS5  │
└─────────────────────────────────────────────────────────┘
```

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://rustup.rs/) stable toolchain
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS

### Development

```bash
# Install frontend dependencies
npm install

# Run in dev mode (hot-reload frontend + backend)
npm run tauri dev

# Type-check frontend
npx vue-tsc --noEmit

# Lint
npx eslint src/ --ext .ts,.vue

# Check Rust
cd src-tauri && cargo check && cargo clippy
```

### Build

```bash
npm run tauri build
```

The distributable will be in `src-tauri/target/release/bundle/`.

## Project Structure

```
clock-lock/
├── src/                          # Vue 3 frontend
│   ├── main.ts                   # App entry point
│   ├── App.vue                   # Root component (widget mode toggle)
│   ├── router/index.ts           # Routes: / and /settings
│   ├── stores/                   # Pinia stores
│   │   ├── workspaceStore.ts     # File system state
│   │   ├── agentStore.ts         # Chat messages, streaming
│   │   ├── settingsStore.ts      # AI provider config
│   │   ├── uiStore.ts            # Theme, preferences
│   │   └── supervisionStore.ts   # DND, idle check-in
│   ├── components/
│   │   ├── AgentChat.vue         # Right panel chat
│   │   ├── AgentPet.vue          # Kaomoji tamagotchi
│   │   ├── BashBlock.vue         # Shell command block
│   │   ├── ChatMessage.vue       # Message bubble renderer
│   │   ├── DiffView.vue          # Unified diff viewer
│   │   ├── FileTree.vue          # Left panel file browser
│   │   ├── FileTreeNode.vue      # Recursive tree node
│   │   ├── MarkdownEditor.vue    # Section-based home.md editor
│   │   ├── Topbar.vue            # Custom title bar
│   │   ├── WidgetWindow.vue      # Compact widget overlay
│   │   └── WorkspaceHome.vue     # Center panel shell
│   ├── layouts/AppLayout.vue     # 3-panel resizable layout
│   ├── pages/
│   │   ├── WorkspacePage.vue
│   │   └── SettingsPage.vue
│   └── styles/variables.css      # Design tokens + theme CSS
├── src-tauri/                    # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json           # Window config, permissions
│   ├── capabilities/default.json # Tauri capability scopes
│   └── src/
│       ├── main.rs               # Entry point
│       ├── lib.rs                # Plugin & command registration
│       ├── db/mod.rs             # SQLite + FTS5 setup
│       ├── watcher.rs            # File watcher
│       ├── supervision.rs        # Idle detection
│       └── commands/
│           ├── agent.rs          # Streaming chat API
│           ├── fs.rs             # Filesystem operations
│           ├── memory.rs         # Conversation CRUD
│           ├── settings.rs       # Config persistence
│           └── shell.rs          # Sandboxed bash execution
├── index.html                    # Main window entry
├── vite.config.ts
└── package.json
```

## Configuration

Settings are stored in the OS app data directory (`~/.clocklock/` or `%APPDATA%/clock-lock/`):

| File | Purpose |
|------|---------|
| `settings.json` | AI provider config (API key XOR-encrypted) |
| `last_workspace.txt` | Restore last project on startup |
| `workspaces/{hash}/home.md` | Per-project home document |
| `workspaces/{hash}/meta.json` | Binary file annotations |
| `workspaces/{hash}/memory.db` | SQLite conversation + event database |
| `workspaces/{hash}/drafts/` | File backups before diff applies |

## License

MIT
