// ---------------------------------------------------------------------------
// search.mjs — the web, for shells that have no browser.
// DuckDuckGo's lite endpoint is the primary (no key, no account) and the
// html endpoint is its backup. THE HEADERS MATTER: a minimal header set
// gets an HTTP 202 anti-bot challenge page, which parses as "no results"
// — the reason web search looked broken. With a real browser header set
// it answers 200 with the results.
//
// Two key-free fallbacks ride along so a rate-limited DuckDuckGo never
// looks like "nothing exists on the web":
//   · Wikipedia's search API (encyclopedic facts, always up)
//   · DuckDuckGo's instant-answer API (entities, summaries)
//
// A small model will not dig through 3000 characters of navigation to
// find a version number, so this module also DIGS: keyLines() pulls the
// lines most likely to hold the answer out of the snippets and the pages.
// ---------------------------------------------------------------------------

import { fetchPage } from './web.mjs'

const LITE = 'https://lite.duckduckgo.com/lite/'
const HTML = 'https://html.duckduckgo.com/html/'
const INSTANT = 'https://api.duckduckgo.com/'
const WIKIPEDIA = 'https://en.wikipedia.org/w/api.php'

export const MAX_RESULTS = 8

/** A browser-ish header set — without it DuckDuckGo answers 202. */
const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'accept-encoding': 'gzip, deflate, br',
  'cache-control': 'no-cache',
  pragma: 'no-cache'
}

/** &amp; / &#x27; … → real characters, tags stripped, whitespace collapsed. */
function text(html) {
  return String(html)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Resolves DDG redirect links (/l/?uddg=…) and drops relative/internal ones. */
function cleanUrl(href, base = LITE) {
  try {
    const abs = new URL(href, base)
    const uddg = abs.searchParams.get('uddg')
    const url = uddg ?? abs.toString()
    if (!/^https?:\/\//.test(url)) return null
    if (/(^|\.)(duckduckgo\.com)$/i.test(new URL(url).hostname)) return null
    return url
  } catch {
    return null
  }
}

/** Pulls titles/links and snippets out of the lite results table. */
function parseLite(html) {
  const hits = []
  const seen = new Set()

  const linkRe = /<a[^>]*href=(["'])([^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = linkRe.exec(html)) !== null) {
    const url = cleanUrl(m[2])
    const title = text(m[3])
    if (!url || !title || seen.has(url)) continue
    seen.add(url)
    hits.push({ title, url, snippet: '' })
    if (hits.length >= MAX_RESULTS) break
  }

  const snipRe = /<td[^>]*class=['"][^'"]*result-snippet[^'"]*['"][^>]*>([\s\S]*?)<\/td>/gi
  const snippets = []
  while ((m = snipRe.exec(html)) !== null) {
    const s = text(m[1])
    if (s) snippets.push(s)
  }
  hits.forEach((h, i) => {
    if (snippets[i]) h.snippet = snippets[i]
  })
  return hits
}

/** The html endpoint: results live in `result__a` anchors with a
 *  `result__snippet` sibling — a different shape, the same information. */
function parseHtml(html) {
  const hits = []
  const seen = new Set()
  const linkRe = /<a[^>]*class=['"][^'"]*result__a[^'"]*['"][^>]*href=(["'])([^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = linkRe.exec(html)) !== null) {
    const url = cleanUrl(m[2], HTML)
    const title = text(m[3])
    if (!url || !title || seen.has(url)) continue
    seen.add(url)
    hits.push({ title, url, snippet: '' })
    if (hits.length >= MAX_RESULTS) break
  }
  const snipRe = /<a[^>]*class=['"][^'"]*result__snippet[^'"]*['"][^>]*>([\s\S]*?)<\/a>/gi
  const snippets = []
  while ((m = snipRe.exec(html)) !== null) {
    const s = text(m[1])
    if (s) snippets.push(s)
  }
  hits.forEach((h, i) => {
    if (snippets[i]) h.snippet = snippets[i]
  })
  return hits
}

/** DuckDuckGo's anti-bot answer: HTTP 202 with a challenge page. */
function isChallenge(status, body) {
  if (status === 202) return true
  return /anomaly|challenge|captcha|unusual traffic/i.test(String(body).slice(0, 4000))
}

async function postDuck(url, q) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'https://duckduckgo.com',
      referer: 'https://duckduckgo.com/'
    },
    body: new URLSearchParams({ q, kl: 'wt-wt' }).toString(),
    signal: AbortSignal.timeout(12000)
  })
  const body = await res.text()
  if (isChallenge(res.status, body)) {
    throw new Error('DuckDuckGo answered with an anti-bot challenge (HTTP 202)')
  }
  if (!res.ok) throw new Error(`DuckDuckGo responded ${res.status}`)
  return body
}

/** Wikipedia's search API — key-free, never rate-limited, encyclopedic. */
async function searchWikipedia(q) {
  const url = `${WIKIPEDIA}?action=query&list=search&srsearch=${encodeURIComponent(
    q
  )}&format=json&origin=*&srlimit=6`
  const res = await fetch(url, {
    headers: { 'user-agent': 'CODEZY/3.1.7 (local desktop app)', accept: 'application/json' },
    signal: AbortSignal.timeout(10000)
  })
  if (!res.ok) throw new Error(`Wikipedia responded ${res.status}`)
  const j = await res.json()
  const hits = (j?.query?.search ?? []).map((h) => ({
    title: h.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(h.title).replace(/ /g, '_'))}`,
    snippet: text(h.snippet ?? '')
  }))
  // the article whose TITLE is the subject comes first — searching
  // "ollama release" also finds the GGUF article, which has its own
  // "stable release" and would answer the wrong question
  const subject = subjectOf(q)
  const s = subject.replace(/[^a-z0-9]/gi, '').toLowerCase()
  if (s.length >= 4) {
    hits.sort((a, b) => {
      const at = a.title.replace(/[^a-z0-9]/gi, '').toLowerCase()
      const bt = b.title.replace(/[^a-z0-9]/gi, '').toLowerCase()
      return (bt.startsWith(s) ? 1 : 0) - (at.startsWith(s) ? 1 : 0)
    })
  }
  return hits
}

/** DuckDuckGo's instant answers — entities, with a summary and links. */
async function searchInstant(q) {
  const url = `${INSTANT}?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`
  const res = await fetch(url, {
    headers: { 'user-agent': BROWSER_HEADERS['user-agent'], accept: 'application/json' },
    signal: AbortSignal.timeout(10000)
  })
  if (!res.ok) throw new Error(`DuckDuckGo instant answered ${res.status}`)
  const j = await res.json()
  const hits = []
  if (j.AbstractURL) {
    hits.push({ title: j.Heading || q, url: j.AbstractURL, snippet: text(j.AbstractText || '') })
  }
  const walk = (topics) => {
    for (const t of topics ?? []) {
      if (t.Topics) walk(t.Topics)
      else if (t.FirstURL && t.Text) hits.push({ title: text(t.Text).split(' - ')[0], url: t.FirstURL, snippet: text(t.Text) })
    }
  }
  walk(j.RelatedTopics)
  return hits
}

/**
 * Runs a web search. DuckDuckGo first (lite, then the html endpoint),
 * then the key-free fallbacks — so a rate-limited or challenged
 * DuckDuckGo never looks like "nothing exists". Results are merged and
 * de-duplicated; the first source that answers leads.
 */
export async function webSearch(query) {
  const q = String(query ?? '').trim().slice(0, 300)
  if (!q) return []

  const hits = []
  const seen = new Set()
  const add = (list) => {
    for (const h of list ?? []) {
      if (!h?.url || !h?.title) continue
      const key = h.url.replace(/#.*$/, '')
      if (seen.has(key)) continue
      seen.add(key)
      hits.push(h)
    }
  }

  let duckError = null
  try {
    add(parseLite(await postDuck(LITE, q)))
  } catch (e) {
    duckError = e
  }
  if (!hits.length) {
    try {
      add(parseHtml(await postDuck(HTML, q)))
    } catch (e) {
      if (!duckError) duckError = e
    }
  }
  if (!hits.length) {
    // the fallbacks are best-effort — one of them failing is fine
    try {
      add(await searchWikipedia(q))
    } catch {
      /* ignore */
    }
    try {
      add(await searchInstant(q))
    } catch {
      /* ignore */
    }
  } else {
    // Wikipedia's ARTICLE is often the most reliable "current version"
    // source there is (its infobox carries "Stable release X"), so it rides
    // along with the web results instead of only as a fallback
    try {
      const wiki = await searchWikipedia(q)
      add(wiki.slice(0, 2))
    } catch {
      /* ignore */
    }
  }
  if (!hits.length && duckError) throw duckError
  return hits.slice(0, MAX_RESULTS)
}

/**
 * Does this message want the web? Deliberately conservative: the app
 * searches when the user says so, or when the question is about something
 * that changes (news, prices, versions, releases) — and NOT for "what is
 * a closure" or "fix this bug".
 */
const ASK_WEB =
  /\b(search|look\s*up|google|find (?:me )?(?:out|info(?:rmation)? on|links?|docs?|documentation|articles?|sources?)|browse|look on the web|online)\b/i
const CURRENT =
  /\b(latest|current(ly)?|today|tonight|recent|recently|news|price|pricing|cost|how much|version|changelog|release[sd]?|released|upcoming|this (?:week|month|year)|who (?:is|was)|what'?s (?:new|happening)|is (?:there|it) (?:any|out)|does .* support|still (?:work|supported|available))\b/i
const QUESTION = /(\?\s*$)|^(who|what|when|where|which|how|is|are|does|do|did|can|should|any)\b/i

export function looksLikeWebQuery(text) {
  const t = String(text ?? '').trim()
  if (!t || t.length < 8) return false
  if (ASK_WEB.test(t)) return true
  if (QUESTION.test(t) && CURRENT.test(t)) return true
  return false
}

/** The query to hand the search engine: the message itself, trimmed of
 *  the chatty bits and capped. */
export function searchQueryFor(text) {
  return String(text ?? '')
    .replace(/^(please\s+)?(can you\s+|could you\s+|i want you to\s+|i need you to\s+)/i, '')
    .replace(/\?+$/, '')
    .trim()
    .slice(0, 200)
}

/** Page furniture, not content — a GitHub releases page is rendered by
 *  JavaScript, so its static HTML is nothing but navigation. */
const NAV_JUNK =
  /^(skip to|navigation menu|sign in|sign up|solutions|explore|resources|support for|for teams|pricing|contact sales|copilot|enterprise|marketplace|legal|privacy|terms|status|blog|security|platform|appearance|settings|view all|github|home|about|docs|api|community)/i
/** A version-ish token: v1.2, 1.2.3, 0.40.5-rc1 … */
const VERSION = /\bv?\(?(\d+)\)?\.(\d+)(?:\.(\d+))?(-[a-z0-9.]+)?/gi
/** A date, in the shapes release notes actually use. */
const DATE =
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s*\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\b/i
/** Words that mark a line as answering a "what is the latest…" question. */
const INTENT = /\b(latest|current|newest|stable|release[sd]?|version|updated)\b/i

/** The version numbers in a line, as comparable tuples. */
function versionsIn(line) {
  const out = []
  for (const m of String(line).matchAll(VERSION)) {
    out.push({
      v: [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)],
      index: m.index ?? 0,
      parts: m[3] ? 3 : 2
    })
  }
  return out
}

const newerThan = (a, b) => (a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2])

/** A price, in the shapes shops and articles write it. */
const PRICE = /(?:\$|USD|EUR|GBP)\s?\d[\d,.]*|\d[\d,.]*\s?(?:USD|EUR|dollars|euros)/gi

/**
 * The token that most likely IS the answer: a version or a price that
 * sits right after an intent word ("latest version is v0.40.6", "costs
 * $1,999"). A 7B model needs this pointed at, not left to dig for.
 *
 * `kind` gates what counts: a PRICE question must not be answered with a
 * version, and a VERSION question must not be answered with a price.
 */
export function answerToken(line, kind = 'any') {
  const cands = []
  const s = String(line)
  if (kind !== 'price') {
    for (const m of s.matchAll(VERSION)) {
      if (INTENT.test(s.slice(Math.max(0, m.index - 60), m.index))) cands.push({ token: m[0], index: m.index })
    }
  }
  if (kind !== 'version') {
    for (const m of s.matchAll(PRICE)) {
      const before = s.slice(Math.max(0, m.index - 60), m.index)
      if (INTENT.test(before) || /cost|price|starts at|only \$/i.test(before)) cands.push({ token: m[0], index: m.index })
    }
  }
  if (!cands.length) return ''
  cands.sort((a, b) => a.index - b.index)
  return cands[0].token
}

/** What KIND of answer the question is asking for — a price question must
 *  not be answered with a version number. */
export function answerKind(query) {
  const q = String(query ?? '').toLowerCase()
  if (/\b(price|pricing|cost|how much|how expensive)\b/.test(q)) return 'price'
  if (/\b(version|release|changelog|latest)\b/.test(q)) return 'version'
  return 'any'
}

/**
 * Pulls the lines most likely to HOLD the answer out of the search
 * snippets and the page text — the version line, the price line, the
 * date line. A small model will not dig through navigation to find it,
 * so the app digs first and hands the model what matters.
 *
 * Two subtleties, both learned from real results:
 *  · the intent word must be NEAR the version — "Llama 3.3 … - Releases"
 *    is a model version in a page called "Releases", not a release;
 *  · the page's TITLE is the subject, so its words count for the line
 *    ("Stable release 0.40.6" on the "Ollama" page is the answer).
 */
/** Stopwords that are never the SUBJECT of a question. */
const STOPWORDS = new Set([
  'latest', 'current', 'version', 'release', 'releases', 'changelog', 'price', 'prices',
  'pricing', 'cost', 'costs', 'much', 'what', 'whats', 'which', 'when', 'where', 'does',
  'tell', 'about', 'please', 'find', 'search', 'looking', 'look', 'know', 'please'
])

/**
 * How trustworthy is this source for this question? Wikipedia carries
 * "Stable release X" in its infobox, and the subject's OWN domain
 * ("node.js" → nodejs.org, "ollama" → ollama.com) is the primary source.
 * A random aggregator that merely mentions the subject is not.
 */
function domainWeight(url, subject) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    let w = 0
    if (host === 'wikipedia.org' || host.endsWith('.wikipedia.org')) w += 3
    if (host === 'github.com' || host.endsWith('.github.com')) w += 1
    const s = String(subject ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase()
    if (s.length >= 4) {
      const bare = host.replace(/[^a-z0-9]/gi, '').toLowerCase()
      if (bare.startsWith(s) || bare.startsWith(s.slice(0, Math.max(4, s.length - 2)))) w += 3
    }
    return w
  } catch {
    return 0
  }
}

/** The subject of a question: its longest meaningful word. */
function subjectOf(query) {
  const words = String(query ?? '')
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w))
  return words.sort((a, b) => b.length - a.length)[0] ?? ''
}

export function keyLines(query, hits, pages) {
  const words = String(query ?? '')
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter((w) => w.length > 3)
  const kind = answerKind(query)
  const subject = subjectOf(query)
  const cands = []
  const consider = (raw, url, subject = '') => {
    for (const line of String(raw ?? '').split(/\n+/)) {
      const t = line.trim()
      if (t.length < 12 || t.length > 320) continue
      if (NAV_JUNK.test(t)) continue
      const versions = versionsIn(t)
      // a version COUNTS only when an intent word sits just before it
      const strong = versions.filter((m) => INTENT.test(t.slice(Math.max(0, m.index - 60), m.index)))
      let s = 0
      if (strong.length) s += 5
      else if (versions.length) s += 1
      // a patch-level version (0.40.6, 26.12.0) is a PROJECT release; a
      // bare major (2.0, 3.3) is usually a model name
      if (strong.some((m) => m.parts >= 3)) s += 2
      if (INTENT.test(t)) s += 2
      if (DATE.test(t)) s += 2
      const hay = `${subject} ${t}`.toLowerCase()
      const subjectHit = words.some((w) => hay.includes(w))
      if (subjectHit) s += 2
      s += domainWeight(url, subject)
      if (s >= 2) {
        cands.push({
          line: t,
          url,
          score: s,
          // the token is only an ANSWER when the line (or its page) is
          // actually about what the user asked — "Stable release 5.0" on
          // a page about super sampling is not the price of a graphics card
          token: subjectHit ? answerToken(t, kind) : '',
          versions: strong.map((m) => ({ v: m.v, parts: m.parts }))
        })
      }
    }
  }
  for (const h of hits ?? []) if (h.snippet) consider(h.snippet, h.url, h.title)
  for (const p of pages ?? []) consider(p.text, p.url, p.title)

  // the newest version among the lines that CLAIM to be the current one
  // is the best answer to a "what is the latest X" question — but only
  // patch-level versions count when there are any: "2.0" is a model name,
  // "0.40.6" is the release
  const all = cands.flatMap((c) => c.versions)
  const patchOnly = all.filter((m) => m.parts >= 3)
  const pool = patchOnly.length ? patchOnly : all
  let newest = null
  for (const m of pool) if (!newest || newerThan(m.v, newest)) newest = m.v
  if (newest) {
    for (const c of cands) {
      if (c.versions.some((m) => m.v[0] === newest[0] && m.v[1] === newest[1] && m.v[2] === newest[2])) c.score += 4
    }
  }

  cands.sort((a, b) => b.score - a.score)
  const out = []
  const seen = new Set()
  for (const c of cands) {
    const key = c.line.slice(0, 70).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ line: c.line, url: c.url, score: c.score, token: c.token })
    if (out.length >= 4) break
  }
  return out
}

/**
 * Searches, reads the promising pages, digs out the lines that hold the
 * answer, and renders it all as a block a model can answer from.
 * Snippets alone are thin; a page is noisy; the KEY LINES are the point.
 */
export async function buildWebContext(message, { pages = 4, maxChars = 3000 } = {}) {
  const query = searchQueryFor(message)
  if (!query) return null
  const hits = await webSearch(query)
  if (!hits.length) return null

  // read the top pages in parallel — the first hits are usually the best
  const read = await Promise.all(
    hits.slice(0, Math.max(0, pages)).map(async (h) => {
      const r = await fetchPage(h.url, { maxChars, timeoutMs: 12000 })
      return r.ok && r.text ? { url: h.url, title: h.title, text: r.text } : null
    })
  )
  const allPages = read.filter(Boolean)

  // the lines that hold the answer, dug out of snippets AND pages
  const keys = keyLines(query, hits, allPages)
  const keyPages = new Set(keys.map((k) => k.url))
  // a page that contributed nothing is page furniture — it would only
  // distract the model, so it does not go into the block
  const useful = allPages.filter((p) => keyPages.has(p.url))

  const lines = []
  // the date first: "latest" is meaningless without it, and a small model
  // will otherwise answer with whatever release it remembers
  lines.push(`Today is ${new Date().toISOString().slice(0, 10)}.`)
  lines.push('You have web access: these results were fetched from the live internet a moment ago.')
  lines.push(`Web search for: ${query}`)
  lines.push('')

  // THE ANSWER, pointed at. A 7B model given a wall of text picks the
  // wrong number; given one labelled value it quotes it.
  const primary = keys.find((k) => k.token)
  if (primary) {
    lines.push('## The web answer')
    lines.push(`The live web says the current value is: ${primary.token}`)
    lines.push(`source: "${primary.line}" — ${primary.url}`)
    lines.push('Use exactly this value. Do not use a number you remember, and do not round it.')
    lines.push('')
  }
  if (keys.length) {
    lines.push('Key lines from the web — these most likely hold the answer:')
    for (const k of keys) lines.push(`- ${k.line}  —  ${k.url}`)
    lines.push('')
  }
  lines.push('Results:')
  for (const [i, h] of hits.slice(0, 6).entries()) {
    lines.push(`${i + 1}. ${h.title}`)
    lines.push(`   ${h.url}`)
    if (h.snippet) lines.push(`   ${h.snippet}`)
  }
  for (const p of useful.slice(0, 2)) {
    lines.push('')
    lines.push(`--- page: ${p.title} (${p.url}) ---`)
    lines.push(p.text)
  }
  lines.push('')
  lines.push(
    'Answer ONLY from the results above — they are live, and they are newer ' +
      'than your training data. If a key line states a version, a date or a ' +
      'number, that IS the answer: quote it exactly, do not round it off and ' +
      'do not substitute something you remember. If the results do not contain ' +
      'the answer, say plainly what is still unknown, and cite the URL you ' +
      'used (plain links).'
  )

  return { query, hits, pages: useful, keys, block: lines.join('\n') }
}
