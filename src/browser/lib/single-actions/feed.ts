import type {
  PageFeedActions,
  SingleActions,
  SingleActionsOptions,
} from "../browser-types.js";
import { dismissBlockingOverlays } from "../runtime-utils.js";
import { createPageFeedActions } from "../page-feed-actions.js";

export const createSingleFeedActions = ({
  page,
  wait,
  normalizeText,
  buttonText,
}: SingleActionsOptions): Pick<
  SingleActions,
  | "composePost"
  | "findRowByPrimaryText"
  | "findFirstFeedItem"
  | "clickQuote"
  | "clickReply"
  | "ensureBookmarked"
  | "ensureNotBookmarked"
  | "ensureLiked"
  | "ensureNotLiked"
  | "ensureReposted"
  | "ensureNotReposted"
  | "maybeDeleteOwnPostByText"
> => {
  const actions: PageFeedActions = createPageFeedActions({
    wait: (_page, ms) => wait(ms),
    normalizeText,
    buttonText,
    dismissBlockingOverlays,
  });

  return {
    composePost: (text: string) => actions.composePost(page, text),
    findRowByPrimaryText: (needle: string, timeout?: number) =>
      actions.findRowByPrimaryText(page, needle, timeout),
    findFirstFeedItem: (timeout?: number) =>
      actions.findFirstFeedItem(page, timeout ?? 60000),
    clickQuote: (row, text) => actions.clickQuote(page, row, text),
    clickReply: (row, text) => actions.clickReply(page, row, text),
    ensureBookmarked: (row) => actions.ensureBookmarked(page, row),
    ensureNotBookmarked: (row) => actions.ensureNotBookmarked(page, row),
    ensureLiked: (row) => actions.ensureLiked(page, row),
    ensureNotLiked: (row) => actions.ensureNotLiked(page, row),
    ensureReposted: (row) => actions.ensureReposted(page, row),
    ensureNotReposted: (row) => actions.ensureNotReposted(page, row),
    maybeDeleteOwnPostByText: (text: string, successNote: string) =>
      actions.maybeDeleteOwnPostByText(page, text, successNote),
  };
};
