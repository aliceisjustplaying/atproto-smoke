import type { SingleActions, SingleActionsOptions } from "./browser-types.js";
import { createSingleAuthActions } from "./single-actions/auth.js";
import { createSingleFeedActions } from "./single-actions/feed.js";
import { createSingleProfileActions } from "./single-actions/profile.js";

export const createSingleActions = (
  options: SingleActionsOptions,
): SingleActions => {
  return {
    ...createSingleAuthActions(options),
    ...createSingleFeedActions(options),
    ...createSingleProfileActions(options),
  };
};
