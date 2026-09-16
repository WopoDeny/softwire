import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseFeedXml } from '../src/feed-parser.mjs';

const root = process.cwd();
const publicDir = path.join(root, 'public');
const cssFile = path.join(publicDir, 'styles.css');
const errors = [];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.cache'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function fail(message) { errors.push(message); }
function relative(file) { return path.relative(root, file).replaceAll('\\', '/'); }

const files = walk(root);
const textFiles = files.filter((file) => /\.(?:mjs|js|json|css|md|example|conf|txt|svg)$/i.test(file) || path.basename(file).startsWith('.env'));
const combined = textFiles.map((file) => `\n/* ${relative(file)} */\n${fs.readFileSync(file, 'utf8')}`).join('\n');

const forbiddenPortability = [
  [/C:\\Users\\[^\\\s]+/i, 'Windows user-home path'],
  [/\/Users\/[^/\s]+/i, 'macOS user-home path'],
  [/\/home\/[^/\s]+/i, 'Linux user-home path'],
  [/\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/, 'private LAN address']
];
for (const [pattern, label] of forbiddenPortability) if (pattern.test(combined)) fail(`Found ${label}.`);

const runtimeSource = [
  ...files.filter((file) => file.includes(`${path.sep}src${path.sep}`)),
  path.join(root, 'package.json')
].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
if (/from\s+['\"](?:next|react|react-dom)(?:\/|['\"])/i.test(runtimeSource)) fail('Found Next.js/React runtime import.');
if (/require\s*\(\s*['\"](?:next|react|react-dom)/i.test(runtimeSource)) fail('Found Next.js/React runtime require().');
if (/upgrade-insecure-requests/i.test(runtimeSource)) fail('Found HTTPS upgrade directive in runtime source.');
if (/strict-transport-security/i.test(runtimeSource)) fail('Found HSTS directive in runtime source.');

const css = fs.readFileSync(cssFile, 'utf8');
let depth = 0;
for (const char of css) {
  if (char === '{') depth += 1;
  if (char === '}') depth -= 1;
  if (depth < 0) break;
}
if (depth !== 0) fail('CSS braces are unbalanced.');

const expensiveCss = [
  [/animation\s*:/i, 'CSS animation'],
  [/backdrop-filter\s*:/i, 'backdrop-filter'],
  [/(^|[^-])filter\s*:/im, 'CSS filter'],
  [/blur\s*\(/i, 'blur()'],
  [/will-change\s*:/i, 'will-change'],
  [/background-attachment\s*:\s*fixed/i, 'fixed background'],
  [/position\s*:\s*sticky/i, 'sticky positioning'],
  [/transition\s*:\s*all/i, 'transition: all']
];
for (const [pattern, label] of expensiveCss) if (pattern.test(css)) fail(`Found expensive CSS feature: ${label}.`);

const fixedRules = [...css.matchAll(/position\s*:\s*fixed/gi)];
if (fixedRules.length !== 1) fail(`Expected exactly one fixed layer (ambient background), found ${fixedRules.length}.`);
if (!/\.ambient-bg\s*\{[^}]*position\s*:\s*fixed/i.test(css)) fail('The only fixed layer must be .ambient-bg.');

if (Buffer.byteLength(css) > 40_000) fail(`styles.css is too large (${Buffer.byteLength(css)} bytes).`);
if (!css.includes('object-fit: fill;')) fail('Ambient image must fill the whole viewport without side bars.');
if (!css.includes('width: 100%;')) fail('Ambient image must span the full viewport width.');
if (!css.includes('height: 100%;')) fail('Ambient image must span the full viewport height.');
if (!css.includes('scrollbar-color: #d84eb8 #180d24;')) fail('Purple/pink scrollbar theme is missing.');
if (/\.section-head h2\s*\{[^}]*display\s*:\s*inline/i.test(css)) fail('Section headings must remain block-level to prevent eyebrow/title collisions.');

const mediaMatches = [...combined.matchAll(/["'](\/media\/[^"'?#]+)["']/g)].map((match) => match[1]);
for (const media of new Set(mediaMatches)) {
  const file = path.join(publicDir, media.replace(/^\//, ''));
  if (!fs.existsSync(file)) fail(`Missing referenced media file: ${media}`);
}


const renderSource = fs.readFileSync(path.join(root, 'src', 'render.mjs'), 'utf8');
if (!renderSource.includes('<div class="ambient-bg" aria-hidden="true"><img src="/media/ambient-blossom.webp" width="1920" height="1080" alt=""></div>')) fail('Ambient background image markup is missing.');
const serverSource = fs.readFileSync(path.join(root, 'src', 'server.mjs'), 'utf8');
if (!renderSource.includes('rel="stylesheet" href="/styles.css?v=11.9.0"')) fail('Versioned stylesheet link is missing.');
if (!renderSource.includes('<style>html{background:#090812}')) fail('Tiny critical paint shell is missing.');
if (!serverSource.includes("RSS_ENABLED ?? 'true'")) fail('Background RSS refresh is not enabled by default.');
if (!serverSource.includes("'Content-Length': String(payload.byteLength)")) fail('Generated responses do not set exact Content-Length.');
if (!serverSource.includes('publicAssets.set')) fail('Public assets are not preloaded into memory.');

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const rssFixture = parseFeedXml('<rss><channel><item><title><![CDATA[Test &amp; One]]></title><link>https://example.com/a</link><media:content url="https://cdn.example.com/a.jpg" type="image/jpeg"/><description><![CDATA[<b>Hello</b> world]]></description><pubDate>Wed, 16 Sep 2026 12:00:00 GMT</pubDate></item></channel></rss>').items[0];
const atomFixture = parseFeedXml('<feed><entry><title>Atom item</title><link rel="alternate" href="https://example.com/b"/><summary>Summary</summary><updated>2026-09-16T12:00:00Z</updated><author><name>Author</name></author></entry></feed>').items[0];
if (rssFixture?.title !== 'Test & One' || rssFixture?.contentSnippet !== 'Hello world' || rssFixture?.link !== 'https://example.com/a' || rssFixture?.image !== 'https://cdn.example.com/a.jpg') fail('RSS parser/media fixture failed.');
if (atomFixture?.title !== 'Atom item' || atomFixture?.author !== 'Author' || atomFixture?.link !== 'https://example.com/b') fail('Atom parser fixture failed.');

if (Object.keys(packageJson.dependencies || {}).length) fail('Runtime dependencies are not empty.');
if (packageJson.name !== 'magazine-core') fail('Unexpected package name.');
if (packageJson.version !== '11.9.0') fail('Expected Magazine Core 11.9.0 version.');

for (const required of ['src/server.mjs', 'src/render.mjs', 'src/news-worker.mjs', 'public/styles.css', 'scripts/smoke.mjs', 'deploy/nginx.conf.example', '.env.example']) {
  if (!fs.existsSync(path.join(root, required))) fail(`Required file missing: ${required}`);
}

if (!serverSource.includes("img-src 'self' data: https:")) fail('CSP does not allow HTTPS publisher images.');
for (const label of ['configured publishers', 'currently refreshed', 'latest cache update']) {
  if (renderSource.includes(label)) fail(`Public Sources page still exposes technical metric: ${label}`);
}

if (errors.length) {
  console.error('Verification failed:');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log('Magazine Core verification passed.');
console.log(`Architecture: zero React / zero Next.js / zero client JavaScript / zero runtime dependencies / cached CSS / background RSS worker.`);
console.log(`CSS: ${Buffer.byteLength(css)} bytes, no animation/blur/backdrop/filter/sticky/transition-all; one fixed ambient image layer only.`);
console.log(`Media references: ${new Set(mediaMatches).size} checked.`);
console.log('Portability: no user-home paths, private LAN addresses, HTTPS forcing or machine-specific paths found.');
