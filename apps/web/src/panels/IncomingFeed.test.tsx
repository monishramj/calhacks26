import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeskAdapter, DeskState } from '../adapters/contract';
import { DeskProvider } from '../adapters/DeskContext';
import { createExerciseReplay, exerciseFixture } from '../adapters/replay';
import { IncomingFeed } from './IncomingFeed';

function setup(onSelectIncident = vi.fn()) {
  const adapter = createExerciseReplay();
  let state!: DeskState;
  adapter.subscribeState((s) => (state = s));
  render(
    <DeskProvider adapter={adapter}>
      <IncomingFeed selectedIncidentId={null} onSelectIncident={onSelectIncident} />
    </DeskProvider>,
  );
  return { adapter, runId: () => state.runId, onSelectIncident };
}

const delivered = (a: DeskAdapter) => {
  let c = 0;
  a.subscribeState((s) => (c = s.scenario!.deliveredCount))();
  return c;
};

let n = 0;
async function advanceTo(adapter: DeskAdapter, runId: string, count: number) {
  for (let i = 0; i < count; i++) {
    await act(async () => {
      const r = await adapter.advanceScenario({ runId, commandId: `feed-${++n}`, expectedDeliveredCount: delivered(adapter) });
      if (!r.ok) throw new Error(r.error.message);
    });
  }
}

describe('IncomingFeed', () => {
  it('shows an honest empty state with no source', () => {
    render(
      <DeskProvider adapter={null}>
        <IncomingFeed selectedIncidentId={null} onSelectIncident={() => {}} />
      </DeskProvider>,
    );
    expect(screen.getByText('No source connected.')).toBeInTheDocument();
  });

  it('shows all six originals verbatim, newest first, labeled Fixture provenance', async () => {
    setup();
    const list = await screen.findByRole('list', { name: 'Incoming reports, newest first' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(6);
    const ids = ['R06', 'R05', 'R04', 'R03', 'R02', 'R01'];
    items.forEach((item, i) => {
      const id = ids[i];
      expect(item).toHaveTextContent(`${id} · #${6 - i}`);
      expect(within(item).getByText(exerciseFixture.reports[id].text)).toHaveClass('original-text');
      expect(within(item).getByText('Fixture (authored)')).toBeInTheDocument();
      expect(item).toHaveTextContent(/Sent:/);
      expect(item).toHaveTextContent(/Event: not given/);
      expect(item).toHaveTextContent(/Received:/);
      expect(item).toHaveTextContent(`Receive #${6 - i}`);
      expect(item).toHaveTextContent(/sender stated/);
    });
    expect(items[0]).toHaveTextContent('Confirmed in INC-residence');
  });

  it('selects the incident by keyboard', async () => {
    const { onSelectIncident } = setup();
    const button = await screen.findByRole('button', { name: 'Select INC-school (R05 · #5)' });
    button.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelectIncident).toHaveBeenCalledWith('INC-school');
  });

  it('shows a null sent time as "not given" (R10)', async () => {
    const { adapter, runId } = setup();
    await advanceTo(adapter, runId(), 4); // R07..R10
    const r10 = (await screen.findByText(exerciseFixture.reports.R10.text)).closest('li')!;
    expect(r10).toHaveTextContent('Sent: not given');
    expect(r10).toHaveTextContent('Not yet confirmed · candidate INC-school');
  });

  it('flags R11 as sent earlier but arrived late', async () => {
    const { adapter, runId } = setup();
    await advanceTo(adapter, runId(), 5); // R07..R11
    const r11 = (await screen.findByText(exerciseFixture.reports.R11.text)).closest('li')!;
    expect(within(r11).getByText('Sent earlier than a report already received · arrived late')).toHaveClass(
      'change-flag',
    );
    expect(screen.getAllByText(/arrived late/)).toHaveLength(1);
  });
});
