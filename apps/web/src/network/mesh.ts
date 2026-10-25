// Simulated LoRa mesh for the Outer Sunset exercise: team radios move along their tracks, rooftop relays and the
// command post stay put. A report is transmitted when its team has a route to the command post (else the radio
// retries), then hops node to node. Deterministic: every view computes the same timeline from the fixture.
import fixture from '../../../../fixtures/replay/sunset-exercise.json';
import { airtimeMs, pHop } from './airtime';

export const RANGE_M = 350; // urban LoRa range between street-level radios and rooftops (a tuning knob)
export const HOP_LIMIT = 3; // Meshtastic default: up to 3 rebroadcasts, so at most 4 links
const RETRY_S = 15;
const HOP_GAP_S = 0.4; // receive, decode and rebroadcast delay per relay

export type Point = { x: number; z: number };
export type MeshNode = Point & { id: string; kind: 'team' | 'relay' | 'command'; label: string };
export type Hop = { from: string; to: string; start: number; end: number };
export type Delivery = {
  messageId: string; teamId: string; firstTry: number; heldSince: number | null; sentAt: number; retries: number;
  hops: Hop[]; deliveredAt: number; packetBytes: number; rawBytes: number; airMs: number; rawAirMs: number;
};

type Track = number[][];
export const SCENARIO = fixture as unknown as {
  startAt: string; durationSeconds: number; script: string[];
  reports: Record<string, { sourceId: string; transmitAt: number; heldSince: number | null; rawBytes: number; packetBytes: number }>;
  teams: { teamId: string; label: string; kind: 'walk' | 'truck'; track: Track }[];
  relays: (Point & { h: number })[]; commandPost: Point & { h: number };
  codecEstimate: { intercept: number; slope: number; samples: number };
};

/** Linear interpolation along a [t, x, z] track (binary search). */
export function positionAt(track: Track, t: number): Point {
  if (t <= track[0][0]) return { x: track[0][1], z: track[0][2] };
  let lo = 0, hi = track.length - 1;
  if (t >= track[hi][0]) return { x: track[hi][1], z: track[hi][2] };
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (track[mid][0] <= t) lo = mid; else hi = mid; }
  const [t0, x0, z0] = track[lo], [t1, x1, z1] = track[hi], f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
  return { x: x0 + (x1 - x0) * f, z: z0 + (z1 - z0) * f };
}

const FIXED: MeshNode[] = [
  { id: 'command', kind: 'command', label: 'Command post', ...SCENARIO.commandPost },
  ...SCENARIO.relays.map((r, i) => ({ id: `relay-${i + 1}`, kind: 'relay' as const, label: `Relay ${i + 1}`, x: r.x, z: r.z })),
];

export function nodesAt(t: number): MeshNode[] {
  return [...FIXED, ...SCENARIO.teams.map((team) => ({ id: team.teamId, kind: 'team' as const, label: team.label, ...positionAt(team.track, t) }))];
}

/** Fewest-link path from a team to the command post at time t, or null when out of coverage. */
export function routeAt(teamId: string, t: number): MeshNode[] | null {
  const nodes = nodesAt(t);
  const start = nodes.find((n) => n.id === teamId)!;
  const prev = new Map<string, MeshNode | null>([[start.id, null]]);
  let frontier = [start];
  for (let links = 0; links <= HOP_LIMIT && frontier.length; links++) {
    const next: MeshNode[] = [];
    for (const a of frontier) for (const b of nodes) {
      if (prev.has(b.id) || Math.hypot(a.x - b.x, a.z - b.z) > RANGE_M) continue;
      prev.set(b.id, a);
      if (b.id === 'command') {
        const path = [b];
        for (let n = prev.get(b.id); n; n = prev.get(n.id)) path.unshift(n);
        return path;
      }
      next.push(b);
    }
    frontier = next;
  }
  return null;
}

function simulate(): Delivery[] {
  return SCENARIO.script.map((messageId) => {
    const r = SCENARIO.reports[messageId];
    const airMs = airtimeMs(r.packetBytes), rawAirMs = airtimeMs(r.rawBytes);
    let sentAt = r.transmitAt, retries = 0, path = routeAt(r.sourceId, sentAt);
    while (!path && sentAt < SCENARIO.durationSeconds + 600) { sentAt += RETRY_S; retries += 1; path = routeAt(r.sourceId, sentAt); }
    const hops: Hop[] = [];
    let t = sentAt;
    for (let i = 0; path && i < path.length - 1; i++) {
      hops.push({ from: path[i].id, to: path[i + 1].id, start: t, end: t + airMs / 1000 });
      t += airMs / 1000 + HOP_GAP_S;
    }
    return { messageId, teamId: r.sourceId, firstTry: r.transmitAt, heldSince: r.heldSince, sentAt, retries, hops,
      deliveredAt: hops.at(-1)?.end ?? Infinity, packetBytes: r.packetBytes, rawBytes: r.rawBytes, airMs, rawAirMs };
  });
}

/** Every report's simulated delivery, in the order reports reach the command post. */
export const DELIVERIES: readonly Delivery[] = simulate().sort((a, b) => a.deliveredAt - b.deliveredAt);
export const DELIVERY_BY_ID = new Map(DELIVERIES.map((d) => [d.messageId, d]));

/** Running network totals at time t, for codec packets and for the same reports sent as raw text. */
export function statsAt(t: number) {
  const done = DELIVERIES.filter((d) => d.deliveredAt <= t);
  const sum = (f: (d: Delivery) => number) => done.reduce((s, d) => s + f(d), 0);
  const airS = sum((d) => d.hops.length * d.airMs) / 1000, rawAirS = sum((d) => d.hops.length * d.rawAirMs) / 1000;
  // Channel load over the last 5 minutes if every report were raw text, the busier case the codec avoids.
  const window = DELIVERIES.filter((d) => d.deliveredAt <= t && d.deliveredAt > t - 300);
  const load = (f: (d: Delivery) => number) => Math.min(window.reduce((s, d) => s + d.hops.length * f(d), 0) / 1000 / 300, 1);
  const meanRaw = window.length ? window.reduce((s, d) => s + d.rawAirMs, 0) / window.length : airtimeMs(80);
  return {
    delivered: done.length, total: DELIVERIES.length, hops: sum((d) => d.hops.length), retries: sum((d) => d.retries),
    bytes: sum((d) => d.packetBytes), rawBytes: sum((d) => d.rawBytes), airS, rawAirS,
    channelUse: load((d) => d.airMs), rawChannelUse: load((d) => d.rawAirMs),
    // 3-link delivery chance for a median report at a busier channel (25% busy), codec vs raw.
    p3: pHop(airtimeMs(21), meanRaw, .25) ** 3, rawP3: pHop(airtimeMs(80), meanRaw, .25) ** 3,
  };
}
