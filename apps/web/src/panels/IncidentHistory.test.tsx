import { act, render, screen, within } from '@testing-library/react';
import type { DeskState } from '../adapters/contract';
import { DeskProvider } from '../adapters/DeskContext';
import { createLegacyReplay as createExerciseReplay, legacyFixture as exerciseFixture } from '../test/legacyExercise';
import { IncidentHistory } from './IncidentHistory';

function setup(selectedIncidentId: string | null) {
  const adapter = createExerciseReplay();
  let state!: DeskState;
  adapter.subscribeState((s) => (state = s));
  render(
    <DeskProvider adapter={adapter}>
      <IncidentHistory selectedIncidentId={selectedIncidentId} onSelectIncident={() => {}} />
    </DeskProvider>,
  );
  return { adapter, runId: () => state.runId };
}

describe('IncidentHistory', () => {
  it('asks for a selection and reports unknown incidents', async () => {
    setup(null);
    expect(screen.getByText('Select an incident.')).toBeInTheDocument();
  });

  it('reports an unknown incident', async () => {
    setup('INC-nowhere');
    expect(await screen.findByText('Incident not found.')).toBeInTheDocument();
  });

  it('lists confirmed originals in receive order with one time and no metadata', async () => {
    setup('INC-school');
    const timeline = await screen.findByRole('list', { name: 'Timeline for INC-school, receive order' });
    const items = within(timeline).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText(exerciseFixture.reports.R01.text)).toHaveClass('original-text');
    expect(within(items[1]).getByText(exerciseFixture.reports.R05.text)).toHaveClass('original-text');
    items.forEach((item) => {
      expect(item.querySelector('time')).toHaveAttribute('datetime');
      expect(item).not.toHaveTextContent(/R01|R05|Rev|Source:|Event:|Sent:|Unconfirmed/);
    });
  });

  it('keeps new reports clearly unconfirmed in the compact timeline', async () => {
    const { adapter, runId } = setup('INC-school');
    await act(async () => {
      const r = await adapter.advanceScenario({ runId: runId(), commandId: 'hist-r07', expectedDeliveredCount: 6 });
      expect(r.ok).toBe(true);
    });
    const r07 = (await screen.findByText(exerciseFixture.reports.R07.text, { exact: false })).closest('li')!;
    expect(r07).toHaveTextContent('Unconfirmed');
    expect(r07).not.toHaveTextContent(/R07|PENDING|Proposal|Fixture/);
    expect(r07.querySelector('time')).toHaveAttribute('datetime');
  });
});
