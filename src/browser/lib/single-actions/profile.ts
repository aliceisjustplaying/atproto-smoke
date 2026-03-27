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
}) => {
  const publicCheckTimeoutMs = config.publicCheckTimeoutMs ?? 180000;
  const pageActions = createPageProfileEditActions({
    artifactsDir: config.artifactsDir,
    wait: (_page, ms) => wait(ms),
    dismissBlockingOverlays,
    avatarPngBase64,
    notes: summary.notes,
  });

  const verifyPublicHandleResolution = async () => {
    const result = await pollJson(
      "public handle resolution",
      () =>
        `${config.publicApiUrl}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(config.handle)}`,
      ({ ok, json }) =>
        ok && typeof json?.did === "string" && json.did.length > 0,
      publicCheckTimeoutMs,
    );
    return { did: result.json.did };
  };

  const verifyPublicAuthorFeed = async () => {
    const result = await pollJson(
      "public author feed indexing",
      () =>
        `${config.publicApiUrl}/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(config.handle)}&limit=20`,
      ({ ok, json }) =>
        ok &&
        Array.isArray(json?.feed) &&
        json.feed.some((item) => item?.post?.record?.text === config.postText),
      publicCheckTimeoutMs,
    );
    const matching = result.json.feed.find(
      (item) => item?.post?.record?.text === config.postText,
    );
    return {
      uri: matching?.post?.uri,
      cid: matching?.post?.cid,
    };
  };

  const verifyPublicProfile = async () => {
    const result = await pollJson(
      "public profile indexing",
      () =>
        `${config.publicApiUrl}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(config.handle)}`,
      ({ ok, json }) =>
        ok && typeof json?.postsCount === "number" && json.postsCount > 0,
      publicCheckTimeoutMs,
    );
    return {
      postsCount: result.json.postsCount,
      followersCount: result.json.followersCount,
      followsCount: result.json.followsCount,
      avatar: result.json.avatar,
      description: result.json.description,
    };
  };

  const verifyPublicProfileAfterEdit = async () => {
    const result = await pollJson(
      "public profile edit indexing",
      () =>
        `${config.publicApiUrl}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(config.handle)}`,
      ({ ok, json }) =>
        ok &&
        json?.description === config.profileNote &&
        typeof json?.avatar === "string" &&
        json.avatar.length > 0,
      publicCheckTimeoutMs,
    );
    const avatarResult = await fetchStatus(result.json.avatar);
    if (!avatarResult.ok) {
      throw new Error(`public avatar URL returned ${avatarResult.status}`);
    }
    return {
      avatar: result.json.avatar,
      avatarStatus: avatarResult.status,
      description: result.json.description,
    };
  };

  const verifyLocalProfileAfterEdit = async () => {
    const didResult = await pollJson(
      "local handle resolution after profile edit",
      () =>
        `${config.pdsUrl}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(config.handle)}`,
      ({ ok, json }) =>
        ok && typeof json?.did === "string" && json.did.length > 0,
      30000,
    );
    const did = didResult.json.did;
    const result = await pollJson(
      "local profile record after edit",
      () =>
        `${config.pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=app.bsky.actor.profile&rkey=self`,
      ({ ok, json }) =>
        ok &&
        json?.value?.description === config.profileNote &&
        typeof json?.value?.avatar?.ref?.$link === "string" &&
        json.value.avatar.ref.$link.length > 0,
      30000,
    );
    return {
      did,
      avatarCid: result.json.value.avatar.ref.$link,
      description: result.json.value.description,
    };
  };

  const editProfile = () =>
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
