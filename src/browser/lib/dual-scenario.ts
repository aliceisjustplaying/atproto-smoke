import type { DualScenarioContext } from "./browser-types.js";
import {
  runDualCleanupPhase,
  runDualPrimaryWavePhase,
  runDualSecondaryWaveAndSettingsPhase,
  runDualSetupPhase,
} from "./dual-scenario/phases.js";

export const runDualScenario = async (
  ctx: DualScenarioContext,
): Promise<void> => {
  await runDualSetupPhase(ctx);
  await runDualPrimaryWavePhase(ctx);
  await runDualSecondaryWaveAndSettingsPhase(ctx);
  await runDualCleanupPhase(ctx);
};
