import {
  fetchJsonWithTimeout,
  fetchStatusWithTimeout,
  sleep,
} from "./runtime-utils.js";
import { derivePdsHost } from "../../config.js";
import type {
  AccountConfig,
  FetchJsonResult,
  FetchStatusResult,
  FlexibleRecord,
  RepoRecord,
  XrpcJsonOptions,
} from "../../types.js";

const asRecord = (value: unknown): FlexibleRecord | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as FlexibleRecord;
};

export const createDualApiHelpers = ({
  config,
}: {
  config: { pdsUrl: string };
}) => {
  const fetchJson = (
    url: string,
    options: FlexibleRecord = {},
  ): Promise<FetchJsonResult> => fetchJsonWithTimeout(url, options);

  const fetchStatus = (
    url: string,
    options: FlexibleRecord = {},
  ): Promise<FetchStatusResult> => fetchStatusWithTimeout(url, options);

  const collectionFromUri = (uri: string | undefined): string | undefined => {
    // Example: at://did:plc:123/app.bsky.feed.post/3kabc -> app.bsky.feed.post
    if (typeof uri !== "string") {
      return undefined;
    }
    const parts = uri.split("/");
    return parts.length >= 4 ? parts[3] : undefined;
  };

  const normalizeRepoRecord = (record: RepoRecord): RepoRecord => {
    const recordValue = asRecord(record.value);
    const innerValue = asRecord(recordValue?.value);
    const innerType =
      typeof innerValue?.$type === "string" ? innerValue.$type : undefined;
    const expectedCollection = collectionFromUri(record?.uri);
    if (
      recordValue !== undefined &&
      innerValue !== undefined &&
      recordValue.$type === undefined &&
      typeof innerType === "string" &&
      (!expectedCollection || innerType === expectedCollection)
    ) {
      return {
        ...record,
        value: innerValue,
      };
    }
    return record;
  };

  const xrpcJson = async (
    nsid: string,
    options: XrpcJsonOptions = {},
  ): Promise<FetchJsonResult> => {
    const { method = "GET", token, params, body, timeoutMs, pdsUrl } = options;
    const basePdsUrl = pdsUrl || config.pdsUrl;
    const url = new URL(`${basePdsUrl}/xrpc/${nsid}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }
    const run = (extraHeaders: Record<string, string> = {}) =>
      fetchJson(url.toString(), {
        method,
        headers: {
          ...headers,
          ...extraHeaders,
        },
        timeoutMs,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const result = await run();
    const shouldRetryWithAppViewProxy =
      !result.ok && nsid.startsWith("app.bsky.");
    if (shouldRetryWithAppViewProxy) {
      return await run({
        "atproto-proxy": "did:web:api.bsky.app#bsky_appview",
      });
    }
    return result;
  };

  const listOwnRecords = async (
    account: AccountConfig,
    collection: string,
    limit = 100,
  ): Promise<RepoRecord[]> => {
    const repo = account.did ?? account.handle;
    const result = await xrpcJson("com.atproto.repo.listRecords", {
      token: account.accessJwt,
      pdsUrl: account.pdsUrl,
      params: {
        repo,
        collection,
        limit: String(limit),
      },
    });
    if (!result.ok) {
      throw new Error(
        `listRecords failed for ${account.handle} collection ${collection}: ${result.status} ${result.text}`,
      );
    }
    const records = Array.isArray(asRecord(result.json)?.records)
      ? (asRecord(result.json)?.records as RepoRecord[])
      : [];
    return records.map(normalizeRepoRecord);
  };

  const recordRkey = (recordOrUri: RepoRecord | string): string | undefined => {
    const uri =
      typeof recordOrUri === "string" ? recordOrUri : recordOrUri?.uri;
    return uri?.split("/").pop();
  };

  const deleteOwnRecord = async (
    account: AccountConfig,
    collection: string,
    record: RepoRecord | string,
  ): Promise<{ rkey: string }> => {
    const rkey = recordRkey(record);
    if (!rkey) {
      throw new Error(
        `unable to determine rkey for ${collection} on ${account.handle}`,
      );
    }
    const result = await xrpcJson("com.atproto.repo.deleteRecord", {
      method: "POST",
      token: account.accessJwt,
      pdsUrl: account.pdsUrl,
      body: {
        repo: account.did,
        collection,
        rkey,
      },
    });
    if (!result.ok) {
      throw new Error(
        `deleteRecord failed for ${account.handle} ${collection} ${rkey}: ${result.status} ${result.text}`,
      );
    }
    return { rkey };
  };

  const purgeOwnRecords = async (
    account: AccountConfig,
    collection: string,
    predicate: (record: RepoRecord) => boolean,
    limit = 100,
  ): Promise<number> => {
    const records = await listOwnRecords(account, collection, limit);
    const doomed = records.filter(predicate);
    for (const record of doomed) {
      await deleteOwnRecord(account, collection, record);
      await sleep(250);
    }
    return doomed.length;
  };

  const waitForOwnRecord = async (
    account: AccountConfig,
    collection: string,
    predicate: (record: RepoRecord) => boolean,
    timeoutMs = 60000,
  ): Promise<RepoRecord> => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const records = await listOwnRecords(account, collection);
      const match = records.find(predicate);
      if (match) {
        return match;
      }
      await sleep(2000);
    }
    throw new Error(
      `record not observed for ${account.handle} in ${collection}`,
    );
  };

  const waitForOwnPostRecord = (
    account: AccountConfig,
    text: string,
    timeoutMs = 60000,
  ): Promise<RepoRecord> => {
    return waitForOwnRecord(
      account,
      "app.bsky.feed.post",
      (record) => record?.value?.text === text,
      timeoutMs,
    );
  };

  const waitForFollowRecord = (
    account: AccountConfig,
    subjectDid: string,
    timeoutMs = 60000,
  ): Promise<RepoRecord> =>
    waitForOwnRecord(
      account,
      "app.bsky.graph.follow",
      (record) => record?.value?.subject === subjectDid,
      timeoutMs,
    );

  const waitForNoOwnRecord = async (
    account: AccountConfig,
    collection: string,
    predicate: (record: RepoRecord) => boolean,
    timeoutMs = 60000,
  ): Promise<true> => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const records = await listOwnRecords(account, collection);
      if (!records.find(predicate)) {
        return true;
      }
      await sleep(2000);
    }
    throw new Error(
      `record still present for ${account.handle} in ${collection}`,
    );
  };

  const waitForOwnListRecord = (
    account: AccountConfig,
    name: string,
    timeoutMs = 60000,
  ): Promise<RepoRecord> =>
    waitForOwnRecord(
      account,
      "app.bsky.graph.list",
      (record) => record?.value?.name === name,
      timeoutMs,
    );

  const waitForOwnListItemRecord = (
    account: AccountConfig,
    listUri: string,
    subjectDid: string,
    timeoutMs = 60000,
  ): Promise<RepoRecord> =>
    waitForOwnRecord(
      account,
      "app.bsky.graph.listitem",
      (record) =>
        record?.value?.list === listUri &&
        record?.value?.subject === subjectDid,
      timeoutMs,
    );

  const createSession = async (
    account: AccountConfig,
  ): Promise<FlexibleRecord> => {
    const identifier = account.loginIdentifier || account.handle;
    const result = await xrpcJson("com.atproto.server.createSession", {
      method: "POST",
      pdsUrl: account.pdsUrl,
      body: {
        identifier,
        password: account.password,
      },
    });
    if (!result.ok) {
      throw new Error(
        `createSession failed for ${identifier}: ${result.status} ${result.text}`,
      );
    }
    return (result.json ?? {}) as FlexibleRecord;
  };

  const pollNotifications = async ({
    account,
    authorHandle,
    reasons,
    minIndexedAt,
    timeoutMs = 180000,
  }: {
    account: AccountConfig;
    authorHandle: string;
    reasons: string[];
    minIndexedAt: number;
    timeoutMs?: number;
  }): Promise<{
    notifications: FlexibleRecord[];
    allNotifications: FlexibleRecord[];
  }> => {
    const started = Date.now();
    let last;
    while (Date.now() - started < timeoutMs) {
      last = await xrpcJson("app.bsky.notification.listNotifications", {
        token: account.accessJwt,
        pdsUrl: account.pdsUrl,
        params: { limit: "100" },
        timeoutMs: 15000,
      });
      if (last.ok && Array.isArray(last.json?.notifications)) {
        const matching = last.json.notifications.filter((item) => {
          if (item?.author?.handle !== authorHandle) {
            return false;
          }
          const indexedAt = Date.parse(
            item?.indexedAt || item?.record?.createdAt || 0,
          );
          if (Number.isFinite(minIndexedAt) && indexedAt < minIndexedAt) {
            return false;
          }
          return reasons.includes(item?.reason);
        });
        const seenReasons = new Set(matching.map((item) => item.reason));
        if (reasons.every((reason) => seenReasons.has(reason))) {
          return {
            notifications: matching,
            allNotifications: last.json.notifications.slice(0, 12),
          };
        }
      }
      await sleep(5000);
    }
    throw new Error(
      `notifications not observed for ${account.handle} within ${timeoutMs}ms; last status=${last?.status ?? "none"} body=${last?.text ?? ""}`,
    );
  };

  const accountFromConfig = (entry: AccountConfig): AccountConfig => ({
    ...entry,
    pdsUrl: entry.pdsUrl ?? config.pdsUrl,
    pdsHost: entry.pdsHost ?? derivePdsHost(entry.pdsUrl ?? config.pdsUrl),
    loginIdentifier: entry.loginIdentifier ?? entry.handle,
    mediaPostText: entry.mediaPostText ?? `${entry.postText} image`,
    shortHandle: entry.handle.replace(/^@/, ""),
  });

  const prepareAccounts = ({
    primaryConfig,
    secondaryConfig,
    startedAt,
  }: {
    primaryConfig: AccountConfig;
    secondaryConfig: AccountConfig;
    startedAt: string;
  }): { primary: AccountConfig; secondary: AccountConfig } => {
    const runToken = startedAt.replace(/\D/g, "").slice(0, 14);
    const primary = accountFromConfig({
      ...primaryConfig,
      listName: primaryConfig.listName || `Smoke List ${runToken}`,
      listDescription:
        primaryConfig.listDescription || `smoke list description ${runToken}`,
      listUpdatedName:
        primaryConfig.listUpdatedName || `Updated Smoke List ${runToken}`,
      listUpdatedDescription:
        primaryConfig.listUpdatedDescription ||
        `updated smoke list description ${runToken}`,
    });
    const secondary = accountFromConfig(secondaryConfig);
    return { primary, secondary };
  };

  const stalePostPrefixesFor = (account: AccountConfig): string[] => {
    if (
      Array.isArray(account.cleanupPostPrefixes) &&
      account.cleanupPostPrefixes.length
    ) {
      return account.cleanupPostPrefixes;
    }
    return [account.postText].filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
  };

  const staleListPrefixes = ["Smoke List ", "Updated Smoke List "];

  const cleanupStaleSmokeArtifacts = async (
    account: AccountConfig,
  ): Promise<{
    deletedPosts: number;
    deletedListItems: number;
    deletedLists: number;
  }> => {
    const postPrefixes = stalePostPrefixesFor(account);
    const deletedPosts = await purgeOwnRecords(
      account,
      "app.bsky.feed.post",
      (record) => {
        const text =
          typeof record.value?.text === "string" ? record.value.text : "";
        return postPrefixes.some((prefix) => text.startsWith(prefix));
      },
    );
    const lists = await listOwnRecords(account, "app.bsky.graph.list", 100);
    const doomedLists = lists.filter((record) => {
      const name =
        typeof record.value?.name === "string" ? record.value.name : "";
      return staleListPrefixes.some((prefix) => name.startsWith(prefix));
    });
    const doomedListUris = new Set(doomedLists.map((record) => record.uri));
    const deletedListItems = doomedListUris.size
      ? await purgeOwnRecords(account, "app.bsky.graph.listitem", (record) => {
          const listUri =
            typeof record.value?.list === "string"
              ? record.value.list
              : undefined;
          return doomedListUris.has(listUri);
        })
      : 0;
    let deletedLists = 0;
    for (const record of doomedLists) {
      await deleteOwnRecord(account, "app.bsky.graph.list", record);
      deletedLists += 1;
      await sleep(250);
    }
    return { deletedPosts, deletedListItems, deletedLists };
  };

  return {
    fetchJson,
    fetchStatus,
    xrpcJson,
    listOwnRecords,
    deleteOwnRecord,
    purgeOwnRecords,
    waitForOwnRecord,
    waitForOwnPostRecord,
    waitForFollowRecord,
    waitForNoOwnRecord,
    waitForOwnListRecord,
    waitForOwnListItemRecord,
    recordRkey,
    createSession,
    pollNotifications,
    prepareAccounts,
    cleanupStaleSmokeArtifacts,
  };
};
