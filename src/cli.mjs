import fs from 'node:fs/promises';
import { getAdapter, listAdapters } from './adapters/registry.mjs';

const usage = `Usage:
  atproto-smoke run-single [--adapter bring-your-own|perlsky] --config config.json
  atproto-smoke run-dual [--adapter bring-your-own|perlsky] --config config.json
  atproto-smoke validate --mode single|dual [--adapter bring-your-own|perlsky] --config config.json
  atproto-smoke write-example --mode single|dual [--adapter bring-your-own|perlsky] --output config.json
  atproto-smoke print-example --mode single|dual [--adapter bring-your-own|perlsky]
  atproto-smoke list-adapters

Notes:
  - bring-your-own is the default adapter
  - v1 is browser-first against bsky.app
  - direct API/AppView contract layers are documented as a later v2 expansion
`;

const parseArgs = (argv) => {
  const result = {
    command: argv[2],
    adapter: 'bring-your-own',
  };

  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--config') {
      result.configPath = argv[++i];
      continue;
    }
    if (arg === '--mode') {
      result.mode = argv[++i];
      continue;
    }
    if (arg === '--adapter') {
      result.adapter = argv[++i];
      continue;
    }
    if (arg === '--output') {
      result.outputPath = argv[++i];
      continue;
    }
    if (arg === '--help' || arg === '-h' || arg === 'help') {
      result.help = true;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return result;
};

const normalizeMode = (command, mode) => {
  if (command === 'run-single') {
    return 'single';
  }
  if (command === 'run-dual') {
    return 'dual';
  }
  return mode;
};

const normalizeConfig = ({ mode, adapter, raw }) => {
  const selectedAdapter = getAdapter(adapter);
  if (mode === 'single') {
    return selectedAdapter.createSingleConfig(raw);
  }
  if (mode === 'dual') {
    return selectedAdapter.createDualConfig(raw);
  }
  throw new Error(`unsupported mode: ${mode}`);
};

const loadJsonConfig = async (configPath) => {
  const text = await fs.readFile(configPath, 'utf8');
  return JSON.parse(text);
};

const writeJsonConfig = async (outputPath, payload) => {
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const adapterHelp = () => {
  return listAdapters()
    .map((adapter) => {
      const lines = [
        `- ${adapter.name}: ${adapter.description}`,
        `  account strategy: ${adapter.accountStrategy}`,
      ];
      for (const note of adapter.notes || []) {
        lines.push(`  note: ${note}`);
      }
      return lines.join('\n');
    })
    .join('\n');
};

export const runCliFromArgv = async (argv = process.argv) => {
  const args = parseArgs(argv);

  if (
    args.help ||
    !args.command ||
    args.command === 'help' ||
    args.command === '--help' ||
    args.command === '-h'
  ) {
    console.log(`${usage}\nBuilt-in adapters:\n${adapterHelp()}`);
    return 0;
  }

  if (args.command === 'list-adapters') {
    console.log(adapterHelp());
    return 0;
  }

  const mode = normalizeMode(args.command, args.mode);
  const adapter = getAdapter(args.adapter);

  if (args.command === 'print-example' || args.command === 'write-example') {
    if (!mode) {
      throw new Error(`${args.command} requires --mode single|dual`);
    }
    const example = adapter.createExampleConfig({ mode });
    if (args.command === 'write-example') {
      if (!args.outputPath) {
        throw new Error('write-example requires --output PATH');
      }
      await writeJsonConfig(args.outputPath, example);
      console.log(`wrote ${args.outputPath} using adapter ${adapter.name} (${mode})`);
      return 0;
    }
    console.log(JSON.stringify(example, null, 2));
    return 0;
  }

  if (!mode) {
    throw new Error('validate requires --mode single|dual');
  }
  if (!args.configPath) {
    throw new Error('--config is required');
  }

  const raw = await loadJsonConfig(args.configPath);
  const config = normalizeConfig({ mode, adapter: adapter.name, raw });

  if (args.command === 'validate') {
    console.log(JSON.stringify(config, null, 2));
    return 0;
  }

  if (args.command === 'run-single') {
    const { runSingleFromConfig } = await import('./browser/run-single.mjs');
    const summary = await runSingleFromConfig(config);
    return summary.ok ? 0 : 1;
  }

  if (args.command === 'run-dual') {
    const { runDualFromConfig } = await import('./browser/run-dual.mjs');
    const summary = await runDualFromConfig(config);
    return summary.ok ? 0 : 1;
  }

  throw new Error(`unsupported command: ${args.command}`);
};
