import { createDualFeedActions } from "./dual-actions/feed.js";
import { createDualModerationActions } from "./dual-actions/moderation.js";
import { createDualProfileActions } from "./dual-actions/profile.js";

export const createDualActions = (options) => {
  return {
    ...createDualProfileActions(options),
    ...createDualFeedActions(options),
    ...createDualModerationActions(options),
  };
};
