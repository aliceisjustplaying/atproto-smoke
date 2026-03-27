import type { DualActions, DualActionsOptions } from "./browser-types.js";
import { createDualFeedActions } from "./dual-actions/feed.js";
import { createDualModerationActions } from "./dual-actions/moderation.js";
import { createDualProfileActions } from "./dual-actions/profile.js";

export const createDualActions = (options: DualActionsOptions): DualActions => {
  return {
    ...createDualProfileActions(options),
    ...createDualFeedActions(options),
    ...createDualModerationActions(options),
  };
};
