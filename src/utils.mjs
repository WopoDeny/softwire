import crypto from 'node:crypto';

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function safeExternalUrl(value, fallback = '#') {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol)) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

export function safeLocalPath(value, fallback = '/') {
  const text = String(value || '').trim();
  if (!text.startsWith('/') || text.startsWith('//')) return fallback;
  return text.replace(/[\r\n]/g, '');
}

export function normalize(value = '') {
  return String(value).trim().toLowerCase().slice(0, 180);
}

export function truncate(value = '', max = 240) {
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function makeId(...parts) {
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 18);
}

export function normalizeDate(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

export function formatDate(value) {
  if (!value) return 'Reference';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Reference';
  return new Intl.DateTimeFormat('en', {
    year: 'numeric', month: 'short', day: 'numeric'
  }).format(date);
}

export function stableIndex(seed = '', length = 1) {
  const text = String(seed || 'default');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  return Math.abs(hash) % Math.max(length, 1);
}

const imagePools = {
  xbox: ['/media/real-xbox.webp', '/media/game-pass.webp', '/media/minecraft.webp', '/media/xbox.webp'],
  azure: ['/media/real-azure.webp', '/media/fabric.webp', '/media/sql-server.webp', '/media/data.webp', '/media/azure.webp'],
  security: ['/media/security.webp', '/media/defender.webp', '/media/intune.webp'],
  development: ['/media/development.webp', '/media/github.webp', '/media/visual-studio.webp', '/media/dotnet.webp'],
  business: ['/media/real-teams.webp', '/media/microsoft-365.webp', '/media/teams.webp', '/media/dynamics.webp', '/media/power-platform.webp', '/media/linkedin.webp'],
  ai: ['/media/real-copilot.webp', '/media/copilot.webp', '/media/ai.webp', '/media/bing.webp'],
  windows: ['/media/real-surface.webp', '/media/windows.webp', '/media/surface.webp']
};

export function topicImage(category = '', seed = '') {
  const key = String(category).toLowerCase();
  let pool = imagePools.windows;
  if (key.includes('xbox') || key.includes('gaming')) pool = imagePools.xbox;
  else if (key.includes('azure') || key.includes('data') || key.includes('cloud')) pool = imagePools.azure;
  else if (key.includes('security')) pool = imagePools.security;
  else if (key.includes('development') || key.includes('github') || key.includes('developer')) pool = imagePools.development;
  else if (key.includes('365') || key.includes('business') || key.includes('company')) pool = imagePools.business;
  else if (key.includes('ai') || key.includes('research') || key.includes('copilot')) pool = imagePools.ai;
  return pool[stableIndex(seed || category, pool.length)];
}

export function canonicalUrl(value) {
  const safe = safeExternalUrl(value, '');
  if (!safe) return null;
  const url = new URL(safe);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (lower.startsWith('utm_') || ['ref', 'source', 'ocid', 'wt.mc_id', 'mc_cid', 'mc_eid'].includes(lower)) {
      url.searchParams.delete(key);
    }
  }
  url.pathname = url.pathname.replace(/\/$/, '') || '/';
  return url.toString();
}
