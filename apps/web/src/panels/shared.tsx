// Shared bits for the panels lane. Every color comes with a written label (§7).
import { useEffect, useState } from 'react';
import type { Attention, DeskAdapter, IncidentPicture, Report, Result } from '../adapters/contract';
import { PLACES } from '../scene/model';
import { useDesk } from '../adapters/DeskContext';

const ATTENTION_CLASS: Record<Attention, string> = {
  POSSIBLE_LIFE_SAFETY: 'tag-life-safety',
  ACTIVE_NEED: 'tag-active-need',
  INFORMATION: 'tag-information',
};

export const URGENCY_LABEL: Record<Attention, string> = {
  POSSIBLE_LIFE_SAFETY: 'Life safety', ACTIVE_NEED: 'Needs help', INFORMATION: 'Info',
};

export function AttentionTag({ attention }: { attention: Attention | null }) {
  return <span className={`tag urgency ${attention ? ATTENTION_CLASS[attention] : 'tag-unknown'}`}>
    {attention ? URGENCY_LABEL[attention] : 'Unknown'}
  </span>;
}

export const placeName = (id: string | null | undefined) => PLACES.find((p) => p.id === id)?.name ?? 'Location unknown';

export function ReportDetails({ report }: { report: Report }) {
  return <div className="detail-fields">
    <span>Report: {report.input.messageId} · {report.reportId}</span>
    <span>Source: {report.input.sourceId} · {report.provenance}</span>
    <TimeField label="Sent" value={report.input.sentAt} />
    <TimeField label="Received" value={report.receivedAt} />
    {report.input.reportedEventAt && <TimeField label="Event" value={report.input.reportedEventAt} />}
  </div>;
}

export function pictureClaims(picture: IncidentPicture | undefined): string[] {
  return picture?.areas.flatMap((a) => a.sites.flatMap((s) => s.subareas.flatMap((x) => x.claims.map((c) => c.text)))) ?? [];
}

export function RelativeAge({ since }: { since: string | undefined }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  if (!since || !Number.isFinite(Date.parse(since))) return null;
  const minutes = Math.max(0, Math.floor((now - Date.parse(since)) / 60_000));
  const age = minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes}m ago`
    : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`;
  return <time className="relative-age muted" dateTime={since} title="Since first report">{age}</time>;
}

/** Shows a time with its meaning; null stays visibly "not given", never filled in. */
export function TimeField({ label, value }: { label: string; value: string | null }) {
  return (
    <span className="time-field">
      {label}: {value ? <time dateTime={value}>{formatTime(value)}</time> : <em>not given</em>}
    </span>
  );
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(11, 19) + 'Z';
}

export function messageLabel(report: Report): string {
  return `${report.input.messageId} · #${report.receiveSequence}`;
}

/**
 * Runs an adapter command and keeps its typed error visible (STALE_REVISION etc.).
 * Never updates local state optimistically; the adapter's next snapshot is the truth.
 */
export function useCommand() {
  const { adapter, state } = useDesk();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run<T>(fn: (adapter: DeskAdapter, runId: string, commandId: string) => Promise<Result<T>>) {
    if (!adapter || !state) return null;
    setBusy(true);
    try {
      const r = await fn(adapter, state.runId, crypto.randomUUID());
      setError(r.ok ? null : `${r.error.code}: ${r.error.message}`);
      return r;
    } finally {
      setBusy(false);
    }
  }
  return { run, error, busy: busy || state?.mode === 'LOCAL DEGRADED' }; // §10: no writes while the database is down
}
