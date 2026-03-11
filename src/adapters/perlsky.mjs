import {
  createAccountConfig,
  createDualRunConfig,
  createSingleRunConfig,
} from '../config.mjs';

export const PERLSKY_PRIMARY_CLEANUP_PREFIXES = Object.freeze([
  'perlsky browser smoke ',
]);

export const PERLSKY_SECONDARY_CLEANUP_PREFIXES = Object.freeze([
  'perlsky browser secondary ',
]);

export const createPerlskyAccountConfig = ({
  role = 'primary',
  ...account
} = {}) => {
  const cleanupPostPrefixes = role === 'secondary'
    ? PERLSKY_SECONDARY_CLEANUP_PREFIXES
    : PERLSKY_PRIMARY_CLEANUP_PREFIXES;

  return createAccountConfig({
    cleanupPostPrefixes,
    ...account,
  });
};

export const createPerlskySingleConfig = ({
  account,
  ...rest
} = {}) => {
  return createSingleRunConfig({
    ...rest,
    adapter: 'perlsky',
    account: createPerlskyAccountConfig({
      role: 'primary',
      ...account,
    }),
  });
};

export const createPerlskyDualConfig = ({
  primary,
  secondary,
  ...rest
} = {}) => {
  return createDualRunConfig({
    ...rest,
    adapter: 'perlsky',
    primary: createPerlskyAccountConfig({
      role: 'primary',
      ...primary,
    }),
    secondary: createPerlskyAccountConfig({
      role: 'secondary',
      ...secondary,
    }),
  });
};
