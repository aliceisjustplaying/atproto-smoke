import {
  createAccountConfig,
  createDualRunConfig,
  createSingleRunConfig,
} from "../config.js";
import type {
  AccountConfig,
  Adapter,
  ExampleBaseConfig,
  FlexibleRecord,
} from "../types.js";

export const createRoleBasedAdapter = ({
  name,
  description,
  accountStrategy,
  notes,
  exampleBase,
  roleDefaults,
  primaryCleanupPrefixes,
  secondaryCleanupPrefixes,
  dualSuiteDefaults = {},
}: {
  name: string;
  description: string;
  accountStrategy: string;
  notes: string[];
  exampleBase: ExampleBaseConfig;
  roleDefaults: (role: string) => FlexibleRecord;
  primaryCleanupPrefixes: readonly string[];
  secondaryCleanupPrefixes: readonly string[];
  dualSuiteDefaults?: FlexibleRecord;
}): { createAccount: (raw?: FlexibleRecord) => AccountConfig; adapter: Adapter } => {
  const createAccount = ({
    role = "primary",
    ...account
  }: FlexibleRecord = {}): AccountConfig => {
    const cleanupPostPrefixes =
      role === "secondary" ? secondaryCleanupPrefixes : primaryCleanupPrefixes;

    return createAccountConfig({
      cleanupPostPrefixes,
      ...roleDefaults(role),
      ...account,
    });
  };

  const createExampleConfig = ({
    mode,
  }: {
    mode: "single" | "dual";
  }): FlexibleRecord => {
    const { primaryHandle, secondaryHandle, ...configBase } = exampleBase;
    const base = {
      ...configBase,
      artifactsDir: `data/browser-smoke/${name}-${mode}`,
    };

    if (mode === "single") {
      return {
        ...base,
        editProfile: true,
        account: {
          handle: primaryHandle,
          password: "replace-me",
        },
      };
    }

    return {
      ...base,
      primary: {
        handle: primaryHandle,
        password: "replace-me",
      },
      secondary: {
        handle: secondaryHandle,
        password: "replace-me-too",
      },
    };
  };

  const createSingleConfig = ({
    account,
    ...rest
  }: FlexibleRecord = {}) => {
    return createSingleRunConfig({
      ...rest,
      adapter: name,
      account: createAccount({
        role: "primary",
        ...account,
      }),
    });
  };

  const createDualConfig = ({
    primary,
    secondary,
    ...rest
  }: FlexibleRecord = {}) => {
    return createDualRunConfig({
      ...dualSuiteDefaults,
      ...rest,
      adapter: name,
      primary: createAccount({
        role: "primary",
        ...primary,
      }),
      secondary: createAccount({
        role: "secondary",
        ...secondary,
      }),
    });
  };

  return {
    createAccount,
    adapter: Object.freeze({
      name,
      description,
      accountStrategy,
      notes,
      createSingleConfig,
      createDualConfig,
      createExampleConfig,
    }),
  };
};
