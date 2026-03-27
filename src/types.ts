export type FlexibleRecord = Record<string, unknown>;

export interface RepoRecord extends FlexibleRecord {
  uri?: string;
  value?: FlexibleRecord;
}

export interface RenderedProfileCountsRaw {
  followersText?: string;
  followsText?: string;
}

export interface RenderedProfileCounts {
  followersCount: number;
  followsCount: number;
  raw: RenderedProfileCountsRaw;
}

export interface ProfileCountsSnapshot {
  rendered: RenderedProfileCounts;
  api: {
    followersCount?: number;
    followsCount?: number;
  };
}

export interface AccountConfig {
  handle: string;
  password: string;
  birthdate: string;
  cleanupPostPrefixes: string[];
  loginIdentifier?: string;
  postText: string;
  mediaPostText: string;
  quoteText: string;
  replyText: string;
  profileNote: string;
  did?: string;
  email?: string;
  pdsUrl?: string;
  pdsHost?: string;
  accessJwt?: string;
  shortHandle?: string;
  listName?: string;
  listDescription?: string;
  listUpdatedName?: string;
  listUpdatedDescription?: string;
  listRkey?: string;
  rootPost?: RepoRecord;
  imagePost?: RepoRecord;
  quotePost?: RepoRecord;
  replyPost?: RepoRecord;
  listRecord?: RepoRecord;
  listItemRecord?: RepoRecord;
  remoteReplyPost?: RepoRecord;
  remoteReplyWasFollowingTarget?: boolean;
  session?: FlexibleRecord;
  baselineCounts?: ProfileCountsSnapshot;
}

export interface RuntimeDualAccount extends AccountConfig {
  did: string;
  accessJwt: string;
  shortHandle: string;
  listName: string;
  listDescription: string;
  listUpdatedName: string;
  listUpdatedDescription: string;
  session: SessionInfo;
}

export interface SessionInfo extends FlexibleRecord {
  accessJwt: string;
  did: string;
}

export interface SuiteConfig {
  pdsUrl: string;
  pdsHost: string;
  artifactsDir: string;
  appUrl: string;
  publicApiUrl: string;
  publicCheckTimeoutMs: number;
  stepTimeoutMs: number;
  headless: boolean;
  strictErrors: boolean;
  publicChecks: boolean;
  targetHandle?: string;
  remoteReplyPostUrl?: string;
  browserExecutablePath?: string;
  adapter?: string;
  progress?: boolean;
}

export type SingleRunConfig = SuiteConfig &
  Omit<AccountConfig, "pdsUrl" | "pdsHost"> & {
    targetHandle: string;
    editProfile: boolean;
  };

export interface DualRunConfig extends SuiteConfig {
  primary: AccountConfig;
  secondary: AccountConfig;
  accountSource?: string;
}

export interface ExampleBaseConfig {
  pdsUrl: string;
  targetHandle: string;
  strictErrors: boolean;
  primaryHandle: string;
  secondaryHandle: string;
  remoteReplyPostUrl?: string;
}

export interface Adapter {
  name: string;
  description: string;
  accountStrategy: string;
  notes: string[];
  createSingleConfig: (raw?: FlexibleRecord) => SingleRunConfig;
  createDualConfig: (raw?: FlexibleRecord) => DualRunConfig;
  createExampleConfig: (raw: { mode: "single" | "dual" }) => FlexibleRecord;
}

export interface ParsedCliArgs {
  command?: string;
  adapter: string;
  configPath?: string;
  mode?: "single" | "dual";
  outputPath?: string;
  help?: boolean;
  jsonOnly?: boolean;
}

export interface SummaryStep {
  name: string;
  status: string;
  at: string;
  error?: string;
  note?: string;
  rowFound?: boolean;
  rowTestId?: string | null;
  screenshot?: string;
  screenshots?: Record<string, string | undefined>;
}

export interface ConsoleEntry {
  page?: string;
  type: string;
  text: string;
}

export interface PageErrorEntry {
  page?: string;
  message: string;
  stack?: string;
}

export interface RequestFailureEntry {
  page?: string;
  url: string;
  method: string;
  errorText: string;
}

export interface HttpFailureEntry {
  page?: string;
  url: string;
  status: number;
  method: string;
}

export interface XrpcEntry {
  page?: string;
  url: string;
  status: number;
  method: string;
}

export interface SummaryUnexpected {
  console: ConsoleEntry[];
  requestFailures: RequestFailureEntry[];
  httpFailures: HttpFailureEntry[];
  pageErrors: PageErrorEntry[];
  total?: number;
}

export interface Summary {
  startedAt: string;
  finishedAt?: string;
  steps: SummaryStep[];
  console: ConsoleEntry[];
  pageErrors: PageErrorEntry[];
  requestFailures: RequestFailureEntry[];
  httpFailures: HttpFailureEntry[];
  xrpc: XrpcEntry[];
  notes: string[];
  unexpected?: SummaryUnexpected;
  fatal?: string;
  ok?: boolean;
}

export interface FetchJsonResult {
  ok: boolean;
  status: number;
  text: string;
  json: FlexibleRecord | FlexibleRecord[] | null;
}

export interface FetchStatusResult {
  ok: boolean;
  status: number;
  url: string;
}

export interface XrpcJsonOptions extends FlexibleRecord {
  method?: string;
  token?: string;
  params?: Record<string, string>;
  body?: FlexibleRecord;
  timeoutMs?: number;
  pdsUrl?: string;
}
