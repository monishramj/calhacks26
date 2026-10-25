// Panels lane (ws/web-panels). App mounts these four; each reads data via useDesk().
import './panels.css';

export type PanelProps = {
  selectedIncidentId: string | null;
  onSelectIncident: (incidentId: string | null) => void;
};

export { IncomingFeed } from './IncomingFeed';
export { ReviewBand } from './ReviewBand';
export { ConfirmedQueue } from './ConfirmedQueue';
export { IncidentHistory } from './IncidentHistory';
export { PicturePanel } from './PicturePanel';
