#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDSLAB_TARGETS } from "../src/lab/pdslab-targets.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const parseArgs = (argv) => {
  const result = {
    ledgerPath: path.join(repoRoot, ".tmp", "smoke-accounts.local.json"),
    outputDir: path.join(repoRoot, ".tmp", "generated", "pdslab-configs"),
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--ledger") {
      result.ledgerPath = path.resolve(argv[++i]);
      continue;
    }
    if (arg === "--output-dir") {
      result.outputDir = path.resolve(argv[++i]);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return result;
};

const usage = `Usage:
  node scripts/write-pdslab-configs.mjs [--ledger .tmp/smoke-accounts.local.json] [--output-dir .tmp/generated/pdslab-configs]
`;

const readJson = async (filePath) => {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
};

const ensureTarget = (ledger, targetId) => {
  const target = ledger.targets?.[targetId];
  if (!target) {
    throw new Error(`ledger target missing: ${targetId}`);
  }
  return target;
};

const createAccountDefaults = ({ spec, role }) => {
  const prefix = `pdslab ${spec.id} ${role}`;
  return {
    postText: `${prefix} root post`,
    mediaPostText: `${prefix} image post`,
    quoteText: `${prefix} quote post`,
    replyText: `${prefix} reply post`,
    profileNote: `${prefix} profile note`,
    cleanupPostPrefixes: [`${prefix} `],
  };
};

const createAccount = ({ account, loginIdentifierKey, spec, role }) => {
  if (!account) {
    throw new Error("account details are required");
  }

  const normalized = {
    ...createAccountDefaults({ spec, role }),
    handle: account.handle,
    password: account.password,
  };

  if (loginIdentifierKey) {
    const loginIdentifier = account[loginIdentifierKey];
    if (!loginIdentifier) {
      throw new Error(
        `missing loginIdentifierKey "${loginIdentifierKey}" on account`,
      );
    }
    normalized.loginIdentifier = loginIdentifier;
  }

  if (account.did) {
    normalized.did = account.did;
  }
  if (account.email) {
    normalized.email = account.email;
  }
  if (account.pdsUrl) {
    normalized.pdsUrl = account.pdsUrl;
  }
  if (account.pdsHost) {
    normalized.pdsHost = account.pdsHost;
  }

  return normalized;
};

const createSingleConfig = ({ spec, ledgerTarget }) => {
  const accountSource = spec.currentDeploymentKey
    ? ledgerTarget[spec.currentDeploymentKey]
    : ledgerTarget.accounts?.[spec.ledgerAccount];

  if (!accountSource) {
    throw new Error(
      `single target ${spec.id} is missing its account in the ledger`,
    );
  }

  return {
    adapter: spec.adapter,
    pdsUrl: ledgerTarget.pdsUrl,
    artifactsDir: `data/browser-smoke/pdslab/${spec.id}`,
    targetHandle: "smoke-a.perlsky.pdslab.net",
    accountSource: spec.accountSource,
    pdslabTargetId: spec.id,
    pdslabRunnerStatus: spec.runnerStatus,
    pdslabPairGroup: spec.pairGroup,
    pdslabNotes: spec.notes,
    account: createAccount({
      account: accountSource,
      loginIdentifierKey: spec.loginIdentifierKey,
      spec,
      role: spec.ledgerAccount || "single",
    }),
  };
};

const createDualConfig = ({ spec, ledgerTarget }) => {
  const primary = ledgerTarget.accounts?.["smoke-a"];
  const secondary = ledgerTarget.accounts?.["smoke-b"];
  if (!primary || !secondary) {
    throw new Error(
      `dual target ${spec.id} is missing smoke-a or smoke-b in the ledger`,
    );
  }

  return {
    adapter: spec.adapter,
    pdsUrl: ledgerTarget.pdsUrl,
    artifactsDir: `data/browser-smoke/pdslab/${spec.id}`,
    accountSource: spec.accountSource,
    pdslabTargetId: spec.id,
    pdslabRunnerStatus: spec.runnerStatus,
    pdslabNotes: spec.notes,
    primary: createAccount({ account: primary, spec, role: "primary" }),
    secondary: createAccount({ account: secondary, spec, role: "secondary" }),
  };
};

const createCrossPdsDualConfig = ({
  spec,
  primaryLedgerTarget,
  secondaryLedgerTarget,
}) => {
  const primarySource = spec.primaryCurrentDeploymentKey
    ? primaryLedgerTarget[spec.primaryCurrentDeploymentKey]
    : primaryLedgerTarget.accounts?.[spec.primaryLedgerAccount];
  const secondarySource = spec.secondaryCurrentDeploymentKey
    ? secondaryLedgerTarget[spec.secondaryCurrentDeploymentKey]
    : secondaryLedgerTarget.accounts?.[spec.secondaryLedgerAccount];

  if (!primarySource || !secondarySource) {
    throw new Error(
      `cross-PDS target ${spec.id} is missing one of its accounts in the ledger`,
    );
  }

  return {
    adapter: spec.adapter,
    pdsUrl: primaryLedgerTarget.pdsUrl,
    artifactsDir: `data/browser-smoke/pdslab/${spec.id}`,
    accountSource: spec.accountSource,
    pdslabTargetId: spec.id,
    pdslabRunnerStatus: spec.runnerStatus,
    pdslabNotes: spec.notes,
    primary: createAccount({
      account: {
        ...primarySource,
        pdsUrl: primaryLedgerTarget.pdsUrl,
      },
      loginIdentifierKey: spec.primaryLoginIdentifierKey,
      spec,
      role: "primary",
    }),
    secondary: createAccount({
      account: {
        ...secondarySource,
        pdsUrl: secondaryLedgerTarget.pdsUrl,
      },
      loginIdentifierKey: spec.secondaryLoginIdentifierKey,
      spec,
      role: "secondary",
    }),
  };
};

const createPlan = (ledger) => {
  const targets = [];
  const skipped = [];

  for (const spec of PDSLAB_TARGETS) {
    const needsLedgerTarget = Boolean(spec.ledgerTarget);
    const ledgerTarget = needsLedgerTarget
      ? ensureTarget(ledger, spec.ledgerTarget)
      : null;
    const primaryLedgerTarget = spec.primaryLedgerTarget
      ? ensureTarget(ledger, spec.primaryLedgerTarget)
      : null;
    const secondaryLedgerTarget = spec.secondaryLedgerTarget
      ? ensureTarget(ledger, spec.secondaryLedgerTarget)
      : null;

    if (
      spec.runnerStatus !== "ready" &&
      spec.runnerStatus !== "needs-login-identifier-support"
    ) {
      skipped.push({
        id: spec.id,
        mode: spec.mode,
        runnerStatus: spec.runnerStatus,
        notes: spec.notes,
      });
      continue;
    }

    let config;
    if (
      spec.mode === "dual" &&
      spec.primaryLedgerTarget &&
      spec.secondaryLedgerTarget
    ) {
      config = createCrossPdsDualConfig({
        spec,
        primaryLedgerTarget,
        secondaryLedgerTarget,
      });
    } else if (spec.mode === "dual") {
      config = createDualConfig({ spec, ledgerTarget });
    } else {
      config = createSingleConfig({ spec, ledgerTarget });
    }

    targets.push({
      id: spec.id,
      mode: spec.mode,
      runnerStatus: spec.runnerStatus,
      config,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    domain: ledger.domain,
    runnableTargets: targets,
    skippedTargets: skipped,
  };
};

const writePlan = async ({ plan, outputDir }) => {
  await fs.mkdir(outputDir, { recursive: true });

  const inventory = {
    generatedAt: plan.generatedAt,
    domain: plan.domain,
    runnableTargets: plan.runnableTargets.map(
      ({ id, mode, runnerStatus, config }) => ({
        id,
        mode,
        runnerStatus,
        pdsUrl: config.pdsUrl,
        primaryPdsUrl: config.primary?.pdsUrl,
        secondaryPdsUrl: config.secondary?.pdsUrl,
        artifactsDir: config.artifactsDir,
        accountSource: config.accountSource,
        pairGroup: config.pdslabPairGroup,
        notes: config.pdslabNotes,
        loginIdentifier: config.account?.loginIdentifier,
      }),
    ),
    skippedTargets: plan.skippedTargets,
  };

  await fs.writeFile(
    path.join(outputDir, "inventory.json"),
    `${JSON.stringify(inventory, null, 2)}\n`,
    "utf8",
  );

  for (const target of plan.runnableTargets) {
    const fileName = `${target.id}.${target.mode}.json`;
    await fs.writeFile(
      path.join(outputDir, fileName),
      `${JSON.stringify(target.config, null, 2)}\n`,
      "utf8",
    );
  }
};

const main = async (argv = process.argv) => {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage);
    return 0;
  }

  const ledger = await readJson(args.ledgerPath);
  const plan = createPlan(ledger);
  await writePlan({ plan, outputDir: args.outputDir });

  console.log(
    JSON.stringify(
      {
        wrote: args.outputDir,
        runnableTargets: plan.runnableTargets.map(
          ({ id, mode, runnerStatus }) => ({
            id,
            mode,
            runnerStatus,
          }),
        ),
        skippedTargets: plan.skippedTargets,
      },
      null,
      2,
    ),
  );

  return 0;
};

const exitCode = await main(process.argv).catch((error) => {
  console.error(String(error?.message ?? error));
  return 1;
});

process.exitCode = exitCode;
