export const runSingleBootstrapPhase = async ({
  step,
  config,
  login,
  completeAgeAssuranceIfNeeded,
  composePost,
  verifyPublicHandleResolution,
  verifyPublicProfile,
  verifyPublicAuthorFeed,
  gotoProfile,
  page,
  findRowByPrimaryText,
  ensureLiked,
  ensureReposted,
  clickQuote,
  clickReply,
  ensureNotLiked,
  ensureNotReposted,
}) => {
  await step('login', login);
  await step('age-assurance', completeAgeAssuranceIfNeeded, { optional: true });
  await step('compose-own-post', () => composePost(config.postText));
  if (config.publicChecks !== false) {
    await step('public-resolve-handle', verifyPublicHandleResolution);
    await step('public-profile', verifyPublicProfile);
    await step('public-author-feed', verifyPublicAuthorFeed);
  }
  await step('own-profile', () => gotoProfile(config.handle));

  const ownPost = await step('find-own-post', async () => {
    await gotoProfile(config.handle);
    await page.getByTestId('postsFeed').first().waitFor({ state: 'visible', timeout: 60000 });
    const row = await findRowByPrimaryText(config.postText, 60000);
    const rowTestId = await row.getAttribute('data-testid');
    return { note: 'found own post', rowFound: true, rowTestId };
  });

  if (!ownPost) {
    return;
  }

  const row = await findRowByPrimaryText(config.postText);
  await step('like-own-post', () => ensureLiked(row), { optional: true });
  await step('repost-own-post', () => ensureReposted(row), { optional: true });
  await step('quote-own-post', () => clickQuote(row, config.quoteText), { optional: true });
  await step('reply-own-post', async () => {
    await gotoProfile(config.handle);
    const refreshed = await findRowByPrimaryText(config.postText, 60000);
    await clickReply(refreshed, config.replyText);
  }, { optional: true });
  await step('unlike-own-post', async () => {
    await gotoProfile(config.handle);
    const refreshed = await findRowByPrimaryText(config.postText, 60000);
    return ensureNotLiked(refreshed);
  }, { optional: true });
  await step('undo-repost-own-post', async () => {
    await gotoProfile(config.handle);
    const refreshed = await findRowByPrimaryText(config.postText, 60000);
    return ensureNotReposted(refreshed);
  }, { optional: true });
};

export const runSingleTargetInteractionPhase = async ({
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
}) => {
  await step('target-profile', async () => {
    await gotoProfile(config.targetHandle);
  });
  await step('follow-target', maybeFollowTarget, { optional: true });

  await step('inspect-target-post', async () => {
    const row = await findFirstFeedItem(20000);
    const preview = ((await row.textContent()) || '').replace(/\s+/g, ' ').slice(0, 160);
    return { note: preview };
  }, { optional: true });

  await step('bookmark-target-post', async () => {
    const row = await findFirstFeedItem(20000);
    return ensureBookmarked(row);
  }, { optional: true });

  await step('saved-posts-page', async () => {
    await openSavedPosts();
    const handleText = page.getByText(`@${config.targetHandle.replace(/^@/, '')}`).first();
    await handleText.waitFor({ state: 'visible', timeout: 20000 });
    return { note: `saved post by ${config.targetHandle}` };
  }, { optional: true });

  await step('like-target-post', async () => {
    await gotoProfile(config.targetHandle);
    const row = await findFirstFeedItem(20000);
    return ensureLiked(row);
  }, { optional: true });

  await step('repost-target-post', async () => {
    await gotoProfile(config.targetHandle);
    const row = await findFirstFeedItem(20000);
    return ensureReposted(row);
  }, { optional: true });

  await step('quote-target-post', async () => {
    await gotoProfile(config.targetHandle);
    const row = await findFirstFeedItem(20000);
    await clickQuote(row, `${config.quoteText} to @${config.targetHandle.replace(/^@/, '')}`);
    return { note: 'quoted target post' };
  }, { optional: true });

  await step('reply-target-post', async () => {
    await gotoProfile(config.targetHandle);
    const row = await findFirstFeedItem(20000);
    await clickReply(row, `${config.replyText} to @${config.targetHandle.replace(/^@/, '')}`);
    return { note: 'replied to target post' };
  }, { optional: true });

  await step('unlike-target-post', async () => {
    await gotoProfile(config.targetHandle);
    const row = await findFirstFeedItem(20000);
    return ensureNotLiked(row);
  }, { optional: true });

  await step('undo-repost-target-post', async () => {
    await gotoProfile(config.targetHandle);
    const row = await findFirstFeedItem(20000);
    return ensureNotReposted(row);
  }, { optional: true });

  await step('unbookmark-target-post', async () => {
    await gotoProfile(config.targetHandle);
    const row = await findFirstFeedItem(20000);
    return ensureNotBookmarked(row);
  }, { optional: true });

  await step('unfollow-target', async () => {
    await gotoProfile(config.targetHandle);
    return maybeUnfollowTarget();
  }, { optional: true });

  await step('refollow-target', async () => {
    await gotoProfile(config.targetHandle);
    return maybeFollowTarget();
  }, { optional: true });

  await step('notifications-page', async () => {
    await openNotifications();
    const tab = page.getByRole('tab', { name: /all|priority/i }).first();
    if (await tab.count()) {
      await tab.waitFor({ state: 'visible', timeout: 15000 });
    }
    return { note: 'notifications page loaded' };
  }, { optional: true });
};

export const runSingleProfilePhase = async ({
  step,
  config,
  gotoProfile,
  editProfile,
  verifyLocalProfileAfterEdit,
  verifyPublicProfileAfterEdit,
}) => {
  if (!config.editProfile) {
    return;
  }

  await step('edit-profile', async () => {
    await gotoProfile(config.handle);
    await editProfile();
  });
  await step('local-profile-after-edit', verifyLocalProfileAfterEdit);
  if (config.publicChecks !== false) {
    await step('public-profile-after-edit', verifyPublicProfileAfterEdit);
  }
};

export const runSingleCleanupPhase = async ({
  step,
  config,
  gotoProfile,
  openProfileTab,
  maybeDeleteOwnPostByText,
}) => {
  await step('cleanup-own-posts-tab', async () => {
    await gotoProfile(config.handle);
    await openProfileTab('Posts');
    return { note: 'opened own posts tab for cleanup' };
  }, { optional: true });

  await step('delete-own-target-quote', async () => {
    return maybeDeleteOwnPostByText(
      `${config.quoteText} to @${config.targetHandle.replace(/^@/, '')}`,
      'deleted target quote post',
    );
  });

  await step('delete-own-quote-post', async () => {
    return maybeDeleteOwnPostByText(config.quoteText, 'deleted own quote post');
  });

  await step('delete-own-root-post', async () => {
    return maybeDeleteOwnPostByText(config.postText, 'deleted root smoke post');
  });

  await step('cleanup-own-replies-tab', async () => {
    await gotoProfile(config.handle);
    await openProfileTab('Replies');
    return { note: 'opened own replies tab for cleanup' };
  }, { optional: true });

  await step('delete-own-target-reply', async () => {
    return maybeDeleteOwnPostByText(
      `${config.replyText} to @${config.targetHandle.replace(/^@/, '')}`,
      'deleted target reply post',
    );
  });

  await step('delete-own-reply-post', async () => {
    return maybeDeleteOwnPostByText(config.replyText, 'deleted own reply post');
  });
};
