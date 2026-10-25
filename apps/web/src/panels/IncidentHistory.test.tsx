import { act, render, screen, within } from '@testing-library/react';
import type { DeskState } from '../adapters/contract';
import { DeskProvider } from '../adapters/DeskContext';
import { createExerciseReplay, exerciseFixture } from '../adapters/replay';
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

  it('lists R01 and R05 as confirmed with the authored seed review event', async () => {
    setup('INC-school');
    const timeline = await screen.findByRole('list', { name: 'Timeline for INC-school, receive order' });
    const items = within(timeline).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('R01 · #1');
    expect(within(items[0]).getByText(exerciseFixture.reports.R01.text)).toHaveClass('original-text');
    expect(items[0]).toHaveTextContent('Confirmed');
    expect(items[1]).toHaveTextContent('R05 · #5');
    expect(items[1]).toHaveTextContent('Confirmed');
    expect(items[1]).toHaveTextContent('Event: not given');

    const history = screen.getByRole('list', { name: 'Review history for INC-school' });
    expect(history).toHaveTextContent('Fixture (authored)');
    expect(history).toHaveTextContent('Rev 0 → 1');
    expect(history).toHaveTextContent(/authored starting state: INFORMATION, reports R01, R05/);
    expect(history).toHaveTextContent(/Reason: Authored §18 starting condition/);
    expect(screen.getByText('No proposals.')).toBeInTheDocument();
    expect(screen.queryByText(/summary may be out of date/)).not.toBeInTheDocument();
  });

  it('after R07, shows it as pending review with a PENDING proposal', async () => {
    const { adapter, runId } = setup('INC-school');
    await act(async () => {
      const r = await adapter.advanceScenario({ runId: runId(), commandId: 'hist-r07' });
      expect(r.ok).toBe(true);
    });
    const r07 = (await screen.findByText(exerciseFixture.reports.R07.text)).closest('li')!;
    expect(r07).toHaveTextContent('R07 · #7');
    expect(r07).toHaveTextContent('Pending review');
    const proposals = screen.getByRole('list', { name: 'Proposals for INC-school' });
    expect(proposals).toHaveTextContent('PENDING: Pending review');
    expect(proposals).toHaveTextContent('Fixture (authored)');
    expect(proposals).toHaveTextContent("Uncertainty: 'may still be upstairs' is not a confirmed person");
    expect(screen.getByText('New evidence · summary may be out of date')).toHaveClass('change-flag');
  });
});
