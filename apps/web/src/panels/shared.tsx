// Shared bits for the panels lane. Every color comes with a written label (§7).
import { useState } from 'react';
import type { Attention, DeskAdapter, Provider, Report, ReportProvenance, Result } from '../adapters/contract';
import { ATTENTION_LABEL } from '../adapters/derived';
import { useDesk } from '../adapters/DeskContext';

const ATTENTION_CLASS: Record<Attention, string> = {
  POSSIBLE_LIFE_SAFETY: 'tag-life-safety',
  ACTIVE_NEED: 'tag-active-need',
  INFORMATION: 'tag-information',
};

export function AttentionTag({ attention }: { attention: Attention | null }) {
  if (!attention) return <span className="tag tag-unknown">Unknown · needs review</span>;
  return <span className={`tag ${ATTENTION_CLASS[attention]}`}>{ATTENTION_LABEL[attention]}</span>;
}

/** Provenance is always written out; a fixture never reads as a live model result. */
export function ProvenanceTag({ provider }: { provider: Provider }) {
  const text: Record<Provider, string> = {
    local_laya: 'Local Laya (model output)',
    claude: 'Claude (model output)',
    gemini: 'Gemini (model output)',
    operator: 'Operator',
    recording: 'Recording',
    fixture: 'Fixture (authored)',
    rule: 'Rule',
  };
  return <span className="tag tag-provenance">{text[provider]}</span>;
}

/** Where a stored report came from in this run (§10 labels). */
export function ReportProvenanceTag({ provenance }: { provenance: ReportProvenance }) {
  const text: Record<ReportProvenance, string> = {
    live: 'Live',
    simulated: 'Simulated',
    recorded: 'Recorded',
    fixture: 'Fixture (authored)',
  };
  return <span className="tag tag-provenance">{text[provenance]}</span>;
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
  return { run, error, busy };
}
