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

const requireString = (value, label) => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required`);
  }
  return value;
};

const optionalString = (value) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error("optional string values must be strings when provided");
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

const optionalPostUrl = (value, label) => {
  const maybe = optionalString(value);
  if (!maybe) {
    return undefined;
  }
  let url;
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

const normalizeCleanupPrefixes = (prefixes) => {
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
    .filter(Boolean);
};

export const derivePdsHost = (pdsUrl) => {
  try {
    return new URL(pdsUrl).host;
  } catch {
    const match = String(pdsUrl).match(/^https?:\/\/([^/]+)/);
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
} = {}) => {
  const normalized = {
    handle: requireString(handle, "account.handle"),
    password: requireString(password, "account.password"),
    birthdate: optionalString(birthdate) || DEFAULTS.birthdate,
    cleanupPostPrefixes: normalizeCleanupPrefixes(cleanupPostPrefixes),
    ...rest,
  };

  const login = optionalString(loginIdentifier);
  if (login) {
    normalized.loginIdentifier = login;
  }

  const post = optionalString(postText);
  const mediaPost = optionalString(mediaPostText);
  const quote = optionalString(quoteText);
  const reply = optionalString(replyText);
  const note = optionalString(profileNote);

  if (post) {
    normalized.postText = post;
  }
  if (mediaPost) {
    normalized.mediaPostText = mediaPost;
  }
  if (quote) {
    normalized.quoteText = quote;
  }
  if (reply) {
    normalized.replyText = reply;
  }
  if (note) {
    normalized.profileNote = note;
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
} = {}) => {
  const normalized = {
    pdsUrl: requireString(pdsUrl, "pdsUrl"),
    artifactsDir: requireString(artifactsDir, "artifactsDir"),
    appUrl: optionalString(appUrl) || DEFAULTS.appUrl,
    publicApiUrl: optionalString(publicApiUrl) || DEFAULTS.publicApiUrl,
    publicCheckTimeoutMs: Number(
      publicCheckTimeoutMs || DEFAULTS.publicCheckTimeoutMs,
    ),
    stepTimeoutMs: Number(stepTimeoutMs || DEFAULTS.stepTimeoutMs),
    headless: Boolean(headless),
    strictErrors: Boolean(strictErrors),
    publicChecks: Boolean(publicChecks),
    ...rest,
  };

  normalized.pdsHost =
    optionalString(pdsHost) || derivePdsHost(normalized.pdsUrl);
  if (!normalized.pdsHost) {
    throw new Error("pdsHost could not be derived from pdsUrl");
  }

  const maybeTarget = optionalString(targetHandle);
  if (maybeTarget) {
    normalized.targetHandle = maybeTarget;
  }

  const maybeRemoteReplyPostUrl = optionalPostUrl(
    remoteReplyPostUrl,
    "remoteReplyPostUrl",
  );
  if (maybeRemoteReplyPostUrl) {
    normalized.remoteReplyPostUrl = maybeRemoteReplyPostUrl;
  }

  const maybeBrowserExecutablePath = optionalString(browserExecutablePath);
  if (maybeBrowserExecutablePath) {
    normalized.browserExecutablePath = maybeBrowserExecutablePath;
  }

  const maybeAdapter = optionalString(adapter);
  if (maybeAdapter) {
    normalized.adapter = maybeAdapter;
  }

  return normalized;
};

export const createSingleRunConfig = ({
  account,
  editProfile = false,
  ...rest
} = {}) => {
  const suite = createSuiteConfig(rest);
  if (!suite.targetHandle) {
    throw new Error("targetHandle is required for single-mode runs");
  }
  return {
    ...suite,
    ...createAccountConfig(account),
    editProfile: Boolean(editProfile),
  };
};

export const createDualRunConfig = ({
  primary,
  secondary,
  accountSource,
  ...rest
} = {}) => {
  const normalized = {
    ...createSuiteConfig(rest),
    primary: createAccountConfig(primary),
    secondary: createAccountConfig(secondary),
  };

  const maybeAccountSource = optionalString(accountSource);
  if (maybeAccountSource) {
    normalized.accountSource = maybeAccountSource;
  }

  return normalized;
};
