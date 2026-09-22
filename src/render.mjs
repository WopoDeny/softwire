// =============================================================================
// Magazine Core — render layer
// -----------------------------------------------------------------------------
// All page rendering for the site. The only page that touches access control
// is the homepage. Every other route is untouched.
//
// Access flow, in short:
//   1. Read X-Document-Id from the request.
//   2. If the id is in blacklist        -> show the banned page (HTTP 403).
//   3. If the id is in whitelist        -> normal homepage, no visible change.
//   4. If the id looks suspicious       -> add to blacklist, show banned page.
//   5. If a stored hash does not match  -> add to blacklist, show banned page.
//   6. Otherwise                        -> add to whitelist + whitelist_hash,
//                                          queue a pending row for later review,
//                                          show normal homepage.
//
// Regular visitors never see any of this. Only blacklisted visitors get a
// different page.
// =============================================================================

import crypto from 'node:crypto';
import { products } from './data/products.js';
import { licenses } from './data/licenses.js';
import { topics } from './data/topics.js';
import { escapeHtml, formatDate, normalize, safeExternalUrl, topicImage, truncate } from './utils.mjs';
import {
  findAccess,
  insertWhitelist,
  insertBlacklist,
  upsertHash,
  upsertPending
} from './db.mjs';

const brand = 'Magazine Core';
const navItems = [
  ['/', 'Home'], ['/news', 'News'], ['/products', 'Products'], ['/licensing', 'Licensing'], ['/updates', 'Sources'], ['/learn', 'Learn'], ['/about', 'About']
];

// =============================================================================
// ACCESS CONTROL — used only by the homepage
// =============================================================================

// Basic sanity check for incoming identifiers.
// Rejects anything too short, too long, containing unexpected characters,
// or carrying obvious injection payloads in the header.
function looksSuspicious(documentId, header) {
  if (!documentId || documentId.length < 6 || documentId.length > 128) return true;
  if (!/^[A-Za-z0-9._:-]+$/.test(documentId)) return true;
  if (!header || header.length > 512) return true;
  if (/<script|javascript:/i.test(header)) return true;
  return false;
}

// Deterministic hash of document_id + header. Used to detect tampering:
// if a known document_id suddenly arrives with a different header, the
// stored hash will not match and the request is treated as hostile.
function makeHash(documentId, header) {
  return crypto
    .createHash('sha256')
    .update(`${documentId}|${header}|magazine-core-pepper`)
    .digest('hex');
}

// Decide what to do with the current visitor.
// Returns one of: { status: 'anonymous' | 'ok' | 'banned' }
async function checkVisitor(documentId, header) {
  if (!documentId) return { status: 'anonymous' };

  const state = await findAccess(documentId);

  // Already banned. Nothing else matters.
  if (state.blacklist) return { status: 'banned' };

  // Already whitelisted. Let them through without writing anything.
  if (state.whitelist) return { status: 'ok' };

  // Looked hostile at first glance. Ban immediately.
  if (looksSuspicious(documentId, header)) {
    await insertBlacklist(documentId, header || '', 'heuristic: suspicious input');
    return { status: 'banned' };
  }

  // Hash mismatch means a known id came back with a different header.
  const expectedHash = makeHash(documentId, header);
  if (state.hash && state.hash.hash !== expectedHash) {
    await insertBlacklist(documentId, header, 'hash mismatch');
    return { status: 'banned' };
  }

  // First clean visit. Add to whitelist + whitelist_hash, and queue
  // a pending row for the external admin program to review later.
  await insertWhitelist(documentId, header);
  await upsertHash(documentId, expectedHash);
  await upsertPending(documentId, header, expectedHash, 'pending');

  return { status: 'ok' };
}

// Rendered instead of the homepage for blacklisted visitors.
function bannedPage() {
  return layout({
    pathname: '/',
    title: 'Access denied',
    description: 'Access denied.',
    status: 403,
    content: `<section class="not-found shell">
      <span class="eyebrow">403</span>
      <h1>You are banned.</h1>
      <p>Your access to this site has been closed.</p>
    </section>`
  });
}

// =============================================================================
// SHARED HELPERS
// =============================================================================

function isActive(pathname, href) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function icon(name) {
  const paths = {
    search: '<path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    external: '<path d="M14 5h5v5M19 5l-8 8M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    spark: '<path d="M12 3l1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Z"/><path d="M5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8L5 15Z"/>',
    shield: '<path d="M12 3 5 6v5c0 4.8 2.8 8.2 7 10 4.2-1.8 7-5.2 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>'
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.arrow}</svg>`;
}

function header(pathname) {
  const nav = navItems.map(([href, label]) => `<a class="nav-link${isActive(pathname, href) ? ' is-active' : ''}" href="${href}">${label}</a>`).join('');
  return `
    <header class="site-header">
      <div class="shell header-row">
        <a class="brand" href="/" aria-label="Magazine Core home">
          <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span class="brand-copy"><strong>Magazine Core</strong><small>Microsoft ecosystem</small></span>
        </a>
        <nav class="desktop-nav" aria-label="Main navigation">${nav}</nav>
        <div class="header-actions">
          <a class="search-button" href="/search" aria-label="Search">${icon('search')}<span>Search</span></a>
          <details class="mobile-menu">
            <summary aria-label="Open navigation">${icon('menu')}</summary>
            <div class="mobile-menu-panel">${nav}<a class="nav-link" href="/search">Search</a></div>
          </details>
        </div>
      </div>
    </header>`;
}

function footer() {
  return `
    <footer class="site-footer">
      <div class="shell footer-grid">
        <div><a class="brand footer-brand" href="/"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="brand-copy"><strong>Magazine Core</strong><small>Independent ecosystem index</small></span></a><p>News, products, licensing references and trusted destinations across the Microsoft ecosystem.</p></div>
        <div><strong>Explore</strong><a href="/news">News</a><a href="/products">Products</a><a href="/licensing">Licensing</a><a href="/updates">Sources</a></div>
        <div><strong>Topics</strong><a href="/topics/windows">Windows</a><a href="/topics/azure">Azure</a><a href="/topics/xbox">Xbox</a><a href="/topics/ai">AI & Copilot</a></div>
      </div>
      <div class="shell footer-bottom"><span>© ${new Date().getFullYear()} Magazine Core</span><span>Microsoft, Xbox and related marks belong to their respective owners.</span></div>
    </footer>`;
}

function layout({ pathname, title, description, content, status = 200 }) {
  const fullTitle = title ? `${escapeHtml(title)} — ${brand}` : `${brand} — Microsoft ecosystem magazine`;
  const desc = escapeHtml(description || 'News, products, licensing and trusted sources across the Microsoft ecosystem.');
  return {
    status,
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="color-scheme" content="dark">
  <meta name="theme-color" content="#260d3a">
  <title>${fullTitle}</title>
  <meta name="description" content="${desc}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <style>html{background:#090812}body{margin:0;background:#090812;color:#f8f5ff}</style>
  <link rel="stylesheet" href="/styles.css?v=11.9.0">
</head>
<body>
  <div class="ambient-bg" aria-hidden="true"><img src="/media/ambient-blossom.webp" width="1920" height="1080" alt=""></div>
  <a class="skip-link" href="#main">Skip to content</a>
  ${header(pathname)}
  <main id="main">${content}</main>
  ${footer()}
</body>
</html>`
  };
}

function sectionHeader(eyebrow, title, text = '', link = '', linkLabel = '') {
  return `<div class="section-head"><div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h2>${escapeHtml(title)}</h2>${text ? `<p>${escapeHtml(text)}</p>` : ''}</div>${link ? `<a class="text-link" href="${link}">${escapeHtml(linkLabel || 'Explore')}${icon('arrow')}</a>` : ''}</div>`;
}

function topicPill(topic) {
  return `<a class="topic-card" href="/topics/${encodeURIComponent(topic.slug)}"><span class="topic-kicker">${escapeHtml(topic.eyebrow)}</span><strong>${escapeHtml(topic.name)}</strong><small>${escapeHtml(topic.teaser)}</small><span class="topic-arrow">${icon('arrow')}</span></a>`;
}

function newsCard(item, featured = false) {
  const image = item.image || topicImage(item.category, item.id || item.title);
  const imageRemote = /^https:\/\//i.test(image);
  const freshness = item.isFallback ? 'Publisher reference' : formatDate(item.publishedAt);
  return `<article class="news-card${featured ? ' news-card-featured' : ''}">
    <a class="news-image" href="/news/${encodeURIComponent(item.id)}" aria-label="${escapeHtml(item.title)}"><img src="${escapeHtml(image)}" width="640" height="360" loading="lazy" decoding="async"${imageRemote ? ' referrerpolicy="no-referrer"' : ''} alt=""></a>
    <div class="news-body">
      <div class="news-meta"><span class="chip">${escapeHtml(item.category || 'News')}</span><span>${escapeHtml(freshness)}</span></div>
      <h3><a href="/news/${encodeURIComponent(item.id)}">${escapeHtml(item.title)}</a></h3>
      <p>${escapeHtml(truncate(item.summary, featured ? 240 : 180))}</p>
      <div class="news-foot"><span>${escapeHtml(item.sourceName || 'Magazine Core')}</span><a href="${escapeHtml(safeExternalUrl(item.link))}" target="_blank" rel="noopener noreferrer">Source ${icon('external')}</a></div>
    </div>
  </article>`;
}

function newsGrid(items, options = {}) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return emptyState('No stories match this view yet.');
  return `<div class="news-grid${options.compact ? ' news-grid-compact' : ''}">${list.map((item, index) => newsCard(item, options.firstFeatured && index === 0)).join('')}</div>`;
}

function productCard(item) {
  return `<article class="product-card">
    <div class="product-art"><img src="${escapeHtml(item.image)}" width="640" height="360" loading="lazy" decoding="async" alt=""></div>
    <div class="product-body"><span class="eyebrow">${escapeHtml(item.area)}</span><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.summary)}</p><div class="tag-row">${(item.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div><a class="card-link" href="${escapeHtml(safeExternalUrl(item.officialUrl))}" target="_blank" rel="noopener noreferrer">Official site ${icon('external')}</a></div>
  </article>`;
}

function productGrid(items) {
  return `<div class="product-grid">${(items || []).map(productCard).join('')}</div>`;
}

function licenseCard(item) {
  return `<article class="license-card"><div class="license-top"><span class="chip chip-gold">${escapeHtml(item.family)}</span><span>${escapeHtml(item.audience)}</span></div><h3>${escapeHtml(item.name)}</h3><div class="license-facts"><span><small>Model</small>${escapeHtml(item.model)}</span><span><small>Unit</small>${escapeHtml(item.unit)}</span></div><ul>${(item.highlights || []).map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul><a class="card-link" href="${escapeHtml(safeExternalUrl(item.officialUrl))}" target="_blank" rel="noopener noreferrer">Microsoft reference ${icon('external')}</a></article>`;
}

function sourceCards(sources) {
  const list = (sources || []).filter(Boolean);
  return `<div class="source-grid">${list.map((source) => `<article class="source-card"><span class="chip">${escapeHtml(source.sourceType || 'Source')}</span><h3>${escapeHtml(source.name)}</h3><p>${escapeHtml(source.category || 'Microsoft ecosystem')}</p><a class="card-link" href="${escapeHtml(safeExternalUrl(source.homepage))}" target="_blank" rel="noopener noreferrer">Visit publisher ${icon('external')}</a></article>`).join('')}</div>`;
}

function pageHero({ eyebrow, title, text, image = '', accent = 'violet' }) {
  return `<section class="page-hero shell accent-${accent}"><div class="page-hero-copy"><span class="eyebrow">${escapeHtml(eyebrow)}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p></div>${image ? `<div class="page-hero-art"><img src="${escapeHtml(image)}" width="960" height="540" loading="eager" decoding="async" fetchpriority="high" alt=""></div>` : ''}</section>`;
}

function emptyState(text) {
  return `<div class="empty-state">${icon('spark')}<strong>Nothing to show here yet.</strong><p>${escapeHtml(text)}</p></div>`;
}

function pagination(basePath, current, total, params) {
  if (total <= 1) return '';
  const makeHref = (page) => {
    const query = new URLSearchParams(params);
    if (page <= 1) query.delete('page'); else query.set('page', String(page));
    const suffix = query.toString();
    return suffix ? `${basePath}?${suffix}` : basePath;
  };
  return `<nav class="pagination" aria-label="Pagination">${current > 1 ? `<a href="${makeHref(current - 1)}">Previous</a>` : '<span aria-disabled="true">Previous</span>'}<strong>Page ${current} / ${total}</strong>${current < total ? `<a href="${makeHref(current + 1)}">Next</a>` : '<span aria-disabled="true">Next</span>'}</nav>`;
}

// =============================================================================
// PAGES
// =============================================================================

// Homepage. This is the only route that runs the access check.
async function home(state, req) {
  // Read the identity headers set by the caller.
  const documentId = String(req?.headers?.['x-document-id'] || '').trim().slice(0, 128);
  const visitorHeader = String(
    req?.headers?.['x-visitor-header'] || req?.headers?.['user-agent'] || ''
  ).trim().slice(0, 512);

  // Run the access check only when an id is present.
  // Anonymous visitors skip the database entirely.
  if (documentId) {
    try {
      const access = await checkVisitor(documentId, visitorHeader);
      if (access.status === 'banned') return bannedPage();
    } catch (error) {
      console.warn(`[access] ${error.message}`);
      // On database errors we fail open: the user sees the normal page.
    }
  }

  // Normal homepage for everyone else.
  const latest = state.items.slice(0, 12);
  const lead = latest[0] || state.items[0];
  const content = `
    <section class="home-hero shell">
      <div class="home-hero-copy scenic-copy"><h1>One clear view across the Microsoft ecosystem.</h1><p>Fast access to reporting, products, licensing references and trusted publishers across Windows, Azure, Xbox, Microsoft 365, security, AI and development.</p><div class="hero-actions"><a class="button primary" href="/news">Explore the newsroom ${icon('arrow')}</a><a class="button secondary" href="/products">Browse products</a></div></div>
      <div class="hero-feature">${lead ? `<img src="${escapeHtml(lead.image || topicImage(lead.category, lead.id))}" width="960" height="540" loading="${/^https:\/\//i.test(lead.image || '') ? 'lazy' : 'eager'}" decoding="async"${/^https:\/\//i.test(lead.image || '') ? ' referrerpolicy="no-referrer"' : ' fetchpriority="high"'} alt=""><div class="hero-feature-copy"><div class="news-meta"><span class="chip">${escapeHtml(lead.category)}</span><span>${escapeHtml(lead.isFallback ? 'Publisher reference' : formatDate(lead.publishedAt))}</span></div><h2>${escapeHtml(lead.title)}</h2><p>${escapeHtml(truncate(lead.summary, 190))}</p><a href="/news/${encodeURIComponent(lead.id)}">Read story ${icon('arrow')}</a></div>` : ''}</div>
    </section>
    <section class="section shell">${sectionHeader('Explore the ecosystem', 'Move by topic, not by clutter', 'Focused destinations for the parts of Microsoft you actually follow.')}<div class="topic-grid">${topics.map(topicPill).join('')}</div></section>
    <section class="section shell">${sectionHeader('Latest reporting', 'Fresh stories, cleanly presented', 'A calm newsroom with clear source labels, readable cards and no distracting moving feed.', '/news', 'Open all news')} ${newsGrid(latest.slice(1, 7), { compact: true })}</section>
    <section class="section shell">${sectionHeader('Product directory', 'The platforms behind work, cloud and play', 'Official destinations with a clear summary of what each product is for.', '/products', 'Browse all products')} ${productGrid(products.slice(0, 6))}</section>
    <section class="section shell split-feature"><div class="feature-copy"><span class="eyebrow">Licensing references</span><h2>Make sense of editions, models and units.</h2><p>Compare common Windows, Microsoft 365, Windows Server and SQL Server licensing structures, then continue to Microsoft documentation.</p><a class="button primary" href="/licensing">Open licensing guide ${icon('arrow')}</a></div><div class="feature-art"><img src="/media/licensing.webp" width="960" height="540" loading="lazy" decoding="async" alt=""></div></section>`;
  return layout({ pathname: '/', title: '', description: 'A fast, curated magazine for Microsoft, Windows, Azure, Xbox, licensing, products and trusted sources.', content });
}

function newsPage(url, state) {
  const category = url.searchParams.get('category') || '';
  const type = url.searchParams.get('type') || '';
  const source = url.searchParams.get('source') || '';
  const page = Math.max(1, Math.min(Number.parseInt(url.searchParams.get('page'), 10) || 1, 100));
  const pageSize = 18;
  const categoryN = normalize(category), typeN = normalize(type), sourceN = normalize(source);
  let items = state.items;
  if (categoryN) items = items.filter((item) => normalize(item.category) === categoryN);
  if (typeN) items = items.filter((item) => normalize(item.sourceType) === typeN);
  if (sourceN) items = items.filter((item) => normalize(item.sourceId) === sourceN);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pages);
  const visible = items.slice((current - 1) * pageSize, current * pageSize);
  const categories = [...new Set(state.items.map((item) => item.category).filter(Boolean))].sort();
  const types = [...new Set(state.sources.map((item) => item.sourceType).filter(Boolean))].sort();
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (type) params.set('type', type);
  if (source) params.set('source', source);
  const filters = `<form class="filter-bar" action="/news" method="get"><div class="filter-label"><span>Refine</span><small>${items.length} stories</small></div><label><span>Category</span><select name="category"><option value="">All categories</option>${categories.map((value) => `<option${value === category ? ' selected' : ''}>${escapeHtml(value)}</option>`).join('')}</select></label><label><span>Source type</span><select name="type"><option value="">All source types</option>${types.map((value) => `<option${value === type ? ' selected' : ''}>${escapeHtml(value)}</option>`).join('')}</select></label><label><span>Publisher</span><select name="source"><option value="">All publishers</option>${state.sources.map((item) => `<option value="${escapeHtml(item.id)}"${item.id === source ? ' selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label><button class="button primary small" type="submit">Apply</button>${category || type || source ? '<a class="clear-link" href="/news">Clear</a>' : ''}</form>`;
  const content = `${pageHero({ eyebrow: 'Newsroom', title: 'The Microsoft ecosystem in motion', text: 'Announcements, analysis and reporting across software, cloud, devices, games and enterprise technology.', image: '/media/real-xbox.webp', accent: 'pink' })}<section class="section shell">${filters}${newsGrid(visible)}${pagination('/news', current, pages, params)}</section>`;
  return layout({ pathname: '/news', title: 'News', description: 'Microsoft ecosystem news from official teams and established technology publishers.', content });
}

function newsDetail(pathname, id, state) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return notFound(pathname);
  const related = state.items.filter((entry) => entry.id !== item.id && entry.category === item.category).slice(0, 4);
  const image = item.image || topicImage(item.category, item.id);
  const content = `<article class="article-page shell"><div class="article-head"><div class="article-copy"><div class="news-meta"><span class="chip">${escapeHtml(item.category)}</span><span>${escapeHtml(formatDate(item.publishedAt))}</span></div><h1>${escapeHtml(item.title)}</h1><p class="article-deck">${escapeHtml(item.summary)}</p><div class="article-source"><span>Published by <strong>${escapeHtml(item.sourceName)}</strong></span><a class="button primary" href="${escapeHtml(safeExternalUrl(item.link))}" target="_blank" rel="noopener noreferrer">Open original story ${icon('external')}</a></div></div><div class="article-art"><img src="${escapeHtml(image)}" width="960" height="540" loading="${/^https:\/\//i.test(image) ? 'lazy' : 'eager'}" decoding="async"${/^https:\/\//i.test(image) ? ' referrerpolicy="no-referrer"' : ' fetchpriority="high"'} alt=""></div></div><div class="article-note"><span>${icon('shield')}</span><p>Magazine Core indexes and summarizes the source. The complete article remains with its original publisher.</p></div></article>${related.length ? `<section class="section shell">${sectionHeader('Keep reading', `More from ${item.category}`)}${newsGrid(related, { compact: true })}</section>` : ''}`;
  return layout({ pathname: '/news', title: item.title, description: item.summary, content });
}

function productsPage() {
  const content = `${pageHero({ eyebrow: 'Products', title: 'Microsoft platforms, mapped clearly', text: 'A visual directory of the operating systems, cloud platforms, productivity tools, developer products and gaming services behind the ecosystem.', image: '/media/real-azure.webp', accent: 'violet' })}<section class="section shell">${sectionHeader('Product directory', 'Work, cloud, code and play', 'Each card goes directly to the official product destination.')} ${productGrid(products)}</section>`;
  return layout({ pathname: '/products', title: 'Products', description: 'A directory of Microsoft products, platforms and official destinations.', content });
}

function licensingPage(url) {
  const family = url.searchParams.get('family') || '';
  const audience = url.searchParams.get('audience') || '';
  let list = licenses;
  if (family) list = list.filter((item) => item.family === family);
  if (audience) list = list.filter((item) => item.audience === audience);
  const families = [...new Set(licenses.map((item) => item.family))].sort();
  const audiences = [...new Set(licenses.map((item) => item.audience))].sort();
  const filters = `<form class="filter-bar compact-filter" action="/licensing" method="get"><div class="filter-label"><span>Compare</span><small>${list.length} entries</small></div><label><span>Family</span><select name="family"><option value="">All families</option>${families.map((value) => `<option${value === family ? ' selected' : ''}>${escapeHtml(value)}</option>`).join('')}</select></label><label><span>Audience</span><select name="audience"><option value="">All audiences</option>${audiences.map((value) => `<option${value === audience ? ' selected' : ''}>${escapeHtml(value)}</option>`).join('')}</select></label><button class="button primary small" type="submit">Apply</button>${family || audience ? '<a class="clear-link" href="/licensing">Clear</a>' : ''}</form>`;
  const content = `${pageHero({ eyebrow: 'Licensing', title: 'Licensing without the maze', text: 'A practical comparison of common Microsoft licensing models, audiences and units. Always confirm final terms in Microsoft documentation.', image: '/media/licensing.webp', accent: 'gold' })}<section class="section shell">${filters}<div class="license-grid">${list.map(licenseCard).join('')}</div></section>`;
  return layout({ pathname: '/licensing', title: 'Licensing', description: 'Microsoft licensing reference for Windows, Microsoft 365, Windows Server and SQL Server.', content });
}

function updatesPage(state) {
  const content = `${pageHero({ eyebrow: 'Sources', title: 'Read closer to the source', text: 'Official Microsoft teams and established technology publications, with a direct route back to every original publisher.', image: '/media/sources.webp', accent: 'pink' })}<section class="section shell">${sectionHeader('Publishers', 'The publications behind the feed', 'Open any publisher directly. Magazine Core keeps the original source visible on every story.')}${sourceCards(state.sources)}</section>`;
  return layout({ pathname: '/updates', title: 'Sources', description: 'Official Microsoft teams and established technology publishers used by Magazine Core.', content });
}

function learnPage() {
  const content = `${pageHero({ eyebrow: 'Learn', title: 'Start with the part you care about', text: 'Use topic pages for current reporting, product pages for official destinations, and licensing references when editions and models matter.', image: '/media/development.webp', accent: 'violet' })}<section class="section shell">${sectionHeader('Topic guides', 'Seven clear paths into the ecosystem', 'Each guide combines current reporting with relevant products.')}<div class="topic-grid topic-grid-large">${topics.map(topicPill).join('')}</div></section><section class="section shell three-up"><article class="info-card"><span class="eyebrow">Products</span><h3>Know what each platform is for.</h3><p>Open a concise directory before moving to the official destination.</p><a class="card-link" href="/products">Browse products ${icon('arrow')}</a></article><article class="info-card"><span class="eyebrow">Licensing</span><h3>Compare common models.</h3><p>Separate device, user, core and subscription concepts before checking final terms.</p><a class="card-link" href="/licensing">Open licensing ${icon('arrow')}</a></article><article class="info-card"><span class="eyebrow">Sources</span><h3>Read from the publisher.</h3><p>Every indexed story keeps a direct route to the original publication.</p><a class="card-link" href="/updates">See sources ${icon('arrow')}</a></article></section>`;
  return layout({ pathname: '/learn', title: 'Learn', description: 'Guides to Microsoft topics, products, licensing and sources.', content });
}

function aboutPage() {
  const content = `${pageHero({ eyebrow: 'About', title: 'A focused index for a very large ecosystem', text: 'Magazine Core organizes Microsoft-related reporting and references into a fast, readable destination without trying to replace the original publishers.', image: '/media/business.webp', accent: 'gold' })}<section class="section shell about-grid"><article class="info-card"><span class="eyebrow">Purpose</span><h2>Signal over clutter.</h2><p>The site groups reporting by topic, connects it with official product destinations, and keeps licensing references separate from editorial coverage.</p></article><article class="info-card"><span class="eyebrow">Sources</span><h2>Original publishers stay visible.</h2><p>Story cards show the publisher and link directly to the source. Magazine Core does not present third-party reporting as its own.</p></article><article class="info-card"><span class="eyebrow">Experience</span><h2>Designed to stay light.</h2><p>The interface favors native HTML navigation, local media and a static visual system. It does not rely on autoplay, animated backgrounds or infinite feeds.</p></article></section>`;
  return layout({ pathname: '/about', title: 'About', description: 'About Magazine Core and its approach to Microsoft ecosystem reporting.', content });
}

function searchPage(url, state) {
  const q = (url.searchParams.get('q') || '').trim().slice(0, 120);
  const needle = normalize(q);
  const news = needle.length >= 2 ? state.items.filter((item) => normalize(`${item.title} ${item.summary} ${item.category} ${item.sourceName}`).includes(needle)).slice(0, 12) : [];
  const productMatches = needle.length >= 2 ? products.filter((item) => normalize(`${item.name} ${item.area} ${item.summary} ${(item.tags || []).join(' ')}`).includes(needle)).slice(0, 8) : [];
  const licenseMatches = needle.length >= 2 ? licenses.filter((item) => normalize(`${item.name} ${item.family} ${item.audience} ${item.model} ${(item.highlights || []).join(' ')}`).includes(needle)).slice(0, 8) : [];
  const sourceMatches = needle.length >= 2 ? state.sources.filter((item) => normalize(`${item.name} ${item.category} ${item.sourceType}`).includes(needle)).slice(0, 8) : [];
  const form = `<form class="search-form" action="/search" method="get">${icon('search')}<input type="search" name="q" value="${escapeHtml(q)}" maxlength="120" placeholder="Search news, products, licensing…" autocomplete="off"><button class="button primary" type="submit">Search</button></form>`;
  let results = '<div class="search-welcome"><h2>Search the ecosystem</h2><p>Try Windows, Azure, Xbox, Copilot, Defender, GitHub or a licensing edition.</p></div>';
  if (q && needle.length < 2) results = emptyState('Enter at least two characters.');
  if (needle.length >= 2) {
    const count = news.length + productMatches.length + licenseMatches.length + sourceMatches.length;
    results = count ? `${news.length ? `<section class="search-group">${sectionHeader('News', `${news.length} matching stories`)}${newsGrid(news, { compact: true })}</section>` : ''}${productMatches.length ? `<section class="search-group">${sectionHeader('Products', `${productMatches.length} matching products`)}${productGrid(productMatches)}</section>` : ''}${licenseMatches.length ? `<section class="search-group">${sectionHeader('Licensing', `${licenseMatches.length} matching references`)}<div class="license-grid">${licenseMatches.map(licenseCard).join('')}</div></section>` : ''}${sourceMatches.length ? `<section class="search-group">${sectionHeader('Sources', `${sourceMatches.length} matching publishers`)}${sourceCards(sourceMatches)}</section>` : ''}` : emptyState(`No results for “${q}”.`);
  }
  const content = `<section class="search-hero shell"><span class="eyebrow">Search</span><h1>Find the Microsoft topic you need.</h1>${form}</section><section class="section shell search-results">${results}</section>`;
  return layout({ pathname: '/search', title: q ? `Search: ${q}` : 'Search', description: 'Search Magazine Core news, products, licensing and sources.', content });
}

function topicPage(pathname, slug, state) {
  const topic = topics.find((entry) => entry.slug === slug);
  if (!topic) return notFound(pathname);
  let stories = topic.category ? state.items.filter((item) => item.category === topic.category) : state.items.filter((item) => normalize(`${item.title} ${item.summary} ${item.category}`).includes(normalize(topic.query)));
  if (!stories.length) stories = state.items.slice(0, 9);
  const topicProducts = products.filter((item) => topic.productIds.includes(item.id));
  const content = `${pageHero({ eyebrow: topic.eyebrow, title: topic.name, text: topic.description, image: topic.image, accent: ['xbox', 'security'].includes(topic.slug) ? 'gold' : topic.slug === 'ai' ? 'pink' : 'violet' })}<section class="section shell">${sectionHeader('Current reporting', `Latest in ${topic.name}`, 'Recent stories from the indexed source set.', '/news', 'Open newsroom')}${newsGrid(stories.slice(0, 9))}</section>${topicProducts.length ? `<section class="section shell">${sectionHeader('Relevant products', `${topic.name} platforms and services`)}${productGrid(topicProducts)}</section>` : ''}`;
  return layout({ pathname, title: topic.name, description: topic.description, content });
}

function notFound(pathname = '') {
  const content = `<section class="not-found shell"><span class="eyebrow">404</span><h1>This page is not in the index.</h1><p>The address may have changed or the story may no longer be available.</p><a class="button primary" href="/">Back to Magazine Core ${icon('arrow')}</a></section>`;
  return layout({ pathname, title: 'Not found', description: 'Page not found.', content, status: 404 });
}

// Route dispatcher. The homepage is the only route that receives `req`,
// because it is the only route that needs to inspect the visitor headers.
export async function renderRoute(url, state, req) {
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  if (pathname === '/') return await home(state, req);
  if (pathname === '/news') return newsPage(url, state);
  if (pathname.startsWith('/news/')) return newsDetail('/news', decodeURIComponent(pathname.slice('/news/'.length)), state);
  if (pathname === '/products') return productsPage();
  if (pathname === '/licensing') return licensingPage(url);
  if (pathname === '/updates') return updatesPage(state);
  if (pathname === '/learn') return learnPage();
  if (pathname === '/about') return aboutPage();
  if (pathname === '/search') return searchPage(url, state);
  if (pathname.startsWith('/topics/')) return topicPage(pathname, decodeURIComponent(pathname.slice('/topics/'.length)), state);
  return notFound(pathname);
}
