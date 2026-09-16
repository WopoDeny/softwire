import { spawn } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

const port = await freePort();
const child = spawn(process.execPath, ['src/server.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), RSS_ENABLED: 'false', SITE_URL: `http://127.0.0.1:${port}` },
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
child.stdout.on('data', (chunk) => { output += String(chunk); });
child.stderr.on('data', (chunk) => { output += String(chunk); });

const ready = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`server did not start in time\n${output}`)), 5000);
  const onData = () => {
    if (output.includes('Magazine Core 11.9 listening')) {
      clearTimeout(timer);
      resolve();
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.once('exit', (code) => {
    if (!output.includes('Magazine Core 11.9 listening')) {
      clearTimeout(timer);
      reject(new Error(`server exited early (${code})\n${output}`));
    }
  });
});

const routes = [
  '/', '/health', '/news', '/news/fallback-windows', '/products', '/licensing', '/updates',
  '/learn', '/about', '/search?q=xbox', '/topics/windows', '/topics/azure', '/topics/xbox',
  '/topics/ai', '/topics/security', '/topics/development', '/topics/business', '/robots.txt',
  '/sitemap.xml', '/favicon.svg', '/styles.css?v=11.9.0', '/media/windows.webp'
];

try {
  await ready;
  const timings = [];
  for (const route of routes) {
    const started = performance.now();
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(2000) });
    const body = await response.arrayBuffer();
    const ms = performance.now() - started;
    timings.push(ms);
    if (response.status !== 200) throw new Error(`${route} returned HTTP ${response.status}`);
    if (!body.byteLength) throw new Error(`${route} returned an empty body`);
    const text = new TextDecoder().decode(body);
    if (route === '/' && (!text.includes('Magazine Core') || !text.includes('/styles.css?v=11.9.0'))) throw new Error('home page content/style check failed');
    if (route === '/updates' && /configured publishers|currently refreshed|latest cache update/i.test(text)) throw new Error('Sources page exposes technical counters');
    if (route === '/search?q=xbox' && !/Xbox/i.test(text)) throw new Error('search route did not return Xbox content');
    if (route === '/health') {
      const health = JSON.parse(text);
      for (const key of ['liveNewsItems', 'fallbackNewsItems', 'remoteImageItems', 'latestPublishedAt']) {
        if (!(key in health)) throw new Error(`health endpoint missing ${key}`);
      }
    }
  }

  const max = Math.max(...timings);
  const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
  console.log(`Smoke test passed: ${routes.length} routes/assets returned HTTP 200.`);
  console.log(`Local response timings: avg ${avg.toFixed(1)} ms, max ${max.toFixed(1)} ms (RSS disabled for deterministic test).`);
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 1000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}
