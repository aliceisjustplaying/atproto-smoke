import {
  createAccountConfig,
  createDualRunConfig,
  createSingleRunConfig,
} from '../config.mjs';

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
