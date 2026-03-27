export type FlexibleRecord = Record<string, unknown>;

export interface RepoRecord extends FlexibleRecord {
  uri?: string;
  value?: FlexibleRecord;
}

export interface AccountConfig extends FlexibleRecord {
  handle: string;
  password: string;
  birthdate: string;
  cleanupPostPrefixes: string[];
  loginIdentifier?: string;
  postText?: string;
  mediaPostText?: string;
  quoteText?: string;
  replyText?: string;
  profileNote?: string;
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
  baselineCounts?: FlexibleRecord;
}

export interface SuiteConfig extends FlexibleRecord {
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

export interface ExampleBaseConfig extends FlexibleRecord {
  pdsUrl: string;
  targetHandle: string;
  strictErrors: boolean;
  primaryHandle: string;
  secondaryHandle: string;
}

export interface Adapter extends FlexibleRecord {
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

export interface SummaryStep extends FlexibleRecord {
  name: string;
  status: string;
  at: string;
}

export interface SummaryUnexpected extends FlexibleRecord {
  console: FlexibleRecord[];
  requestFailures: FlexibleRecord[];
  httpFailures: FlexibleRecord[];
  pageErrors: FlexibleRecord[];
  total?: number;
}

export interface Summary extends FlexibleRecord {
  startedAt: string;
  finishedAt?: string;
  steps: SummaryStep[];
  console: FlexibleRecord[];
  pageErrors: FlexibleRecord[];
  requestFailures: FlexibleRecord[];
  httpFailures: FlexibleRecord[];
  xrpc: FlexibleRecord[];
  notes: string[];
  unexpected?: SummaryUnexpected;
  fatal?: string;
  ok?: boolean;
}

export interface FetchJsonResult extends FlexibleRecord {
  ok: boolean;
  status: number;
  text: string;
  json: FlexibleRecord | FlexibleRecord[] | null;
}

export interface FetchStatusResult extends FlexibleRecord {
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
