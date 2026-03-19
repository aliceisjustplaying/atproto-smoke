export const createDualApiHelpers = ({ config }) => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const deriveHost = (pdsUrl) => {
    try {
      return new URL(pdsUrl).host;
    } catch {
      return undefined;
    }
  };

  const fetchJson = async (url, options = {}) => {
    const timeoutMs = options.timeoutMs ?? 30000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const fetchOptions = {
      ...options,
      signal: controller.signal,
    };
    delete fetchOptions.timeoutMs;
    let res;
    try {
      res = await fetch(url, fetchOptions);
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, text, json };
  };

  const fetchStatus = async (url) => {
    const res = await fetch(url, {
      redirect: 'follow',
    });
    return { ok: res.ok, status: res.status, url: res.url };
  };

  const xrpcJson = async (nsid, { method = 'GET', token, params, body, timeoutMs, pdsUrl } = {}) => {
    const basePdsUrl = pdsUrl || config.pdsUrl;
    const url = new URL(`${basePdsUrl}/xrpc/${nsid}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    const headers = { accept: 'application/json' };
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    const run = (extraHeaders = {}) => fetchJson(url.toString(), {
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
      !result.ok &&
      nsid.startsWith('app.bsky.');
    if (shouldRetryWithAppViewProxy) {
      return run({
        'atproto-proxy': 'did:web:api.bsky.app#bsky_appview',
      });
    }
    return result;
  };

  const listOwnRecords = async (account, collection, limit = 100) => {
    const result = await xrpcJson('com.atproto.repo.listRecords', {
      token: account.accessJwt,
      pdsUrl: account.pdsUrl,
      params: {
        repo: account.did,
        collection,
        limit: String(limit),
      },
    });
    if (!result.ok) {
      throw new Error(
        `listRecords failed for ${account.handle} collection ${collection}: ${result.status} ${result.text}`,
      );
    }
    return result.json?.records || [];
  };

  const listOwnPosts = async (account, limit = 100) =>
    listOwnRecords(account, 'app.bsky.feed.post', limit);

  const recordRkey = (recordOrUri) => {
    const uri = typeof recordOrUri === 'string' ? recordOrUri : recordOrUri?.uri;
    return uri?.split('/').pop();
  };

  const deleteOwnRecord = async (account, collection, record) => {
    const rkey = recordRkey(record);
    if (!rkey) {
      throw new Error(`unable to determine rkey for ${collection} on ${account.handle}`);
    }
    const result = await xrpcJson('com.atproto.repo.deleteRecord', {
      method: 'POST',
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

  const purgeOwnRecords = async (account, collection, predicate, limit = 100) => {
    const records = await listOwnRecords(account, collection, limit);
    const doomed = records.filter(predicate);
    for (const record of doomed) {
      await deleteOwnRecord(account, collection, record);
      await sleep(250);
    }
    return doomed.length;
  };

  const waitForOwnRecord = async (account, collection, predicate, timeoutMs = 60000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const records = await listOwnRecords(account, collection);
      const match = records.find(predicate);
      if (match) {
        return match;
      }
      await sleep(2000);
    }
    throw new Error(`record not observed for ${account.handle} in ${collection}`);
  };

  const waitForOwnPostRecord = async (account, text, timeoutMs = 60000) => {
    return waitForOwnRecord(
      account,
      'app.bsky.feed.post',
      (record) => record?.value?.text === text,
      timeoutMs,
    );
  };

  const waitForFollowRecord = async (account, subjectDid, timeoutMs = 60000) =>
    waitForOwnRecord(
      account,
      'app.bsky.graph.follow',
      (record) => record?.value?.subject === subjectDid,
      timeoutMs,
    );

  const waitForNoOwnRecord = async (account, collection, predicate, timeoutMs = 60000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const records = await listOwnRecords(account, collection);
      if (!records.find(predicate)) {
        return true;
      }
      await sleep(2000);
    }
    throw new Error(`record still present for ${account.handle} in ${collection}`);
  };

  const waitForOwnListRecord = async (account, name, timeoutMs = 60000) =>
    waitForOwnRecord(
      account,
      'app.bsky.graph.list',
      (record) => record?.value?.name === name,
      timeoutMs,
    );

  const waitForOwnListItemRecord = async (account, listUri, subjectDid, timeoutMs = 60000) =>
    waitForOwnRecord(
      account,
      'app.bsky.graph.listitem',
      (record) => record?.value?.list === listUri && record?.value?.subject === subjectDid,
      timeoutMs,
    );

  const createSession = async (account) => {
    const identifier = account.loginIdentifier || account.handle;
    const result = await xrpcJson('com.atproto.server.createSession', {
      method: 'POST',
      pdsUrl: account.pdsUrl,
      body: {
        identifier,
        password: account.password,
      },
    });
    if (!result.ok) {
      throw new Error(`createSession failed for ${identifier}: ${result.status} ${result.text}`);
    }
    return result.json;
  };

  const pollNotifications = async ({
    account,
    authorHandle,
    reasons,
    minIndexedAt,
    timeoutMs = 180000,
  }) => {
    const started = Date.now();
    let last;
    while (Date.now() - started < timeoutMs) {
      last = await xrpcJson('app.bsky.notification.listNotifications', {
        token: account.accessJwt,
        pdsUrl: account.pdsUrl,
        params: { limit: '100' },
        timeoutMs: 15000,
      });
      if (last.ok && Array.isArray(last.json?.notifications)) {
        const matching = last.json.notifications.filter((item) => {
          if (item?.author?.handle !== authorHandle) {
            return false;
          }
          const indexedAt = Date.parse(item?.indexedAt || item?.record?.createdAt || 0);
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
      `notifications not observed for ${account.handle} within ${timeoutMs}ms; last status=${last?.status ?? 'none'} body=${last?.text ?? ''}`,
    );
  };

  const accountFromConfig = (entry) => ({
    ...entry,
    pdsUrl: entry.pdsUrl || config.pdsUrl,
    pdsHost: entry.pdsHost || deriveHost(entry.pdsUrl || config.pdsUrl),
    loginIdentifier: entry.loginIdentifier || entry.handle,
    mediaPostText: entry.mediaPostText || `${entry.postText} image`,
    shortHandle: entry.handle.replace(/^@/, ''),
  });

  const prepareAccounts = ({ primaryConfig, secondaryConfig, startedAt }) => {
    const runToken = startedAt.replace(/\D/g, '').slice(0, 14);
    const primary = accountFromConfig({
      ...primaryConfig,
      listName: primaryConfig.listName || `Smoke List ${runToken}`,
      listDescription: primaryConfig.listDescription || `smoke list description ${runToken}`,
      listUpdatedName: primaryConfig.listUpdatedName || `Updated Smoke List ${runToken}`,
      listUpdatedDescription:
        primaryConfig.listUpdatedDescription || `updated smoke list description ${runToken}`,
    });
    const secondary = accountFromConfig(secondaryConfig);
    return { primary, secondary };
  };

  const stalePostPrefixesFor = (account) => {
    if (Array.isArray(account.cleanupPostPrefixes) && account.cleanupPostPrefixes.length) {
      return account.cleanupPostPrefixes;
    }
    if (/secondary/i.test(account.postText || '')) {
      return ['perlsky browser secondary '];
    }
    return ['perlsky browser smoke '];
  };

  const staleListPrefixes = ['Smoke List ', 'Updated Smoke List '];

  const cleanupStaleSmokeArtifacts = async (account) => {
    const postPrefixes = stalePostPrefixesFor(account);
    const deletedPosts = await purgeOwnRecords(
      account,
      'app.bsky.feed.post',
      (record) => postPrefixes.some((prefix) => (record?.value?.text || '').startsWith(prefix)),
    );
    const lists = await listOwnRecords(account, 'app.bsky.graph.list', 100);
    const doomedLists = lists.filter((record) =>
      staleListPrefixes.some((prefix) => (record?.value?.name || '').startsWith(prefix)),
    );
    const doomedListUris = new Set(doomedLists.map((record) => record.uri));
    const deletedListItems = doomedListUris.size
      ? await purgeOwnRecords(
          account,
          'app.bsky.graph.listitem',
          (record) => doomedListUris.has(record?.value?.list),
        )
      : 0;
    let deletedLists = 0;
    for (const record of doomedLists) {
      await deleteOwnRecord(account, 'app.bsky.graph.list', record);
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
    listOwnPosts,
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
    accountFromConfig,
    prepareAccounts,
    cleanupStaleSmokeArtifacts,
  };
};
