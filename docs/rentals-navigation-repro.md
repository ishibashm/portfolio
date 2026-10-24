# Rental HTTPS navigation failure (2026-10-25 JST)

Area: 愛知県名古屋市中区. Deployment remains gen2, 1 CPU, 1Gi;
billing, deployment configuration and `RENTALS_ON_DEMAND_ENABLED` are unchanged.

## Evidence

Built the unmodified production Dockerfile with Podman. Ran the runner as its
configured `nextjs` user with `--cpus=1 --memory=1g` and `--memory=512m`, using
Sparticuz Chromium, production launch arguments and the original interception
policy against real HTTPS URLs (no data URLs, no database writes).

With `--memory=1g` the first HTTPS navigation emitted:

```text
Failed to create /nonexistent/.pki/nssdb directory.
Error initializing NSS without a persistent database: libsqlite3.so.0: cannot open shared object file: No such file or directory
FATAL:../crypto/nss_util.cc:115 nss_error=-5977, os_error=22
frame detached about:blank
browser disconnected
Error: Navigating frame was detached
```

With `--memory=512m` the first request returned `net::ERR_NETWORK_CHANGED`; the city request
then emitted the same missing-SQLite fatal error and detached-frame exception.
**Resource-limit caveat:** this rootless Podman host accepts the flags and records
`Memory=1073741824` / `CpuQuota=100000` in container inspection, but inside the
container `memory.max=max`, `cpu.max=max 100000` and `/proc/self/cgroup` is `0::/`.
Explicit `--cgroups=enabled` also reports unlimited limits. Thus these runs use
the requested flags but do **not** prove operation under enforced 1Gi/512Mi or
1-CPU limits. The reported cgroup peak is host-wide and is not scraper RSS.
Repeat on a host with delegated cgroups for genuine memory-pressure testing.

This demonstrates a Chromium NSS runtime dependency failure, not evidence of an
OOM. An HTTPS navigation initializes NSS; a data URL does not exercise this path.
The production Dockerfile now installs only `libsqlite3-0` in the runner.

`curl -IL` returned HTTP 200 without redirects for:

- https://myhome.nifty.com/rent/aichi/
- https://myhome.nifty.com/rent/aichi/city/
- https://myhome.nifty.com/rent/aichi/nagoyashinakaku_ct/

The retrieved HTML had no meta refresh, explicit `location.href =` or
`location.replace` redirect, or visible CAPTCHA challenge. It includes a Google
Tag Manager noscript iframe and third-party advertising scripts. These checks do
not establish behavior of every third-party script or every Cloud Run source IP.

The prefecture landing page loads its full city selector dynamically. The `/city/`
index contains the exact city link in server-rendered HTML, and the listing page
contains `window.Nifty.Data.Bukken` as JSON (111 records in the captured response).
Blocking all external scripts on the landing page was a separate city-discovery
problem. The new path fetches `/city/` and listing HTML, parses with parse5 and
JSON.parse, and never executes remote JavaScript in Node.

Browser fallback uses `domcontentloaded`, a 15-second navigation timeout,
Puppeteer's `error` event for renderer crashes, and at most two attempts with a
fresh page AND browser. Images/fonts/media, third-party requests and subframe
navigation are blocked; first-party scripts can populate dynamic content. All
fallbacks/retries retain the minimum 20-second delay. Explicit HTTP errors fail
without browser retries. Existing pagination, address filtering, save batching,
feature switch and successful-refresh cache semantics are preserved.

## Repeat the read-only probes

Build before applying the fix to reproduce the crash, then rebuild after it:

```sh
podman build -f Dockerfile -t localhost/rentals-repro .
node_modules/.bin/esbuild src/lib/niftyRentalHtml.ts --bundle --platform=node --format=cjs --outfile=/tmp/rentals-html.cjs
podman run --rm --cpus=1 --memory=1g \
  -v "$PWD/scripts/probe_rentals_container.mjs:/tmp/probe.mjs:ro" \
  --entrypoint node localhost/rentals-repro /tmp/probe.mjs
podman run --rm --cpus=1 --memory=1g \
  -v "$PWD/scripts/probe_rentals_container.mjs:/tmp/probe.mjs:ro" \
  -v /tmp/rentals-html.cjs:/tmp/rentals-html.cjs:ro \
  --entrypoint node localhost/rentals-repro /tmp/probe.mjs fetch
```

Repeat each run with `--memory=512m`. Run sequentially to preserve request spacing.
The browser probe deliberately retains the original interception policy, isolating
the runtime-library fix. The fetch probe uses the production HTML parser and
reports matching-area rows and cgroup limits/peak/events. Neither starts the Next
server or saves listings; these are scraper-isolation probes, not concurrency-80
load tests or exact emulation of the Cloud Run host.

Memory note: this failure does not justify increasing the deployment memory.
Keep 1Gi; evaluate whole-service peak memory under realistic concurrency separately.

## Verification results

- Rebuilt production Dockerfile successfully with the runtime dependency fix.
- Fixed browser probe with `--memory=1g`: HTTP 200 for both the original landing
  page and city page; 111 inline listings. The original interception policy still
  causes unrelated inline JavaScript errors but no NSS fatal abort.
- Fixed browser probe with `--memory=512m`: transient `net::ERR_NETWORK_CHANGED`
  on the landing page; no missing-SQLite fatal error. This is not a passing browser
  navigation run. A nonfatal missing-root-certificate-module warning remains;
  certificate validation was not disabled.
- Fetch/parser probes with both `--memory=1g` and `--memory=512m`: succeeded,
  each returning 111 records, all matching 愛知県名古屋市中区. These are read-only
  and use the actual production parser, not database refreshes. Resource limits
  remained unenforced as described above.
- `npm run lint`: passed, with 17 existing warnings and no errors.
- `tsc --noEmit --incremental false`: passed.
- `npm test`: 614 suites passed and one skipped on the initial run; 11 suites
  failed because Prisma had not yet been generated or sandbox restrictions
  rejected subprocesses/local listeners. After generating Prisma and rerunning
  outside the sandbox, all 11 affected suites plus the three changed rental suites
  passed (14 suites, 118 tests). No test failures remain unresolved.
