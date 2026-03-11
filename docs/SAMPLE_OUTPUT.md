# Sample Output

This page shows trimmed examples of what `atproto-smoke` prints and writes.

## `list-adapters`

```text
- bring-your-own: Use existing accounts on any PDS with minimal configuration.
  account strategy: existing-accounts
  note: This is the default adapter and the lowest-friction path for non-Perl PDS implementations.
  note: The suite will not create accounts for you. Supply one account for single-mode or two for dual-mode.
- perlsky: Use perlsky-flavored defaults like cleanup prefixes and adapter tagging.
  account strategy: existing-accounts-or-bootstrap
  note: The standalone suite still expects credentials in the config.
  note: perlsky-specific account bootstrap and reusable-pair helpers live in perlsky, not in atproto-smoke itself.
```

## `write-example --mode dual`

```text
wrote /tmp/config.json using adapter bring-your-own (dual)
```

Generated config:

```json
{
  "pdsUrl": "https://your-pds.example",
  "artifactsDir": "data/browser-smoke/bring-your-own-dual",
  "targetHandle": "alice.mosphere.at",
  "strictErrors": true,
  "primary": {
    "handle": "smoke-primary.your-pds.example",
    "password": "replace-me"
  },
  "secondary": {
    "handle": "smoke-secondary.your-pds.example",
    "password": "replace-me-too"
  }
}
```

## `validate --mode dual`

```json
{
  "pdsUrl": "https://your-pds.example",
  "artifactsDir": "data/browser-smoke/bring-your-own-dual",
  "appUrl": "https://bsky.app",
  "publicApiUrl": "https://public.api.bsky.app",
  "publicCheckTimeoutMs": 180000,
  "stepTimeoutMs": 120000,
  "headless": true,
  "strictErrors": true,
  "publicChecks": true,
  "pdsHost": "your-pds.example",
  "targetHandle": "alice.mosphere.at",
  "primary": {
    "handle": "smoke-primary.your-pds.example",
    "password": "replace-me",
    "birthdate": "1990-01-01",
    "cleanupPostPrefixes": []
  },
  "secondary": {
    "handle": "smoke-secondary.your-pds.example",
    "password": "replace-me-too",
    "birthdate": "1990-01-01",
    "cleanupPostPrefixes": []
  }
}
```

## Real `summary.json`

Trimmed from a clean strict dual-account run:

```json
{
  "startedAt": "2026-03-11T20:04:16.563Z",
  "appUrl": "https://bsky.app",
  "pdsUrl": "https://perlsky.mosphere.at",
  "primaryHandle": "smokee2ea20260311-121322.perlsky.mosphere.at",
  "secondaryHandle": "smokee2eb20260311-121322.perlsky.mosphere.at",
  "steps": [
    {
      "name": "primary-login",
      "status": "ok"
    },
    {
      "name": "primary-age-assurance",
      "status": "ok"
    },
    {
      "name": "secondary-login",
      "status": "ok"
    },
    {
      "name": "secondary-age-assurance",
      "status": "ok"
    },
    {
      "name": "primary-preclean-stale-artifacts",
      "status": "ok"
    }
  ],
  "notes": [
    "account source: pair-file",
    "browser launch candidate succeeded: executable:/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ],
  "unexpected": {
    "console": [],
    "requestFailures": [],
    "httpFailures": [],
    "pageErrors": [],
    "total": 0
  },
  "ok": true
}
```

The full artifact from that run lives at:

```text
data/browser-smoke/step-timeout-20260311-2007/summary.json
```
