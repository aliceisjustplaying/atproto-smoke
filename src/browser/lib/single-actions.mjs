import { createSingleAuthActions } from './single-actions/auth.mjs';
import { createSingleFeedActions } from './single-actions/feed.mjs';
import { createSingleProfileActions } from './single-actions/profile.mjs';

export const createSingleActions = (options) => {
  return {
    ...createSingleAuthActions(options),
    ...createSingleFeedActions(options),
    ...createSingleProfileActions(options),
  };
};
