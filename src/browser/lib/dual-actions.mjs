import { createDualFeedActions } from './dual-actions/feed.mjs';
import { createDualModerationActions } from './dual-actions/moderation.mjs';
import { createDualProfileActions } from './dual-actions/profile.mjs';

export const createDualActions = (options) => {
  return {
    ...createDualProfileActions(options),
    ...createDualFeedActions(options),
    ...createDualModerationActions(options),
  };
};
