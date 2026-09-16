# Magazine Core 11.9 Final

Magazine Core 11.9 Final is the stable ultralight build intended for local testing and VPS deployment. It keeps the zero-React/zero-Next architecture, restores a polished purple/pink visual system, uses the supplied blossom image as a persistent full-viewport background, and keeps RSS work outside visitor requests.

## Architecture

- No Next.js, React, Express, hydration, RSC or client-side router.
- Zero client JavaScript and zero runtime npm dependencies.
- One Node.js web process; RSS/Atom refresh runs in a separate Worker thread.
- Visitor requests never fetch or parse RSS.
- Local assets are preloaded into memory at startup.
- Plain HTTP works. There is no HTTPS requirement, HSTS or forced upgrade.

## Final UI rules

- The blossom image is rendered once as a dedicated viewport background layer.
- The blossom image fills the complete viewport (`100% × 100%`) so there are no black side bars on wide displays.
- The background is a single static layer: no repeat, no animation and no extra repaint loop.
- Content scrolls above the background; the image remains visually stable while scrolling.
- Section eyebrow, heading and description stay on separate vertical lines.
- Internal pages keep a consistent gap below the header.
- Cards keep consistent padding, bottom actions and readable contrast over the photographic background.
- No marquee/ticker, animated background, blur, backdrop-filter or `transition: all`.

The only fixed visual layer is the single static background image. There are no fixed content panels, sticky headers or continuously moving effects.

## Real news and images

The RSS/Atom parser extracts publisher-provided images from common feed fields such as `media:content`, `media:thumbnail`, image enclosures and images embedded in feed content.

Only HTTPS publisher image URLs are accepted. News-card images load lazily and use `referrerpolicy="no-referrer"`. If a feed does not provide a usable image, Magazine Core uses the local fallback image pool.

On first startup, built-in publisher references are shown immediately while the background worker warms the cache. The worker starts after one second and checks sources one at a time. Visitor navigation never waits for the worker.

`/health` exposes operational diagnostics:

- `liveNewsItems`
- `fallbackNewsItems`
- `remoteImageItems`
- `latestPublishedAt`
- `sourcesOnline`
- `sourcesDegraded`
- `sourcesOffline`
- `updatedAt`

These diagnostics are not exposed on the public Sources page.

## Windows quick start

Requirements: Node.js 22 or newer.

```powershell
npm install
npm run build
npm start
```

Open:

```text
http://127.0.0.1:3000/
```

Health check:

```text
http://127.0.0.1:3000/health
```

With the site running, you can also verify live RSS status from another terminal:

```powershell
npm run news:status
```

If `Live news` is greater than zero, Magazine Core is serving real RSS/Atom items. If it remains zero for more than a couple of minutes on a VPS, check outbound DNS/HTTPS access.

If port 3000 is occupied by an older build:

```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## RSS defaults

```text
RSS_ENABLED=true
RSS_INITIAL_DELAY_SECONDS=1
RSS_STEP_SECONDS=12
RSS_TIMEOUT_MS=5000
```

For a very small VPS, `RSS_STEP_SECONDS=30` is a conservative option. To isolate the pure web path during diagnostics, set `RSS_ENABLED=false`.

## VPS deployment

A simple layout is `/opt/magazine-core` with Nginx on port 80 and Node bound to port 3000.

```bash
cd /opt/magazine-core
cp .env.example .env
npm install
npm run build
```

`deploy/nginx.conf.example` is HTTP-only and contains no TLS redirect or HSTS.

For automatic restart after a crash or reboot, `deploy/magazine-core.service.example` is included as a systemd template. Copy it to `/etc/systemd/system/magazine-core.service`, adjust the project path if necessary, then run:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now magazine-core
sudo systemctl status magazine-core
```

## Safe Git push

The repository intentionally ignores `.env`, `.env.*`, cache files, `node_modules`, logs, editor metadata and common certificate/private-key extensions. `.env.example` remains tracked.

Before the first push:

```bash
git add .
git status
git diff --cached
```

Review the staged diff before committing.

## Verification

```powershell
npm run verify
npm run smoke
npm run build
```

`npm run smoke` launches an isolated temporary server with RSS disabled and verifies the main pages, a news article, search, health, sitemap, stylesheet and local media assets.
