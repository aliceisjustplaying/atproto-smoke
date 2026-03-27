import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  setupDualBrowser,
  createDualStepHelpers,
  finalizeDualSummary,
} from "./lib/dual-browser.mjs";
import { createDualApiHelpers } from "./lib/dual-api.mjs";
import { createListHelpers } from "./lib/lists.mjs";
import { createSettingsHelpers } from "./lib/settings.mjs";
import { runDualScenario } from "./lib/dual-scenario.mjs";
import { createDualActions } from "./lib/dual-actions.mjs";
import {
  AVATAR_PNG_BASE64,
  createBaseSummary,
  sleep,
} from "./lib/runtime-utils.mjs";

export const runDualFromConfig = async (config) => {
  await fs.mkdir(config.artifactsDir, { recursive: true });
  const appBaseUrl = config.appUrl.replace(/\/$/, "");

  const summary = createBaseSummary({
    appUrl: config.appUrl,
    pdsUrl: config.pdsUrl,
    primaryPdsUrl: config.primary?.pdsUrl || config.pdsUrl,
    secondaryPdsUrl: config.secondary?.pdsUrl || config.pdsUrl,
    publicApiUrl: config.publicApiUrl,
    targetHandle: config.targetHandle,
    remoteReplyPostUrl: config.remoteReplyPostUrl,
    primaryHandle: config.primary?.handle,
    secondaryHandle: config.secondary?.handle,
  });

  if (config.accountSource) {
    summary.notes.push(`account source: ${config.accountSource}`);
  }

  const { browser, primaryPage, secondaryPage } = await setupDualBrowser({
    config,
    summary,
  });
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
  const { setCheckboxSetting, setRadioSetting } = createSettingsHelpers({
    appBaseUrl,
    wait,
  });

  const { primary, secondary } = prepareAccounts({
    primaryConfig: config.primary,
    secondaryConfig: config.secondary,
    startedAt: summary.startedAt,
  });

  const actions = createDualActions({
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
      createSession,
      cleanupStaleSmokeArtifacts,
      waitForOwnPostRecord,
      waitForFollowRecord,
      waitForNoOwnRecord,
      waitForOwnListRecord,
      waitForOwnListItemRecord,
      recordRkey,
      pollNotifications,
      createList,
      openListPage,
      editCurrentList,
      addUserToCurrentList,
      removeUserFromCurrentList,
      deleteCurrentList,
      setRadioSetting,
      setCheckboxSetting,
      ...actions,
    });
  } catch (error) {
    summary.fatal = String(error?.message ?? error);
  }

  await finalizeDualSummary({
    summary,
    config,
    screenshot,
    browser,
    isIgnoredConsole,
    isIgnoredRequestFailure,
    isIgnoredHttpFailure,
  });
  await fs.writeFile(
    path.join(config.artifactsDir, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify(summary, null, 2));
  return summary;
};

export const runDualFromConfigPath = async (configPath) => {
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  return runDualFromConfig(config);
};

export const runDualFromArgv = async (argv = process.argv) => {
  const configPath = argv[2];
  if (!configPath) {
    console.error("usage: node run-dual.mjs <config.json>");
    return 2;
  }
  const summary = await runDualFromConfigPath(configPath);
  return summary.ok ? 0 : 1;
};

const isDirectExecution =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  const exitCode = await runDualFromArgv(process.argv);
  process.exitCode = exitCode;
}
