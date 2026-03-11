# atproto-smoke

`atproto-smoke` is a standalone `bsky.app` compatibility smoke suite for AT
Protocol PDS implementations. It is intended to be useful across multiple PDS
projects, not just `perlsky`.

Today the suite focuses on real browser-driven interoperability through
`bsky.app`, AppView-backed reads, and a reusable-account workflow that avoids
minting fresh smoke actors on every run.

## Quickstart

```sh
npm install
npx playwright install chromium
node bin/atproto-smoke.mjs print-example --mode dual > config.json
$EDITOR config.json
node bin/atproto-smoke.mjs run-dual --config config.json
```

For the lowest-friction path, point the suite at an existing PDS and two
existing accounts. The package is intentionally adapter-friendly, but
bring-your-own accounts are the default path for non-Perl PDS implementations.

## Using From perlsky

`perlsky` consumes this suite as an external checkout.

If you keep the repos side by side like this:

```text
.../perlsky
.../atproto-smoke
```

then `script/perlsky-browser-smoke` will find `atproto-smoke` automatically.
Otherwise set `PERLSKY_BROWSER_SUITE_ROOT=/path/to/atproto-smoke`.

## Current Scope

The existing browser automation is already strong enough to be useful outside
this repo:

- reusable-account `bsky.app` smoke flows
- post, image post, like, repost, quote, reply, bookmark, follow
- list lifecycle
- profile edit and avatar upload
- notifications checks
- settings-depth flows
- strict artifacts with screenshots, console output, failed requests, failed
  HTTP responses, and recent XRPC traffic
- bounded per-step timeouts so late browser stalls fail with artifacts instead
  of hanging forever

DMs are intentionally deferred for now. The current suite is focused on stable
social, list, and settings interactions first.

## Extraction Shape

The target standalone project shape is:

1. Generic core browser flows and artifact handling
2. A bring-your-own-accounts mode with minimal configuration
3. Thin per-PDS adapters for provisioning and implementation-specific defaults

The generic runtime, config builders, and adapter helpers live here. `perlsky`
keeps thin wrapper entrypoints so its existing local workflow still works while
the suite itself evolves independently.

## Current CLI

The package now has its own CLI entrypoint:

```sh
node atproto-smoke/bin/atproto-smoke.mjs print-example --mode dual
node atproto-smoke/bin/atproto-smoke.mjs validate --mode dual --config atproto-smoke/examples/bring-your-own-dual.json
node atproto-smoke/bin/atproto-smoke.mjs run-dual --config atproto-smoke/examples/bring-your-own-dual.json
```

Examples live in [examples/](./examples):

- `bring-your-own-single.json`
- `bring-your-own-dual.json`
- `perlsky-dual.json`

## Minimal Configuration Goal

The default experience for other PDS developers should be:

- provide a `pdsUrl`
- provide one or two existing account credentials
- optionally provide a `targetHandle`
- run the suite against `bsky.app`

Provisioning is intentionally adapter-specific. That means `perlsky` can keep a
helpful invite/bootstrap path, while other PDSes like `rsky` or `pegasus` can
add their own adapters without changing the core browser flows.

## Current Adapter Contract

The helpers in `src/` model two layers:

- `adapters/bring-your-own.mjs`
  For the lowest-friction mode where callers supply existing credentials
- `adapters/perlsky.mjs`
  For `perlsky`-specific defaults like cleanup prefixes and adapter tagging

The current config contract is intentionally small:

- suite-level settings:
  `pdsUrl`, `artifactsDir`, `appUrl`, `publicApiUrl`, `targetHandle`,
  `publicCheckTimeoutMs`, `stepTimeoutMs`, `headless`, `strictErrors`,
  `publicChecks`,
  `browserExecutablePath`, `adapter`
- account-level settings:
  `handle`, `password`, `birthdate`, `postText`, `mediaPostText`, `quoteText`,
  `replyText`, `profileNote`, `cleanupPostPrefixes`

`pdsHost` is derived automatically from `pdsUrl`, so callers do not need any
perlsky-specific host-setting knowledge just to point the browser at a custom
PDS.

## V2 Ideas

The long-term direction is a test pyramid, not a browser-only harness and not a
pure endpoint-only harness:

1. direct PDS/AppView contract tests
2. cross-service integration checks
3. a thinner `bsky.app` smoke on top

The browser layer stays because it catches real `social-app` assumptions and
AppView proxying issues. The direct API/AppView layers belong underneath it so
regressions become easier to debug and less brittle when the UI changes.

In other words: this project should eventually answer both "does my PDS return
the right protocol shapes?" and "does it still behave correctly through
`bsky.app` and AppView-backed reads?".

## Planned Next Steps

- keep `script/perlsky-browser-smoke` as a thin `perlsky` adapter over this
  package
- add a repo-independent install story once the extracted package boundary
  settles
- add direct API/AppView contract tests as the first major v2 expansion
- revisit a JS-to-TS migration later, after the standalone package boundary is
  stable
