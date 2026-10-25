import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeskState } from '../adapters/contract';
import { DeskProvider } from '../adapters/DeskContext';
import { createLegacyReplay as createExerciseReplay } from '../test/legacyExercise';
import { ConfirmedQueue } from './ConfirmedQueue';

function setup(selected: string | null = null) {
  const adapter = createExerciseReplay();
  let state!: DeskState;
  adapter.subscribeState((s) => (state = s));
  const onSelect = vi.fn();
  render(
    <DeskProvider adapter={adapter}>
      <ConfirmedQueue selectedIncidentId={selected} onSelectIncident={onSelect} />
    </DeskProvider>,
  );
  return { adapter, get: () => state, onSelect };
}

const queueOrder = () =>
  screen.getAllByTestId(/^queue-/).map((el) => el.getAttribute('data-testid')!.replace('queue-', ''));

describe('ConfirmedQueue', () => {
  it('shows an honest empty state with no source', () => {
    render(
      <DeskProvider adapter={null}>
        <ConfirmedQueue selectedIncidentId={null} onSelectIncident={() => {}} />
      </DeskProvider>,
    );
    expect(screen.getByText('No source connected.')).toBeInTheDocument();
  });

  it('starts residence, shelter, school with written labels', async () => {
    const { onSelect } = setup('INC-shelter');
    await screen.findByTestId('queue-INC-residence');
    expect(queueOrder()).toEqual(['INC-residence', 'INC-shelter', 'INC-school']);
    expect(within(screen.getByTestId('queue-INC-residence')).getByText('Life safety')).toBeInTheDocument();
    expect(within(screen.getByTestId('queue-INC-shelter')).getByText('Needs help')).toBeInTheDocument();
    expect(within(screen.getByTestId('queue-INC-school')).getByText('Info')).toBeInTheDocument();
    const school = screen.getByTestId('queue-INC-school');
    expect(school).not.toHaveTextContent(/rev 1|open since|INC-school/);
    expect(within(school).getByText('Just now')).toBeInTheDocument();
    expect(within(school).queryByText('Details')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('queue-INC-shelter')).getByText('Details')).toBeInTheDocument();
    expect(within(screen.getByTestId('queue-INC-shelter')).getAllByRole('button')[0]).toHaveAttribute(
      'aria-current',
      'true',
    );
    await userEvent.click(within(school).getAllByRole('button')[0]);
    expect(onSelect).toHaveBeenCalledWith('INC-school');
  });

  it('an override needs a reason and goes through the adapter', async () => {
    const { get } = setup('INC-shelter');
    const shelter = await screen.findByTestId('queue-INC-shelter');
    await userEvent.click(within(shelter).getByRole('button', { name: 'Override INC-shelter' }));
    const apply = within(shelter).getByRole('button', { name: 'Apply override' });
    expect(apply).toBeDisabled();
    await userEvent.selectOptions(within(shelter).getByLabelText('Status'), 'RESOLVED');
    await userEvent.type(within(shelter).getByLabelText('Reason for override'), 'Blankets delivered');
    expect(apply).toBeEnabled();
    await userEvent.click(apply);
    await waitFor(() => expect(queueOrder()).toEqual(['INC-residence', 'INC-school']));
    expect(get().incidents.find((i) => i.incidentId === 'INC-shelter')!.status).toBe('RESOLVED');
  });
});
