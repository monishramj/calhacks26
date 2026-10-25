// Contract v1 types. §17 types are verbatim; §9 records and commands are the G0
// freeze (see work/validation/G0.md "Contract choices"). schema/contract.schema.json
// is the wire authority; these types describe the same shapes.

// ---- §17, verbatim ----------------------------------------------------------------

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

// ---- results ------------------------------------------------------------------------

/** Client-safe error: never embeds a provider response or secret. */
export type ContractError = { code: ErrorCode; message: string };
export type Result<T> = { ok: true; value: T } | { ok: false; error: ContractError };

// ---- identities ---------------------------------------------------------------------

/** Backend-verified caller role (from the SpacetimeDB identity), never a client field. */
export type Role = 'operator' | 'bridge' | 'simulator' | 'worker';
export type AdapterMethod =
  | 'subscribeState'
  | 'receiveReport'
  | 'submitLocalSuggestion'
  | 'submitIncidentProposal'
  | 'approveProposal'
  | 'rejectProposal'
  | 'operatorEdit'
  | 'claimJob'
  | 'advanceScenario'
  | 'resetRun';
/** live = SpacetimeDB run; replay = isolated in-browser run (writes never reach live). */
export type RunKind = 'live' | 'replay';

// ---- §9 records -------------------------------------------------------------------------

/** Where a stored report came from in this run. Separate from model `Provider`. */
export type ReportProvenance = 'live' | 'simulated' | 'recorded' | 'fixture';

/** A stored report. The backend assigns reportId, receiveSequence, and receivedAt. */
export type Report = {
  reportId: string;
  /** Monotonic per run, assigned by the backend. Never sender-supplied. */
  receiveSequence: number;
  /** Backend receive time (RFC 3339). Distinct from input.sentAt and input.reportedEventAt. */
  receivedAt: string;
  provenance: ReportProvenance;
  /** The original input, unchanged. */
  input: ReportInput;
};

export type ReportRelation = {
  runId: string;
  relationId: string;
  reportId: string;
  targetReportId: string;
  kind: RelationKind;
  incidentId: string;
  state: 'PROVISIONAL' | 'CONFIRMED';
  proposalId: string | null;
  /** Backend identity of the confirming operator; null while provisional. */
  reviewer: string | null;
};

export type ReviewState = 'PENDING' | 'APPROVED' | 'REJECTED' | 'STALE';

/** §9 InferenceProposal, local half. */
export type SuggestionRecord = {
  suggestionId: string;
  jobId: string;
  reviewState: ReviewState;
  suggestion: LocalSuggestion;
};

/** §9 InferenceProposal, incident half. Operator-authored proposals have no job. */
export type ProposalRecord = {
  jobId: string | null;
  submittedByRole: 'worker' | 'operator';
  reviewState: ReviewState;
  proposal: IncidentProposal;
};

export type JobKind = 'LOCAL_SUGGESTION' | 'INCIDENT_PROPOSAL';
export type Job = {
  runId: string;
  jobId: string;
  kind: JobKind;
  reportId: string | null;
  incidentId: string | null;
  inputSignature: string;
  state: 'QUEUED' | 'CLAIMED' | 'DONE' | 'FAILED' | 'INVALIDATED';
  attempts: number;
  claim: { workerIdentity: string; leaseExpiresAt: string } | null;
};

export type JobReport = Pick<ReportInput, 'text' | 'sentAt' | 'reportedEventAt' | 'reportedLocation'> & {
  reportId: string;
  receiveSequence: number;
};

/** Everything a worker (Laya or Claude) sees. Built only from delivered state. */
export type JobInput = {
  runId: string;
  jobId: string;
  kind: JobKind;
  inputSignature: string;
  targetReportId: string | null;
  incidentId: string | null;
  /** Ordered by receiveSequence. */
  reports: JobReport[];
  candidateIncidents: IncidentView[];
  places: { placeId: string; aliases: string[] }[];
};

export type ChangeField = 'status' | 'attention' | 'confirmedPlaceId' | 'summary' | 'addReportIds' | 'relations';

export type ReviewEvent = {
  runId: string;
  sequence: number;
  commandId: string;
  /** Only operators change confirmed state. */
  actorRole: 'operator';
  actorIdentity: string;
  incidentId: string;
  proposalId: string | null;
  priorRevision: number;
  newRevision: number;
  acceptedChanges: ChangeField[];
  reason: string | null;
  sourceReportIds: string[];
};

/** Client-visible scenario progress. The script itself stays in a private table. */
export type ScenarioState = {
  runId: string;
  exerciseVersion: string;
  seed: string;
  logicalClock: number;
  deliveredCount: number;
  totalCount: number;
  awaitingPresenter: boolean;
  nextGate: 'SEND_NEXT_REPORT' | null;
};

// ---- commands -----------------------------------------------------------------------------

export type ApproveProposalCommand = {
  commandId: string;
  runId: string;
  proposalId: string;
  /** What the operator saw; approval re-validates both against current state. */
  inputSignature: string;
  baseIncidentVersions: Record<string, number>;
};
export type RejectProposalCommand = { commandId: string; runId: string; proposalId: string; reason: string };
export type OperatorEditCommand = {
  commandId: string;
  runId: string;
  incidentId: string;
  baseRevision: number;
  changes: {
    status?: 'OPEN' | 'RESOLVED';
    attention?: Attention | null;
    confirmedPlaceId?: string | null;
    summary?: string | null;
    addReportIds?: string[];
  };
  /** A reason, source reports, or both. */
  reason: string | null;
  sourceReportIds: string[];
};
export type ClaimJobCommand = { runId: string; kinds: JobKind[] };
export type SubmitLocalSuggestionCommand = { jobId: string; suggestion: LocalSuggestion };
export type SubmitIncidentProposalCommand = { jobId: string | null; proposal: IncidentProposal };
export type AdvanceScenarioCommand = { commandId: string; runId: string; expectedDeliveredCount: number };
export type ResetRunCommand = { commandId: string; runId: string };

// ---- adapter (live: ws/state on SpacetimeDB; replay: ws/web in-browser) -----------------------

export type DeskMode = 'LIVE' | 'LOCAL DEGRADED' | 'LOCAL REPLAY' | 'NOT CONNECTED';

export type DeskState = {
  runId: string;
  mode: DeskMode;
  reports: Report[];
  incidents: IncidentView[];
  relations: ReportRelation[];
  suggestions: SuggestionRecord[];
  proposals: ProposalRecord[];
  reviewEvents: ReviewEvent[];
  scenario: ScenarioState | null;
};

export interface DeskAdapter {
  subscribeState(listener: (state: DeskState) => void): () => void;
  receiveReport(input: ReportInput): Promise<Result<{ reportId: string; duplicate: boolean }>>;
  submitLocalSuggestion(cmd: SubmitLocalSuggestionCommand): Promise<Result<{ suggestionId: string }>>;
  submitIncidentProposal(cmd: SubmitIncidentProposalCommand): Promise<Result<{ proposalId: string }>>;
  approveProposal(cmd: ApproveProposalCommand): Promise<Result<{ incidentId: string; revision: number }>>;
  rejectProposal(cmd: RejectProposalCommand): Promise<Result<null>>;
  operatorEdit(cmd: OperatorEditCommand): Promise<Result<{ incidentId: string; revision: number }>>;
  claimJob(cmd: ClaimJobCommand): Promise<Result<{ job: Job; input: JobInput } | null>>;
  advanceScenario(cmd: AdvanceScenarioCommand): Promise<Result<{ reportId: string } | null>>;
  resetRun(cmd: ResetRunCommand): Promise<Result<{ runId: string }>>;
}
