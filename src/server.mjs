// =============================================================================
// Magazine Core — HTTP server
// -----------------------------------------------------------------------------
// The server is deliberately thin. It loads cached news into memory, serves
// static assets, and hands every HTML request to the render layer.
//
// The only access-control-related change compared to the original server:
//   1. `pingDb()` is awaited before `listen`, so the site refuses to start
//      if MySQL is unreachable.
//   2. The request handler is async so it can await the render layer.
//   3. `renderCached()` skips the HTML cache for requests carrying an
//      X-Document-Id header, because those may produce a banned page.
// =============================================================================

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { fallbackNews } from './data/fallbackNews.js';
import { sources } from './data/sources.js';
import { renderRoute } from './render.mjs';
import { pingDb } from './db.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const cacheFile = path.join(root, '.cache', 'news.json');
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') process.loadEnvFile(envFile);

const host = String(process.env.HOST || '0.0.0.0').trim() || '0.0.0.0';
const requestedPort = Number(process.env.PORT ?? 3000);
const port = Number.isInteger(requestedPort) && requestedPort >= 0 && requestedPort <= 65535 ? requestedPort : 3000;
const siteUrl = normalizeSiteUrl(process.env.SITE_URL || `http://localhost:${port || 3000}`);
const rssEnabled = String(process.env.RSS_ENABLED ?? 'true').trim().toLowerCase() !== 'false';

let state = {
  items: fallbackNews,
  sources: sources.map((entry) => ({
    id: entry.id,
    name: entry.name,
    category: entry.category,
    sourceType: entry.sourceType,
    homepage: entry.homepage,
    status: 'idle',
    itemCount: 0,
    checkedAt: null
  })),
  updatedAt: null
};

const htmlCache = new Map();
const publicAssets = new Map();
let worker = null;
let workerRestartTimer = null;
let shuttingDown = false;

function normalizeSiteUrl(value) {
  try {
    const url = new URL(String(value));
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('bad protocol');
    return url.origin;
  } catch {
    return `http://localhost:${port || 3000}`;
  }
}

function mimeType(filename) {
  switch (path.extname(filename).toLowerCase()) {
    case '.css': return 'text/css; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.webp': return 'image/webp';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.ico': return 'image/x-icon';
    case '.json': return 'application/json; charset=utf-8';
    default: return 'application/octet-stream';
  }
}

function securityHeaders(contentType = '') {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin'
  };
  if (contentType.startsWith('text/html')) {
    headers['Content-Security-Policy'] = "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; media-src 'self'";
  }
  return headers;
}

function send(res, status, body = '', headers = {}) {
  const contentType = headers['Content-Type'] || 'text/plain; charset=utf-8';
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  res.writeHead(status, {
    ...securityHeaders(contentType),
    ...headers,
    'Content-Length': String(payload.byteLength)
  });
  if (res.req?.method === 'HEAD') return res.end();
  res.end(payload);
}

async function preloadPublicAssets() {
  async function walk(dir, prefix = '') {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      const relative = `${prefix}/${entry.name}`.replace(/\\/g, '/');
      if (entry.isDirectory()) {
        await walk(absolute, relative);
        continue;
      }
      if (!entry.isFile()) continue;
      const [buffer, stat] = await Promise.all([fsp.readFile(absolute), fsp.stat(absolute)]);
      publicAssets.set(relative, {
        buffer,
        contentType: mimeType(entry.name),
        lastModified: stat.mtime.toUTCString()
      });
    }
  }
  await walk(publicDir, '');
}

function serveStatic(req, res, pathname) {
  const asset = publicAssets.get(pathname);
  if (!asset) return false;
  const cacheControl = pathname.startsWith('/media/') || pathname === '/styles.css'
    ? 'public, max-age=2592000, immutable'
    : 'public, max-age=300, must-revalidate';

  if (req.headers['if-modified-since'] === asset.lastModified) {
    res.writeHead(304, {
      ...securityHeaders(asset.contentType),
      'Cache-Control': cacheControl,
      'Last-Modified': asset.lastModified,
      'Content-Length': '0'
    });
    res.end();
    return true;
  }

  send(res, 200, asset.buffer, {
    'Content-Type': asset.contentType,
    'Cache-Control': cacheControl,
    'Last-Modified': asset.lastModified
  });
  return true;
}

// Render with a small in-memory cache.
// Caching is skipped for any request carrying an X-Document-Id header,
// because those may produce a banned page that must not be shared.
async function renderCached(url, stateForRender, req) {
  const isAnon = !req?.headers?.['x-document-id'];
  const key = `${url.pathname}${url.search}`;
  const current = htmlCache.get(key);
  const now = Date.now();

  if (isAnon && current && now - current.createdAt < 30_000) return current.result;

  const result = await renderRoute(url, stateForRender, req);

  if (isAnon && result.status === 200) {
    if (htmlCache.size >= 160) htmlCache.delete(htmlCache.keys().next().value);
    htmlCache.set(key, { result, createdAt: now });
  }
  return result;
}

function invalidateHtmlCache() {
  htmlCache.clear();
}

async function loadCache() {
  try {
    const cached = JSON.parse(await fsp.readFile(cacheFile, 'utf8'));
    if (Array.isArray(cached.items) && cached.items.length) state.items = cached.items;
    if (Array.isArray(cached.sources) && cached.sources.length) state.sources = cached.sources;
    state.updatedAt = cached.updatedAt || null;
  } catch {
    // First run is intentionally instant: built-in stories render until RSS snapshots arrive.
  }
}

function startWorker() {
  if (!rssEnabled || shuttingDown || worker) return;

  worker = new Worker(new URL('./news-worker.mjs', import.meta.url), {
    env: process.env,
    resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 }
  });
  worker.unref();

  worker.on('message', (message) => {
    if (message?.type === 'snapshot') {
      if (Array.isArray(message.items) && message.items.length) state.items = message.items;
      if (Array.isArray(message.sources) && message.sources.length) state.sources = message.sources;
      state.updatedAt = message.updatedAt || state.updatedAt;
      invalidateHtmlCache();
      return;
    }
    if (message?.type === 'log') {
      const fn = message.level === 'warn' ? console.warn : console.log;
      fn(`[rss] ${message.message}`);
    }
  });

  worker.on('error', (error) => console.warn(`[rss] worker error: ${error.message}; website remains online.`));
  worker.on('exit', (code) => {
    worker = null;
    if (shuttingDown) return;
    if (code !== 0) console.warn(`[rss] worker exited with code ${code}; restarting in 30s while cached news stays online.`);
    clearTimeout(workerRestartTimer);
    workerRestartTimer = setTimeout(startWorker, 30_000);
    workerRestartTimer.unref();
  });
}

function robotsText() {
  return `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

function sitemapXml() {
  const staticPaths = ['/', '/news', '/products', '/licensing', '/updates', '/learn', '/about', '/search'];
  const topicPaths = ['windows', 'azure', 'xbox', 'ai', 'security', 'development', 'business'].map((slug) => `/topics/${slug}`);
  const urls = [...staticPaths, ...topicPaths].map((pathname) => `<url><loc>${siteUrl}${pathname}</loc></url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

function healthJson() {
  const liveItems = state.items.filter((item) => !item?.isFallback);
  const fallbackItems = state.items.length - liveItems.length;
  const remoteImageItems = liveItems.filter((item) => /^https:\/\//i.test(item?.image || '')).length;
  const latestPublishedAt = liveItems
    .map((item) => item?.publishedAt)
    .filter(Boolean)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
  const sourcesOnline = state.sources.filter((source) => source?.status === 'online').length;
  const sourcesDegraded = state.sources.filter((source) => source?.status === 'degraded').length;
  const sourcesOffline = state.sources.filter((source) => source?.status === 'offline').length;
  return JSON.stringify({
    ok: true,
    service: 'magazine-core',
    version: '11.9.0',
    architecture: 'instant-static-html',
    css: 'versioned-cached-stylesheet',
    assets: 'memory',
    rssEnabled,
    rssWorker: worker ? 'running' : (rssEnabled ? 'starting' : 'disabled'),
    newsItems: state.items.length,
    liveNewsItems: liveItems.length,
    fallbackNewsItems: fallbackItems,
    remoteImageItems,
    latestPublishedAt,
    sources: state.sources.length,
    sourcesOnline,
    sourcesDegraded,
    sourcesOffline,
    updatedAt: state.updatedAt
  });
}

await Promise.all([loadCache(), preloadPublicAssets()]);

// Fail fast if the access layer cannot reach MySQL.
try {
  await pingDb();
  console.log('[db] MySQL connection OK');
} catch (error) {
  console.error(`[db] MySQL connection failed: ${error.message}`);
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const startedAt = process.hrtime.bigint();
  try {
    if (!['GET', 'HEAD'].includes(req.method || '')) {
      send(res, 405, 'Method not allowed', { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
      return;
    }
    if ((req.url || '').length > 2048) {
      send(res, 414, 'Request URI too long');
      return;
    }

    const url = new URL(req.url || '/', siteUrl);
    const pathname = url.pathname;

    if (pathname === '/health') {
      send(res, 200, healthJson(), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return;
    }
    if (pathname === '/robots.txt') {
      send(res, 200, robotsText(), { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
      return;
    }
    if (pathname === '/sitemap.xml') {
      send(res, 200, sitemapXml(), { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
      return;
    }
    if (serveStatic(req, res, pathname)) return;

    const result = await renderCached(url, state, req);
    const elapsedBeforeSend = Number(process.hrtime.bigint() - startedAt) / 1e6;
    send(res, result.status, result.html, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': result.status === 200 ? 'private, no-cache, must-revalidate' : 'no-store',
      'Server-Timing': `app;dur=${elapsedBeforeSend.toFixed(2)}`
    });
  } catch (error) {
    console.error('[web] request failed:', error);
    if (!res.headersSent) send(res, 500, 'Internal server error');
    else res.destroy();
  } finally {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    if (elapsedMs > 100) console.warn(`[perf] slow request ${req.method} ${req.url}: ${elapsedMs.toFixed(1)}ms`);
  }
});

server.requestTimeout = 10_000;
server.headersTimeout = 12_000;
server.keepAliveTimeout = 5_000;
server.maxRequestsPerSocket = 500;
server.maxHeadersCount = 64;

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`[web] Port ${port} is already in use. Another Magazine Core/Node process is probably still running.`);
    console.error('[web] Stop the older npm start window with Ctrl+C, then run npm start again.');
    process.exitCode = 1;
    return;
  }
  console.error(`[web] server error: ${error?.message || error}`);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  const actual = server.address();
  const actualPort = typeof actual === 'object' && actual ? actual.port : port;
  console.log(`[web] Magazine Core 11.9 listening on http://${host}:${actualPort}`);
  console.log(`[web] Instant path: cached CSS + tiny critical shell, ${publicAssets.size} local assets in memory, zero client JavaScript.`);
  console.log(`[rss] ${rssEnabled ? 'Background refresh enabled; it never runs inside visitor requests.' : 'Disabled by configuration.'}`);
  if (rssEnabled) startWorker();
});

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(workerRestartTimer);
  console.log(`[web] ${signal} received; shutting down`);
  if (worker) {
    worker.postMessage({ type: 'stop' });
    await Promise.race([
      new Promise((resolve) => worker.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 1500))
    ]);
    if (worker?.threadId !== -1) await worker.terminate().catch(() => {});
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
