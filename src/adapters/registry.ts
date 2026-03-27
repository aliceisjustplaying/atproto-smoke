import { BRING_YOUR_OWN_ADAPTER } from "./bring-your-own.js";
import { PERLSKY_ADAPTER } from "./perlsky.js";
import { TRANQUIL_PDS_ADAPTER } from "./tranquil-pds.js";
import type { Adapter } from "../types.js";

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
export const ADAPTERS: Readonly<Partial<Record<string, Adapter>>> =
  Object.freeze({
    [BRING_YOUR_OWN_ADAPTER.name]: BRING_YOUR_OWN_ADAPTER,
    [PERLSKY_ADAPTER.name]: PERLSKY_ADAPTER,
    [TRANQUIL_PDS_ADAPTER.name]: TRANQUIL_PDS_ADAPTER,
  });

export const ADAPTER_NAMES: readonly string[] = Object.freeze(
  Object.keys(ADAPTERS),
);

export const getAdapter = (name = "bring-your-own"): Adapter => {
  const adapter = ADAPTERS[name];
  if (adapter === undefined) {
    throw new Error(`unsupported adapter: ${name}`);
  }
  return adapter;
};

export const listAdapters = (): Adapter[] => {
  return ADAPTER_NAMES.map((name) => getAdapter(name));
};
