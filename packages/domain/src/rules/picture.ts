// Claude working picture checks, shared by the coordinator (so the model hears what is wrong) and
// the SpacetimeDB module (authoritative). Pure. A draft is checked against the exact JobInput it
// was built from, so it can cite only reports that job delivered (unknown or future ones fail).
import type { ErrorCode, IncidentPictureDraft, JobInput, JobReport, PictureArea, PictureClaim, PictureNode, PictureSite, PictureSubarea, Result } from '../types';
import { fail, validateWire } from '../validate';

type Ctx = { byId: Map<string, JobReport>; places: Set<string> };
class PictureError extends Error {
  constructor(readonly code: ErrorCode, message: string) {
    super(message);
  }
}
const bad = (message: string): never => {
  throw new PictureError('INVALID_INPUT', message);
};

/** Report IDs in receive order. Unknown or future IDs (not delivered to this job) are rejected. */
function ordered(ids: string[], ctx: Ctx): JobReport[] {
  const missing = ids.filter((id) => !ctx.byId.has(id));
  if (missing.length) throw new PictureError('INVALID_SOURCE', `not reports delivered for this job: ${missing.slice(0, 5).join(', ')}`);
  return ids.map((id) => ctx.byId.get(id)!).sort((a, b) => a.receiveSequence - b.receiveSequence);
}

/** Shared node checks: location labels must be in the cited reports or known places; chronology is rebuilt from sent times. */
function checkNode(n: PictureNode, ctx: Ctx, located: boolean): PictureNode {
  const reports = ordered(n.reportIds, ctx);
  if (located) {
    const label = n.label.toLowerCase();
    const text = reports.map((r) => r.text.toLowerCase()).join('\n');
    const known = ctx.places.has(label) || text.includes(label) || reports.some((r) => r.reportedLocation?.placeId.toLowerCase() === label);
    if (!known) bad(`location "${n.label}" appears in none of its reports`);
  }
  // Late: sent before a report that was received earlier in this node (sender time vs receive order).
  const late = new Set<string>();
  let newestSent = -Infinity;
  for (const r of reports) {
    if (r.sentAt === null) continue;
    const sent = Date.parse(r.sentAt);
    if (sent < newestSent) late.add(r.reportId);
    newestSent = Math.max(newestSent, sent);
  }
  const supersedes = new Map(n.chronology.map((e) => [e.reportId, e.supersedesReportId]));
  return {
    ...n,
    reportIds: reports.map((r) => r.reportId),
    chronology: reports.map((r) => ({ reportId: r.reportId, supersedesReportId: supersedes.get(r.reportId) ?? null, late: late.has(r.reportId) })),
  };
}

function checkClaim(c: PictureClaim, ctx: Ctx): PictureClaim {
  const texts = ordered(c.reportIds, ctx).map((r) => r.text);
  // Invented counts: every number in a claim must appear in the reports that cite it.
  for (const n of c.text.match(/\d+/g) ?? []) if (!texts.some((t) => t.includes(n))) bad(`count ${n} in "${c.text}" is not in its cited reports`);
  return { ...c, reportIds: ordered(c.reportIds, ctx).map((r) => r.reportId) };
}

function checkSubarea(x: PictureSubarea, ctx: Ctx): PictureSubarea {
  return { ...x, ...checkNode(x, ctx, true), claims: x.claims.map((c) => checkClaim(c, ctx)) };
}

function checkSite(s: PictureSite, ctx: Ctx): PictureSite {
  return { ...s, ...checkNode(s, ctx, true), subareas: s.subareas.map((x) => checkSubarea(x, ctx)) };
}

function checkArea(a: PictureArea, ctx: Ctx): PictureArea {
  return { ...a, ...checkNode(a, ctx, false), sites: a.sites.map((s) => checkSite(s, ctx)) };
}

/**
 * Checks a worker's picture draft against the job it answers. Returns the normalized draft
 * (reports in receive order, chronology with recomputed late flags) or the reason it was rejected.
 */
export function checkPicture(draft: unknown, input: JobInput): Result<IncidentPictureDraft> {
  const v = validateWire<IncidentPictureDraft>('IncidentPictureDraft', draft);
  if (!v.ok) return v;
  if (v.value.runId !== input.runId || v.value.incidentId !== input.incidentId) {
    return fail('INVALID_SOURCE', `the picture is for ${v.value.incidentId}, the job is for ${input.incidentId}`);
  }
  const ctx: Ctx = {
    byId: new Map(input.reports.map((r) => [r.reportId, r])),
    places: new Set(input.places.flatMap((p) => [p.placeId, ...p.aliases]).map((s) => s.toLowerCase())),
  };
  try {
    return { ok: true, value: { ...v.value, areas: v.value.areas.map((a) => checkArea(a, ctx)) } };
  } catch (e) {
    if (e instanceof PictureError) return fail(e.code, e.message);
    throw e;
  }
}
