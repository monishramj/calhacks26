import { useDesk } from '../adapters/DeskContext';
import { pictureClaims } from './shared';

export function PicturePanel({ selectedIncidentId }: { selectedIncidentId: string | null }) {
  const { state } = useDesk();
  if (!selectedIncidentId) return <p className="empty">Select an incident.</p>;
  const picture = state?.pictures?.find((p) => p.incidentId === selectedIncidentId);
  if (!picture) return <p className="empty">No summary yet.</p>;
  const claims = pictureClaims(picture).slice(0, 3);
  const nodes = picture.areas.flatMap((a) => [a, ...a.sites.flatMap((s) => [s, ...s.subareas])]);
  const uncertainties = [...new Set(nodes.flatMap((n) => [...n.uncertainties, ...n.conflicts]))];
  return <div className="picture">
    <p className="muted">Unconfirmed{picture.status === 'STALE' ? ' · New reports awaiting review' : ''}</p>
    {claims.length > 0 ? <ul className="picture-claims">{claims.map((text) => <li key={text}>{text}</li>)}</ul> : <p className="empty">No summary yet.</p>}
    {uncertainties.length > 0 && <p className="muted picture-uncertainty" title={uncertainties.join('; ')}>Uncertain: {uncertainties.join('; ')}</p>}
  </div>;
}
