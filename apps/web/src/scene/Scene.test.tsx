import type { ComponentType } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Scene, type SceneProps } from './index';
import type { SceneDataProps } from './model';
import { incident, sceneIncidents } from './fixtures.test-support';

// Additive lane-local props anticipated for adapter wiring; the shell's existing
// selectedIncidentId/onSelectIncident contract remains unchanged in TEST.
const SceneUnderTest = Scene as ComponentType<SceneProps & SceneDataProps>;

function renderScene(extra: Partial<SceneProps & SceneDataProps> = {}) {
  const onSelectIncident = vi.fn();
  const result = render(<SceneUnderTest
    selectedIncidentId={null}
    onSelectIncident={onSelectIncident}
    incidents={sceneIncidents}
    sourceProvenance="fixture"
    {...extra}
  />);
  return { ...result, onSelectIncident };
}

describe('scene interaction with WebGL unavailable', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows an explicit 2D map and honest exercise/source labels', () => {
    renderScene();
    expect(screen.getByRole('img', { name: /exercise map.*2d/i })).toBeVisible();
    expect(screen.getByText(/webgl unavailable.*2d/i)).toBeVisible();
    expect(screen.getByText(/fictional helene-inspired exercise/i)).toBeVisible();
    expect(screen.getByText(/source: fixture/i)).toBeVisible();
  });

  it('lets pointer selection report an incident ID without mutating inputs', async () => {
    const before = JSON.stringify(sceneIncidents);
    const { onSelectIncident } = renderScene();
    await userEvent.click(screen.getByRole('button', { name: /residence.*possible life safety/i }));
    expect(onSelectIncident).toHaveBeenCalledTimes(1);
    expect(onSelectIncident).toHaveBeenCalledWith('residence-incident');
    expect(JSON.stringify(sceneIncidents)).toBe(before);
  });

  it('supports Enter and Space on labeled incident buttons', async () => {
    const { onSelectIncident } = renderScene();
    const school = screen.getByRole('button', { name: /school.*information/i });
    school.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelectIncident).toHaveBeenLastCalledWith('school-incident');
    const shelter = screen.getByRole('button', { name: /shelter.*active need/i });
    shelter.focus();
    await userEvent.keyboard(' ');
    expect(onSelectIncident).toHaveBeenLastCalledWith('shelter-incident');
  });

  it('reflects external selection changes from the queue/history', () => {
    const { rerender } = renderScene({ selectedIncidentId: 'school-incident' });
    expect(screen.getByRole('button', { name: /school.*information/i })).toHaveAttribute('aria-pressed', 'true');
    rerender(<SceneUnderTest incidents={sceneIncidents} selectedIncidentId="residence-incident" onSelectIncident={vi.fn()} />);
    expect(screen.getByRole('button', { name: /school.*information/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /residence.*possible life safety/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps unlocated incidents selectable in a written unplaced list', async () => {
    const { onSelectIncident } = renderScene();
    const unplaced = screen.getByRole('region', { name: /unplaced incidents/i });
    await userEvent.click(within(unplaced).getByRole('button', { name: /unplaced-incident.*unknown/i }));
    expect(onSelectIncident).toHaveBeenLastCalledWith('unplaced-incident');
  });

  it('exposes heatmap mode to keyboard users and retains marker selection', async () => {
    const { onSelectIncident } = renderScene();
    const toggle = screen.getByRole('button', { name: /heatmap/i });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    toggle.focus();
    await userEvent.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/confirmed unresolved incident concentration/i)).toBeVisible();
    expect(screen.getByText(/not severity.*terrain.*flood depth/i)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /school.*information/i }));
    expect(onSelectIncident).toHaveBeenLastCalledWith('school-incident');
  });

  it('keeps the written heatmap scale and radius unchanged as incidents change', async () => {
    const { rerender } = renderScene();
    await userEvent.click(screen.getByRole('button', { name: /heatmap/i }));
    const legend = screen.getByRole('note', { name: /heatmap legend/i });
    const originalLegend = legend.textContent;
    expect(originalLegend).toMatch(/fixed/i);
    expect(originalLegend).toMatch(/radius/i);
    expect(originalLegend).toMatch(/scale/i);
    rerender(<SceneUnderTest incidents={[incident()]} selectedIncidentId={null} onSelectIncident={vi.fn()} />);
    expect(screen.getByRole('note', { name: /heatmap legend/i }).textContent).toBe(originalLegend);
  });

  it('shows recorded source provenance without implying a live result', () => {
    renderScene({ sourceProvenance: 'recording' });
    expect(screen.getByText(/source: recording/i)).toBeVisible();
    expect(screen.queryByText(/^source: live$/i)).not.toBeInTheDocument();
  });

  it('renders no fixture incidents when the shell supplies no incident data', () => {
    render(<Scene selectedIncidentId={null} onSelectIncident={vi.fn()} />);
    expect(screen.getByText(/no confirmed incidents/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: /school.*information/i })).not.toBeInTheDocument();
  });
});
