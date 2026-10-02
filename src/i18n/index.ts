import { useUiStore, type AppLocale } from "../stores/uiStore";
import { computed } from "vue";

const zhCN: Record<string, string> = {
  "Chat": "聊天", "Notes": "笔记", "Files": "文件", "Open Folder": "打开文件夹",
  "Open a Workspace": "打开工作区", "Browse for a project folder": "选择一个项目文件夹",
  "Settings": "设置", "Provider": "服务提供方", "Appearance": "外观", "Behavior": "行为",
  "AI Provider": "AI 服务提供方", "Endpoint URL": "服务端地址", "API Key": "API 密钥", "Model": "模型",
  "Hide": "隐藏", "Show": "显示", "Stored locally in app data. Never leaves your machine.": "密钥仅保存在本机应用数据中，不会离开你的设备。",
  "Theme": "主题", "Light": "浅色", "System": "跟随系统", "Dark": "深色", "Language": "语言", "中文": "中文", "English": "English",
  "App Behavior": "应用行为", "Auto-restore last workspace": "启动时恢复上次工作区", "Re-open the previous project folder on startup.": "启动时重新打开上次使用的项目文件夹。",
  "Launch mode": "启动方式", "Window": "窗口", "Minimized": "最小化", "Close button": "关闭按钮", "Exit app": "退出应用", "Hide to tray": "隐藏到托盘",
  "Clicking the window close button fully quits the app. Use the tray icon to reopen.": "点击窗口关闭按钮将退出应用。可通过托盘图标重新打开。",
  "Close button hides the window to the tray; the app keeps running. Quit from the tray menu.": "点击关闭按钮会将窗口隐藏到托盘，应用仍会运行。可从托盘菜单退出。",
  "Home location": "主页文件位置", "AppData": "应用数据", "Workspace": "工作区", "Workspace mode saves home.md in .clock-lock/": "工作区模式会将 home.md 保存到 .clock-lock/ 文件夹。",
  "Check-in": "主动提醒", "Do Not Disturb": "请勿打扰", "Suppress idle check-ins and notifications.": "暂停空闲提醒和通知。",
  "Idle check-ins": "空闲提醒", "Master switch: whether Clock Lock checks in at all after you've been idle past the threshold below. (For the agent checking its own progress, see Agent self-audit below.)": "控制 Clock Lock 是否在你空闲超过下方时长后提醒你。（若要设置智能体检查自身进度，请查看下方“智能体静默自检”。）",
  "Idle check-in threshold": "空闲提醒间隔", "Custom": "自定义", "Check-ins are off. Use DND for a quick mute instead.": "提醒已关闭。需要暂时静音时可以开启“请勿打扰”。",
  "minutes (1 min – 2 weeks)": "分钟（1 分钟至 2 周）", "How long you can be idle before the agent gently checks in.": "空闲多久后由智能体轻声提醒你。",
  "AI-written check-in messages": "使用 AI 撰写提醒内容", "About the words, not the trigger: occasionally (≤ once a day) let the AI write a fresh line about what you were working on. Off keeps the built-in phrase pool — zero API calls. Idle check-ins still fire either way.": "此选项只影响提醒内容：每天最多一次，让 AI 根据你正在进行的工作写一条新提醒。关闭后使用内置文案，不会调用 API。无论此选项如何设置，空闲提醒都会照常触发。",
  "Git tracking": "Git 变更跟踪", "Track new commits": "跟踪新提交", "Watch the repo for new commits and let the agent react to what changed.": "监视仓库的新提交，并让智能体根据变更作出响应。",
  "Commit threshold": "提交数量阈值", "commits (1–50)": "次提交（1–50）", "How many new commits accumulate before the agent takes a look.": "累积多少次新提交后让智能体查看。",
  "Min interval between reactions": "响应最短间隔", "Agent self-audit on silence": "智能体静默自检", "Self-audit on silence": "静默时自检", "Silence threshold": "静默时长阈值",
  "Min interval between check-ins": "自检最短间隔", "Agent self-audit": "智能体静默自检",
  "The agent reviews its own progress when it's been quiet — no file changes, no chat, no agent output. (This is about the agent's self-review, not about nudging you — see Check-in above.)": "当一段时间没有文件变更、聊天或智能体输出时，智能体会检查自身进度。（这是智能体的自检，不是提醒你；提醒设置请见上方“主动提醒”。）",
  "No file changes, no user chat, and no agent output for this long triggers a check-in.": "在这段时间内没有文件变更、用户消息或智能体输出时触发自检。",
  "minutes (5–180)": "分钟（5–180）", "minutes (10–480)": "分钟（10–480）", "minutes (1–240)": "分钟（1–240）",
  "Personality prompt": "个性提示词", "e.g. encouraging senior developer who keeps things brief": "例如：简洁、鼓励人的资深开发者",
  "Injected into the system prompt to shape the agent's tone and style.": "此内容会加入系统提示词，用于设定智能体的语气和风格。",
  "Max context messages": "最大上下文消息数", "Past messages included per request.": "每次请求包含的历史消息数量。", "Max response tokens": "最大回复 token 数", "Token budget per response.": "每次回复的 token 上限。",
  "Shell path": "Shell 路径", "Auto-detect (cmd / sh)": "自动检测（cmd / sh）", "Shell executable for running bash blocks. On Windows, set to e.g. C:\\Program Files\\Git\\bin\\bash.exe for Git Bash.": "用于运行 bash 代码块的 Shell 程序。Windows 用户可设置为 Git Bash 路径，例如 C:\\Program Files\\Git\\bin\\bash.exe。",
  "Saved": "已保存", "Back": "返回", "Close": "关闭", 
  "Agent": "智能体", "Focus mode — silences check-ins": "专注模式 — 暂停主动提醒", "FOCUS": "专注", "Switch to light": "切换到浅色模式", "Switch to dark": "切换到深色模式", "Widget": "小组件", "Minimize": "最小化", "Restore": "还原", "Maximize": "最大化",
  "Clear chat": "清空聊天", "Hey, I'm Clock Lock — your dev coworker.": "你好，我是 Clock Lock，你的开发搭档。", "Open a workspace, or just tell me what you're working on.": "打开一个工作区，或告诉我你正在做什么。", "Configure your API key in": "请先在", "to get started.": "中配置 API 密钥以开始使用。",
  "This looks like a new project. I can scan the files and write an overview to": "这看起来是一个新项目。我可以扫描文件并将项目概览写入",
  "Scan & summarize": "扫描并总结", "truncated": "已截断", "Remove attachment": "移除附件", "Quick actions": "快捷操作", "Ask me anything… (Enter to send)": "随时向我提问…（按 Enter 发送）", "Stop": "停止", "Send": "发送",
  "Enter / Esc": "Enter / Esc", "minutes": "分钟", "min": "分钟",
  "Todos": "待办事项", "Add task": "添加任务", "Remove": "移除", "No tasks yet. Hit": "还没有任务。点击", "or ask the agent.": "或让智能体帮你添加。", "New task… (Enter to add, Esc to close)": "新建任务…（Enter 添加，Esc 关闭）",
  "Overview": "项目概览", "Edit": "编辑", "Ctrl+Enter / Esc to save": "Ctrl+Enter 保存 / Esc 取消", "No description yet. Double-click to write one, or ask the agent to": "还没有项目描述。双击此处编写，或让智能体执行",
  "No notes yet. The agent jots observations here as you work. Double-click to add your own.": "还没有笔记。智能体会在你工作时记录观察，也可以双击添加自己的笔记。",
  "Describe your project…": "描述你的项目…", "Scratch pad — progress, links, observations…": "随手记 — 进度、链接、观察…",
  "Refresh": "刷新", "Empty workspace": "工作区为空", "No workspace open": "未打开工作区", "Loading…": "加载中…",  "Close preview": "关闭预览", "Open in system app": "用系统应用打开", "Attach this file to chat": "将此文件附加到聊天", "Attach": "附加", "No inline preview — try \"Open in system app\".": "无法预览此文件 — 请尝试“用系统应用打开”。", "Agent annotation": "智能体备注", "Describe this file so the agent understands it… (optional)": "描述此文件，帮助智能体理解…（可选）", "Saved!": "已保存！",
  "Apply changes": "应用更改", "Dismiss": "忽略", "Retry": "重试", "Running…": "运行中…", "Re-run": "重新运行",
  "I'm here": "我回来了", "Remind me": "提醒我", "Snooze 1h": "延后 1 小时", "Snoozed · see you in an hour": "已延后 · 一小时后再见", "Snoozed": "已延后", "still on your list": "还在你的待办中", "Task Breakdown": "任务拆解", "Accept & Add to Todos": "接受并添加到待办", "Internal Monologue": "内部思考",
  "just now": "刚刚", "a little while ago": "不久前", "earlier": "更早之前", "was in": "最近打开了",
   "Cloud (OpenAI-compatible)": "云端（兼容 OpenAI）", "Local (Ollama)": "本地（Ollama）",
  "(no output)": "（无输出）", "GOAL": "目标", "COZY TIME (*ﾟ▽ﾟ*)": "休息时间 (*ﾟ▽ﾟ*)",
  
  
  
   
    "Status update": "状态更新", "Remind me of my todo": "提醒我的待办", "Show current goal": "显示当前目标", "Show last reply": "显示上条回复",
    
  "Applied": "已应用", "Applying...": "正在应用…", "Failed": "失败",
  "Approve & Run": "批准并运行", "Save": "保存", "COMMAND...": "输入命令…",
};

const en: Record<string, string> = {};
const dict: Record<AppLocale, Record<string, string>> = { en, "zh-CN": zhCN };

export function useI18n() {
  const ui = useUiStore();
  function t(key: string): string {
    return dict[ui.locale][key] ?? key;
  }
  return { t, locale: computed(() => ui.locale) };
}
