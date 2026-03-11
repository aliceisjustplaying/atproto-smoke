#!/usr/bin/env node
import { runCliFromArgv } from '../src/cli.mjs';

try {
  const exitCode = await runCliFromArgv(process.argv);
  process.exitCode = exitCode;
} catch (error) {
  console.error(String(error?.message ?? error));
  process.exitCode = 1;
}
