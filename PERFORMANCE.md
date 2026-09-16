# Performance notes — Magazine Core 11.9 Final

## Browser path

The browser receives ordinary server-rendered HTML plus one small versioned stylesheet. There is no React/Next runtime, hydration, client router, JavaScript bundle, autoplay, polling or route prefetch.

The stylesheet avoids continuous or expensive decorative effects:

- no CSS animations/keyframes
- no blur/filter/backdrop-filter
- no sticky content
- no `will-change`
- no `transition: all`
- no moving ticker/marquee

There is exactly one fixed visual layer: the user-supplied static blossom background. It contains one 1920x1080 image with `object-fit: contain` and one static dark overlay. No content element is fixed to the viewport.

Publisher news images are lazy loaded. A slow third-party image CDN can delay its own image without blocking Magazine Core HTML/CSS or navigation.

## Server path

A visitor request only parses the URL, reads in-memory state and returns an HTML string or a preloaded local asset. It never performs an outbound feed request.

RSS/Atom refresh runs in a Worker thread, one source at a time. Feed size, response time, per-source item count and total item count are bounded.

## Verified load behavior

On the supplied build in the validation environment, with RSS disabled, 5,000 requests to the home page at concurrency 50 completed with 0 failures. The Node process stayed around tens of MB of RSS memory during the test.

With the RSS worker enabled, 5,000 concurrent requests to `/news` also completed with 0 failures while the worker remained separate from visitor processing. Exact throughput and CPU usage will vary by VPS, Node version and network stack; these measurements are regression checks rather than guarantees for every server.

## Repeated navigation

The stylesheet is cached as `/styles.css?v=11.9.0` instead of being embedded in every page. Native document navigation is used; there is no SPA prefetch or background route fetching.

## Diagnostics

HTML responses include `Server-Timing`. `/health` reports live/fallback news counts and latest publication/cache timestamps. If Node response time remains low but a particular client still stutters, investigate that browser/VM graphics process, extensions, antivirus/web filtering and third-party image networking separately from the web server.
