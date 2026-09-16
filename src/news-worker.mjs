import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parentPort } from 'node:worker_threads';
import { sources } from './data/sources.js';
import { fallbackNews } from './data/fallbackNews.js';
import { parseFeedXml } from './feed-parser.mjs';
import { canonicalUrl, makeId, normalizeDate, truncate } from './utils.mjs';

const cacheDir = path.resolve(process.cwd(), '.cache');
const cacheFile = path.join(cacheDir, 'news.json');
const enabled = String(process.env.RSS_ENABLED ?? 'true').toLowerCase() !== 'false';
const initialDelayMs = clampNumber(process.env.RSS_INITIAL_DELAY_SECONDS, 1, 1, 600) * 1000;
const stepMs = clampNumber(process.env.RSS_STEP_SECONDS, 12, 5, 600) * 1000;
const timeoutMs = clampNumber(process.env.RSS_TIMEOUT_MS, 5000, 2000, 15000);
const maxFeedBytes = clampNumber(process.env.RSS_MAX_FEED_BYTES, 700_000, 150_000, 2_000_000);
const maxItemsPerSource = clampNumber(process.env.RSS_MAX_ITEMS_PER_SOURCE, 10, 4, 20);
const maxTotalItems = clampNumber(process.env.RSS_MAX_TOTAL_ITEMS, 240, 60, 600);
const maxAgeDays = clampNumber(process.env.RSS_MAX_ITEM_AGE_DAYS, 45, 7, 180);
const userAgent = 'Mozilla/5.0 (compatible; MagazineCore/11.9; +RSS reader)';

const priorityIds = [
  'microsoft-official', 'windows-blog', 'xbox-wire', 'azure-blog', 'security-blog',
  'microsoft-365', 'github-blog', 'dotnet-blog', 'windows-insider', 'xbox-game-pass',
  'microsoft-research', 'windows-central', 'neowin', 'bleepingcomputer'
];
const sourceById = new Map(sources.map((source) => [source.id, source]));
const orderedSources = [
  ...priorityIds.map((id) => sourceById.get(id)).filter(Boolean),
  ...sources.filter((source) => !priorityIds.includes(source.id))
];

let itemsBySource = new Map();
let sourceState = new Map();
let validatorsByUrl = new Map();
let updatedAt = null;
let cursor = 0;
let timer = null;
let stopped = false;
let writesSinceSnapshot = 0;

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(Math.max(number, min), max) : fallback;
}

function sourceView(source, overrides = {}) {
  return {
    id: source.id,
    name: source.name,
    category: source.category,
    sourceType: source.sourceType,
    homepage: source.homepage,
    status: 'pending',
    itemCount: 0,
    checkedAt: null,
    durationMs: null,
    error: null,
    ...overrides
  };
}

function recent(item, now = Date.now()) {
  if (item?.isFallback) return true;
  const stamp = Date.parse(item?.publishedAt || '');
  if (!Number.isFinite(stamp)) return false;
  return stamp >= now - maxAgeDays * 86400000 && stamp <= now + 172800000;
}

function snapshotItems() {
  const live = [...itemsBySource.values()].flat().filter((item) => recent(item));
  const deduped = [...new Map(live.map((item) => [item.link, item])).values()]
    .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))
    .slice(0, maxTotalItems);

  if (deduped.length >= 6) return deduped;
  const seen = new Set(deduped.map((item) => item.link));
  return [...deduped, ...fallbackNews.filter((item) => !seen.has(item.link))].slice(0, maxTotalItems);
}

async function loadCache() {
  try {
    const raw = await fs.readFile(cacheFile, 'utf8');
    const cached = JSON.parse(raw);
    if (Array.isArray(cached.items)) {
      for (const item of cached.items) {
        if (!item?.sourceId || item.isFallback) continue;
        const list = itemsBySource.get(item.sourceId) || [];
        list.push(item);
        itemsBySource.set(item.sourceId, list.slice(0, maxItemsPerSource));
      }
    }
    if (Array.isArray(cached.sources)) {
      for (const item of cached.sources) sourceState.set(item.id, item);
    }
    if (cached.validators && typeof cached.validators === 'object') {
      validatorsByUrl = new Map(Object.entries(cached.validators));
    }
    updatedAt = cached.updatedAt || null;
  } catch {
    // First run: the web thread serves built-in stories immediately.
  }

  for (const source of sources) {
    if (!sourceState.has(source.id)) sourceState.set(source.id, sourceView(source));
  }
}

async function writeCache() {
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    const payload = JSON.stringify({
      updatedAt,
      items: snapshotItems(),
      sources: sources.map((source) => sourceState.get(source.id) || sourceView(source)),
      validators: Object.fromEntries(validatorsByUrl)
    });
    const temp = `${cacheFile}.${process.pid}.tmp`;
    await fs.writeFile(temp, payload, 'utf8');
    await fs.rename(temp, cacheFile).catch(async (error) => {
      if (!['EEXIST', 'EPERM', 'EACCES'].includes(error?.code)) throw error;
      await fs.rm(cacheFile, { force: true });
      await fs.rename(temp, cacheFile);
    });
  } catch (error) {
    parentPort?.postMessage({ type: 'log', level: 'warn', message: `cache write failed: ${error.message}` });
  }
}

function detectCategory(source, item) {
  const text = `${item.title || ''} ${item.contentSnippet || ''} ${item.content || ''} ${item.summary || ''}`.toLowerCase();
  const rules = [
    ['Xbox', ['xbox', 'game pass', 'minecraft', 'activision', 'bethesda', 'blizzard', 'halo', 'forza']],
    ['Security', ['security', 'defender', 'entra', 'identity', 'vulnerability', 'malware', 'ransomware', 'zero trust', 'cve-', 'patch tuesday']],
    ['Azure', ['azure', 'cloud service', 'microsoft cloud', 'datacenter']],
    ['AI', ['microsoft foundry', 'copilot', 'artificial intelligence', 'generative ai', 'ai agent', 'foundation model', 'language model']],
    ['GitHub', ['github', 'codespaces', 'copilot coding agent', 'dependabot']],
    ['Windows', ['windows 11', 'windows 10', 'windows insider', 'surface', 'microsoft edge', 'copilot+ pc', 'powertoys', 'windows terminal', 'winui', 'wsl']],
    ['Microsoft 365', ['microsoft 365', 'office 365', 'microsoft teams', 'sharepoint', 'onedrive', 'outlook', 'exchange', 'power platform']],
    ['Development', ['.net', 'visual studio', 'powershell', 'developer', 'sdk', 'typescript', 'c#', 'c++', 'java', 'python', 'aspire']],
    ['Data', ['cosmos db', 'sql server', 'fabric', 'database']],
    ['Research', ['microsoft research', 'researchers', 'research lab']]
  ];
  return rules.find(([, words]) => words.some((word) => text.includes(word)))?.[0] || source.category;
}

function matchesFilter(source, item) {
  if (!source.includeKeywords?.length) return true;
  const text = `${item.title || ''} ${item.contentSnippet || ''} ${item.content || ''} ${item.summary || ''}`.toLowerCase();
  return source.includeKeywords.some((word) => text.includes(String(word).toLowerCase()));
}

async function readLimitedText(response) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxFeedBytes) throw new Error('feed exceeds size limit');
  if (!response.body) return response.text();

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxFeedBytes) {
      await reader.cancel();
      throw new Error('feed exceeds size limit');
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function fetchXml(url) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  const validator = validatorsByUrl.get(url) || {};
  const headers = {
    'user-agent': userAgent,
    accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.3'
  };
  if (validator.etag) headers['if-none-match'] = validator.etag;
  if (validator.lastModified) headers['if-modified-since'] = validator.lastModified;

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers
    });
    if (response.status === 304) return { notModified: true };
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await readLimitedText(response);
    validatorsByUrl.set(url, {
      etag: response.headers.get('etag') || null,
      lastModified: response.headers.get('last-modified') || null
    });
    return { notModified: false, xml };
  } finally {
    clearTimeout(timerId);
  }
}

function normalizeImageUrl(value, baseUrl) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('data:')) return null;
  try {
    const normalized = raw.startsWith('//') ? `https:${raw}` : raw;
    const url = new URL(normalized, baseUrl || undefined);
    if (url.protocol !== 'https:') return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeItem(source, item) {
  const link = canonicalUrl(item.link || item.guid || source.homepage) || source.homepage;
  const title = truncate(item.title || 'Untitled update', 180);
  const content = item.contentSnippet || item.contentEncoded || item.content || item.summary || item.description || '';
  return {
    id: makeId(source.id, link, title),
    sourceId: source.id,
    sourceName: source.name,
    sourceType: source.sourceType,
    category: detectCategory(source, item),
    title,
    summary: truncate(content, 320) || 'Open the original publication for the complete story.',
    link,
    publishedAt: normalizeDate(item.isoDate || item.pubDate || item.published || item.updated),
    image: normalizeImageUrl(item.image, link || source.homepage),
    author: truncate(item.creator || item.dcCreator || item.author || '', 90) || null,
    isFallback: false
  };
}

async function refreshSource(source) {
  const started = Date.now();
  let lastError = null;
  for (const url of source.feedUrls) {
    try {
      const result = await fetchXml(url);
      const retained = itemsBySource.get(source.id) || [];
      if (result.notModified && retained.length) {
        sourceState.set(source.id, sourceView(source, {
          status: 'online', itemCount: retained.length, checkedAt: new Date().toISOString(), durationMs: Date.now() - started
        }));
        return false;
      }

      const feed = parseFeedXml(result.xml);
      const items = (feed.items || [])
        .filter((item) => matchesFilter(source, item))
        .slice(0, maxItemsPerSource)
        .map((item) => normalizeItem(source, item))
        .filter((item) => recent(item));
      if (!items.length) throw new Error('no matching recent items');
      itemsBySource.set(source.id, items);
      sourceState.set(source.id, sourceView(source, {
        status: 'online', itemCount: items.length, checkedAt: new Date().toISOString(), durationMs: Date.now() - started
      }));
      updatedAt = new Date().toISOString();
      return true;
    } catch (error) {
      lastError = error;
    }
  }

  const retained = itemsBySource.get(source.id) || [];
  sourceState.set(source.id, sourceView(source, {
    status: retained.length ? 'degraded' : 'offline',
    itemCount: retained.length,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    error: truncate(lastError?.name === 'AbortError' ? 'timeout' : (lastError?.message || 'feed unavailable'), 120)
  }));
  return false;
}

function publishSnapshot() {
  parentPort?.postMessage({
    type: 'snapshot',
    updatedAt,
    items: snapshotItems(),
    sources: sources.map((entry) => sourceState.get(entry.id) || sourceView(entry))
  });
}

async function step() {
  if (stopped || !enabled) return;
  const source = orderedSources[cursor % orderedSources.length];
  cursor += 1;
  try {
    const changed = await refreshSource(source);
    writesSinceSnapshot += 1;
    if (writesSinceSnapshot >= 6 || changed) {
      writesSinceSnapshot = 0;
      await writeCache();
    }
    publishSnapshot();
  } catch (error) {
    parentPort?.postMessage({ type: 'log', level: 'warn', message: `RSS step failed: ${error.message}` });
  } finally {
    if (!stopped) {
      const liveCount = [...itemsBySource.values()].reduce((total, list) => total + list.filter((item) => !item?.isFallback).length, 0);
      const nextDelay = liveCount >= 6 ? stepMs : Math.min(stepMs, 2000);
      timer = setTimeout(step, nextDelay);
      timer.unref?.();
    }
  }
}

await loadCache();
publishSnapshot();

if (enabled) {
  parentPort?.postMessage({
    type: 'log',
    level: 'info',
    message: `background refresh starts in ${Math.round(initialDelayMs / 1000)}s; warm-up checks run every 2s until live stories arrive, then one source every ${Math.round(stepMs / 1000)}s`
  });
  timer = setTimeout(step, initialDelayMs);
  timer.unref?.();
} else {
  parentPort?.postMessage({ type: 'log', level: 'info', message: 'RSS worker disabled by configuration.' });
}

parentPort?.on('message', async (message) => {
  if (message?.type === 'stop') {
    stopped = true;
    if (timer) clearTimeout(timer);
    await writeCache();
    process.exit(0);
  }
});
