import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { createLegacyReplay as createExerciseReplay } from './test/legacyExercise';
import { createExerciseReplay as createSunsetReplay } from './adapters/replay';

// Shell smoke test: layout regions exist, sections collapse by keyboard, mode is labeled.
describe('App shell', () => {
  it('renders the mode banner, scene, and four collapsible sections', async () => {
    render(<App />);
    expect(screen.getByTestId('run-mode')).toHaveTextContent('NOT CONNECTED');
    expect(screen.getByLabelText('Exercise scene')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /Review band/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    toggle.focus();
    await userEvent.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    for (const name of [/Incoming reports/, /Confirmed queue/, /Selected incident history/]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('labels the replay run and jumps the exercise clock to the next delivered report', async () => {
    render(<App adapter={createSunsetReplay()} />);
    expect(screen.getByTestId('run-mode')).toHaveTextContent('LOCAL REPLAY');
    expect(screen.getByText(/Inference: fixture/)).toBeInTheDocument();
    expect(screen.getByText('0 / 55 delivered')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next report (#1)' }));
    expect(await screen.findByText('1 / 55 delivered')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next report (#2)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reset run' }));
    expect(await screen.findByText('0 / 55 delivered')).toBeInTheDocument();
  });

  it('on database loss disables writes, then starts an isolated replay on request', async () => {
    const base = createExerciseReplay();
    const lost = { ...base, subscribeState: (l: Parameters<typeof base.subscribeState>[0]) => base.subscribeState((s) => l({ ...s, mode: 'LOCAL DEGRADED' })) };
    render(<App adapter={lost} />);
    expect(screen.getByTestId('run-mode')).toHaveTextContent('LOCAL DEGRADED');
    expect(screen.getByText(/writes are stopped/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset run' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Start local replay' }));
    expect(screen.getByTestId('run-mode')).toHaveTextContent('LOCAL REPLAY');
    expect(screen.getByRole('button', { name: 'Reset run' })).toBeEnabled();
  });
});
