import type { SingleActions, SingleActionsOptions } from "../browser-types.js";
import type { FlexibleRecord } from "../../../types.js";
import { isRecord, isString } from "../../../guards.js";
import { dismissBlockingOverlays } from "../runtime-utils.js";
import { createPageProfileEditActions } from "../page-profile-edit-actions.js";

export const createSingleProfileActions = ({
  config,
  summary,
  page,
  wait,
  fetchStatus,
  pollJson,
  avatarPngBase64,
}: SingleActionsOptions): Pick<
  SingleActions,
  | "verifyPublicHandleResolution"
  | "verifyPublicAuthorFeed"
  | "verifyPublicProfile"
  | "verifyPublicProfileAfterEdit"
  | "verifyLocalProfileAfterEdit"
  | "editProfile"
> => {
  const publicCheckTimeoutMs = config.publicCheckTimeoutMs;
  const pageActions = createPageProfileEditActions({
    artifactsDir: config.artifactsDir,
    wait: (_page, ms) => wait(ms),
    dismissBlockingOverlays,
    avatarPngBase64,
    notes: summary.notes,
  });

  const verifyPublicHandleResolution = async (): Promise<FlexibleRecord> => {
    const result = await pollJson(
      "public handle resolution",
      () =>
        `${config.publicApiUrl}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(config.handle)}`,
      ({ ok, json }) => {
        const resolved = isRecord(json) ? json : undefined;
        const did = isString(resolved?.did) ? resolved.did : undefined;
        return ok && did !== undefined && did.length > 0;
      },
      publicCheckTimeoutMs,
    );
    const json = isRecord(result.json) ? result.json : undefined;
    return { did: typeof json?.did === "string" ? json.did : undefined };
  };

  const verifyPublicAuthorFeed = async (): Promise<FlexibleRecord> => {
    const result = await pollJson(
      "public author feed indexing",
      () =>
        `${config.publicApiUrl}/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(config.handle)}&limit=20`,
      ({ ok, json }) => {
        const feed =
          isRecord(json) && Array.isArray(json.feed) ? json.feed : [];
        return (
          ok &&
          feed.some(
            (item) =>
              isRecord(item) &&
              isRecord(item.post) &&
              isRecord(item.post.record) &&
              item.post.record.text === config.postText,
          )
        );
      },
      publicCheckTimeoutMs,
    );
    const feed =
      isRecord(result.json) && Array.isArray(result.json.feed)
        ? result.json.feed.filter(isRecord)
        : [];
    const matching = feed.find(
      (item) =>
        isRecord(item) &&
        isRecord(item.post) &&
        isRecord(item.post.record) &&
        item.post.record.text === config.postText,
    );
    return {
      uri:
        isRecord(matching) &&
        isRecord(matching.post) &&
        isString(matching.post.uri)
          ? matching.post.uri
          : undefined,
      cid:
        isRecord(matching) &&
        isRecord(matching.post) &&
        isString(matching.post.cid)
          ? matching.post.cid
          : undefined,
    };
  };

  const verifyPublicProfile = async (): Promise<FlexibleRecord> => {
    const result = await pollJson(
      "public profile indexing",
      () =>
        `${config.publicApiUrl}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(config.handle)}`,
      ({ ok, json }) =>
        ok &&
        isRecord(json) &&
        typeof json.postsCount === "number" &&
        json.postsCount > 0,
      publicCheckTimeoutMs,
    );
    const json = isRecord(result.json) ? result.json : {};
    return {
      postsCount: json.postsCount,
      followersCount: json.followersCount,
      followsCount: json.followsCount,
      avatar: json.avatar,
      description: json.description,
    };
  };

  const verifyPublicProfileAfterEdit = async (): Promise<FlexibleRecord> => {
    const result = await pollJson(
      "public profile edit indexing",
      () =>
        `${config.publicApiUrl}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(config.handle)}`,
      ({ ok, json }) =>
        ok &&
        isRecord(json) &&
        json.description === config.profileNote &&
        typeof json.avatar === "string" &&
        json.avatar.length > 0,
      publicCheckTimeoutMs,
    );
    const json = isRecord(result.json) ? result.json : {};
    if (!isString(json.avatar)) {
      throw new Error("public profile edit indexing returned no avatar URL");
    }
    const avatarResult = await fetchStatus(json.avatar);
    if (!avatarResult.ok) {
      throw new Error(
        `public avatar URL returned ${String(avatarResult.status)}`,
      );
    }
    return {
      avatar: json.avatar,
      avatarStatus: avatarResult.status,
      description: json.description,
    };
  };

  const verifyLocalProfileAfterEdit = async (): Promise<FlexibleRecord> => {
    const didResult = await pollJson(
      "local handle resolution after profile edit",
      () =>
        `${config.pdsUrl}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(config.handle)}`,
      ({ ok, json }) => {
        const resolved = isRecord(json) ? json : undefined;
        const did = isString(resolved?.did) ? resolved.did : undefined;
        return ok && did !== undefined && did.length > 0;
      },
      30000,
    );
    const didJson = isRecord(didResult.json) ? didResult.json : undefined;
    const did = isString(didJson?.did) ? didJson.did : undefined;
    if (did === undefined) {
      throw new Error("local handle resolution did not return a did");
    }
    const result = await pollJson(
      "local profile record after edit",
      () =>
        `${config.pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=app.bsky.actor.profile&rkey=self`,
      ({ ok, json }) => {
        const profileRecord = isRecord(json) ? json : undefined;
        const value = isRecord(profileRecord?.value)
          ? profileRecord.value
          : undefined;
        const avatar = isRecord(value?.avatar) ? value.avatar : undefined;
        const ref = isRecord(avatar?.ref) ? avatar.ref : undefined;
        return (
          ok &&
          value?.description === config.profileNote &&
          typeof ref?.$link === "string" &&
          ref.$link.length > 0
        );
      },
      30000,
    );
    const json = isRecord(result.json) ? result.json : {};
    const value = isRecord(json.value) ? json.value : {};
    const avatar = isRecord(value.avatar) ? value.avatar : {};
    const ref = isRecord(avatar.ref) ? avatar.ref : {};
    return {
      did,
      avatarCid: ref.$link,
      description: value.description,
    };
  };

  const editProfile = (): Promise<{
    avatarFile: string;
    profileNote: string;
  }> =>
    pageActions.editProfile(page, {
      profileNote: config.profileNote,
      handle: config.handle,
    });

  return {
    verifyPublicHandleResolution,
    verifyPublicAuthorFeed,
    verifyPublicProfile,
    verifyPublicProfileAfterEdit,
    verifyLocalProfileAfterEdit,
    editProfile,
  };
};
