const remoteReplyHandleFromUrl = (postUrl) => {
  const match = postUrl?.match(/\/profile\/([^/]+)\/post\//);
  return match ? decodeURIComponent(match[1]) : undefined;
};

export const runDualSetupPhase = async (ctx) => {
  const {
    config,
    step,
    primaryPage,
    secondaryPage,
    primary,
    secondary,
    login,
    completeAgeAssuranceIfNeeded,
    createSession,
    cleanupStaleSmokeArtifacts,
    composePost,
    waitForOwnPostRecord,
    gotoProfile,
    waitForProfileHandle,
    findRowByPrimaryText,
    composePostWithImage,
    editProfile,
    verifyLocalProfileAfterEdit,
    verifyPublicProfileAfterEdit,
    readProfileCountsAfterReload,
    createList,
    waitForOwnListRecord,
    recordRkey,
    openListPage,
    editCurrentList,
    addUserToCurrentList,
    waitForOwnListItemRecord,
    removeUserFromCurrentList,
    waitForNoOwnRecord,
    deleteCurrentList,
    maybeUnfollow,
  } = ctx;

  await step("primary-login", () => login(primaryPage, primary), {
    pageNames: ["primary"],
  });
  await step(
    "primary-age-assurance",
    () => completeAgeAssuranceIfNeeded(primaryPage, primary),
    {
      optional: true,
      pageNames: ["primary"],
    },
  );
  await step("secondary-login", () => login(secondaryPage, secondary), {
    pageNames: ["secondary"],
  });
  await step(
    "secondary-age-assurance",
    () => completeAgeAssuranceIfNeeded(secondaryPage, secondary),
    {
      optional: true,
      pageNames: ["secondary"],
    },
  );

  primary.session = await createSession(primary);
  primary.accessJwt = primary.session.accessJwt;
  primary.did = primary.session.did;
  secondary.session = await createSession(secondary);
  secondary.accessJwt = secondary.session.accessJwt;
  secondary.did = secondary.session.did;

  await step("primary-preclean-stale-artifacts", () =>
    cleanupStaleSmokeArtifacts(primary),
  );
  await step("secondary-preclean-stale-artifacts", () =>
    cleanupStaleSmokeArtifacts(secondary),
  );

  await step(
    "primary-preclean-reset-follow-secondary",
    async () => {
      await gotoProfile(primaryPage, secondary.handle);
      await waitForProfileHandle(primaryPage, secondary.handle);
      return maybeUnfollow(primaryPage);
    },
    { optional: true, pageNames: ["primary"] },
  );

  await step(
    "secondary-preclean-reset-follow-primary",
    async () => {
      await gotoProfile(secondaryPage, primary.handle);
      await waitForProfileHandle(secondaryPage, primary.handle);
      return maybeUnfollow(secondaryPage);
    },
    { optional: true, pageNames: ["secondary"] },
  );

  await step(
    "primary-compose-root-post",
    () => composePost(primaryPage, primary.postText),
    {
      pageNames: ["primary"],
    },
  );

  primary.rootPost = await waitForOwnPostRecord(primary, primary.postText);

  await step(
    "primary-own-profile",
    async () => {
      await gotoProfile(primaryPage, primary.handle);
      await waitForProfileHandle(primaryPage, primary.handle);
      const row = await findRowByPrimaryText(
        primaryPage,
        primary.postText,
        60000,
      );
      const rowTestId = await row.getAttribute("data-testid");
      return { rowTestId };
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-own-profile-reload",
    async () => {
      await gotoProfile(primaryPage, primary.handle);
      await primaryPage.reload({
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await waitForProfileHandle(primaryPage, primary.handle);
      const row = await findRowByPrimaryText(
        primaryPage,
        primary.postText,
        60000,
      );
      const rowTestId = await row.getAttribute("data-testid");
      return { rowTestId };
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-compose-image-post",
    () => composePostWithImage(primaryPage, primary.mediaPostText),
    {
      pageNames: ["primary"],
    },
  );

  await step("primary-image-post-record", async () => {
    primary.imagePost = await waitForOwnPostRecord(
      primary,
      primary.mediaPostText,
    );
    const embed = primary.imagePost.value?.embed;
    if (
      embed?.$type !== "app.bsky.embed.images" ||
      !Array.isArray(embed.images) ||
      embed.images.length < 1
    ) {
      throw new Error(
        "image post did not persist an app.bsky.embed.images record",
      );
    }
    return {
      uri: primary.imagePost.uri,
      imageCount: embed.images.length,
      mimeType: embed.images[0]?.image?.mimeType,
    };
  });

  await step(
    "secondary-compose-root-post",
    () => composePost(secondaryPage, secondary.postText),
    {
      pageNames: ["secondary"],
    },
  );

  secondary.rootPost = await waitForOwnPostRecord(
    secondary,
    secondary.postText,
  );

  await step(
    "secondary-own-profile",
    async () => {
      await gotoProfile(secondaryPage, secondary.handle);
      await waitForProfileHandle(secondaryPage, secondary.handle);
      const row = await findRowByPrimaryText(
        secondaryPage,
        secondary.postText,
        60000,
      );
      const rowTestId = await row.getAttribute("data-testid");
      return { rowTestId };
    },
    { pageNames: ["secondary"] },
  );

  await step(
    "secondary-own-profile-reload",
    async () => {
      await gotoProfile(secondaryPage, secondary.handle);
      await secondaryPage.reload({
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await waitForProfileHandle(secondaryPage, secondary.handle);
      const row = await findRowByPrimaryText(
        secondaryPage,
        secondary.postText,
        60000,
      );
      const rowTestId = await row.getAttribute("data-testid");
      return { rowTestId };
    },
    { pageNames: ["secondary"] },
  );

  await step("primary-edit-profile", () => editProfile(primaryPage, primary), {
    pageNames: ["primary"],
  });

  await step("primary-local-profile-after-edit", () =>
    verifyLocalProfileAfterEdit(primary),
  );
  await step(
    "primary-public-profile-after-edit",
    () => verifyPublicProfileAfterEdit(primary),
    {
      timeoutMs: Math.max(
        Number(config.publicCheckTimeoutMs || 180000) + 15000,
        195000,
      ),
    },
  );

  await step(
    "secondary-edit-profile",
    () => editProfile(secondaryPage, secondary),
    {
      pageNames: ["secondary"],
    },
  );

  await step("secondary-local-profile-after-edit", () =>
    verifyLocalProfileAfterEdit(secondary),
  );
  await step(
    "secondary-public-profile-after-edit",
    () => verifyPublicProfileAfterEdit(secondary),
    {
      timeoutMs: Math.max(
        Number(config.publicCheckTimeoutMs || 180000) + 15000,
        195000,
      ),
    },
  );

  await step(
    "primary-baseline-profile-counts",
    async () => {
      primary.baselineCounts = await readProfileCountsAfterReload(
        primaryPage,
        primary,
        primary.handle,
      );
      return primary.baselineCounts;
    },
    { pageNames: ["primary"] },
  );

  await step(
    "secondary-baseline-profile-counts",
    async () => {
      secondary.baselineCounts = await readProfileCountsAfterReload(
        secondaryPage,
        secondary,
        secondary.handle,
      );
      return secondary.baselineCounts;
    },
    { pageNames: ["secondary"] },
  );

  await step(
    "primary-create-list",
    () => {
      return createList(primaryPage, primary.listName, primary.listDescription);
    },
    { pageNames: ["primary"] },
  );

  await step("primary-list-record", async () => {
    primary.listRecord = await waitForOwnListRecord(primary, primary.listName);
    primary.listRkey = recordRkey(primary.listRecord);
    if (primary.listRecord.value?.description !== primary.listDescription) {
      throw new Error("list record description did not match after create");
    }
    return {
      uri: primary.listRecord.uri,
      rkey: primary.listRkey,
      description: primary.listRecord.value?.description,
    };
  });

  await step(
    "primary-edit-list",
    async () => {
      await openListPage(primaryPage, primary.handle, primary.listRkey);
      return editCurrentList(
        primaryPage,
        primary.listUpdatedName,
        primary.listUpdatedDescription,
      );
    },
    { pageNames: ["primary"] },
  );

  await step("primary-list-record-after-edit", async () => {
    primary.listRecord = await waitForOwnListRecord(
      primary,
      primary.listUpdatedName,
    );
    primary.listRkey = recordRkey(primary.listRecord);
    if (
      primary.listRecord.value?.description !== primary.listUpdatedDescription
    ) {
      throw new Error("list record description did not match after edit");
    }
    return {
      uri: primary.listRecord.uri,
      rkey: primary.listRkey,
      description: primary.listRecord.value?.description,
    };
  });

  await step(
    "primary-list-add-secondary-member",
    async () => {
      await openListPage(primaryPage, primary.handle, primary.listRkey);
      return addUserToCurrentList(primaryPage, secondary.handle);
    },
    { pageNames: ["primary"] },
  );

  await step("primary-list-member-record", async () => {
    primary.listItemRecord = await waitForOwnListItemRecord(
      primary,
      primary.listRecord.uri,
      secondary.did,
    );
    return {
      uri: primary.listItemRecord.uri,
      rkey: recordRkey(primary.listItemRecord),
    };
  });

  await step(
    "primary-list-remove-secondary-member",
    async () => {
      await openListPage(primaryPage, primary.handle, primary.listRkey);
      return removeUserFromCurrentList(primaryPage, secondary.handle);
    },
    { pageNames: ["primary"] },
  );

  await step("primary-list-member-record-removed", async () => {
    await waitForNoOwnRecord(
      primary,
      "app.bsky.graph.listitem",
      (record) =>
        record?.value?.list === primary.listRecord.uri &&
        record?.value?.subject === secondary.did,
    );
    return { listUri: primary.listRecord.uri, subject: secondary.did };
  });

  await step(
    "primary-delete-list",
    async () => {
      await openListPage(primaryPage, primary.handle, primary.listRkey);
      return deleteCurrentList(primaryPage);
    },
    { pageNames: ["primary"] },
  );

  await step("primary-list-record-removed", async () => {
    await waitForNoOwnRecord(
      primary,
      "app.bsky.graph.list",
      (record) => recordRkey(record) === primary.listRkey,
    );
    return { rkey: primary.listRkey };
  });
};

export const runDualPrimaryWavePhase = async (ctx) => {
  const {
    config,
    step,
    primaryPage,
    secondaryPage,
    primary,
    secondary,
    gotoProfile,
    waitForProfileHandle,
    maybeUnfollow,
    maybeFollow,
    waitForFollowRecord,
    verifyProfileCountsAfterReload,
    findRowByPrimaryText,
    ensureLiked,
    ensureBookmarked,
    openSavedPosts,
    ensureReposted,
    clickQuote,
    clickReply,
    waitForOwnPostRecord,
    pollNotifications,
    openNotifications,
    waitForNotificationsFeed,
  } = ctx;

  const primaryWaveStarted = Date.now() - 1000;
  await step(
    "primary-open-secondary-profile",
    async () => {
      await gotoProfile(primaryPage, secondary.handle);
      await waitForProfileHandle(primaryPage, secondary.handle);
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-reset-follow-secondary",
    () => maybeUnfollow(primaryPage),
    {
      optional: true,
      pageNames: ["primary"],
    },
  );

  await step("primary-follow-secondary", () => maybeFollow(primaryPage), {
    pageNames: ["primary"],
  });

  await step("primary-follow-secondary-record", async () => {
    const record = await waitForFollowRecord(primary, secondary.did);
    return { uri: record.uri };
  });

  await step(
    "primary-own-profile-counts-after-follow",
    () => {
      return verifyProfileCountsAfterReload(
        primaryPage,
        primary,
        primary.handle,
        {
          followsCount: (primary.baselineCounts?.api?.followsCount ?? 0) + 1,
        },
      );
    },
    { pageNames: ["primary"] },
  );

  await step(
    "secondary-own-profile-counts-after-being-followed",
    () => {
      return verifyProfileCountsAfterReload(
        secondaryPage,
        secondary,
        secondary.handle,
        {
          followersCount:
            (secondary.baselineCounts?.api?.followersCount ?? 0) + 1,
        },
      );
    },
    { pageNames: ["secondary"] },
  );

  await step(
    "primary-like-secondary-post",
    async () => {
      await gotoProfile(primaryPage, secondary.handle);
      const row = await findRowByPrimaryText(
        primaryPage,
        secondary.postText,
        60000,
      );
      return ensureLiked(primaryPage, row);
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-bookmark-secondary-post",
    async () => {
      await gotoProfile(primaryPage, secondary.handle);
      const row = await findRowByPrimaryText(
        primaryPage,
        secondary.postText,
        60000,
      );
      return ensureBookmarked(primaryPage, row);
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-saved-posts-secondary",
    async () => {
      await openSavedPosts(primaryPage);
      await primaryPage
        .getByText(`@${secondary.handle.replace(/^@/, "")}`)
        .first()
        .waitFor({
          state: "visible",
          timeout: 20000,
        });
      return { note: `saved post by ${secondary.handle}` };
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-repost-secondary-post",
    async () => {
      await gotoProfile(primaryPage, secondary.handle);
      const row = await findRowByPrimaryText(
        primaryPage,
        secondary.postText,
        60000,
      );
      return ensureReposted(primaryPage, row);
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-quote-secondary-post",
    async () => {
      await gotoProfile(primaryPage, secondary.handle);
      const row = await findRowByPrimaryText(
        primaryPage,
        secondary.postText,
        60000,
      );
      await clickQuote(primaryPage, row, primary.quoteText);
      primary.quotePost = await waitForOwnPostRecord(
        primary,
        primary.quoteText,
      );
      return { quoteText: primary.quoteText, uri: primary.quotePost.uri };
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-reply-secondary-post",
    async () => {
      await gotoProfile(primaryPage, secondary.handle);
      const row = await findRowByPrimaryText(
        primaryPage,
        secondary.postText,
        60000,
      );
      await clickReply(primaryPage, row, primary.replyText);
      primary.replyPost = await waitForOwnPostRecord(
        primary,
        primary.replyText,
      );
      return { replyText: primary.replyText, uri: primary.replyPost.uri };
    },
    { pageNames: ["primary"] },
  );

  if (config.remoteReplyPostUrl) {
    const remoteReplyText = `${primary.replyText} remote`;
    const remoteReplyHandle = remoteReplyHandleFromUrl(
      config.remoteReplyPostUrl,
    );

    if (remoteReplyHandle) {
      await step(
        "primary-prepare-configured-remote-reply-target",
        async () => {
          await gotoProfile(primaryPage, remoteReplyHandle);
          await waitForProfileHandle(primaryPage, remoteReplyHandle);
          const wasFollowing =
            (await primaryPage.getByTestId("unfollowBtn").first().count()) > 0;
          primary.remoteReplyWasFollowingTarget = wasFollowing;
          if (!wasFollowing) {
            await maybeFollow(primaryPage);
          }
          return {
            remoteReplyHandle,
            wasFollowing,
            nowFollowing:
              (await primaryPage.getByTestId("unfollowBtn").first().count()) >
              0,
          };
        },
        { pageNames: ["primary"] },
      );
    }

    await step(
      "primary-reply-configured-remote-post",
      async () => {
        await primaryPage.goto(config.remoteReplyPostUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
        await primaryPage.getByTestId("replyBtn").first().waitFor({
          state: "visible",
          timeout: 20000,
        });
        await clickReply(primaryPage, primaryPage, remoteReplyText);
        primary.remoteReplyPost = await waitForOwnPostRecord(
          primary,
          remoteReplyText,
        );
        return {
          replyText: remoteReplyText,
          uri: primary.remoteReplyPost.uri,
          remoteReplyPostUrl: config.remoteReplyPostUrl,
          remoteReplyHandle,
        };
      },
      { pageNames: ["primary"] },
    );
  }

  await step("secondary-notification-api-primary-engagement-wave", async () => {
    const result = await pollNotifications({
      account: secondary,
      authorHandle: primary.handle,
      reasons: ["like", "repost", "quote", "reply"],
      minIndexedAt: primaryWaveStarted,
    });
    return {
      reasons: result.notifications.map((item) => item.reason),
      sample: result.allNotifications.slice(0, 5),
    };
  });

  await step(
    "secondary-notifications-page",
    async () => {
      await openNotifications(secondaryPage);
      const feed = await waitForNotificationsFeed(secondaryPage);
      return {
        note: feed
          ? "notifications feed visible"
          : "notifications page visible without explicit feed testid",
      };
    },
    { pageNames: ["secondary"] },
  );
};

export const runDualSecondaryWaveAndSettingsPhase = async (ctx) => {
  const {
    step,
    primaryPage,
    secondaryPage,
    primary,
    secondary,
    gotoProfile,
    waitForProfileHandle,
    maybeUnfollow,
    maybeFollow,
    waitForFollowRecord,
    verifyProfileCountsAfterReload,
    pollNotifications,
    openNotifications,
    waitForNotificationsFeed,
    ensureProfileMuted,
    ensureProfileUnmuted,
    findRowByPrimaryText,
    openReportPostDraft,
    blockProfile,
    unblockProfile,
    setRadioSetting,
    setCheckboxSetting,
  } = ctx;

  const secondaryWaveStarted = Date.now() - 1000;
  await step(
    "secondary-open-primary-profile",
    async () => {
      await gotoProfile(secondaryPage, primary.handle);
      await waitForProfileHandle(secondaryPage, primary.handle);
    },
    { pageNames: ["secondary"] },
  );

  await step(
    "secondary-reset-follow-primary",
    () => maybeUnfollow(secondaryPage),
    {
      optional: true,
      pageNames: ["secondary"],
    },
  );

  await step("secondary-follow-primary", () => maybeFollow(secondaryPage), {
    pageNames: ["secondary"],
  });

  await step("secondary-follow-primary-record", async () => {
    const record = await waitForFollowRecord(secondary, primary.did);
    return { uri: record.uri };
  });

  await step(
    "secondary-own-profile-counts-after-follow",
    () => {
      return verifyProfileCountsAfterReload(
        secondaryPage,
        secondary,
        secondary.handle,
        {
          followersCount:
            (secondary.baselineCounts?.api?.followersCount ?? 0) + 1,
          followsCount: (secondary.baselineCounts?.api?.followsCount ?? 0) + 1,
        },
      );
    },
    { pageNames: ["secondary"] },
  );

  await step(
    "primary-own-profile-counts-after-being-followed",
    () => {
      return verifyProfileCountsAfterReload(
        primaryPage,
        primary,
        primary.handle,
        {
          followersCount:
            (primary.baselineCounts?.api?.followersCount ?? 0) + 1,
          followsCount: (primary.baselineCounts?.api?.followsCount ?? 0) + 1,
        },
      );
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-notification-api-secondary-follow",
    async () => {
      const result = await pollNotifications({
        account: primary,
        authorHandle: secondary.handle,
        reasons: ["follow"],
        minIndexedAt: secondaryWaveStarted,
        timeoutMs: 30000,
      });
      return {
        reasons: result.notifications.map((item) => item.reason),
        sample: result.allNotifications.slice(0, 5),
      };
    },
    { optional: true },
  );

  await step(
    "primary-notifications-page",
    async () => {
      await openNotifications(primaryPage);
      const feed = await waitForNotificationsFeed(primaryPage);
      return {
        note: feed
          ? "notifications feed visible"
          : "notifications page visible without explicit feed testid",
      };
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-mute-secondary",
    async () => {
      await gotoProfile(primaryPage, secondary.handle);
      return ensureProfileMuted(primaryPage);
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-unmute-secondary",
    async () => {
      await gotoProfile(primaryPage, secondary.handle);
      return ensureProfileUnmuted(primaryPage);
    },
    { pageNames: ["primary"] },
  );

  await step(
    "secondary-report-primary-post-draft",
    async () => {
      await gotoProfile(secondaryPage, primary.handle);
      const row = await findRowByPrimaryText(
        secondaryPage,
        primary.postText,
        60000,
      );
      return openReportPostDraft(secondaryPage, row);
    },
    { pageNames: ["secondary"] },
  );

  await step(
    "secondary-block-primary",
    async () => {
      await gotoProfile(secondaryPage, primary.handle);
      return blockProfile(secondaryPage);
    },
    { pageNames: ["secondary"] },
  );

  await step(
    "secondary-unblock-primary",
    () => {
      return unblockProfile(secondaryPage);
    },
    { pageNames: ["secondary"] },
  );

  await step(
    "primary-settings-likes-people-i-follow",
    () => {
      return setRadioSetting(
        primaryPage,
        "/settings/notifications/likes",
        "People I follow",
      );
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-settings-likes-everyone",
    () => {
      return setRadioSetting(
        primaryPage,
        "/settings/notifications/likes",
        "Everyone",
      );
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-settings-threads-oldest",
    () => {
      return setRadioSetting(
        primaryPage,
        "/settings/threads",
        "Oldest replies first",
      );
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-settings-threads-tree-view-on",
    () => {
      return setCheckboxSetting(
        primaryPage,
        "/settings/threads",
        "Tree view",
        true,
      );
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-settings-threads-tree-view-off",
    () => {
      return setCheckboxSetting(
        primaryPage,
        "/settings/threads",
        "Tree view",
        false,
      );
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-settings-threads-top-replies",
    () => {
      return setRadioSetting(
        primaryPage,
        "/settings/threads",
        "Top replies first",
      );
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-settings-following-feed-hide-replies",
    () => {
      return setCheckboxSetting(
        primaryPage,
        "/settings/following-feed",
        "Show replies",
        false,
      );
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-settings-following-feed-show-replies",
    () => {
      return setCheckboxSetting(
        primaryPage,
        "/settings/following-feed",
        "Show replies",
        true,
      );
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-settings-autoplay-off",
    () => {
      return setCheckboxSetting(
        primaryPage,
        "/settings/content-and-media",
        "Autoplay videos and GIFs",
        false,
      );
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-settings-autoplay-on",
    () => {
      return setCheckboxSetting(
        primaryPage,
        "/settings/content-and-media",
        "Autoplay videos and GIFs",
        true,
      );
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-settings-accessibility-require-alt-on",
    () => {
      return setCheckboxSetting(
        primaryPage,
        "/settings/accessibility",
        "Require alt text before posting",
        true,
      );
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-settings-accessibility-require-alt-off",
    () => {
      return setCheckboxSetting(
        primaryPage,
        "/settings/accessibility",
        "Require alt text before posting",
        false,
      );
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-settings-accessibility-large-badges-on",
    () => {
      return setCheckboxSetting(
        primaryPage,
        "/settings/accessibility",
        "Display larger alt text badges",
        true,
      );
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-settings-accessibility-large-badges-off",
    () => {
      return setCheckboxSetting(
        primaryPage,
        "/settings/accessibility",
        "Display larger alt text badges",
        false,
      );
    },
    { pageNames: ["primary"] },
  );
};

export const runDualCleanupPhase = async (ctx) => {
  const {
    config,
    step,
    primaryPage,
    secondaryPage,
    primary,
    secondary,
    gotoProfile,
    findRowByPrimaryText,
    ensureNotLiked,
    ensureNotBookmarked,
    ensureNotReposted,
    maybeUnfollow,
    verifyProfileCountsAfterReload,
    waitForProfileHandle,
    openProfileTab,
    maybeDeleteOwnPostByText,
  } = ctx;

  await step(
    "primary-cleanup-unlike-secondary-post",
    async () => {
      await gotoProfile(primaryPage, secondary.handle);
      const row = await findRowByPrimaryText(
        primaryPage,
        secondary.postText,
        60000,
      );
      return ensureNotLiked(primaryPage, row);
    },
    { optional: true, pageNames: ["primary"] },
  );

  await step(
    "primary-cleanup-unbookmark-secondary-post",
    async () => {
      await gotoProfile(primaryPage, secondary.handle);
      const row = await findRowByPrimaryText(
        primaryPage,
        secondary.postText,
        60000,
      );
      return ensureNotBookmarked(primaryPage, row);
    },
    { optional: true, pageNames: ["primary"] },
  );

  await step(
    "primary-cleanup-undo-repost-secondary-post",
    async () => {
      await gotoProfile(primaryPage, secondary.handle);
      const row = await findRowByPrimaryText(
        primaryPage,
        secondary.postText,
        60000,
      );
      return ensureNotReposted(primaryPage, row);
    },
    { optional: true, pageNames: ["primary"] },
  );

  await step(
    "primary-cleanup-unfollow-secondary",
    async () => {
      await gotoProfile(primaryPage, secondary.handle);
      return maybeUnfollow(primaryPage);
    },
    { optional: true, pageNames: ["primary"] },
  );

  await step(
    "secondary-cleanup-unfollow-primary",
    async () => {
      await gotoProfile(secondaryPage, primary.handle);
      return maybeUnfollow(secondaryPage);
    },
    { optional: true, pageNames: ["secondary"] },
  );

  if (
    config.remoteReplyPostUrl &&
    primary.remoteReplyWasFollowingTarget === false
  ) {
    const remoteReplyHandle = remoteReplyHandleFromUrl(
      config.remoteReplyPostUrl,
    );
    if (remoteReplyHandle) {
      await step(
        "primary-cleanup-remote-reply-target-follow",
        async () => {
          await gotoProfile(primaryPage, remoteReplyHandle);
          await waitForProfileHandle(primaryPage, remoteReplyHandle);
          return maybeUnfollow(primaryPage);
        },
        { optional: true, pageNames: ["primary"] },
      );
    }
  }

  await step(
    "primary-own-profile-counts-after-unfollow-cleanup",
    () => {
      return verifyProfileCountsAfterReload(
        primaryPage,
        primary,
        primary.handle,
        {
          followersCount: primary.baselineCounts?.api?.followersCount ?? 0,
          followsCount: primary.baselineCounts?.api?.followsCount ?? 0,
        },
      );
    },
    { pageNames: ["primary"] },
  );

  await step(
    "secondary-own-profile-counts-after-unfollow-cleanup",
    () => {
      return verifyProfileCountsAfterReload(
        secondaryPage,
        secondary,
        secondary.handle,
        {
          followersCount: secondary.baselineCounts?.api?.followersCount ?? 0,
          followsCount: secondary.baselineCounts?.api?.followsCount ?? 0,
        },
      );
    },
    { pageNames: ["secondary"] },
  );

  await step(
    "primary-cleanup-delete-quote",
    async () => {
      await gotoProfile(primaryPage, primary.handle);
      await openProfileTab(primaryPage, "Posts");
      return maybeDeleteOwnPostByText(
        primaryPage,
        primary.quoteText,
        "deleted quote post",
      );
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-cleanup-delete-image-post",
    async () => {
      await gotoProfile(primaryPage, primary.handle);
      await openProfileTab(primaryPage, "Posts");
      return maybeDeleteOwnPostByText(
        primaryPage,
        primary.mediaPostText,
        "deleted image post",
      );
    },
    { pageNames: ["primary"] },
  );

  await step(
    "primary-cleanup-delete-reply",
    async () => {
      await gotoProfile(primaryPage, primary.handle);
      await openProfileTab(primaryPage, "Replies");
      return maybeDeleteOwnPostByText(
        primaryPage,
        primary.replyText,
        "deleted reply post",
      );
    },
    { optional: true, pageNames: ["primary"] },
  );

  if (config.remoteReplyPostUrl) {
    await step(
      "primary-cleanup-delete-remote-reply",
      async () => {
        await gotoProfile(primaryPage, primary.handle);
        await openProfileTab(primaryPage, "Replies");
        return maybeDeleteOwnPostByText(
          primaryPage,
          `${primary.replyText} remote`,
          "deleted remote reply post",
        );
      },
      { optional: true, pageNames: ["primary"] },
    );
  }

  await step(
    "secondary-cleanup-delete-root-post",
    async () => {
      await gotoProfile(secondaryPage, secondary.handle);
      await openProfileTab(secondaryPage, "Posts");
      return maybeDeleteOwnPostByText(
        secondaryPage,
        secondary.postText,
        "deleted root post",
      );
    },
    { pageNames: ["secondary"] },
  );

  await step(
    "primary-cleanup-delete-root-post",
    async () => {
      await gotoProfile(primaryPage, primary.handle);
      await openProfileTab(primaryPage, "Posts");
      return maybeDeleteOwnPostByText(
        primaryPage,
        primary.postText,
        "deleted root post",
      );
    },
    { optional: true, pageNames: ["primary"] },
  );
};
