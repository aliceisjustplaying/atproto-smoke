import { BRING_YOUR_OWN_ADAPTER } from './bring-your-own.mjs';
import { PERLSKY_ADAPTER } from './perlsky.mjs';

/**
 * Adapter definitions normalize raw user config into smoke-suite config.
 *
 * v1 adapters are intentionally small:
 * - they describe the adapter for help/docs
 * - they build single/dual configs
 * - they provide example configs
 *
 * They do not provision accounts, create invites, or run lifecycle hooks.
 * Those higher-level workflows belong in per-PDS tooling around the suite.
 */
export const ADAPTERS = Object.freeze({
  [BRING_YOUR_OWN_ADAPTER.name]: BRING_YOUR_OWN_ADAPTER,
  [PERLSKY_ADAPTER.name]: PERLSKY_ADAPTER,
});

export const ADAPTER_NAMES = Object.freeze(Object.keys(ADAPTERS));

export const getAdapter = (name = 'bring-your-own') => {
  const adapter = ADAPTERS[name];
  if (!adapter) {
    throw new Error(`unsupported adapter: ${name}`);
  }
  return adapter;
};

export const listAdapters = () => {
  return ADAPTER_NAMES.map((name) => ADAPTERS[name]);
};
