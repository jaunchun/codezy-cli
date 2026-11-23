// ---------------------------------------------------------------------------
// harness.d.mts — TypeScript declarations for cli/lib/harness.mjs.
// The Electron main process imports the SAME core file the terminal shell
// uses (one core, two shells) — this file is what lets `tsc` see its API.
// ---------------------------------------------------------------------------

export type V2Outcome = 'ok' | 'denied' | 'rejected' | 'unknown' | 'error' | 'blocked'

export interface V2ToolCall {
  id?: string
  name?: string
  arguments?: unknown
  function?: { name?: string; arguments?: unknown }
}

export interface V2Message {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: V2ToolCall[]
  tool_name?: string
  tool_call_id?: string
  [key: string]: unknown
}

export interface V2Event {
  /** 'model' + 'tool_start' fire BEFORE the step runs, 'tool' after;
   *  retry/nudge narrate the loop, 'end' closes the chain. */
  type: 'tool' | 'tool_start' | 'model' | 'nudge' | 'retry' | 'end'
  iteration?: number
  name?: string
  args?: Record<string, unknown>
  outcome?: V2Outcome
  result?: string
  /** v3.1 — wall time of the whole tool step, milliseconds. */
  ms?: number
  status?: 'text' | 'limit' | 'stopped'
  text?: string
  iterations?: number
  /** retry events */
  attempt?: number
  max?: number
  wait?: number
  error?: string
  /** sub-agent chains tag their depth */
  sub?: boolean
  depth?: number
}

export interface V2Todo {
  text: string
  status: 'pending' | 'in_progress' | 'done'
}

export interface V2RegistryEntry {
  check?: (args: Record<string, unknown>) => string | null
  run: (args: Record<string, unknown>) => Promise<string>
  /** todo_write / task_status — the live checklist + background tasks. */
  state?: {
    todos: V2Todo[]
    tasks?: Map<
      number,
      {
        id: number
        command: string
        running: boolean
        code: number | string | null
        out: string
        started?: number
        proc?: { pid?: number; kill: (signal?: unknown) => unknown } | null
      }
    >
    nextTaskId?: number
  }
}

export type V2Registry = Record<string, V2RegistryEntry>

export const DEFAULT_NUM_CTX: number
export const DEFAULT_TEMPERATURE: number
export const DEFAULT_MAX_ITER: number
/** streaming watchdogs: no bytes for stallMs (Ollama) / no finish within
 *  maxWaitMs (OpenAI) → a retriable error instead of an infinite hang. */
export const DEFAULT_STALL_MS: number
export const DEFAULT_MAX_WAIT_MS: number
export const DANGEROUS_TOOLS: ReadonlySet<string>
/** Tools that change the disk or run code — plan mode refuses all of them. */
export const MUTATING_TOOLS: ReadonlySet<string>
/** Read-only calls eligible for one concurrent prefix batch. */
export const PARALLEL_SAFE: ReadonlySet<string>

export interface V2ToolSchema {
  type?: string
  function?: { name?: string; description?: string; parameters?: unknown }
}

export const TOOLS: V2ToolSchema[]
/** v3 sub-agent tool schema — merged into the loop by runAgent itself. */
export const DELEGATE_TOOL: V2ToolSchema
/** v3.5 questioning tool — merged only when the host passes `askUser`. */
export const ASK_USER_TOOL: V2ToolSchema

/** Minimal glob → RegExp (** crosses folders, * stays inside a segment). */
export function globToRegExp(pattern: string): RegExp

export interface OllamaCallOptions {
  baseUrl?: string
  model: string
  messages: V2Message[]
  tools?: unknown[]
  signal?: AbortSignal
  numCtx?: number
  temperature?: number
  /** streaming stall watchdog — no bytes for this long → StallError. */
  stallMs?: number
  fetchImpl?: typeof fetch
}

export interface OllamaCallResult {
  content: string
  tool_calls: V2ToolCall[]
  stats: { promptTokens?: number; completionTokens?: number }
}

export function ollamaCall(o: OllamaCallOptions): Promise<OllamaCallResult>

// -- OpenAI-compatible endpoints (Nebius Token Factory, OpenRouter, …) --------

/** Base URL → chat-completions endpoint (origin-only URLs gain "/v1"). */
export function chatCompletionsUrl(baseUrl: string): string

export interface OpenAICallOptions {
  baseUrl: string
  apiKey?: string
  model: string
  messages: V2Message[]
  tools?: unknown[]
  signal?: AbortSignal
  temperature?: number
  /** hard cap on the whole call — exceeding it is a retriable WaitTimeoutError. */
  maxWaitMs?: number
  fetchImpl?: typeof fetch
}

/** Same result shape as ollamaCall — runAgent accepts either call. */
export function openaiCall(o: OpenAICallOptions): Promise<OllamaCallResult>

/** Resolves a model-provided path against the allowed roots, or throws. */
export function resolveInRoots(roots: string[], raw: unknown): string

export function makeRegistry(opts: {
  roots: string[]
  cwd?: string
  execTimeoutMs?: number
  /** Plan mode: write_file / edit_file / run_command refuse in `check`. */
  allowMutations?: boolean
}): V2Registry

/** One hook entry: shell command, optional tool filter (default: every tool). */
export interface V2Hook {
  tools?: string[]
  command: string
  timeout_ms?: number
}

/** Loaded hook config — `.codezy/hooks.json`, workspace first, else home. */
export interface V2Hooks {
  file: string
  cwd: string
  before_tool: V2Hook[]
  after_tool: V2Hook[]
}

/** Reads the hook config for a run; null when there is none. */
export function loadHooks(roots: string[]): V2Hooks | null

/** Transient model/network failure — the retry loop may re-attempt it. */
export function isTransient(e: unknown): boolean
/** Best-effort repair of malformed JSON in model output. */
export function repairJson(raw: string): unknown
/** Recovers a tool call the model buried in prose text. */
export function parseTextToolCall(content: string, known: string[]): V2ToolCall | null
/** Shrinks OLD tool results to fit the context window instead of letting the
 *  provider silently drop the oldest messages. */
export function fitContext(
  msgs: V2Message[],
  opts?: { recentTools?: number; oldCap?: number; budget?: number }
): V2Message[]

/** HTML → readable prose (scripts/styles dropped, block breaks kept). */
export function htmlToText(html: string): string

/** Opens a URL and returns its readable text — the web_fetch half, shared
 *  with the desktop app (whose normal chat has no tools of its own). */
export function fetchPage(
  url: string,
  opts?: { maxChars?: number; timeoutMs?: number }
): Promise<{ ok: boolean; error: string; text: string }>

export interface RunAgentOptions {
  messages: V2Message[]
  tools?: unknown[]
  registry: V2Registry
  callModel: (o: {
    messages: V2Message[]
    tools?: unknown[]
    signal?: AbortSignal
  }) => Promise<{ content?: string; tool_calls?: V2ToolCall[]; message?: { tool_calls?: V2ToolCall[] } }>
  approve?: (name: string, args: Record<string, unknown>) => Promise<boolean> | boolean
  needsApproval?: (name: string, args: Record<string, unknown>) => boolean
  maxIter?: number
  toolResultCap?: number
  /** transient model-call retries (default 2) + base backoff delay */
  retries?: number
  retryDelayMs?: number
  onEvent?: (e: V2Event) => void
  /** before_tool failures BLOCK the action; after_tool failures are appended to the tool result. */
  hooks?: V2Hooks | null
  signal?: AbortSignal
  /** v3 honesty gate — a non-null return pushes the model back into the loop (capped at 2). */
  finishGuard?: ((finalText: string) => string | null) | null
  /** v3.5 questioning — provided ⇒ ask_user joins schema + registry; the
   *  chain parks until the promise resolves. */
  askUser?: ((question: string, options: string[]) => Promise<string>) | null
  /** v3 sub-agents — `delegate` is merged into the loop when this is on. */
  allowDelegate?: boolean
  /** Depth of the CURRENT chain (0 = the top-level run). */
  delegateDepth?: number
  maxDelegateDepth?: number
  /** Iteration budget a sub-agent gets. */
  delegateIter?: number
}

export interface RunAgentResult {
  status: 'text' | 'limit' | 'stopped'
  text: string
  messages: V2Message[]
  iterations: number
  /** token totals across every model call of the chain */
  usage?: { promptTokens?: number; completionTokens?: number; calls?: number }
}

export function runAgent(o: RunAgentOptions): Promise<RunAgentResult>
