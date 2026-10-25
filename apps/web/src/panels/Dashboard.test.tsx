import { useState } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeskState, IncidentPicture, LabelScore } from '../adapters/contract';
import { DeskProvider } from '../adapters/DeskContext';
import { createLegacyReplay } from '../test/legacyExercise';
import { PLACES } from '../scene/model';
import { ConfirmedQueue } from './ConfirmedQueue';
import { PicturePanel } from './PicturePanel';
import { ReviewBand } from './ReviewBand';
import { RelativeAge } from './shared';

async function pendingState() {
  const adapter = createLegacyReplay();
  let state!: DeskState;
  const unsubscribe = adapter.subscribeState((s) => { state = s; });
  await adapter.advanceScenario({ runId: state.runId, commandId: 'pending', expectedDeliveredCount: 6 });
  unsubscribe();
  return { adapter, state };
}

function Panels({ initial = null }: { initial?: string | null }) {
  const [selectedIncidentId, onSelectIncident] = useState<string | null>(initial);
  const selection = { selectedIncidentId, onSelectIncident };
  return <><ReviewBand {...selection} /><ConfirmedQueue {...selection} /><PicturePanel {...selection} /></>;
}

async function renderPending(scores: LabelScore[] = [], extra: object = {}) {
  const { adapter, state } = await pendingState();
  state.suggestions[0].suggestion.scores = scores;
  state.reports.find((r) => r.input.messageId === 'R07')!.input.reportedLocation = { placeId: PLACES[0].id, source: 'sender_explicit' };
  Object.assign(state, extra);
  const view = { ...adapter, subscribeState: (listener: (s: DeskState) => void) => { listener(state); return () => {}; } };
  render(<DeskProvider adapter={view}><Panels /></DeskProvider>);
  return { card: await screen.findByTestId('review-R07'), state };
}

it('shows the highest attention and action probabilities, with a readable place', async () => {
  const { card } = await renderPending([
    { label: 'ACTIVE_NEED', value: .15, kind: 'probability' },
    { label: 'POSSIBLE_LIFE_SAFETY', value: .85, kind: 'probability' },
    { label: 'NEW_INCIDENT', value: .1, kind: 'probability' },
    { label: 'FLAG_CORRECTION', value: .9, kind: 'probability' },
  ]);
  expect(card).toHaveTextContent('Laya · Life safety 85% · Correct earlier report · 90%');
  expect(card).not.toHaveTextContent(/15%|10%/);
  expect(within(card).getByText(PLACES[0].name)).toBeInTheDocument();
  expect(within(card).getByText('Unconfirmed')).toBeInTheDocument();
});

it('labels raw scores as scores and never converts them to percentages', async () => {
  const { card } = await renderPending([{ label: 'ACTIVE_NEED', value: 2.7, kind: 'score' }]);
  expect(card).toHaveTextContent('Needs help 2.7 score');
  expect(card).not.toHaveTextContent('%');
});

it('renders no invented confidence or Claude explanation when data is absent', async () => {
  const { card } = await renderPending();
  expect(card).not.toHaveTextContent(/%|score|Claude ·/);
  expect(card).toHaveTextContent('Correct earlier report');
});

it('shows optional Claude summary and reason without changing confirmation', async () => {
  const { state } = await pendingState();
  const reportId = state.suggestions[0].suggestion.reportId;
  const { card } = await renderPending([], {
    checks: [{
      check: { reportId, summary: 'Someone may be upstairs.', reason: 'Claude reads it as a correction.' },
      outcome: 'SENT_TO_PERSON', reason: 'The correction leaves a possible life-safety concern.',
    }] as unknown as DeskState['checks'],
  });
  expect(card).toHaveTextContent('Claude · Someone may be upstairs.');
  expect(card).toHaveTextContent('The correction leaves a possible life-safety concern.');
  expect(card).toHaveTextContent('Unconfirmed');
});

it('keeps metadata in collapsed Details on only the selected review card', async () => {
  const { card } = await renderPending();
  expect(within(card).queryByText('Details')).not.toBeInTheDocument();
  await userEvent.click(within(card).getAllByRole('button')[0]);
  const details = within(card).getByText('Details').closest('details')!;
  expect(details).not.toHaveAttribute('open');
  await userEvent.click(within(card).getByText('Details'));
  expect(details).toHaveAttribute('open');
  expect(details).toHaveTextContent('Report: R07');
  expect(details).toHaveTextContent('fixture');
  expect(details).toHaveTextContent('correction');
});

it('A approves the focused report, while typing a rejection reason does not', async () => {
  const { adapter } = await pendingState();
  const approve = vi.spyOn(adapter, 'approveProposal');
  render(<DeskProvider adapter={adapter}><Panels /></DeskProvider>);
  const card = await screen.findByTestId('review-R07');
  await userEvent.click(within(card).getByRole('button', { name: 'Reject' }));
  await userEvent.type(within(card).getByLabelText('Reason for rejecting'), 'a');
  expect(approve).not.toHaveBeenCalled();
  within(card).getAllByRole('button')[0].focus();
  await userEvent.keyboard('{Control>}a{/Control}');
  expect(approve).not.toHaveBeenCalled();
  await userEvent.keyboard('a');
  expect(approve).toHaveBeenCalledOnce();
  expect(screen.queryByTestId('review-R07')).not.toBeInTheDocument();
});

it('filters the queue and moves selection with Up/Down without intercepting override fields', async () => {
  render(<DeskProvider adapter={createLegacyReplay()}><Panels initial="INC-residence" /></DeskProvider>);
  const residence = await screen.findByTestId('queue-INC-residence');
  within(residence).getAllByRole('button')[0].focus();
  await userEvent.keyboard('{ArrowDown}');
  const shelter = screen.getByTestId('queue-INC-shelter');
  expect(within(shelter).getAllByRole('button')[0]).toHaveAttribute('aria-current', 'true');
  await userEvent.click(within(shelter).getByRole('button', { name: 'Override INC-shelter' }));
  const status = within(shelter).getByLabelText('Status');
  status.focus();
  await userEvent.keyboard('{ArrowDown}');
  expect(within(shelter).getAllByRole('button')[0]).toHaveAttribute('aria-current', 'true');
  within(shelter).getAllByRole('button')[0].focus();
  await userEvent.keyboard('{ArrowUp}');
  expect(within(residence).getAllByRole('button')[0]).toHaveAttribute('aria-current', 'true');
  await userEvent.click(screen.getByRole('button', { name: 'Info 1' }));
  expect(screen.getAllByTestId(/^queue-/)).toHaveLength(1);
  expect(screen.getByTestId('queue-INC-school')).toBeInTheDocument();
});

it('uses only the latest confirming actor for the auto-confirmed label', async () => {
  const { adapter, state } = await pendingState();
  const event = { runId: state.runId, sequence: 1, commandId: 'check', actorRole: 'claude_check', actorIdentity: 'claude', incidentId: 'INC-school', proposalId: null, priorRevision: 0, newRevision: 1, acceptedChanges: ['attention'], reason: null, sourceReportIds: [] };
  const view = { ...adapter, subscribeState: (listener: (s: DeskState) => void) => { listener({ ...state, reviewEvents: [event] } as DeskState); return () => {}; } };
  const { rerender } = render(<DeskProvider adapter={view}><Panels /></DeskProvider>);
  expect(await screen.findByText('Auto-confirmed · Laya + Claude agree')).toBeInTheDocument();
  const edited = { ...view, subscribeState: (listener: (s: DeskState) => void) => { listener({ ...state, reviewEvents: [event, { ...event, sequence: 2, actorRole: 'operator' }] } as DeskState); return () => {}; } };
  rerender(<DeskProvider adapter={edited}><Panels /></DeskProvider>);
  expect(screen.queryByText('Auto-confirmed · Laya + Claude agree')).not.toBeInTheDocument();
});

it('shows only the selected picture, at most three claims, uncertainty, and stale status', async () => {
  const { adapter, state } = await pendingState();
  const node = { label: 'School', severity: null, chronology: [], uncertainties: ['Occupancy unknown'], conflicts: [], reportIds: [] };
  const picture: IncidentPicture = { runId: state.runId, incidentId: 'INC-school', model: 'claude', status: 'STALE', staleSinceReportId: 'rpt-007', throughSequence: 6,
    areas: [{ ...node, sites: [{ ...node, siteKind: 'school', subareas: [{ ...node, claims: ['First claim', 'Second claim', 'Third claim', 'Fourth claim'].map((text) => ({ text, reportIds: [] })) }] }] }] };
  const view = { ...adapter, subscribeState: (listener: (s: DeskState) => void) => { listener({ ...state, pictures: [picture, { ...picture, incidentId: 'INC-other' }] }); return () => {}; } };
  const { rerender } = render(<DeskProvider adapter={view}><PicturePanel selectedIncidentId={null} /></DeskProvider>);
  expect(screen.queryByText('First claim')).not.toBeInTheDocument();
  rerender(<DeskProvider adapter={view}><PicturePanel selectedIncidentId="INC-school" /></DeskProvider>);
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
  expect(screen.getByText('Unconfirmed · New reports awaiting review')).toBeInTheDocument();
  expect(screen.getByText('Uncertain: Occupancy unknown')).toBeInTheDocument();
  expect(screen.queryByText('Fourth claim')).not.toBeInTheDocument();
  state.incidents.find((i) => i.incidentId === 'INC-school')!.summary = null;
  rerender(<DeskProvider adapter={view}><ConfirmedQueue selectedIncidentId={null} onSelectIncident={() => {}} /></DeskProvider>);
  const row = screen.getByTestId('queue-INC-school');
  expect(row).toHaveTextContent('Unconfirmed · First claim');
  expect(row).not.toHaveTextContent('Second claim');
});

it('updates relative age and omits missing timestamps', () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
    const { rerender } = render(<RelativeAge since="2026-10-25T11:58:00Z" />);
    expect(screen.getByText('2m ago')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByText('3m ago')).toBeInTheDocument();
    rerender(<RelativeAge since={undefined} />);
    expect(screen.queryByRole('time')).not.toBeInTheDocument();
  } finally { vi.useRealTimers(); }
});
