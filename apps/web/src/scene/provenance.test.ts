import { reportSourceLabel } from './model';

describe('contract v1 report provenance', () => {
  it('does not imply any source when the desk has no received evidence', () => {
    expect(reportSourceLabel([])).toBe('none');
  });

  it('keeps recorded, simulated and fixture evidence distinct from live', () => {
    expect(reportSourceLabel([{ provenance: 'recorded' }])).toBe('recorded');
    expect(reportSourceLabel([{ provenance: 'simulated' }])).toBe('simulated');
    expect(reportSourceLabel([{ provenance: 'fixture' }])).toBe('fixture');
  });

  it('retains all source kinds and stable labels as reports are repeated/reordered', () => {
    const records = [{ provenance: 'live' }, { provenance: 'fixture' }, { provenance: 'live' }];
    expect(reportSourceLabel(records)).toBe('fixture + live');
    expect(reportSourceLabel([...records].reverse())).toBe('fixture + live');
  });
});
