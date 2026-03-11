# Adapters

`atproto-smoke` has two layers:

1. the generic smoke engine
2. small adapters that normalize caller config for a specific workflow

In v1, adapters are intentionally narrow. They are config builders, not full
provisioning plugins.

## What an Adapter Does

An adapter definition currently owns:

- a stable adapter name
- a short description
- an `accountStrategy` label for docs/help
- human-facing notes for the CLI and README
- `createSingleConfig(raw)`
- `createDualConfig(raw)`
- `createExampleConfig({ mode })`

That means adapters can:

- apply implementation-specific defaults
- add cleanup prefixes
- tag config with an adapter name
- emit a better example file for a specific PDS

That also means adapters do not currently:

- create accounts
- mint invites
- provision fixtures
- perform setup or teardown hooks
- override the browser scenario itself

Those higher-level workflows belong in the PDS project that consumes
`atproto-smoke`, or in future v2 expansion work if a broader hook model becomes
necessary.

## Built-in Adapters

### `bring-your-own`

Use existing credentials against any PDS.

This is the default adapter and the recommended starting point for other PDS
implementations in any language.

### `perlsky`

Use the same core browser flows, but apply `perlsky`-specific defaults such as
cleanup prefixes and adapter tagging.

`perlsky` still owns the higher-level workflows around invites, reusable smoke
pairs, and local wrappers. Those helpers do not live in `atproto-smoke`.

## Minimal Adapter Contract

The current registry lives in `src/adapters/registry.mjs`. A built-in adapter
definition looks like this in practice:

```js
{
  name: 'bring-your-own',
  description: 'Use existing accounts on any PDS with minimal configuration.',
  accountStrategy: 'existing-accounts',
  notes: ['...'],
  createSingleConfig(raw) { ... },
  createDualConfig(raw) { ... },
  createExampleConfig({ mode }) { ... },
}
```

If we later add third-party adapter loading, this is the shape to preserve.

## Recommendation For Other PDS Projects

Start with `bring-your-own` first.

If your project needs nicer defaults, add a small adapter that only does
normalization and examples. Keep invite/account bootstrap outside the generic
suite until we have a stronger reason to standardize lifecycle hooks.
