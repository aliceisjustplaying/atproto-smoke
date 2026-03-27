import { dismissBlockingOverlays } from '../runtime-utils.mjs';
import { createPageFeedActions } from '../page-feed-actions.mjs';

export const createSingleFeedActions = ({
  page,
  wait,
  normalizeText,
  buttonText,
}) => {
  const actions = createPageFeedActions({
    wait: (_page, ms) => wait(ms),
    normalizeText,
    buttonText,
    dismissBlockingOverlays,
  });

  return {
    composePost: (text) => actions.composePost(page, text),
    findRowByPrimaryText: (needle, timeout) => actions.findRowByPrimaryText(page, needle, timeout),
    findFirstFeedItem: (timeout) => actions.findFirstFeedItem(page, timeout || 60000),
    clickQuote: (row, text) => actions.clickQuote(page, row, text),
    clickReply: (row, text) => actions.clickReply(page, row, text),
    ensureBookmarked: (row) => actions.ensureBookmarked(page, row),
    ensureNotBookmarked: (row) => actions.ensureNotBookmarked(page, row),
    ensureLiked: (row) => actions.ensureLiked(page, row),
    ensureNotLiked: (row) => actions.ensureNotLiked(page, row),
    ensureReposted: (row) => actions.ensureReposted(page, row),
    ensureNotReposted: (row) => actions.ensureNotReposted(page, row),
    maybeDeleteOwnPostByText: (text, successNote) => actions.maybeDeleteOwnPostByText(page, text, successNote),
  };
};
