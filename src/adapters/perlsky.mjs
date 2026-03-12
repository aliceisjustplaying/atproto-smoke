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

export const PERLSKY_REMOTE_REPLY_POST_URL =
  'https://bsky.app/profile/alice.mosphere.at/post/3mgu5lgnsnk22';

const perlskyRoleDefaults = (role) => {
  if (role === 'secondary') {
    return {
      postText: 'perlsky browser secondary post',
      quoteText: 'perlsky browser secondary quote',
      replyText: 'perlsky browser secondary reply',
      profileNote: 'perlsky browser secondary profile edit',
    };
  }

  return {
    postText: 'perlsky browser smoke post',
    quoteText: 'perlsky browser smoke quote',
    replyText: 'perlsky browser smoke reply',
    profileNote: 'perlsky browser smoke profile edit',
  };
};

const createPerlskyExampleConfig = ({ mode }) => {
  const base = {
    pdsUrl: 'https://perlsky.mosphere.at',
    artifactsDir: `data/browser-smoke/perlsky-${mode}`,
    targetHandle: 'alice.mosphere.at',
    remoteReplyPostUrl: PERLSKY_REMOTE_REPLY_POST_URL,
    strictErrors: true,
  };

  if (mode === 'single') {
    return {
      ...base,
      editProfile: true,
      account: {
        handle: 'smoke-primary.perlsky.mosphere.at',
        password: 'replace-me',
      },
    };
  }

  return {
    ...base,
    primary: {
      handle: 'smoke-primary.perlsky.mosphere.at',
      password: 'replace-me',
    },
    secondary: {
      handle: 'smoke-secondary.perlsky.mosphere.at',
      password: 'replace-me-too',
    },
  };
};

export const createPerlskyAccountConfig = ({
  role = 'primary',
  ...account
} = {}) => {
  const cleanupPostPrefixes = role === 'secondary'
    ? PERLSKY_SECONDARY_CLEANUP_PREFIXES
    : PERLSKY_PRIMARY_CLEANUP_PREFIXES;

  return createAccountConfig({
    cleanupPostPrefixes,
    ...perlskyRoleDefaults(role),
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
    remoteReplyPostUrl: PERLSKY_REMOTE_REPLY_POST_URL,
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

export const PERLSKY_ADAPTER = Object.freeze({
  name: 'perlsky',
  description: 'Use perlsky-flavored defaults like cleanup prefixes and adapter tagging.',
  accountStrategy: 'existing-accounts-or-bootstrap',
  notes: [
    'The standalone suite still expects credentials in the config.',
    'perlsky-specific account bootstrap and reusable-pair helpers live in perlsky, not in atproto-smoke itself.',
  ],
  createSingleConfig: createPerlskySingleConfig,
  createDualConfig: createPerlskyDualConfig,
  createExampleConfig: createPerlskyExampleConfig,
});
