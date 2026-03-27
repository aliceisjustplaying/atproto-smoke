import {
  runSingleBootstrapPhase,
  runSingleCleanupPhase,
  runSingleProfilePhase,
  runSingleTargetInteractionPhase,
} from "./single-scenario/phases.js";

export const runSingleScenario = async (ctx) => {
  await runSingleBootstrapPhase(ctx);
  await runSingleTargetInteractionPhase(ctx);
  await runSingleProfilePhase(ctx);
  await runSingleCleanupPhase(ctx);
};
