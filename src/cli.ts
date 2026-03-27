import fs from "node:fs/promises";
import {
  ADAPTER_NAMES,
  getAdapter,
  listAdapters,
} from "./adapters/registry.js";
import type {
  DualRunConfig,
  FlexibleRecord,
  ParsedCliArgs,
  SingleRunConfig,
} from "./types.js";

const adapterUsage = ADAPTER_NAMES.join("|");

const usage = `Usage:
  atproto-smoke run-single [--adapter ${adapterUsage}] --config config.json
  atproto-smoke run-dual [--adapter ${adapterUsage}] --config config.json
  atproto-smoke validate --mode single|dual [--adapter ${adapterUsage}] --config config.json
  atproto-smoke write-example --mode single|dual [--adapter ${adapterUsage}] --output config.json
  atproto-smoke print-example --mode single|dual [--adapter ${adapterUsage}]
  atproto-smoke list-adapters

Notes:
  - bring-your-own is the default adapter
  - v1 is browser-first against bsky.app
  - run commands print step progress to stderr by default
  - add --json-only to suppress progress and keep stdout machine-only
  - direct API/AppView contract layers are documented as a later v2 expansion
`;

const parseArgs = (argv: string[]): ParsedCliArgs => {
  const result: ParsedCliArgs = {
    command: argv[2],
    adapter: "bring-your-own",
  };

  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config") {
      result.configPath = argv[++i];
      continue;
    }
    if (arg === "--mode") {
      result.mode = argv[++i] as "single" | "dual";
      continue;
    }
    if (arg === "--adapter") {
      result.adapter = argv[++i];
      continue;
    }
    if (arg === "--output") {
      result.outputPath = argv[++i];
      continue;
    }
    if (arg === "--help" || arg === "-h" || arg === "help") {
      result.help = true;
      continue;
    }
    if (arg === "--json-only") {
      result.jsonOnly = true;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return result;
};

const normalizeMode = (
  command: string | undefined,
  mode: ParsedCliArgs["mode"],
): ParsedCliArgs["mode"] => {
  if (command === "run-single") {
    return "single";
  }
  if (command === "run-dual") {
    return "dual";
  }
  return mode;
};

const normalizeConfig = ({
  mode,
  adapter,
  raw,
}: {
  mode: "single" | "dual";
  adapter: string;
  raw: FlexibleRecord;
}): SingleRunConfig | DualRunConfig => {
  const selectedAdapter = getAdapter(adapter);
  if (mode === "single") {
    return selectedAdapter.createSingleConfig(raw);
  }
  return selectedAdapter.createDualConfig(raw);
};

const loadJsonConfig = async (configPath: string): Promise<FlexibleRecord> => {
  const text = await fs.readFile(configPath, "utf8");
  return JSON.parse(text) as FlexibleRecord;
};

const writeJsonConfig = async (
  outputPath: string,
  payload: FlexibleRecord,
): Promise<void> => {
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
};

const adapterHelp = (): string => {
  return listAdapters()
    .map((adapter) => {
      const lines = [
        `- ${adapter.name}: ${adapter.description}`,
        `  account strategy: ${adapter.accountStrategy}`,
      ];
      for (const note of adapter.notes) {
        lines.push(`  note: ${note}`);
      }
      return lines.join("\n");
    })
    .join("\n");
};

export const runCliFromArgv = async (argv = process.argv): Promise<number> => {
  const args = parseArgs(argv);

  if (
    args.help === true ||
    args.command === undefined ||
    args.command === "help" ||
    args.command === "--help" ||
    args.command === "-h"
  ) {
    process.stdout.write(`${usage}\nBuilt-in adapters:\n${adapterHelp()}\n`);
    return 0;
  }

  if (args.command === "list-adapters") {
    process.stdout.write(`${adapterHelp()}\n`);
    return 0;
  }

  const mode = normalizeMode(args.command, args.mode);
  const adapter = getAdapter(args.adapter);

  if (args.command === "print-example" || args.command === "write-example") {
    if (mode === undefined) {
      throw new Error(`${args.command} requires --mode single|dual`);
    }
    const example = adapter.createExampleConfig({ mode });
    if (args.command === "write-example") {
      if (args.outputPath === undefined) {
        throw new Error("write-example requires --output PATH");
      }
      await writeJsonConfig(args.outputPath, example);
      process.stdout.write(
        `wrote ${args.outputPath} using adapter ${adapter.name} (${mode})\n`,
      );
      return 0;
    }
    process.stdout.write(`${JSON.stringify(example, null, 2)}\n`);
    return 0;
  }

  if (mode === undefined) {
    throw new Error("validate requires --mode single|dual");
  }
  if (args.configPath === undefined) {
    throw new Error("--config is required");
  }

  const raw = await loadJsonConfig(args.configPath);
  const config = normalizeConfig({ mode, adapter: adapter.name, raw });
  if (args.command === "run-single" || args.command === "run-dual") {
    config.progress = args.jsonOnly !== true;
  }

  if (args.command === "validate") {
    process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
    return 0;
  }

  if (args.command === "run-single") {
    const { runSingleFromConfig } = await import("./browser/run-single.js");
    const summary = await runSingleFromConfig(config as SingleRunConfig);
    return summary.ok === true ? 0 : 1;
  }

  if (args.command === "run-dual") {
    const { runDualFromConfig } = await import("./browser/run-dual.js");
    const summary = await runDualFromConfig(config as DualRunConfig);
    return summary.ok === true ? 0 : 1;
  }

  throw new Error(`unsupported command: ${args.command}`);
};
