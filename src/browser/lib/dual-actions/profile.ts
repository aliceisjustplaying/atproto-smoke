import type { Page } from "playwright";
import {
  buttonText,
  dismissBlockingOverlays,
  loginToBlueskyApp,
  normalizeText,
  pollJsonUntil,
} from "../runtime-utils.js";
import { isNumber, isRecord, isString } from "../../../guards.js";
import type {
  AccountConfig,
  FlexibleRecord,
  ProfileCountsSnapshot,
  RenderedProfileCountsRaw,
} from "../../../types.js";
import type {
  DualActions,
  DualActionsOptions,
  PageAuthActions,
  PageFeedActions,
  PageProfileEditActions,
} from "../browser-types.js";
import { createPageAuthActions } from "../page-auth-actions.js";
import { createPageFeedActions } from "../page-feed-actions.js";
import { createPageProfileEditActions } from "../page-profile-edit-actions.js";

export const createDualProfileActions = ({
  appBaseUrl,
  config,
  summary,
  wait,
  xrpcJson,
  fetchJson,
  fetchStatus,
  avatarPngBase64,
}: DualActionsOptions): Pick<
  DualActions,
  | "login"
  | "completeAgeAssuranceIfNeeded"
  | "gotoProfile"
  | "waitForProfileHandle"
  | "verifyProfileCountsAfterReload"
  | "readProfileCountsAfterReload"
  | "composePost"
  | "composePostWithImage"
  | "editProfile"
  | "verifyLocalProfileAfterEdit"
  | "verifyPublicProfileAfterEdit"
> => {
  const publicCheckTimeoutMs = config.publicCheckTimeoutMs;
  const authActions: PageAuthActions = createPageAuthActions({
    appUrl: config.appUrl,
    appBaseUrl,
    wait,
    loginToBlueskyApp,
  });
  const feedActions: PageFeedActions = createPageFeedActions({
    wait,
    normalizeText,
    buttonText,
    dismissBlockingOverlays,
  });
  const profileEditActions: PageProfileEditActions =
    createPageProfileEditActions({
      artifactsDir: config.artifactsDir,
      wait,
      dismissBlockingOverlays,
      avatarPngBase64,
      notes: summary.notes,
    });

  const parseCompactCount = (raw: unknown): number | undefined => {
    if (!isString(raw)) {
      return undefined;
    }
    const normalized = raw.replace(/,/g, "").trim();
    const match = /^([0-9]+(?:\.[0-9]+)?)([KMB])?$/i.exec(normalized);
    if (!match) {
      return undefined;
    }
    const base = Number(match[1]);
    const suffixMatch = /[KMB]$/i.exec(normalized);
    const suffix = suffixMatch?.[0]?.toUpperCase();
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

  const login = async (page: Page, account: AccountConfig): Promise<void> => {
    const loginIdentifier = account.loginIdentifier ?? account.handle;
    await authActions.login(page, {
      pdsHost: account.pdsHost ?? config.pdsHost,
      loginIdentifier,
      password: account.password,
      notes: summary.notes,
      noteTarget: account.handle,
    });
  };

  const completeAgeAssuranceIfNeeded = (
    page: Page,
    account: AccountConfig,
  ): Promise<void> =>
    authActions.completeAgeAssuranceIfNeeded(page, {
      birthdate: account.birthdate,
      notes: summary.notes,
      noteText: `Completed age-assurance birthdate gate for ${account.handle}`,
    });

  const gotoProfile = authActions.gotoProfile;

  const waitForProfileHandle = authActions.waitForProfileHandle;

  const readRenderedProfileCounts = async (
    page: Page,
  ): Promise<{
    followersCount: number;
    followsCount: number;
    raw: RenderedProfileCountsRaw;
  }> => {
    const raw = await page.evaluate<RenderedProfileCountsRaw>(() => {
      const entries = Array.from(
        document.querySelectorAll<HTMLAnchorElement>("a[href]"),
      ).map((node) => ({
        href: node.getAttribute("href") ?? "",
        text: node.innerText.replace(/\s+/g, " ").trim(),
      }));
      const followersEntry = entries.find((entry) =>
        /\/followers(?:[/?#]|$)/i.test(entry.href),
      );
      const followsEntry = entries.find((entry) =>
        /\/follows(?:[/?#]|$)/i.test(entry.href),
      );
      const bodyText = document.body.innerText.replace(/\s+/g, " ").trim();
      const followersFallbackMatch =
        /([0-9][0-9.,]*\s*[KMB]?)\s+followers?/i.exec(bodyText);
      const followsFallbackMatch =
        /([0-9][0-9.,]*\s*[KMB]?)\s+(?:following|follows?)/i.exec(bodyText);
      const followersFallback = followersFallbackMatch?.[0];
      const followsFallback = followsFallbackMatch?.[0];
      return {
        followersText: followersEntry?.text ?? followersFallback,
        followsText: followsEntry?.text ?? followsFallback,
      };
    });

    const parseLinkedCount = (text: unknown, label: string): number => {
      if (!isString(text) || text.length === 0) {
        throw new Error(`rendered ${label} link text not found`);
      }
      const normalized = text.replace(/\s+/g, " ").trim();
      const match = /([0-9][0-9.,]*\s*[KMB]?)/i.exec(normalized);
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
    page: Page,
    viewerAccount: AccountConfig,
    profileHandle: string,
  ): Promise<ProfileCountsSnapshot> => {
    await gotoProfile(page, profileHandle);
    await waitForProfileHandle(page, profileHandle);
    const rendered = await readRenderedProfileCounts(page);
    const apiResult = await xrpcJson("app.bsky.actor.getProfile", {
      token: viewerAccount.accessJwt,
      pdsUrl: viewerAccount.pdsUrl,
      params: { actor: profileHandle },
      timeoutMs: 15000,
    });
    if (!apiResult.ok) {
      throw new Error(`failed to read profile counts for ${profileHandle}`);
    }
    const apiJson = isRecord(apiResult.json) ? apiResult.json : {};
    return {
      rendered,
      api: {
        followersCount: isNumber(apiJson.followersCount)
          ? apiJson.followersCount
          : undefined,
        followsCount: isNumber(apiJson.followsCount)
          ? apiJson.followsCount
          : undefined,
      },
    };
  };

  const verifyProfileCountsAfterReload = async (
    page: Page,
    viewerAccount: AccountConfig,
    profileHandle: string,
    expected: { followersCount?: number; followsCount?: number },
    timeoutMs = 30000,
  ): Promise<ProfileCountsSnapshot> => {
    const started = Date.now();
    let lastSnapshot: ProfileCountsSnapshot | undefined;
    while (Date.now() - started < timeoutMs) {
      try {
        const snapshot = await readProfileCountsSnapshot(
          page,
          viewerAccount,
          profileHandle,
        );
        lastSnapshot = snapshot;
        const matches = Object.entries(expected).every(([key, value]) => {
          if (key === "followersCount") {
            return (
              snapshot.rendered.followersCount === value &&
              snapshot.api.followersCount === value
            );
          }
          if (key === "followsCount") {
            return (
              snapshot.rendered.followsCount === value &&
              snapshot.api.followsCount === value
            );
          }
          return true;
        });
        if (matches) {
          return snapshot;
        }
      } catch {
        // Retry until the timeout expires.
      }
      await wait(page, 2000);
    }

    throw new Error(
      `profile counts for ${profileHandle} did not converge; expected=${JSON.stringify(expected)} rendered=${JSON.stringify(lastSnapshot?.rendered)} api=${JSON.stringify(lastSnapshot?.api)}`,
    );
  };

  const readProfileCountsAfterReload = async (
    page: Page,
    viewerAccount: AccountConfig,
    profileHandle: string,
    timeoutMs = 30000,
  ): Promise<ProfileCountsSnapshot> => {
    const started = Date.now();
    let lastError: unknown;
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
    throw lastError instanceof Error
      ? lastError
      : new Error(`failed to read profile counts for ${profileHandle}`);
  };

  const composePost = feedActions.composePost;

  const uploadComposerMedia = async (page: Page): Promise<string> => {
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

  const composePostWithImage = async (
    page: Page,
    text: string,
  ): Promise<{ mediaFile: string }> => {
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

  const editProfile = (
    page: Page,
    account: AccountConfig,
  ): Promise<{ avatarFile: string; profileNote: string }> =>
    profileEditActions.editProfile(page, {
      profileNote: account.profileNote,
      handle: account.handle,
    });

  const verifyLocalProfileAfterEdit = async (
    account: AccountConfig,
  ): Promise<FlexibleRecord> => {
    const didResult = await xrpcJson("com.atproto.identity.resolveHandle", {
      pdsUrl: account.pdsUrl,
      params: { handle: account.handle },
    });
    const didJson = isRecord(didResult.json) ? didResult.json : undefined;
    if (!didResult.ok || didJson?.did !== account.did) {
      throw new Error(`handle did mismatch for ${account.handle}`);
    }
    const result = await xrpcJson("com.atproto.repo.getRecord", {
      pdsUrl: account.pdsUrl,
      params: {
        repo: account.did ?? "",
        collection: "app.bsky.actor.profile",
        rkey: "self",
      },
    });
    if (!result.ok) {
      throw new Error(
        `profile record lookup failed for ${account.handle}: ${String(result.status)} ${result.text}`,
      );
    }
    const resultJson = isRecord(result.json) ? result.json : {};
    const value = isRecord(resultJson.value) ? resultJson.value : {};
    const avatar = isRecord(value.avatar) ? value.avatar : {};
    const ref = isRecord(avatar.ref) ? avatar.ref : {};
    const avatarCid = ref.$link;
    const description = value.description;
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

  const verifyPublicProfileAfterEdit = async (
    account: AccountConfig,
  ): Promise<FlexibleRecord> => {
    const result = await pollJsonUntil({
      name: `public profile edit indexing for ${account.handle}`,
      buildUrl: () =>
        `${config.publicApiUrl}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(account.handle)}`,
      predicate: ({ ok, json }): boolean => {
        const publicProfile = isRecord(json) ? json : undefined;
        const avatar = publicProfile?.avatar;
        return (
          ok &&
          publicProfile?.description === account.profileNote &&
          isString(avatar) &&
          avatar.length > 0
        );
      },
      timeoutMs: publicCheckTimeoutMs,
      fetchJson,
    });
    const publicProfile = isRecord(result.json) ? result.json : {};
    if (!isString(publicProfile.avatar)) {
      throw new Error(`public avatar URL missing for ${account.handle}`);
    }
    const avatarResult = await fetchStatus(publicProfile.avatar);
    if (!avatarResult.ok) {
      throw new Error(
        `public avatar URL returned ${String(avatarResult.status)} for ${account.handle}`,
      );
    }
    return {
      avatar: publicProfile.avatar,
      avatarStatus: avatarResult.status,
      description: publicProfile.description,
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
