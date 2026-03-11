import {
  createAccountConfig,
  createDualRunConfig,
  createSingleRunConfig,
} from '../config.mjs';

const createBringYourOwnExampleConfig = ({ mode }) => {
  const base = {
    pdsUrl: 'https://your-pds.example',
    artifactsDir: `data/browser-smoke/bring-your-own-${mode}`,
    targetHandle: 'alice.mosphere.at',
    strictErrors: true,
  };

  if (mode === 'single') {
    return {
      ...base,
      editProfile: true,
      account: {
        handle: 'smoke-primary.your-pds.example',
        password: 'replace-me',
      },
    };
  }

  return {
    ...base,
    primary: {
      handle: 'smoke-primary.your-pds.example',
      password: 'replace-me',
    },
    secondary: {
      handle: 'smoke-secondary.your-pds.example',
      password: 'replace-me-too',
    },
  };
};

export const createBringYourOwnAccount = (account = {}) => {
  return createAccountConfig(account);
};

export const createBringYourOwnSingleConfig = ({
  account,
  ...rest
} = {}) => {
  return createSingleRunConfig({
    ...rest,
    account: createBringYourOwnAccount(account),
  });
};

export const createBringYourOwnDualConfig = ({
  primary,
  secondary,
  ...rest
} = {}) => {
  return createDualRunConfig({
    ...rest,
    primary: createBringYourOwnAccount(primary),
    secondary: createBringYourOwnAccount(secondary),
  });
};

export const BRING_YOUR_OWN_ADAPTER = Object.freeze({
  name: 'bring-your-own',
  description: 'Use existing accounts on any PDS with minimal configuration.',
  accountStrategy: 'existing-accounts',
  notes: [
    'This is the default adapter and the lowest-friction path for non-Perl PDS implementations.',
    'The suite will not create accounts for you. Supply one account for single-mode or two for dual-mode.',
  ],
  createSingleConfig: createBringYourOwnSingleConfig,
  createDualConfig: createBringYourOwnDualConfig,
  createExampleConfig: createBringYourOwnExampleConfig,
});
