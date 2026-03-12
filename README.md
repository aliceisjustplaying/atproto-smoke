# atproto-smoke

Browser-driven smoke tests for any AT Protocol PDS. Point it at your server, give it two accounts, and it will log into `bsky.app` and exercise the real social flows — posting, following, lists, notifications, settings, and more.

It grew out of [perlsky](https://github.com/aliceisjustplaying/perlsky) but is designed to work with any PDS implementation.

## Quick start

```sh
npm install
npx playwright install chromium

# generate a config, fill in your PDS URL and credentials
node bin/atproto-smoke.mjs write-example --mode dual --output config.json
$EDITOR config.json

# validate and run
node bin/atproto-smoke.mjs validate --mode dual --config config.json
node bin/atproto-smoke.mjs run-dual --config config.json
```

That's it. Provide a `pdsUrl` and two account credentials, and the suite handles the rest. Run commands print per-step progress to `stderr` and write a JSON summary to `stdout` (`--json-only` for machine-readable output only).

## What it covers

- Post creation (text and image), like, repost, quote, reply, bookmark, follow/unfollow
- Cross-PDS reply — set `remoteReplyPostUrl` to exercise replying to a post on a different server
- Profile edit and avatar upload
- Signed-in profile reload with rendered follow/follower count verification
- List lifecycle (create, edit, add/remove members, delete)
- Notification checks
- Settings-depth flows
- Mute/unmute, block/unblock, report draft

Every run produces screenshots, console output, failed requests, HTTP failures, and recent XRPC traffic as artifacts. Steps have bounded timeouts so a hung browser fails with artifacts instead of hanging forever.

DMs are intentionally deferred — the current suite is focused on stable social, list, and settings interactions first.

## Adapters

The suite ships with built-in adapters for different PDS implementations:

```sh
node bin/atproto-smoke.mjs list-adapters
```

- **`bring-your-own`** — the default. Works with any PDS that has accounts you can log into.
- **`perlsky`** — thin adapter for `perlsky`-specific defaults like cleanup prefixes.

Other PDS projects (rsky, pegasus, etc.) can add their own adapters without changing the core browser flows. The adapter contract is documented in [docs/ADAPTERS.md](./docs/ADAPTERS.md).

## Using from perlsky

If you keep the repos side by side, `perlsky` finds this checkout automatically:

```text
.../perlsky
.../atproto-smoke
```

Otherwise set `PERLSKY_BROWSER_SUITE_ROOT=/path/to/atproto-smoke`.

## Config

The config surface is intentionally small — suite-level settings (`pdsUrl`, `artifactsDir`, `headless`, `strictErrors`, `targetHandle`, `remoteReplyPostUrl`, etc.) and per-account settings (`handle`, `password`, `postText`, `cleanupPostPrefixes`, etc.). `pdsHost` is derived from `pdsUrl` automatically.

Example configs live in [examples/](./examples). See [docs/SAMPLE_OUTPUT.md](./docs/SAMPLE_OUTPUT.md) for representative CLI output and `summary.json` shape.

## Future direction

The long-term shape is a test pyramid: direct PDS/AppView contract tests at the bottom, cross-service integration checks in the middle, and a thinner `bsky.app` browser smoke on top. The browser layer stays because it catches real `social-app` assumptions that API tests miss.
