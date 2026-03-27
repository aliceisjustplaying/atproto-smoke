import { getAdapter, listAdapters } from './registry.mjs';

export const loadAdapter = (name = 'bring-your-own') => getAdapter(name);

export const hasAdapter = (name) => {
  try {
    getAdapter(name);
    return true;
  } catch {
    return false;
  }
};

export {
  getAdapter,
  listAdapters,
};
