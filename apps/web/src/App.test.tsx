import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';

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
});
