// TypeScript declarations for cli/lib/search.mjs — the shared web core.

export interface SearchHit {
  title: string
  url: string
  snippet: string
}

export const MAX_RESULTS: number

/** Searches the web (DuckDuckGo first, then key-free fallbacks). */
export function webSearch(query: string): Promise<SearchHit[]>

/** Does this message want the web? Conservative on purpose. */
export function looksLikeWebQuery(text: string): boolean

/** The query to hand the search engine (the message, trimmed). */
export function searchQueryFor(text: string): string

/** The lines most likely to hold the answer, dug out of the snippets
 *  and the page text. */
export function keyLines(
  query: string,
  hits: SearchHit[],
  pages: { url: string; title: string; text: string }[]
): {
  line: string
  url: string
  score: number
  /** The version/price token right after an intent word — the answer. */
  token: string
}[]

/** The token that most likely IS the answer (a version or price that sits
 *  right after an intent word). */
export function answerToken(line: string): string

export interface WebContext {
  query: string
  hits: SearchHit[]
  pages: { url: string; title: string; text: string }[]
  keys: { line: string; url: string; score: number; token: string }[]
  /** The block the model actually reads. */
  block: string
}

/** Searches, reads the promising pages and renders the block a model can
 *  answer from (the answer itself is pointed at, not just listed). */
export function buildWebContext(
  message: string,
  opts?: { pages?: number; maxChars?: number }
): Promise<WebContext | null>
