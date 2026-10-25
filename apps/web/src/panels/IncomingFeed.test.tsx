import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeskAdapter, DeskState } from '../adapters/contract';
import { DeskProvider } from '../adapters/DeskContext';
import { createLegacyReplay as createExerciseReplay, legacyFixture as exerciseFixture } from '../test/legacyExercise';
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

const schoolCard = () => screen.getByText('School', { selector: 'strong' }).closest('li')!;

describe('IncomingFeed', () => {
  it('shows an honest empty state with no source', () => {
    render(
      <DeskProvider adapter={null}>
        <IncomingFeed selectedIncidentId={null} onSelectIncident={() => {}} />
      </DeskProvider>,
    );
    expect(screen.getByText('No source connected.')).toBeInTheDocument();
  });

  it('groups the six originals into one card per place, and lists them verbatim when expanded', async () => {
    setup();
    const list = await screen.findByRole('list', { name: 'Incoming reports by place, most recent first' });
    expect(list.children).toHaveLength(3); // school, shelter, residence
    expect(schoolCard()).toHaveTextContent('2 reports grouped into 1 incident');
    await userEvent.click(within(schoolCard()).getAllByRole('button')[0]);
    const originals = within(schoolCard()).getAllByText((_, el) => el?.classList.contains('original-text') ?? false);
    expect(originals.map((el) => el.textContent)).toEqual([exerciseFixture.reports.R05.text, exerciseFixture.reports.R01.text]);
  });

  it('selects the incident by keyboard', async () => {
    const { onSelectIncident } = setup();
    await screen.findByRole('list', { name: /by place/ });
    within(schoolCard()).getAllByRole('button')[0].focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelectIncident).toHaveBeenCalledWith('INC-school');
  });

  it('shows a null sent time as "not given" (R10)', async () => {
    const { adapter, runId } = setup();
    await advanceTo(adapter, runId(), 4); // R07..R10
    await userEvent.click(within(schoolCard()).getAllByRole('button')[0]);
    const r10 = within(schoolCard()).getByText(exerciseFixture.reports.R10.text).closest('li')!;
    await userEvent.click(within(r10).getByText('Details'));
    expect(r10).toHaveTextContent('Sent: not given');
    expect(schoolCard()).toHaveTextContent('waiting');
  });

  it('flags R11 as sent earlier but arrived late', async () => {
    const { adapter, runId } = setup();
    await advanceTo(adapter, runId(), 5); // R07..R11
    await userEvent.click(within(schoolCard()).getAllByRole('button')[0]);
    const r11 = within(schoolCard()).getByText(exerciseFixture.reports.R11.text).closest('li')!;
    expect(within(r11).getByText('Arrived late · sent before a report already received')).toHaveClass('change-flag');
    expect(screen.getAllByText(/Arrived late/)).toHaveLength(1);
  });
});
