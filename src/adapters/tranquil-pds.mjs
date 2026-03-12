import {
  createAccountConfig,
  createDualRunConfig,
  createSingleRunConfig,
} from '../config.mjs';

export const TRANQUIL_PDS_PRIMARY_CLEANUP_PREFIXES = Object.freeze([
  'tranquil browser smoke ',
]);

export const TRANQUIL_PDS_SECONDARY_CLEANUP_PREFIXES = Object.freeze([
  'tranquil browser secondary ',
]);

const tranquilRoleDefaults = (role) => {
  if (role === 'secondary') {
    return {
      postText: 'tranquil browser secondary post',
      quoteText: 'tranquil browser secondary quote',
      replyText: 'tranquil browser secondary reply',
      profileNote: 'tranquil browser secondary profile edit',
    };
  }

  return {
    postText: 'tranquil browser smoke post',
    quoteText: 'tranquil browser smoke quote',
    replyText: 'tranquil browser smoke reply',
    profileNote: 'tranquil browser smoke profile edit',
  };
};

const createTranquilExampleConfig = ({ mode }) => {
  const base = {
    pdsUrl: 'https://tranquil.mosphere.at',
    artifactsDir: `data/browser-smoke/tranquil-pds-${mode}`,
    targetHandle: 'alice.tranquil.mosphere.at',
    strictErrors: true,
  };

  if (mode === 'single') {
    return {
      ...base,
      editProfile: true,
      account: {
        handle: 'smoke-primary.tranquil.mosphere.at',
        password: 'replace-me',
      },
    };
  }

  return {
    ...base,
    primary: {
      handle: 'smoke-primary.tranquil.mosphere.at',
      password: 'replace-me',
    },
    secondary: {
      handle: 'smoke-secondary.tranquil.mosphere.at',
      password: 'replace-me-too',
    },
  };
};

export const createTranquilPdsAccountConfig = ({
  role = 'primary',
  ...account
} = {}) => {
  const cleanupPostPrefixes = role === 'secondary'
    ? TRANQUIL_PDS_SECONDARY_CLEANUP_PREFIXES
    : TRANQUIL_PDS_PRIMARY_CLEANUP_PREFIXES;

  return createAccountConfig({
    cleanupPostPrefixes,
    ...tranquilRoleDefaults(role),
    ...account,
  });
};

export const createTranquilPdsSingleConfig = ({
  account,
  ...rest
} = {}) => {
  return createSingleRunConfig({
    ...rest,
    adapter: 'tranquil-pds',
    account: createTranquilPdsAccountConfig({
      role: 'primary',
      ...account,
    }),
  });
};

export const createTranquilPdsDualConfig = ({
  primary,
  secondary,
  ...rest
} = {}) => {
  return createDualRunConfig({
    ...rest,
    adapter: 'tranquil-pds',
    primary: createTranquilPdsAccountConfig({
      role: 'primary',
      ...primary,
    }),
    secondary: createTranquilPdsAccountConfig({
      role: 'secondary',
      ...secondary,
    }),
  });
};

export const TRANQUIL_PDS_ADAPTER = Object.freeze({
  name: 'tranquil-pds',
  description: 'Use tranquil-pds-flavored defaults like cleanup prefixes and hosted example handles.',
  accountStrategy: 'self-register-or-existing-accounts',
  notes: [
    'The standalone suite still expects credentials in the config.',
    'tranquil-pds can self-register accounts via com.atproto.server.createAccount, but that bootstrap stays outside the generic smoke runner.',
  ],
  createSingleConfig: createTranquilPdsSingleConfig,
  createDualConfig: createTranquilPdsDualConfig,
  createExampleConfig: createTranquilExampleConfig,
});
