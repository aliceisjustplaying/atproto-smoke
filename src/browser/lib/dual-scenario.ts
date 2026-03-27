import {
  runDualCleanupPhase,
  runDualPrimaryWavePhase,
  runDualSecondaryWaveAndSettingsPhase,
  runDualSetupPhase,
} from "./dual-scenario/phases.js";

export const runDualScenario = async (ctx) => {
  await runDualSetupPhase(ctx);
  await runDualPrimaryWavePhase(ctx);
  await runDualSecondaryWaveAndSettingsPhase(ctx);
  await runDualCleanupPhase(ctx);
};
