import {
  buttonText,
  dismissBlockingOverlays,
  loginToBlueskyApp,
  normalizeText,
  pollJsonUntil,
} from "../runtime-utils.mjs";
import { createPageAuthActions } from "../page-auth-actions.mjs";
import { createPageFeedActions } from "../page-feed-actions.mjs";
import { createPageProfileEditActions } from "../page-profile-edit-actions.mjs";

export const createDualProfileActions = ({
  appBaseUrl,
  config,
  summary,
  wait,
  xrpcJson,
  fetchJson,
  fetchStatus,
  avatarPngBase64,
}) => {
  const publicCheckTimeoutMs = config.publicCheckTimeoutMs ?? 180000;
  const authActions = createPageAuthActions({
    appUrl: config.appUrl,
    appBaseUrl,
    wait,
    loginToBlueskyApp,
  });
  const feedActions = createPageFeedActions({
    wait,
    normalizeText,
    buttonText,
    dismissBlockingOverlays,
  });
  const profileEditActions = createPageProfileEditActions({
    artifactsDir: config.artifactsDir,
    wait,
    dismissBlockingOverlays,
    avatarPngBase64,
    notes: summary.notes,
  });

  const parseCompactCount = (raw) => {
    if (typeof raw !== "string") {
      return undefined;
    }
    const normalized = raw.replace(/,/g, "").trim();
    const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)([KMB])?$/i);
    if (!match) {
      return undefined;
    }
    const base = Number(match[1]);
    const suffix = (match[2] || "").toUpperCase();
    const multiplier =
      suffix === "K"
        ? 1_000
        : suffix === "M"
          ? 1_000_000
          : suffix === "B"
            ? 1_000_000_000
            : 1;
    return Math.round(base * multiplier);
  };

  const login = async (page, account) => {
    const loginIdentifier = account.loginIdentifier || account.handle;
    await authActions.login(page, {
      pdsHost: account.pdsHost || config.pdsHost,
      loginIdentifier,
      password: account.password,
      notes: summary.notes,
      noteTarget: account.handle,
    });
  };

  const completeAgeAssuranceIfNeeded = (page, account) =>
    authActions.completeAgeAssuranceIfNeeded(page, {
      birthdate: account.birthdate,
      notes: summary.notes,
      noteText: `Completed age-assurance birthdate gate for ${account.handle}`,
    });

  const gotoProfile = authActions.gotoProfile;

  const waitForProfileHandle = authActions.waitForProfileHandle;

  const readRenderedProfileCounts = async (page) => {
    const raw = await page.evaluate(() => {
      const normalize = (text) => (text || "").replace(/\s+/g, " ").trim();
      const entries = Array.from(document.querySelectorAll("a[href]")).map(
        (node) => ({
          href: node.getAttribute("href") || "",
          text: normalize(node.textContent || ""),
        }),
      );
      const pick = (pattern) =>
        entries.find((entry) => pattern.test(entry.href))?.text;
      const bodyText = normalize(document.body?.innerText || "");
      const followersFallback = bodyText.match(
        /([0-9][0-9.,]*\s*[KMB]?)\s+followers?/i,
      )?.[0];
      const followsFallback = bodyText.match(
        /([0-9][0-9.,]*\s*[KMB]?)\s+(?:following|follows?)/i,
      )?.[0];
      return {
        followersText: pick(/\/followers(?:[/?#]|$)/i) || followersFallback,
        followsText: pick(/\/follows(?:[/?#]|$)/i) || followsFallback,
      };
    });

    const parseLinkedCount = (text, label) => {
      if (typeof text !== "string" || !text.length) {
        throw new Error(`rendered ${label} link text not found`);
      }
      const normalized = text.replace(/\s+/g, " ").trim();
      const match = normalized.match(/([0-9][0-9.,]*\s*[KMB]?)/i);
      if (!match) {
        throw new Error(
          `unable to parse rendered ${label} count from "${normalized}"`,
        );
      }
      const value = parseCompactCount(match[1].replace(/\s+/g, ""));
      if (value === undefined) {
        throw new Error(
          `unable to normalize rendered ${label} count from "${normalized}"`,
        );
      }
      return value;
    };

    return {
      followersCount: parseLinkedCount(raw.followersText, "followers"),
      followsCount: parseLinkedCount(raw.followsText, "follows"),
      raw,
    };
  };

  const readProfileCountsSnapshot = async (
    page,
    viewerAccount,
    profileHandle,
  ) => {
    await gotoProfile(page, profileHandle);
    await waitForProfileHandle(page, profileHandle);
    const rendered = await readRenderedProfileCounts(page);
    const apiResult = await xrpcJson("app.bsky.actor.getProfile", {
      token: viewerAccount?.accessJwt,
      pdsUrl: viewerAccount?.pdsUrl,
      params: { actor: profileHandle },
      timeoutMs: 15000,
    });
    if (!apiResult.ok) {
      throw new Error(`failed to read profile counts for ${profileHandle}`);
    }
    return {
      rendered,
      api: {
        followersCount: apiResult.json?.followersCount,
        followsCount: apiResult.json?.followsCount,
      },
    };
  };

  const verifyProfileCountsAfterReload = async (
    page,
    viewerAccount,
    profileHandle,
    expected,
    timeoutMs = 30000,
  ) => {
    const started = Date.now();
    let snapshot;
    while (Date.now() - started < timeoutMs) {
      try {
        snapshot = await readProfileCountsSnapshot(
          page,
          viewerAccount,
          profileHandle,
        );
        const matches = Object.entries(expected).every(
          ([key, value]) =>
            snapshot?.rendered?.[key] === value &&
            snapshot?.api?.[key] === value,
        );
        if (matches) {
          return snapshot;
        }
      } catch {
        // Retry until the timeout expires.
      }
      await wait(page, 2000);
    }

    throw new Error(
      `profile counts for ${profileHandle} did not converge; expected=${JSON.stringify(expected)} rendered=${JSON.stringify(snapshot?.rendered)} api=${JSON.stringify(snapshot?.api)}`,
    );
  };

  const readProfileCountsAfterReload = async (
    page,
    viewerAccount,
    profileHandle,
    timeoutMs = 30000,
  ) => {
    const started = Date.now();
    let lastError;
    while (Date.now() - started < timeoutMs) {
      try {
        return await readProfileCountsSnapshot(
          page,
          viewerAccount,
          profileHandle,
        );
      } catch (error) {
        lastError = error;
        await wait(page, 2000);
      }
    }
    throw (
      lastError ||
      new Error(`failed to read profile counts for ${profileHandle}`)
    );
  };

  const composePost = feedActions.composePost;

  const uploadComposerMedia = async (page) => {
    const mediaFile = await profileEditActions.ensureAvatarFixture();
    const openMedia = page.getByTestId("openMediaBtn").last();
    if (!(await openMedia.count())) {
      throw new Error("composer media button unavailable");
    }
    const chooserPromise = page.waitForEvent("filechooser", { timeout: 10000 });
    await openMedia.click({ noWaitAfter: true });
    const chooser = await chooserPromise;
    await chooser.setFiles(mediaFile);
    await wait(page, 2000);
    return mediaFile;
  };

  const composePostWithImage = async (page, text) => {
    await page
      .locator('[aria-label="Compose new post"]')
      .last()
      .click({ noWaitAfter: true });
    await wait(page, 800);
    const editor = page.locator('[aria-label="Rich-Text Editor"]').last();
    await editor.click({ noWaitAfter: true });
    await editor.fill(text);
    const mediaFile = await uploadComposerMedia(page);
    await wait(page, 500);
    await page
      .getByRole("button", { name: "Publish post" })
      .click({ noWaitAfter: true });
    await wait(page, 5000);
    return { mediaFile };
  };

  const editProfile = (page, account) =>
    profileEditActions.editProfile(page, {
      profileNote: account.profileNote,
      handle: account.handle,
    });

  const verifyLocalProfileAfterEdit = async (account) => {
    const didResult = await xrpcJson("com.atproto.identity.resolveHandle", {
      pdsUrl: account.pdsUrl,
      params: { handle: account.handle },
    });
    if (!didResult.ok || didResult.json?.did !== account.did) {
      throw new Error(`handle did mismatch for ${account.handle}`);
    }
    const result = await xrpcJson("com.atproto.repo.getRecord", {
      pdsUrl: account.pdsUrl,
      params: {
        repo: account.did,
        collection: "app.bsky.actor.profile",
        rkey: "self",
      },
    });
    if (!result.ok) {
      throw new Error(
        `profile record lookup failed for ${account.handle}: ${result.status} ${result.text}`,
      );
    }
    const avatarCid = result.json?.value?.avatar?.ref?.$link;
    const description = result.json?.value?.description;
    if (
      description !== account.profileNote ||
      typeof avatarCid !== "string" ||
      !avatarCid.length
    ) {
      throw new Error(
        `profile record did not contain expected avatar/description for ${account.handle}`,
      );
    }
    return { avatarCid, description };
  };

  const verifyPublicProfileAfterEdit = async (account) => {
    const result = await pollJsonUntil({
      name: `public profile edit indexing for ${account.handle}`,
      buildUrl: () =>
        `${config.publicApiUrl}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(account.handle)}`,
      predicate: ({ ok, json }) =>
        ok &&
        json?.description === account.profileNote &&
        typeof json?.avatar === "string" &&
        json.avatar.length > 0,
      timeoutMs: publicCheckTimeoutMs,
      fetchJson,
    });
    const avatarResult = await fetchStatus(result.json.avatar);
    if (!avatarResult.ok) {
      throw new Error(
        `public avatar URL returned ${avatarResult.status} for ${account.handle}`,
      );
    }
    return {
      avatar: result.json.avatar,
      avatarStatus: avatarResult.status,
      description: result.json.description,
    };
  };

  return {
    login,
    completeAgeAssuranceIfNeeded,
    gotoProfile,
    waitForProfileHandle,
    verifyProfileCountsAfterReload,
    readProfileCountsAfterReload,
    composePost,
    composePostWithImage,
    editProfile,
    verifyLocalProfileAfterEdit,
    verifyPublicProfileAfterEdit,
  };
};
