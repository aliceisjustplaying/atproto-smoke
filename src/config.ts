import type {
  AccountConfig,
  DualRunConfig,
  FlexibleRecord,
  SingleRunConfig,
  SuiteConfig,
} from "./types.js";
import { getRecord } from "./guards.js";

const DEFAULTS = {
  appUrl: "https://bsky.app",
  publicApiUrl: "https://public.api.bsky.app",
  publicCheckTimeoutMs: 180000,
  stepTimeoutMs: 120000,
  birthdate: "1990-01-01",
  headless: true,
  strictErrors: false,
  publicChecks: true,
};

const DEFAULT_ACCOUNT_TEXTS = {
  postText: "browser smoke root post",
  mediaPostText: "browser smoke image post",
  quoteText: "browser smoke quote post",
  replyText: "browser smoke reply post",
  profileNote: "browser smoke profile note",
};

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required`);
  }
  return value;
};

const optionalString = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error("optional string values must be strings when provided");
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

const optionalPostUrl = (value: unknown, label: string): string | undefined => {
  const maybe = optionalString(value);
  if (maybe === undefined) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(maybe);
  } catch {
    throw new Error(`${label} must be a valid URL when provided`);
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error(`${label} must use http or https`);
  }
  if (!/\/profile\/[^/]+\/post\/[^/?#]+/.test(url.pathname)) {
    throw new Error(`${label} must point at a post URL`);
  }
  return url.toString();
};

const normalizeCleanupPrefixes = (prefixes: unknown): string[] => {
  if (prefixes === undefined) {
    return [];
  }
  if (!Array.isArray(prefixes)) {
    throw new Error("cleanupPostPrefixes must be an array when provided");
  }
  return prefixes
    .map((value) => {
      if (typeof value !== "string") {
        throw new Error("cleanup post prefixes must be strings");
      }
      return value.length ? value : undefined;
    })
    .filter((value): value is string => value !== undefined);
};

export const derivePdsHost = (pdsUrl: string): string | undefined => {
  try {
    return new URL(pdsUrl).host;
  } catch {
    const match = /^https?:\/\/([^/]+)/.exec(pdsUrl);
    return match?.[1];
  }
};

export const createAccountConfig = ({
  handle,
  loginIdentifier,
  password,
  birthdate = DEFAULTS.birthdate,
  postText,
  mediaPostText,
  quoteText,
  replyText,
  profileNote,
  cleanupPostPrefixes,
  ...rest
}: FlexibleRecord = {}): AccountConfig => {
  const normalized: AccountConfig = {
    handle: requireString(handle, "account.handle"),
    password: requireString(password, "account.password"),
    birthdate: optionalString(birthdate) ?? DEFAULTS.birthdate,
    postText: optionalString(postText) ?? DEFAULT_ACCOUNT_TEXTS.postText,
    mediaPostText:
      optionalString(mediaPostText) ?? DEFAULT_ACCOUNT_TEXTS.mediaPostText,
    quoteText: optionalString(quoteText) ?? DEFAULT_ACCOUNT_TEXTS.quoteText,
    replyText: optionalString(replyText) ?? DEFAULT_ACCOUNT_TEXTS.replyText,
    profileNote:
      optionalString(profileNote) ?? DEFAULT_ACCOUNT_TEXTS.profileNote,
    cleanupPostPrefixes: normalizeCleanupPrefixes(cleanupPostPrefixes),
    ...rest,
  };

  const login = optionalString(loginIdentifier);
  if (login !== undefined) {
    normalized.loginIdentifier = login;
  }

  return normalized;
};

export const createSuiteConfig = ({
  pdsUrl,
  pdsHost,
  artifactsDir,
  appUrl = DEFAULTS.appUrl,
  publicApiUrl = DEFAULTS.publicApiUrl,
  publicCheckTimeoutMs = DEFAULTS.publicCheckTimeoutMs,
  stepTimeoutMs = DEFAULTS.stepTimeoutMs,
  targetHandle,
  remoteReplyPostUrl,
  headless = DEFAULTS.headless,
  strictErrors = DEFAULTS.strictErrors,
  publicChecks = DEFAULTS.publicChecks,
  browserExecutablePath,
  adapter,
  ...rest
}: FlexibleRecord = {}): SuiteConfig => {
  const normalizedBase = {
    pdsUrl: requireString(pdsUrl, "pdsUrl"),
    artifactsDir: requireString(artifactsDir, "artifactsDir"),
    appUrl: optionalString(appUrl) ?? DEFAULTS.appUrl,
    publicApiUrl: optionalString(publicApiUrl) ?? DEFAULTS.publicApiUrl,
    publicCheckTimeoutMs: Number(
      publicCheckTimeoutMs ?? DEFAULTS.publicCheckTimeoutMs,
    ),
    stepTimeoutMs: Number(stepTimeoutMs ?? DEFAULTS.stepTimeoutMs),
    headless: Boolean(headless),
    strictErrors: Boolean(strictErrors),
    publicChecks: Boolean(publicChecks),
    ...rest,
  };

  const derivedPdsHost =
    optionalString(pdsHost) ?? derivePdsHost(normalizedBase.pdsUrl);
  if (derivedPdsHost === undefined) {
    throw new Error("pdsHost could not be derived from pdsUrl");
  }

  const maybeTarget = optionalString(targetHandle);
  const maybeRemoteReplyPostUrl = optionalPostUrl(
    remoteReplyPostUrl,
    "remoteReplyPostUrl",
  );
  const maybeBrowserExecutablePath = optionalString(browserExecutablePath);
  const maybeAdapter = optionalString(adapter);
  return {
    ...normalizedBase,
    pdsHost: derivedPdsHost,
    ...(maybeTarget !== undefined ? { targetHandle: maybeTarget } : {}),
    ...(maybeRemoteReplyPostUrl !== undefined
      ? { remoteReplyPostUrl: maybeRemoteReplyPostUrl }
      : {}),
    ...(maybeBrowserExecutablePath !== undefined
      ? { browserExecutablePath: maybeBrowserExecutablePath }
      : {}),
    ...(maybeAdapter !== undefined ? { adapter: maybeAdapter } : {}),
  };
};

export const createSingleRunConfig = ({
  account,
  editProfile = false,
  ...rest
}: FlexibleRecord = {}): SingleRunConfig => {
  const suite = createSuiteConfig(rest);
  if (suite.targetHandle === undefined) {
    throw new Error("targetHandle is required for single-mode runs");
  }
  const normalizedAccount = getRecord(account) ?? {};
  return {
    ...suite,
    ...createAccountConfig(normalizedAccount),
    targetHandle: suite.targetHandle,
    editProfile: Boolean(editProfile),
  };
};

export const createDualRunConfig = ({
  primary,
  secondary,
  accountSource,
  ...rest
}: FlexibleRecord = {}): DualRunConfig => {
  const normalizedPrimary = getRecord(primary) ?? {};
  const normalizedSecondary = getRecord(secondary) ?? {};
  const normalized: DualRunConfig = {
    ...createSuiteConfig(rest),
    primary: createAccountConfig(normalizedPrimary),
    secondary: createAccountConfig(normalizedSecondary),
  };

  const maybeAccountSource = optionalString(accountSource);
  if (maybeAccountSource !== undefined) {
    normalized.accountSource = maybeAccountSource;
  }

  return normalized;
};
