import type { SingleScenarioContext } from "../browser-types.js";

export const runSingleBootstrapPhase = async (
  ctx: SingleScenarioContext,
): Promise<void> => {
  const {
    step,
    config,
    login,
    completeAgeAssuranceIfNeeded,
    composePost,
    verifyPublicHandleResolution,
    verifyPublicProfile,
    verifyPublicAuthorFeed,
    gotoProfile,
    waitForProfileHandle,
    page,
    findRowByPrimaryText,
    ensureLiked,
    ensureReposted,
    clickQuote,
    clickReply,
    ensureNotLiked,
    ensureNotReposted,
  } = ctx;
  const postText =
    typeof config.postText === "string" ? config.postText : "unknown post";

  await step("login", login);
  await step("age-assurance", completeAgeAssuranceIfNeeded, { optional: true });
  await step("compose-own-post", () => composePost(postText));
  if (config.publicChecks) {
    await step("public-resolve-handle", verifyPublicHandleResolution);
    await step("public-profile", verifyPublicProfile);
    await step("public-author-feed", verifyPublicAuthorFeed);
  }
  await step("own-profile", () => gotoProfile(config.handle));

  const ownPost = await step("find-own-post", async () => {
    const started = Date.now();
    let lastError: Error | undefined;
    while (Date.now() - started < 60000) {
      try {
        await gotoProfile(config.handle);
        await waitForProfileHandle(config.handle, 15000);
        await page
          .getByTestId("postsFeed")
          .first()
          .waitFor({ state: "visible", timeout: 15000 });
        const row = await findRowByPrimaryText(postText, 15000);
        const rowTestId = await row.getAttribute("data-testid");
        return { note: "found own post", rowFound: true, rowTestId };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      await page
        .reload({ waitUntil: "domcontentloaded", timeout: 60000 })
        .catch(() => undefined);
      await page.waitForTimeout(3000);
    }

    throw (
      lastError ??
      new Error(`feed item with primary text not found: ${postText}`)
    );
  });

  if (!ownPost) {
    return;
  }

  const row = await findRowByPrimaryText(postText);
  await step("like-own-post", () => ensureLiked(row), { optional: true });
  await step("repost-own-post", () => ensureReposted(row), { optional: true });
  await step("quote-own-post", () => clickQuote(row, config.quoteText), {
    optional: true,
  });
  await step(
    "reply-own-post",
    async () => {
      await gotoProfile(config.handle);
      const refreshed = await findRowByPrimaryText(postText, 60000);
      await clickReply(refreshed, config.replyText);
    },
    { optional: true },
  );
  await step(
    "unlike-own-post",
    async () => {
      await gotoProfile(config.handle);
      const refreshed = await findRowByPrimaryText(postText, 60000);
      return await ensureNotLiked(refreshed);
    },
    { optional: true },
  );
  await step(
    "undo-repost-own-post",
    async () => {
      await gotoProfile(config.handle);
      const refreshed = await findRowByPrimaryText(postText, 60000);
      return await ensureNotReposted(refreshed);
    },
    { optional: true },
  );
};

export const runSingleTargetInteractionPhase = async (
  ctx: SingleScenarioContext,
): Promise<void> => {
  const {
    step,
    config,
    gotoProfile,
    maybeFollowTarget,
    findFirstFeedItem,
    ensureBookmarked,
    openSavedPosts,
    page,
    ensureLiked,
    ensureReposted,
    clickQuote,
    clickReply,
    ensureNotLiked,
    ensureNotReposted,
    ensureNotBookmarked,
    maybeUnfollowTarget,
    openNotifications,
  } = ctx;
  const targetShortHandle = config.targetHandle.replace(/^@/, "");
  const targetHandle =
    typeof config.targetHandle === "string"
      ? config.targetHandle
      : "unknown target";
  const quoteText =
    typeof config.quoteText === "string" ? config.quoteText : "quote";
  const replyText =
    typeof config.replyText === "string" ? config.replyText : "reply";

  await step("target-profile", async () => {
    await gotoProfile(targetHandle);
  });
  await step("follow-target", maybeFollowTarget, { optional: true });

  await step(
    "inspect-target-post",
    async () => {
      const row = await findFirstFeedItem(20000);
      const preview = ((await row.textContent()) ?? "")
        .replace(/\s+/g, " ")
        .slice(0, 160);
      return { note: preview };
    },
    { optional: true },
  );

  await step(
    "bookmark-target-post",
    async () => {
      const row = await findFirstFeedItem(20000);
      return await ensureBookmarked(row);
    },
    { optional: true },
  );

  await step(
    "saved-posts-page",
    async () => {
      await openSavedPosts();
      const handleText = page.getByText(`@${targetShortHandle}`).first();
      await handleText.waitFor({ state: "visible", timeout: 20000 });
      return { note: `saved post by ${targetHandle}` };
    },
    { optional: true },
  );

  await step(
    "like-target-post",
    async () => {
      await gotoProfile(targetHandle);
      const row = await findFirstFeedItem(20000);
      return await ensureLiked(row);
    },
    { optional: true },
  );

  await step(
    "repost-target-post",
    async () => {
      await gotoProfile(targetHandle);
      const row = await findFirstFeedItem(20000);
      return await ensureReposted(row);
    },
    { optional: true },
  );

  await step(
    "quote-target-post",
    async () => {
      await gotoProfile(targetHandle);
      const row = await findFirstFeedItem(20000);
      await clickQuote(row, `${quoteText} to @${targetShortHandle}`);
      return { note: "quoted target post" };
    },
    { optional: true },
  );

  await step(
    "reply-target-post",
    async () => {
      await gotoProfile(targetHandle);
      const row = await findFirstFeedItem(20000);
      await clickReply(row, `${replyText} to @${targetShortHandle}`);
      return { note: "replied to target post" };
    },
    { optional: true },
  );

  await step(
    "unlike-target-post",
    async () => {
      await gotoProfile(targetHandle);
      const row = await findFirstFeedItem(20000);
      return await ensureNotLiked(row);
    },
    { optional: true },
  );

  await step(
    "undo-repost-target-post",
    async () => {
      await gotoProfile(targetHandle);
      const row = await findFirstFeedItem(20000);
      return await ensureNotReposted(row);
    },
    { optional: true },
  );

  await step(
    "unbookmark-target-post",
    async () => {
      await gotoProfile(targetHandle);
      const row = await findFirstFeedItem(20000);
      return await ensureNotBookmarked(row);
    },
    { optional: true },
  );

  await step(
    "unfollow-target",
    async () => {
      await gotoProfile(targetHandle);
      return await maybeUnfollowTarget();
    },
    { optional: true },
  );

  await step(
    "refollow-target",
    async () => {
      await gotoProfile(targetHandle);
      return await maybeFollowTarget();
    },
    { optional: true },
  );

  await step(
    "notifications-page",
    async () => {
      await openNotifications();
      const tab = page.getByRole("tab", { name: /all|priority/i }).first();
      if (await tab.count()) {
        await tab.waitFor({ state: "visible", timeout: 15000 });
      }
      return { note: "notifications page loaded" };
    },
    { optional: true },
  );
};

export const runSingleProfilePhase = async (
  ctx: SingleScenarioContext,
): Promise<void> => {
  const {
    step,
    config,
    gotoProfile,
    editProfile,
    verifyLocalProfileAfterEdit,
    verifyPublicProfileAfterEdit,
  } = ctx;

  if (!config.editProfile) {
    return;
  }

  await step("edit-profile", async () => {
    await gotoProfile(config.handle);
    await editProfile();
  });
  await step("local-profile-after-edit", verifyLocalProfileAfterEdit);
  if (config.publicChecks) {
    await step("public-profile-after-edit", verifyPublicProfileAfterEdit);
  }
};

export const runSingleCleanupPhase = async (
  ctx: SingleScenarioContext,
): Promise<void> => {
  const {
    step,
    config,
    gotoProfile,
    openProfileTab,
    maybeDeleteOwnPostByText,
  } = ctx;
  const targetShortHandle = config.targetHandle.replace(/^@/, "");
  const quoteText =
    typeof config.quoteText === "string" ? config.quoteText : "quote";
  const replyText =
    typeof config.replyText === "string" ? config.replyText : "reply";

  await step(
    "cleanup-own-posts-tab",
    async () => {
      await gotoProfile(config.handle);
      await openProfileTab("Posts");
      return { note: "opened own posts tab for cleanup" };
    },
    { optional: true },
  );

  await step("delete-own-target-quote", () => {
    return maybeDeleteOwnPostByText(
      `${quoteText} to @${targetShortHandle}`,
      "deleted target quote post",
    );
  });

  await step("delete-own-quote-post", () => {
    return maybeDeleteOwnPostByText(config.quoteText, "deleted own quote post");
  });

  await step("delete-own-root-post", () => {
    return maybeDeleteOwnPostByText(config.postText, "deleted root smoke post");
  });

  await step(
    "cleanup-own-replies-tab",
    async () => {
      await gotoProfile(config.handle);
      await openProfileTab("Replies");
      return { note: "opened own replies tab for cleanup" };
    },
    { optional: true },
  );

  await step("delete-own-target-reply", () => {
    return maybeDeleteOwnPostByText(
      `${replyText} to @${targetShortHandle}`,
      "deleted target reply post",
    );
  });

  await step("delete-own-reply-post", () => {
    return maybeDeleteOwnPostByText(config.replyText, "deleted own reply post");
  });
};
