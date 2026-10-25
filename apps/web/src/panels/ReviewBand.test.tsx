import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeskAdapter, DeskState } from '../adapters/contract';
import { DeskProvider } from '../adapters/DeskContext';
import { createLegacyReplay as createExerciseReplay } from '../test/legacyExercise';
import { ConfirmedQueue } from './ConfirmedQueue';
import { ReviewBand } from './ReviewBand';

function setup() {
  const adapter = createExerciseReplay();
  let state!: DeskState;
  adapter.subscribeState((s) => (state = s));
  const onSelect = vi.fn();
  render(
    <DeskProvider adapter={adapter}>
      <ReviewBand selectedIncidentId={null} onSelectIncident={onSelect} />
      <ConfirmedQueue selectedIncidentId={null} onSelectIncident={() => {}} />
    </DeskProvider>,
  );
  return { adapter, get: () => state, onSelect };
}

const delivered = (a: DeskAdapter) => {
  let c = 0;
  a.subscribeState((s) => (c = s.scenario!.deliveredCount))();
  return c;
};

let n = 0;
async function advance(adapter: DeskAdapter, runId: string) {
  await act(async () => {
    await adapter.advanceScenario({ runId, commandId: `t-${++n}`, expectedDeliveredCount: delivered(adapter) });
  });
}

const queueOrder = () =>
  screen.getAllByTestId(/^queue-/).map((el) => el.getAttribute('data-testid')!.replace('queue-', ''));

describe('ReviewBand', () => {
  it('shows an honest empty state with no source', () => {
    render(
      <DeskProvider adapter={null}>
        <ReviewBand selectedIncidentId={null} onSelectIncident={() => {}} />
      </DeskProvider>,
    );
    expect(screen.getByText('No source connected.')).toBeInTheDocument();
  });

  it('R07 appears unconfirmed with its original text, and the queue does not move', async () => {
    const { adapter, get, onSelect } = setup();
    expect(await screen.findByText('Nothing needs review.')).toBeInTheDocument();
    await advance(adapter, get().runId);
    const card = await screen.findByTestId('review-R07');
    expect(
      within(card).getByText(
        'Correction: the school gym is clear, but someone may still be upstairs in the main building.',
      ),
    ).toHaveClass('original-text');
    expect(within(card).getByText('Unconfirmed')).toBeInTheDocument();
    expect(within(card).getByText('Life safety')).toHaveClass('tag-life-safety');
    expect(card).not.toHaveTextContent(/R07|#7|Candidate incident/);
    expect(within(card).queryByText(/model score/)).not.toBeInTheDocument();
    expect(queueOrder()).toEqual(['INC-residence', 'INC-shelter', 'INC-school']);
    expect(screen.getByText('New report · review needed')).toBeInTheDocument();
    await userEvent.click(within(card).getAllByRole('button')[0]);
    expect(onSelect).toHaveBeenCalledWith('INC-school');
  });

  it('operator approval moves INC-school to rank 1', async () => {
    const { adapter, get } = setup();
    await screen.findByText('Nothing needs review.');
    await advance(adapter, get().runId);
    const card = await screen.findByTestId('review-R07');
    await userEvent.click(within(card).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(queueOrder()).toEqual(['INC-school', 'INC-residence', 'INC-shelter']));
    expect(screen.getByText('Nothing needs review.')).toBeInTheDocument();
  });

  it('rejecting needs a written reason', async () => {
    const { adapter, get } = setup();
    await screen.findByText('Nothing needs review.');
    await advance(adapter, get().runId);
    const card = await screen.findByTestId('review-R07');
    await userEvent.click(within(card).getByRole('button', { name: 'Reject' }));
    const confirm = within(card).getByRole('button', { name: 'Confirm reject' });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(card).getByLabelText('Reason for rejecting'), 'Duplicate of an older report');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() => expect(get().proposals[0].reviewState).toBe('REJECTED'));
    expect(queueOrder()).toEqual(['INC-residence', 'INC-shelter', 'INC-school']);
  });

  it('a stale approval shows STALE_REVISION', async () => {
    const { adapter, get } = setup();
    await screen.findByText('Nothing needs review.');
    await advance(adapter, get().runId);
    await advance(adapter, get().runId);
    await userEvent.click(within(await screen.findByTestId('review-R07')).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.queryByTestId('review-R07')).not.toBeInTheDocument());
    await userEvent.click(within(screen.getByTestId('review-R08')).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('STALE_REVISION');
  });
});
