// INTERIM copy of the §17 contract for the web app. Replace every import of this
// file with `packages/domain` once `[contract] v1` (G0) merges; field meanings must
// not drift from §17 in the meantime. Types below the §17 block are the web's
// snapshot/command shapes for the §17 adapter commands and are proposals to ws/state.

// ---- §17, verbatim ----
export type Attention = 'POSSIBLE_LIFE_SAFETY' | 'ACTIVE_NEED' | 'INFORMATION';
export type LocalAction = 'NEW_INCIDENT' | 'ATTACH_REPORT' | 'FLAG_CORRECTION' | 'FLAG_CONFLICT' | 'REQUEST_REVIEW';
export type Provider = 'local_laya' | 'claude' | 'operator' | 'recording' | 'fixture' | 'rule';

export type ReportInput = {
  runId: string;
  sourceId: string;
  messageId: string;
  text: string;
  origin: 'radio' | 'scenario' | 'operator';
  sentAt: string | null;
  reportedEventAt: string | null;
  reportedLocation: { placeId: string; source: 'sender_explicit' | 'operator' } | null;
  transport: {
    verification: 'verified' | 'not_applicable';
    encoding: 'raw' | 'lightweight' | 'llm' | 'not_applicable';
    measurementSource: 'measured' | 'calculated' | 'simulated' | 'not_applicable';
    originalBytes: number | null;
    applicationPacketBytes: number | null;
  };
};

export type IncidentView = {
  runId: string;
  incidentId: string;
  revision: number;
  status: 'OPEN' | 'RESOLVED';
  attention: Attention | null;
  confirmedPlaceId: string | null;
  confirmedReportIds: string[];
  summary: string | null;
  openCycleStartSequence: number;
};

export type LabelScore = { label: string; value: number; kind: 'probability' | 'score' };

export type LocalSuggestion = {
  runId: string;
  reportId: string;
  action: LocalAction;
  candidateIncidentId: string | null;
  attention: Attention | null;
  scores: LabelScore[];
  evidenceReportIds: string[];
  baseIncidentVersions: Record<string, number>;
  inputSignature: string;
  provider: Provider;
};

export type RelationKind = 'REPEAT' | 'UPDATE' | 'CORRECTION' | 'CONFLICT';

export type IncidentProposal = {
  runId: string;
  proposalId: string;
  incidentId: string;
  baseIncidentVersions: Record<string, number>;
  inputSignature: string;
  addReportIds: string[];
  relations: { reportId: string; targetReportId: string; kind: RelationKind }[];
  suggestedStatus: 'OPEN' | 'RESOLVED' | null;
  suggestedAttention: Attention | null;
  suggestedSummary: string | null;
  evidenceReportIds: string[];
  uncertainties: string[];
  provider: Provider;
};

export type ErrorCode =
  | 'STALE_REVISION'
  | 'INVALID_SOURCE'
  | 'INVALID_INPUT'
  | 'UNAUTHORIZED'
  | 'WRONG_RUN'
  | 'SERVICE_UNAVAILABLE';

// ---- web snapshot shapes (§9 records as the UI reads them) ----
export type RunMode = 'LIVE' | 'LOCAL DEGRADED' | 'LOCAL REPLAY' | 'NOT CONNECTED';

/** A stored report. The backend (or replay) assigns id, sequence, and receive time. */
export type ReportRecord = {
  reportId: string;
  receiveSequence: number;
  /** Time this run received it. Distinct from input.sentAt and input.reportedEventAt. */
  receivedAt: string;
  input: ReportInput;
  /** Where this record came from in this run: fixture in replay, never a live claim. */
  provenance: Provider;
};

export type ProposalRecord = IncidentProposal & { reviewState: 'PENDING' | 'APPROVED' | 'REJECTED' };

export type ReviewEvent = {
  sequence: number;
  commandId: string;
  actor: Provider;
  incidentId: string;
  proposalId: string | null;
  priorRevision: number;
  newRevision: number;
  changes: string[];
  reason: string | null;
};

export type ScenarioProgress = {
  delivered: number;
  total: number;
  /** Message ID of the next scenario report, or null when the script is done. */
  nextMessageId: string | null;
};

export type DeskState = {
  runId: string;
  mode: RunMode;
  sourceProvenance: string;
  inferenceProvenance: string;
  reports: ReportRecord[];
  incidents: IncidentView[];
  suggestions: LocalSuggestion[];
  proposals: ProposalRecord[];
  reviewEvents: ReviewEvent[];
  scenario: ScenarioProgress;
};

// ---- §17 adapter commands ----
export type AdapterError = { code: ErrorCode; message: string };
export type Result<T> = { ok: true; value: T } | { ok: false; error: AdapterError };

type Command = { runId: string; commandId: string };

export type DeskAdapter = {
  subscribeState(listener: (state: DeskState) => void): () => void;
  receiveReport(input: ReportInput): Promise<Result<{ reportId: string }>>;
  submitLocalSuggestion(suggestion: LocalSuggestion): Promise<Result<null>>;
  submitIncidentProposal(proposal: IncidentProposal): Promise<Result<{ proposalId: string }>>;
  approveProposal(cmd: Command & { proposalId: string }): Promise<Result<{ incidentId: string; revision: number }>>;
  rejectProposal(cmd: Command & { proposalId: string; reason: string }): Promise<Result<null>>;
  operatorEdit(
    cmd: Command & {
      incidentId: string;
      baseRevision: number;
      attention?: Attention | null;
      status?: 'OPEN' | 'RESOLVED';
      reason: string;
    },
  ): Promise<Result<{ incidentId: string; revision: number }>>;
  claimJob(cmd: { runId: string; workerId: string }): Promise<Result<null>>;
  advanceScenario(cmd: Command): Promise<Result<{ reportId: string } | null>>;
  resetRun(): Promise<Result<{ runId: string }>>;
};
