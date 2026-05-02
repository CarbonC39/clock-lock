Clock Lock: Agent Evolution Technical Plan (Revised)

This document outlines the phased technical implementation to upgrade the current light-weight Agent into a high-utility, emotionally supportive "Cyber-Coworker" optimized for neurodivergent workflows.
Phase 1: Cognitive Loop via Structured Outputs

Goal: Prevent impulsive/incorrect tool calls and eliminate fragile text-parsing by using Native Function Calling.
1.1 Native Tool Calling Pipeline

    Deprecation: Remove all Regex-based <tool> tag parsing.

    Implementation: Fully integrate OpenAI-compatible tools array in the API request.

    Forced Chain-of-Thought (CoT): Instead of a markdown <thought> block, inject a mandatory thought_process field into the JSON Schema of every tool, or create a dedicated think_and_plan tool that must be called before taking file actions.
    JSON

    // Example Schema enforcement
    {
      "name": "propose_file_edit",
      "parameters": {
        "type": "object",
        "properties": {
          "thought_process": { "type": "string", "description": "Mandatory internal reasoning." },
          "target_file": { "type": "string" },
          "edits": { "type": "array" }
        },
        "required": ["thought_process", "target_file", "edits"]
      }
    }

    Frontend Masking: The frontend agentStore reads tool_calls.arguments.thought_process and optionally renders it as a dim, collapsible "Internal Monologue" UI.

1.2 Multi-Turn Stability & Auto-Retry

    Deterministic Execution: If the JSON arguments string returned by the LLM fails JSON.parse(), the system does NOT try to fix it with regex.

    Retry Loop: The Rust backend or frontend immediately intercepts the error and pushes a system message back to the LLM: {"role": "system", "content": "Tool call failed: Invalid JSON format. Please ensure all paths are properly escaped and retry."}.

Phase 2: Context Atomization & Persistent Memory

Goal: Reduce cognitive load on the LLM by filtering noise, and ensure zero state-loss on app restarts.
2.1 Intent-Based Context Fetching

Instead of sending the whole home.md and current file:

    Level 0 (Always On): Pushed in the System Prompt: The last 3 pending Todos + Current Active File path.

    Level 1 (Lazy Load): The Agent utilizes native tools to gather information: read_file(path), git_status(), search_code(query).

2.2 SQLite-Backed Working Memory

    Data Structure: Do not store critical state purely in Vue's Pinia store.

    Implementation:

        Rust maintains a session_state table in SQLite.

        Fields: last_active_timestamp, current_focus_file, last_error_log.

    Cold Start Recovery: On app launch, workspaceStore fetches this state from Rust. If idle time > 30 mins, Agent initializes with context: "Welcome back. You were halfway through refactoring the Login component. Shall we finish the API call?"

Phase 3: Proactive Companionship (Event-Driven)

Goal: Move from "Wait for user" to "Ride-along partner" without generating API costs for every keystroke.
3.1 Rust-Tauri Event Bridge

    Backend Observer: watcher.rs listens to filesystem changes and filters out .gitignore.

    Frontend Signals: Emits lightweight Tauri events (file-saved, terminal-error).

    Local State Machine (Zero-Token Cost):

        On File Save: Agent's kaomoji changes to working or excited locally. No API call made.

        On Build/Terminal Failure: If a subprocess returns exit 1, agentStore debounces the event and automatically triggers a background LLM request: "I noticed the build failed. Need a hand with the error log?"

3.2 Micro-Tasking Engine

    Tool: split_task(description: string) -> SubTask[].

    Logic: If the user adds a complex Todo (e.g., "Implement database"), the Agent proactively calls split_task and returns a UI card asking: "That sounds like a big one. Want me to break it down into these 3 smaller steps?" User clicks "Accept" to update home.md.

Phase 4: Precision Collaboration (The "Surgeon" Toolset)

Goal: Avoid data loss and improve code-editing confidence.
4.1 Surgical Edits

    Tool Upgrade: Replace full-file overwrites with surgical tools:

        patch_markdown_section(file: string, heading: string, new_content: string)

        append_to_notes(text: string)

    Draft & Review Workflow: When the Agent proposes code changes, it generates a structured JSON array of changes. The frontend renders this via DiffView.vue. The user must click "Apply" to execute the Rust command that patches the physical file.

Phase 5: Aesthetic & Emotional Feedback

Goal: High-fidelity "Tamagotchi" feel with low cognitive overhead.
5.1 Advanced Kaomoji State Machine

    States:

        IDLE: Occasional blinking (・_・).

        PROCESSING: Loading animation ( ˘▽˘)っ♨.

        SUCCESS: Celebratory burst (๑•̀ㅂ•́)و✧.

        EMPATHY: When build fails or user is stuck (；´д｀)ゞ.

    Implementation: Handled entirely via Vue reactivity (AgentPet.vue) responding to agentStore status flags (isStreaming, lastActionStatus), decoupled from the LLM prompt.

Immediate Action Items (Next Sprint)

    Refactor Agent I/O: Strip out custom regex parsers and migrate strictly to OpenAI-compatible tools array formatting in commands/agent.rs and agentStore.ts.

    Implement JSON Schema Tooling: Define the first two native tools (patch_markdown_section and fetch_context) with strict JSON Schemas.

    Rust Event Emitter: Build the Tauri event bridge in watcher.rs to send file-saved signals to the frontend to drive the Kaomoji state machine.