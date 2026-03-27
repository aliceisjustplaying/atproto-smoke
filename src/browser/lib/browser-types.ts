import type { Browser, Locator, Page } from "playwright";
import type {
  AccountConfig,
  ConsoleEntry,
  DualRunConfig,
  FetchJsonResult,
  FetchStatusResult,
  FlexibleRecord,
  HttpFailureEntry,
  SessionInfo,
  RequestFailureEntry,
  ProfileCountsSnapshot,
  RepoRecord,
  RuntimeDualAccount,
  SingleRunConfig,
  Summary,
  XrpcJsonOptions,
} from "../../types.js";

export type PageName = "primary" | "secondary";

export interface StepOptions {
  optional?: boolean;
  timeoutMs?: number;
  pageNames?: PageName[];
}

export type StepRunner = <T>(
  name: string,
  fn: () => Promise<T>,
  options?: StepOptions,
) => Promise<T | null>;

export type SingleWait = (ms: number) => Promise<void>;
export type PageWait = (page: Page, ms: number) => Promise<void>;

export interface LoginTarget {
  pdsHost: string;
  loginIdentifier: string;
  password: string;
  notes?: string[];
  noteTarget?: string;
}

export interface AgeAssuranceTarget {
  birthdate: string;
  notes?: string[];
  noteText?: string;
}

export interface PageAuthActionsOptions {
  appUrl: string;
  appBaseUrl: string;
  wait: PageWait;
  loginToBlueskyApp: (args: {
    page: Page;
    appUrl: string;
    pdsHost: string;
    loginIdentifier: string;
    password: string;
    notes?: string[];
    noteTarget?: string;
  }) => Promise<{ loginPath: string }>;
}

export interface PageAuthActions {
  login: (page: Page, target: LoginTarget) => Promise<{ loginPath: string }>;
  completeAgeAssuranceIfNeeded: (
    page: Page,
    target: AgeAssuranceTarget,
  ) => Promise<void>;
  gotoProfile: (page: Page, handle: string) => Promise<void>;
  waitForProfileHandle: (
    page: Page,
    handle: string,
    timeout?: number,
  ) => Promise<void>;
  maybeFollow: (page: Page) => Promise<FlexibleRecord>;
  maybeUnfollow: (page: Page) => Promise<FlexibleRecord>;
  openNotifications: (page: Page) => Promise<void>;
  openSavedPosts: (page: Page) => Promise<void>;
  openProfileTab: (page: Page, name: string) => Promise<void>;
}

export interface PageFeedActionsOptions {
  wait: PageWait;
  normalizeText: (text: string | null | undefined) => string;
  buttonText: (locator: Locator) => Promise<string>;
  dismissBlockingOverlays: (page: Page) => Promise<void>;
}

export interface PublishComposerOptions {
  applyWritesLabel: string;
  publishLabel: string | RegExp;
}

export interface PageFeedActions {
  composePost: (page: Page, text: string) => Promise<void>;
  findRowByPrimaryText: (
    page: Page,
    needle: string,
    timeout?: number,
  ) => Promise<Locator>;
  maybeFindRowByPrimaryText: (
    page: Page,
    needle: string,
    timeout?: number,
  ) => Promise<Locator | null>;
  findFirstFeedItem: (page: Page, timeout?: number) => Promise<Locator>;
  clickQuote: (page: Page, row: Locator, text: string) => Promise<void>;
  clickReply: (page: Page, row: Page | Locator, text: string) => Promise<void>;
  ensureBookmarked: (page: Page, row: Locator) => Promise<FlexibleRecord>;
  ensureNotBookmarked: (page: Page, row: Locator) => Promise<FlexibleRecord>;
  ensureLiked: (page: Page, row: Locator) => Promise<FlexibleRecord>;
  ensureNotLiked: (page: Page, row: Locator) => Promise<FlexibleRecord>;
  ensureReposted: (page: Page, row: Locator) => Promise<FlexibleRecord>;
  ensureNotReposted: (page: Page, row: Locator) => Promise<FlexibleRecord>;
  openPostOptions: (page: Page, row: Locator) => Promise<Locator>;
  maybeDeleteOwnPostByText: (
    page: Page,
    text: string,
    successNote: string,
  ) => Promise<FlexibleRecord>;
}

export interface ProfileEditTarget {
  profileNote: string;
  handle?: string;
}

export interface PageProfileEditActionsOptions {
  artifactsDir: string;
  wait: PageWait;
  dismissBlockingOverlays: (page: Page) => Promise<void>;
  avatarPngBase64: string;
  notes?: string[];
}

export interface PageProfileEditActions {
  ensureAvatarFixture: () => Promise<string>;
  uploadProfileAvatar: (page: Page) => Promise<string>;
  editProfile: (
    page: Page,
    target: ProfileEditTarget,
  ) => Promise<{ avatarFile: string; profileNote: string }>;
}

export type FetchJson = (
  url: string,
  options?: FlexibleRecord,
) => Promise<FetchJsonResult>;

export type FetchStatus = (
  url: string,
  options?: FlexibleRecord,
) => Promise<FetchStatusResult>;

export type PollJson = (
  name: string,
  buildUrl: () => string,
  predicate: (result: FetchJsonResult) => boolean,
  timeoutMs: number,
) => Promise<FetchJsonResult>;

export type XrpcJson = (
  nsid: string,
  options?: XrpcJsonOptions,
) => Promise<FetchJsonResult>;

export interface SingleActionsOptions {
  config: SingleRunConfig;
  summary: Summary;
  page: Page;
  appBaseUrl: string;
  wait: SingleWait;
  sleep: (ms: number) => Promise<void>;
  normalizeText: (text: string | null | undefined) => string;
  buttonText: (locator: Locator) => Promise<string>;
  fetchStatus: FetchStatus;
  pollJson: PollJson;
  avatarPngBase64: string;
}

export interface SingleActions {
  login: () => Promise<void>;
  completeAgeAssuranceIfNeeded: () => Promise<void>;
  gotoProfile: (handle: string) => Promise<void>;
  waitForProfileHandle: (handle: string, timeout?: number) => Promise<void>;
  maybeFollowTarget: () => Promise<FlexibleRecord>;
  maybeUnfollowTarget: () => Promise<FlexibleRecord>;
  openNotifications: () => Promise<void>;
  openSavedPosts: () => Promise<void>;
  openProfileTab: (name: string) => Promise<void>;
  composePost: (text: string) => Promise<void>;
  findRowByPrimaryText: (needle: string, timeout?: number) => Promise<Locator>;
  findFirstFeedItem: (timeout?: number) => Promise<Locator>;
  clickQuote: (row: Locator, text: string) => Promise<void>;
  clickReply: (row: Page | Locator, text: string) => Promise<void>;
  ensureBookmarked: (row: Locator) => Promise<FlexibleRecord>;
  ensureNotBookmarked: (row: Locator) => Promise<FlexibleRecord>;
  ensureLiked: (row: Locator) => Promise<FlexibleRecord>;
  ensureNotLiked: (row: Locator) => Promise<FlexibleRecord>;
  ensureReposted: (row: Locator) => Promise<FlexibleRecord>;
  ensureNotReposted: (row: Locator) => Promise<FlexibleRecord>;
  maybeDeleteOwnPostByText: (
    text: string,
    successNote: string,
  ) => Promise<FlexibleRecord>;
  verifyPublicHandleResolution: () => Promise<FlexibleRecord>;
  verifyPublicAuthorFeed: () => Promise<FlexibleRecord>;
  verifyPublicProfile: () => Promise<FlexibleRecord>;
  verifyPublicProfileAfterEdit: () => Promise<FlexibleRecord>;
  verifyLocalProfileAfterEdit: () => Promise<FlexibleRecord>;
  editProfile: () => Promise<{ avatarFile: string; profileNote: string }>;
}

export interface DualActionsOptions {
  config: DualRunConfig;
  summary: Summary;
  appBaseUrl: string;
  wait: PageWait;
  sleep: (ms: number) => Promise<void>;
  normalizeText: (text: string | null | undefined) => string;
  buttonText: (locator: Locator) => Promise<string>;
  fetchJson: FetchJson;
  fetchStatus: FetchStatus;
  xrpcJson: XrpcJson;
  avatarPngBase64: string;
}

export interface DualActions {
  login: (page: Page, account: AccountConfig) => Promise<void>;
  completeAgeAssuranceIfNeeded: (
    page: Page,
    account: AccountConfig,
  ) => Promise<void>;
  gotoProfile: (page: Page, handle: string) => Promise<void>;
  waitForProfileHandle: (
    page: Page,
    handle: string,
    timeout?: number,
  ) => Promise<void>;
  verifyProfileCountsAfterReload: (
    page: Page,
    viewerAccount: AccountConfig,
    profileHandle: string,
    expected: { followersCount?: number; followsCount?: number },
    timeoutMs?: number,
  ) => Promise<ProfileCountsSnapshot>;
  readProfileCountsAfterReload: (
    page: Page,
    viewerAccount: AccountConfig,
    profileHandle: string,
    timeoutMs?: number,
  ) => Promise<ProfileCountsSnapshot>;
  composePost: (page: Page, text: string) => Promise<void>;
  composePostWithImage: (
    page: Page,
    text: string,
  ) => Promise<{ mediaFile: string }>;
  editProfile: (
    page: Page,
    account: AccountConfig,
  ) => Promise<{ avatarFile: string; profileNote: string }>;
  verifyLocalProfileAfterEdit: (
    account: AccountConfig,
  ) => Promise<FlexibleRecord>;
  verifyPublicProfileAfterEdit: (
    account: AccountConfig,
  ) => Promise<FlexibleRecord>;
  findRowByPrimaryText: (
    page: Page,
    needle: string,
    timeout?: number,
  ) => Promise<Locator>;
  ensureLiked: (page: Page, row: Locator) => Promise<FlexibleRecord>;
  ensureNotLiked: (page: Page, row: Locator) => Promise<FlexibleRecord>;
  ensureReposted: (page: Page, row: Locator) => Promise<FlexibleRecord>;
  ensureNotReposted: (page: Page, row: Locator) => Promise<FlexibleRecord>;
  ensureBookmarked: (page: Page, row: Locator) => Promise<FlexibleRecord>;
  ensureNotBookmarked: (page: Page, row: Locator) => Promise<FlexibleRecord>;
  clickQuote: (page: Page, row: Locator, text: string) => Promise<void>;
  clickReply: (page: Page, row: Page | Locator, text: string) => Promise<void>;
  maybeFollow: (page: Page) => Promise<FlexibleRecord>;
  maybeUnfollow: (page: Page) => Promise<FlexibleRecord>;
  openNotifications: (page: Page) => Promise<void>;
  openSavedPosts: (page: Page) => Promise<void>;
  waitForNotificationsFeed: (page: Page) => Promise<Locator | null>;
  openProfileTab: (page: Page, name: string) => Promise<void>;
  maybeDeleteOwnPostByText: (
    page: Page,
    text: string,
    successNote: string,
  ) => Promise<FlexibleRecord>;
  openReportPostDraft: (page: Page, row: Locator) => Promise<FlexibleRecord>;
  ensureProfileMuted: (page: Page) => Promise<FlexibleRecord>;
  ensureProfileUnmuted: (page: Page) => Promise<FlexibleRecord>;
  blockProfile: (page: Page) => Promise<FlexibleRecord>;
  unblockProfile: (page: Page) => Promise<FlexibleRecord>;
}

export interface SingleScenarioContext extends SingleActions {
  step: StepRunner;
  config: SingleRunConfig;
  page: Page;
}

export interface DualScenarioContext extends DualActions {
  config: DualRunConfig;
  step: StepRunner;
  primaryPage: Page;
  secondaryPage: Page;
  primary: RuntimeDualAccount;
  secondary: RuntimeDualAccount;
  createSession: (account: AccountConfig) => Promise<SessionInfo>;
  cleanupStaleSmokeArtifacts: (account: AccountConfig) => Promise<{
    deletedPosts: number;
    deletedListItems: number;
    deletedLists: number;
  }>;
  waitForOwnPostRecord: (
    account: AccountConfig,
    text: string,
    timeoutMs?: number,
  ) => Promise<RepoRecord>;
  waitForFollowRecord: (
    account: AccountConfig,
    subjectDid: string,
    timeoutMs?: number,
  ) => Promise<RepoRecord>;
  waitForNoOwnRecord: (
    account: AccountConfig,
    collection: string,
    predicate: (record: RepoRecord) => boolean,
    timeoutMs?: number,
  ) => Promise<true>;
  waitForOwnListRecord: (
    account: AccountConfig,
    name: string,
    timeoutMs?: number,
  ) => Promise<RepoRecord>;
  waitForOwnListItemRecord: (
    account: AccountConfig,
    listUri: string,
    subjectDid: string,
    timeoutMs?: number,
  ) => Promise<RepoRecord>;
  recordRkey: (recordOrUri: RepoRecord | string) => string | undefined;
  pollNotifications: (args: {
    account: AccountConfig;
    authorHandle: string;
    reasons: string[];
    minIndexedAt: number;
    timeoutMs?: number;
  }) => Promise<{
    notifications: FlexibleRecord[];
    allNotifications: FlexibleRecord[];
  }>;
  openListPage: (page: Page, handle: string, listRkey: string) => Promise<void>;
  createList: (
    page: Page,
    name: string,
    description: string,
  ) => Promise<FlexibleRecord>;
  editCurrentList: (
    page: Page,
    name: string,
    description: string,
  ) => Promise<FlexibleRecord>;
  addUserToCurrentList: (page: Page, handle: string) => Promise<FlexibleRecord>;
  removeUserFromCurrentList: (
    page: Page,
    handle: string,
  ) => Promise<FlexibleRecord>;
  deleteCurrentList: (page: Page) => Promise<FlexibleRecord>;
  setRadioSetting: (
    page: Page,
    route: string,
    name: string,
  ) => Promise<FlexibleRecord>;
  setCheckboxSetting: (
    page: Page,
    route: string,
    name: string,
    desired: boolean,
  ) => Promise<FlexibleRecord>;
}

export interface DualStepHelpers {
  screenshot: (pageName: PageName, name: string) => Promise<string>;
  normalizeText: (text: string | null | undefined) => string;
  isIgnoredConsole: (entry: ConsoleEntry) => boolean;
  isIgnoredRequestFailure: (entry: RequestFailureEntry) => boolean;
  isIgnoredHttpFailure: (entry: HttpFailureEntry) => boolean;
  step: StepRunner;
  wait: PageWait;
  buttonText: (locator: Locator) => Promise<string>;
}

export interface SetupDualBrowserResult {
  browser: Browser;
  primaryPage: Page;
  secondaryPage: Page;
}
