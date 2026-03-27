import type {
  DualActions,
  DualActionsOptions,
  PageAuthActions,
  PageFeedActions,
} from "../browser-types.js";
import type { Locator, Page } from "playwright";
import { createPageAuthActions } from "../page-auth-actions.js";
import { createPageFeedActions } from "../page-feed-actions.js";
import { dismissBlockingOverlays } from "../runtime-utils.js";

export const createDualFeedActions = ({
  config,
  appBaseUrl,
  wait,
  normalizeText,
  buttonText,
}: DualActionsOptions): Pick<
  DualActions,
  | "findRowByPrimaryText"
  | "ensureLiked"
  | "ensureNotLiked"
  | "ensureReposted"
  | "ensureNotReposted"
  | "ensureBookmarked"
  | "ensureNotBookmarked"
  | "clickQuote"
  | "clickReply"
  | "maybeFollow"
  | "maybeUnfollow"
  | "openNotifications"
  | "openSavedPosts"
  | "waitForNotificationsFeed"
  | "openProfileTab"
  | "maybeDeleteOwnPostByText"
  | "openReportPostDraft"
> => {
  const authActions: PageAuthActions = createPageAuthActions({
    appUrl: config.appUrl,
    appBaseUrl,
    wait,
    loginToBlueskyApp: () => Promise.resolve({ loginPath: "unused" }),
  });
  const feedActions: PageFeedActions = createPageFeedActions({
    wait,
    normalizeText,
    buttonText,
    dismissBlockingOverlays,
  });

  const waitForNotificationsFeed = async (
    page: Page,
  ): Promise<Locator | null> => {
    const feed = page.getByTestId("notifsFeed").first();
    if (await feed.count()) {
      await feed.waitFor({ state: "visible", timeout: 15000 });
      return feed;
    }
    return null;
  };

  const openReportPostDraft = async (
    page: Page,
    row: Locator,
  ): Promise<Record<string, string | boolean>> => {
    await feedActions.openPostOptions(page, row);
    await page
      .getByRole("menuitem", { name: /report post/i })
      .click({ noWaitAfter: true });
    const dialog = page.locator('[role="dialog"]').last();
    await dialog.waitFor({ state: "visible", timeout: 10000 });
    await dialog
      .getByRole("button", { name: /create report for other/i })
      .click({ noWaitAfter: true });
    await wait(page, 1000);
    const submit = dialog
      .getByRole("button", { name: /submit report/i })
      .last();
    await submit.waitFor({ state: "visible", timeout: 10000 });
    const body = normalizeText(await dialog.textContent());
    const close = dialog
      .getByRole("button", { name: /close active dialog/i })
      .last();
    if (await close.count()) {
      await close.click({ noWaitAfter: true });
    } else {
      await page.keyboard.press("Escape").catch(() => undefined);
    }
    await wait(page, 1000);
    return {
      note: "opened report draft without submitting",
      submitVisible: true,
      body,
    };
  };

  return {
    findRowByPrimaryText: feedActions.findRowByPrimaryText,
    ensureLiked: feedActions.ensureLiked,
    ensureNotLiked: feedActions.ensureNotLiked,
    ensureReposted: feedActions.ensureReposted,
    ensureNotReposted: feedActions.ensureNotReposted,
    ensureBookmarked: feedActions.ensureBookmarked,
    ensureNotBookmarked: feedActions.ensureNotBookmarked,
    clickQuote: feedActions.clickQuote,
    clickReply: feedActions.clickReply,
    maybeFollow: authActions.maybeFollow,
    maybeUnfollow: authActions.maybeUnfollow,
    openNotifications: authActions.openNotifications,
    openSavedPosts: authActions.openSavedPosts,
    waitForNotificationsFeed,
    openProfileTab: authActions.openProfileTab,
    maybeDeleteOwnPostByText: feedActions.maybeDeleteOwnPostByText,
    openReportPostDraft,
  };
};
