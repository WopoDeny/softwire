import process from 'node:process';

const base = String(process.env.MAGAZINE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const url = `${base}/health`;

try {
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  console.log(`Magazine Core ${data.version || ''} news status`);
  console.log(`RSS worker: ${data.rssWorker}`);
  console.log(`Live news: ${data.liveNewsItems}`);
  console.log(`Fallback news: ${data.fallbackNewsItems}`);
  console.log(`Remote publisher images: ${data.remoteImageItems}`);
  console.log(`Sources online/degraded/offline: ${data.sourcesOnline ?? 0}/${data.sourcesDegraded ?? 0}/${data.sourcesOffline ?? 0}`);
  console.log(`Latest published: ${data.latestPublishedAt || 'not available yet'}`);
  console.log(`Last cache update: ${data.updatedAt || 'not available yet'}`);
  if ((data.liveNewsItems ?? 0) > 0) {
    console.log('OK: live RSS/Atom content is being served.');
  } else {
    console.log('WAIT: only fallback content is available. Check outbound DNS/HTTPS access if this remains unchanged after 1-2 minutes.');
  }
} catch (error) {
  console.error(`Cannot read ${url}: ${error.message}`);
  console.error('Start the site first with npm start, then run npm run news:status in another terminal.');
  process.exitCode = 1;
}
