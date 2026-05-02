import type { Highlighter } from "shiki";

// Singleton — created once, reused for every highlight call.
let _instance: Highlighter | null = null;
let _initPromise: Promise<Highlighter> | null = null;

const LANGS = [
  "typescript", "tsx", "javascript", "jsx",
  "vue", "svelte",
  "rust", "python", "go", "java", "csharp", "cpp", "c",
  "json", "toml", "yaml", "html", "css", "scss",
  "bash", "markdown", "ruby",
] as const;

const EXT_LANG: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
  vue: "vue", svelte: "svelte",
  rs: "rust", py: "python", go: "go",
  java: "java", cs: "csharp", cpp: "cpp", c: "c", h: "c",
  json: "json", toml: "toml", yaml: "yaml", yml: "yaml",
  html: "html", css: "css", scss: "scss",
  sh: "bash", bash: "bash", zsh: "bash",
  md: "markdown",
  rb: "ruby",
};

async function getHighlighter(): Promise<Highlighter> {
  if (_instance) return _instance;
  if (!_initPromise) {
    _initPromise = import("shiki").then(({ createHighlighter }) =>
      createHighlighter({
        themes: ["catppuccin-mocha", "catppuccin-latte"],
        langs: [...LANGS],
      })
    );
    _instance = await _initPromise;
  }
  return _initPromise;
}

export function getLangFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG[ext] ?? "";
}

export async function highlightCode(
  code: string,
  filename: string,
  isDark: boolean
): Promise<string | null> {
  const lang = getLangFromFilename(filename);
  if (!lang) return null;
  try {
    const hl = await getHighlighter();
    return hl.codeToHtml(code, {
      lang,
      theme: isDark ? "catppuccin-mocha" : "catppuccin-latte",
    });
  } catch {
    return null;
  }
}
