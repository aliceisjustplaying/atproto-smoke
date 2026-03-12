import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupDualBrowser, createDualStepHelpers } from './lib/dual-browser.mjs';
import { createDualApiHelpers } from './lib/dual-api.mjs';
import { createListHelpers } from './lib/lists.mjs';
import { createSettingsHelpers } from './lib/settings.mjs';
import { runDualScenario } from './lib/dual-scenario.mjs';
import { createDualActions } from './lib/dual-actions.mjs';

export const runDualFromConfig = async (config) => {
  await fs.mkdir(config.artifactsDir, { recursive: true });
  const appBaseUrl = config.appUrl.replace(/\/$/, '');

  const summary = {
    startedAt: new Date().toISOString(),
    appUrl: config.appUrl,
    pdsUrl: config.pdsUrl,
    publicApiUrl: config.publicApiUrl,
    targetHandle: config.targetHandle,
    remoteReplyPostUrl: config.remoteReplyPostUrl,
    primaryHandle: config.primary?.handle,
    secondaryHandle: config.secondary?.handle,
    steps: [],
    console: [],
    pageErrors: [],
    requestFailures: [],
    httpFailures: [],
    xrpc: [],
    notes: [],
  };

  if (config.accountSource) {
    summary.notes.push(`account source: ${config.accountSource}`);
  }

  const AVATAR_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAV0lEQVR4nO3PQQ0AIBDAMMC/58MCP7KkVbDX1pk5A6gWUC2gWkC1gGoB1QKqBVQLqBZQLaBaQLWAagHVAqoFVAuoFlAtoFpAtYBqAdUCqgVUC6gWUC2gWkD1B4a2AX/y3CvgAAAAAElFTkSuQmCC';
  const { browser, primaryPage, secondaryPage } = await setupDualBrowser({ config, summary });
  const {
    screenshot,
    normalizeText,
    isIgnoredConsole,
    isIgnoredRequestFailure,
    isIgnoredHttpFailure,
    step,
    wait,
    buttonText,
  } = createDualStepHelpers({ config, summary, primaryPage, secondaryPage });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const {
    fetchJson,
    fetchStatus,
    xrpcJson,
    waitForOwnPostRecord,
    waitForFollowRecord,
    waitForNoOwnRecord,
    waitForOwnListRecord,
    waitForOwnListItemRecord,
    recordRkey,
    createSession,
    pollNotifications,
    prepareAccounts,
    cleanupStaleSmokeArtifacts,
  } = createDualApiHelpers({ config });
  const {
    openListPage,
    createList,
    editCurrentList,
    deleteCurrentList,
    addUserToCurrentList,
    removeUserFromCurrentList,
  } = createListHelpers({ appBaseUrl, wait });
  const {
    setCheckboxSetting,
    setRadioSetting,
  } = createSettingsHelpers({ appBaseUrl, wait });

  const { primary, secondary } = prepareAccounts({
    primaryConfig: config.primary,
    secondaryConfig: config.secondary,
    startedAt: summary.startedAt,
  });

  const {
    login,
    completeAgeAssuranceIfNeeded,
    gotoProfile,
    waitForProfileHandle,
    verifyProfileCountsAfterReload,
    readProfileCountsAfterReload,
    composePost,
    composePostWithImage,
    editProfile,
    verifyLocalProfileAfterEdit,
    verifyPublicProfileAfterEdit,
    findRowByPrimaryText,
    ensureLiked,
    ensureNotLiked,
    ensureReposted,
    ensureNotReposted,
    ensureBookmarked,
    ensureNotBookmarked,
    clickQuote,
    clickReply,
    maybeFollow,
    maybeUnfollow,
    openNotifications,
    openSavedPosts,
    waitForNotificationsFeed,
    ensureProfileMuted,
    ensureProfileUnmuted,
    blockProfile,
    unblockProfile,
    openReportPostDraft,
    openProfileTab,
    maybeDeleteOwnPostByText,
  } = createDualActions({
    config,
    summary,
    appBaseUrl,
    wait,
    sleep,
    normalizeText,
    buttonText,
    fetchJson,
    fetchStatus,
    xrpcJson,
    avatarPngBase64: AVATAR_PNG_BASE64,
  });

  try {
    await runDualScenario({
    config,
    step,
    primaryPage,
    secondaryPage,
    primary,
    secondary,
    login,
    completeAgeAssuranceIfNeeded,
    createSession,
    cleanupStaleSmokeArtifacts,
    composePost,
    waitForOwnPostRecord,
    gotoProfile,
    waitForProfileHandle,
    verifyProfileCountsAfterReload,
    readProfileCountsAfterReload,
    findRowByPrimaryText,
    composePostWithImage,
    editProfile,
    verifyLocalProfileAfterEdit,
    verifyPublicProfileAfterEdit,
    createList,
    waitForOwnListRecord,
    recordRkey,
    openListPage,
    editCurrentList,
    addUserToCurrentList,
    waitForOwnListItemRecord,
    removeUserFromCurrentList,
    waitForNoOwnRecord,
    deleteCurrentList,
    maybeUnfollow,
    maybeFollow,
    waitForFollowRecord,
    ensureLiked,
    ensureBookmarked,
    openSavedPosts,
    ensureReposted,
    clickQuote,
    clickReply,
    pollNotifications,
    openNotifications,
    waitForNotificationsFeed,
    ensureProfileMuted,
    ensureProfileUnmuted,
    openReportPostDraft,
    blockProfile,
    unblockProfile,
    setRadioSetting,
    setCheckboxSetting,
    ensureNotLiked,
    ensureNotBookmarked,
    ensureNotReposted,
    openProfileTab,
    maybeDeleteOwnPostByText,
    });
  } catch (error) {
    summary.fatal = String(error?.message ?? error);
  }

  summary.finishedAt = new Date().toISOString();
  summary.unexpected = {
    console: summary.console.filter((entry) => !isIgnoredConsole(entry)),
    requestFailures: summary.requestFailures.filter((entry) => !isIgnoredRequestFailure(entry)),
    httpFailures: summary.httpFailures.filter((entry) => !isIgnoredHttpFailure(entry)),
    pageErrors: summary.pageErrors,
  };
  summary.unexpected.total =
    summary.unexpected.console.length +
    summary.unexpected.requestFailures.length +
    summary.unexpected.httpFailures.length +
    summary.unexpected.pageErrors.length;
  if (!summary.fatal && config.strictErrors !== false && summary.unexpected.total > 0) {
    summary.fatal = `Unexpected browser/runtime errors: ${summary.unexpected.total}`;
  }
  summary.ok = !summary.fatal;
  await screenshot('primary', 'final').catch(() => undefined);
  await screenshot('secondary', 'final').catch(() => undefined);
  await fs.writeFile(
    path.join(config.artifactsDir, 'summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
    'utf8',
  );
  console.log(JSON.stringify(summary, null, 2));
  await Promise.race([
    browser.close(),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('browser close timed out after 15000ms')), 15000);
    }),
  ]).catch((error) => {
    summary.notes.push(String(error?.message ?? error));
  });
  return summary;
};

export const runDualFromConfigPath = async (configPath) => {
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  return runDualFromConfig(config);
};

export const runDualFromArgv = async (argv = process.argv) => {
  const configPath = argv[2];
  if (!configPath) {
    console.error('usage: node run-dual.mjs <config.json>');
    return 2;
  }
  const summary = await runDualFromConfigPath(configPath);
  return summary.ok ? 0 : 1;
};

const isDirectExecution =
  !!process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  const exitCode = await runDualFromArgv(process.argv);
  process.exitCode = exitCode;
}
