// ---------------------------------------------------------------------------
// web.mjs — fetching a page and reading it.
//
// The page-fetcher lives here (not in the harness) so the search core can
// use it too: the search module digs the answer out of the pages behind
// the results, and the harness exposes the same thing as the web_fetch
// tool. One fetcher, two callers.
// ---------------------------------------------------------------------------

/** HTML → readable prose: drop scripts/styles/noise, keep block breaks. */
export function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|blockquote|pre|table|ul|ol|figcaption)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Opens a URL and returns its readable text — the web_fetch half, as a
 * standalone function, so the desktop app can read a page for a search
 * result too (its normal chat has no tools).
 */
export async function fetchPage(url, { maxChars = 20000, timeoutMs = 15000 } = {}) {
  try {
    const res = await fetch(String(url), {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9'
      }
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} ${res.statusText}`, text: '' }
    const type = (res.headers.get('content-type') ?? '').toLowerCase()
    const raw = await res.text()
    const out = type.includes('html') || type.includes('xml') ? htmlToText(raw) : raw.trim()
    const cap = Math.min(Math.max(Number(maxChars) || 20000, 1000), 100000)
    return {
      ok: true,
      error: '',
      text: out.length > cap ? `${out.slice(0, cap)}\n…[truncated]` : out
    }
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e), text: '' }
  }
}
