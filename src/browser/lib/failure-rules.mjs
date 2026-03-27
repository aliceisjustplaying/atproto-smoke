export const IGNORED_CONSOLE = [
  /events\.bsky\.app\/.*ERR_BLOCKED_BY_CLIENT/i,
  /slider-vertical/i,
  /Password field is not contained in a form/i,
  /Failed to load resource: the server responded with a status of 400 \(\)/i,
];

export const IGNORED_REQUEST_FAILURE = [
  { url: /events\.bsky\.app\//i, error: /ERR_(BLOCKED_BY_CLIENT|ABORTED)/i },
  { url: /workers\.dev\/api\/config/i, error: /ERR_ABORTED/i },
  { url: /app-config\.workers\.bsky\.app\/config/i, error: /ERR_ABORTED/i },
  { url: /live-events\.workers\.bsky\.app\/config/i, error: /ERR_ABORTED/i },
  { url: /cdn\.bsky\.app\/img\/avatar_thumbnail\//i, error: /ERR_ABORTED/i },
  { url: /events\.bsky\.app\/t/i, error: /ERR_ABORTED/i },
  { url: /events\.bsky\.app\/gb\/api\/features\//i, error: /ERR_ABORTED/i },
  {
    url: /(?:video\.bsky\.app\/watch|video\.cdn\.bsky\.app\/hls)\/.*\/(?:(?:playlist|video)\.m3u8|.*\.ts|.*\.vtt)/i,
    error: /ERR_ABORTED/i,
  },
  { url: /\/xrpc\/chat\.bsky\.convo\.getLog/i, error: /ERR_ABORTED/i },
  {
    url: /\/xrpc\/app\.bsky\.graph\.(?:muteActor|unmuteActor)/i,
    error: /ERR_ABORTED/i,
  },
  {
    url: /\/xrpc\/com\.atproto\.identity\.resolveHandle/i,
    error: /ERR_ABORTED/i,
  },
  { url: /\/xrpc\/app\.bsky\.feed\.getAuthorFeed/i, error: /ERR_ABORTED/i },
  {
    url: /\/xrpc\/app\.bsky\.graph\.getSuggestedFollowsByActor/i,
    error: /ERR_ABORTED/i,
  },
  {
    url: /\/xrpc\/chat\.bsky\.convo\.getConvoAvailability/i,
    error: /ERR_ABORTED/i,
  },
];

export const IGNORED_HTTP_FAILURE = [
  { url: /c\.1password\.com\/richicons/i, status: 404 },
  { url: /\/xrpc\/app\.bsky\.graph\.getList\?/, status: 400 },
  { url: /\/xrpc\/app\.bsky\.feed\.getAuthorFeed\?/, status: 400 },
];

export const isIgnoredConsoleEntry = (entry) =>
  IGNORED_CONSOLE.some((pattern) => pattern.test(entry.text || ""));

export const isIgnoredRequestFailureEntry = (entry) =>
  IGNORED_REQUEST_FAILURE.some(
    (rule) =>
      rule.url.test(entry.url || "") && rule.error.test(entry.errorText || ""),
  );

export const isIgnoredHttpFailureEntry = (entry) =>
  IGNORED_HTTP_FAILURE.some(
    (rule) =>
      rule.url.test(entry.url || "") &&
      (!rule.status || rule.status === entry.status),
  );
