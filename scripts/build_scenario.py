"""Build the Outer Sunset exercise from one authored table.

Writes:
  fixtures/private/exercise/exercise.json      places and report events (what the live run receives)
  fixtures/private/exercise/expectations.json  authored labels per report (tests only, never model input)
  fixtures/replay/sunset-exercise.json         replay fixture + team tracks, relays, estimated packet sizes

Team tracks follow the real street graph in apps/web/src/scene/sunset.json. Packet sizes are ESTIMATED from the
400 measured LLM-codec packets in services/codec-radio/data/replay_400.jsonl (linear fit on text bytes); the UI
labels them as estimates. All reports are synthetic. Run: python3 scripts/build_scenario.py
"""
import heapq, json, math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAP = json.loads((ROOT / 'apps/web/src/scene/sunset.json').read_text())
START = '2026-10-25T18:00:00Z'
DURATION = 40 * 60
WALK, DRIVE = 1.4, 7.0  # m/s

# id: (label, kind) — kind 'truck' teams drive.
TEAMS = {
    'team-01': ('School team A', 'walk'), 'team-02': ('School team B', 'walk'), 'team-03': ('Judah west team', 'walk'),
    'team-04': ('North shelter crew', 'walk'), 'team-05': ('Judah east team', 'walk'), 'team-06': ('Lawton team', 'walk'),
    'team-07': ('Moraga east team', 'walk'), 'team-08': ('Lawton west team', 'walk'), 'team-09': ('Judah middle team', 'walk'),
    'team-10': ('Beach patrol', 'walk'), 'team-11': ('Kirkham team', 'walk'), 'team-12': ('South shelter crew', 'walk'),
    'team-13': ('Supply truck 1', 'truck'), 'team-14': ('Supply truck 2', 'truck'), 'team-15': ('Medic team', 'truck'),
    'team-16': ('Utility check team', 'truck'),
}

LS, NEED, INFO = 'POSSIBLE_LIFE_SAFETY', 'ACTIVE_NEED', 'INFORMATION'
NEW, ATTACH, CORR, REVIEW = 'NEW_INCIDENT', 'ATTACH_REPORT', 'FLAG_CORRECTION', 'REQUEST_REVIEW'

# (time, key, team, place or None, text, incident, attention, action, relation (kind, target key) or None, note)
# `time` is when the report is transmitted. A report with `held` was written earlier while the team's radio was out
# of coverage, and keeps that earlier sent time (the late older report).
R = [
    ('00:40', 'gym-clear', 'team-01', 'school', 'School gym evacuation complete. Everyone our team checked is outside.', 'INC-school', INFO, NEW, None, 'Limited source claim: does not prove every school building is clear.'),
    ('01:30', 'n-shelter-open', 'team-04', 'north-shelter', 'North shelter open at the church hall. 18 people here, blankets needed tonight.', 'INC-north-shelter', NEED, NEW, None, 'Active supply need.'),
    ('02:10', 'h47-water', 'team-03', 'house-47-judah', 'House on 47th near Judah: water rising downstairs, two people waiting upstairs.', 'INC-house-47-judah', LS, NEW, None, 'Possible life-safety concern.'),
    ('03:00', 'h44-wire', 'team-09', 'house-44-judah', '44th and Judah: power line down on the sidewalk, sparking. Keeping people back.', 'INC-house-44-judah', LS, NEW, None, 'Possible life-safety hazard.'),
    ('03:40', 'apt-power', 'team-05', 'apartments', 'Apartment block on Judah: power out, elevator stuck between floors, nobody inside it.', 'INC-apartments', INFO, NEW, None, 'Status only; nobody in the elevator.'),
    ('04:30', 'h43-cold', 'team-06', 'house-43-lawton', 'House on 43rd near Lawton: elderly man alone, no heat, needs blankets.', 'INC-house-43-lawton', NEED, NEW, None, 'Active need.'),
    ('05:15', 'gym-searched', 'team-02', 'school', 'School sports hall checked. Our search of that area is complete.', 'INC-school', INFO, ATTACH, ('UPDATE', 'gym-clear'), 'Same gym subarea; keep source scope.'),
    ('06:00', 'h41-gas', 'team-07', 'house-41-moraga', 'Strong smell of gas at 41st and Moraga. We told neighbors to stay out.', 'INC-house-41-moraga', LS, NEW, None, 'Possible life-safety hazard.'),
    ('06:45', 'n-shelter-repeat', 'team-04', 'north-shelter', 'Repeating: north shelter still needs blankets tonight.', 'INC-north-shelter', NEED, ATTACH, ('REPEAT', 'n-shelter-open'), 'Repeat: no new incident, no extra heat.'),
    ('07:30', 'grocery-water', 'team-14', 'grocery', 'Grocery store at 45th and Judah is open, giving out bottled water.', 'INC-grocery', INFO, NEW, None, 'Resource information.'),
    ('08:20', 'h46l-basement', 'team-08', 'house-46-lawton', '46th and Lawton: basement flooding, family pumping water, they need sandbags.', 'INC-house-46-lawton', NEED, NEW, None, 'Active need.'),
    ('09:00', 'h47-help', 'team-03', 'house-47-judah', '47th and Judah: the people upstairs have asked for help, water still rising.', 'INC-house-47-judah', LS, ATTACH, ('UPDATE', 'h47-water'), 'Update to the same house.'),
    ('09:50', 'h48-dog', 'team-10', 'house-48-kirkham', 'House on 48th near Kirkham: dog trapped in the flooded garage. Owner is safe.', 'INC-house-48-kirkham', NEED, NEW, None, 'Animal rescue need; owner safe.'),
    ('10:40', 'hw-sandbags', 'team-13', 'hardware-store', 'Hardware store at 43rd and Lawton has sandbags. We need a truck to move them.', 'INC-hardware-store', NEED, NEW, None, 'Resource with a transport need.'),
    ('11:30', 'apt-oxygen', 'team-05', 'apartments', 'Apartment block: two residents on the 4th floor use oxygen machines, batteries running low.', 'INC-apartments', LS, ATTACH, ('UPDATE', 'apt-power'), 'Raises attention to possible life safety: needs a human.'),
    ('12:15', 'cafe-food', 'team-09', 'cafe', 'Beach cafe staff are staying. We can serve hot food to about 30 people.', 'INC-cafe', INFO, NEW, None, 'Resource information.'),
    ('13:00', 'school-upstairs', 'team-01', 'school', 'Correction: the school gym is clear, but someone may still be upstairs in the main building.', 'INC-school', LS, CORR, ('CORRECTION', 'gym-clear'), '"May" is not a confirmed person; possible life safety.'),
    ('13:40', 'h44-repeat', 'team-16', 'house-44-judah', 'Repeating 44th and Judah: live wire on the sidewalk, still sparking.', 'INC-house-44-judah', LS, ATTACH, ('REPEAT', 'h44-wire'), 'Repeat: no extra heat.'),
    ('14:30', 'dunes-shout', 'team-10', None, 'Someone is shouting for help near the dunes. We cannot see where.', 'INC-dunes', LS, NEW, None, 'No known place: stays unplaced.'),
    ('15:10', 's-shelter-open', 'team-12', 'south-shelter', 'South shelter open at the church hall on Moraga. 25 people, we need cots.', 'INC-south-shelter', NEED, NEW, None, 'Active need.'),
    ('15:50', 'school-repeat', 'team-02', 'school', 'Repeating the school report: possible person upstairs in the main building.', 'INC-school', LS, ATTACH, ('REPEAT', 'school-upstairs'), 'Repeat of the concern; no headcount added.'),
    ('16:40', 'h42-door', 'team-05', 'house-42-judah', '42nd and Judah: neighbor not answering her door, lights off since this morning.', 'INC-house-42-judah', LS, NEW, None, 'Uncertain possible harm.'),
    ('17:20', 'h45-tree', 'team-11', 'house-45-kirkham', '45th and Kirkham: tree fell on the roof. Family is safe, roof leaking.', 'INC-house-45-kirkham', NEED, NEW, None, 'Need; family safe.'),
    ('18:00', 'n-shelter-water', 'team-14', 'north-shelter', 'Truck delivered 40 bottles of water to the north shelter.', 'INC-north-shelter', INFO, ATTACH, ('UPDATE', 'n-shelter-open'), 'Delivery; blankets still open.'),
    ('18:45', 'h40-car', 'team-07', 'house-40-moraga', '40th and Moraga: car stuck in the flooded intersection, water at the doors, driver still inside.', 'INC-house-40-moraga', LS, NEW, None, 'Possible life safety.'),
    ('19:30', 'apt-medic', 'team-15', 'apartments', 'Medic team at the apartment block. Oxygen users stable for now, need batteries within two hours.', 'INC-apartments', LS, ATTACH, ('UPDATE', 'apt-oxygen'), 'Stable for now is not resolved; keep attention.'),
    ('20:15', 'school-main', 'team-01', 'school', 'School report refers to the main building beside the gym.', 'INC-school', None, ATTACH, ('UPDATE', 'school-upstairs'), 'Subarea clarification only.'),
    ('21:00', 'h46l-bags', 'team-13', 'house-46-lawton', 'Sandbags delivered to 46th and Lawton. Basement water holding.', 'INC-house-46-lawton', INFO, ATTACH, ('UPDATE', 'h46l-basement'), 'Need met for now.'),
    ('21:40', 'hw-left', 'team-06', 'hardware-store', 'Hardware store: 60 sandbags left, truck can take more.', 'INC-hardware-store', NEED, ATTACH, ('UPDATE', 'hw-sandbags'), 'Resource update.'),
    ('22:30', 'motel-ok', 'team-03', 'motel', 'Beach motel: ground floor flooded, guests moved upstairs, all accounted for.', 'INC-motel', INFO, NEW, None, 'Source claim of all accounted for.'),
    ('23:10', 'dunes-repeat', 'team-10', None, 'Repeating: shouting for help near the dunes, south of the beach parking lot.', 'INC-dunes', LS, ATTACH, ('REPEAT', 'dunes-shout'), 'Still no known place.'),
    ('24:00', 's-shelter-more', 'team-08', 'south-shelter', 'South shelter: 12 more people arrived, now 37. Still need cots and water.', 'INC-south-shelter', NEED, ATTACH, ('UPDATE', 's-shelter-open'), 'Need grows; one incident.'),
    ('24:40', 'school-question', 'team-02', 'school', 'Has everyone at the school been rescued?', 'INC-school', None, REVIEW, None, 'A question, not a confirmation of a person or a rescue.'),
    ('25:20', 'h41-off', 'team-16', 'house-41-moraga', '41st and Moraga: gas company crew is here, the gas is shut off. Neighbors can go back.', 'INC-house-41-moraga', INFO, ATTACH, ('UPDATE', 'h41-gas'), 'Lowers a life-safety incident: needs a human.'),
    ('26:00', 'gym-late', 'team-11', 'school', 'Earlier school gym report: all people our team checked were outside.', 'INC-school', None, ATTACH, ('UPDATE', 'gym-clear'), 'Late older report: must not lower the newer upstairs concern.', '09:30'),
    ('26:40', 'h46m-fine', 'team-12', 'house-46-moraga', '46th and Moraga: checked the whole block, everyone is fine.', 'INC-house-46-moraga', INFO, NEW, None, 'Status only.'),
    ('27:20', 'h40-out', 'team-07', 'house-40-moraga', '40th and Moraga: driver is out of the car and safe. Car still in the water.', 'INC-house-40-moraga', INFO, ATTACH, ('UPDATE', 'h40-car'), 'Lowers a life-safety incident: needs a human.'),
    ('28:00', 'h42-fine', 'team-05', 'house-42-judah', 'Correction for 42nd and Judah: the neighbor answered. She is fine, her phone was dead.', 'INC-house-42-judah', INFO, CORR, ('CORRECTION', 'h42-door'), 'Correction: needs a human.'),
    ('28:45', 'h47-out', 'team-15', 'house-47-judah', 'Medic team at 47th and Judah. Both residents out, in our truck, mild cold.', 'INC-house-47-judah', INFO, ATTACH, ('UPDATE', 'h47-help'), 'Lowers a life-safety incident: needs a human.'),
    ('29:30', 'cafe-soup', 'team-09', 'cafe', 'Beach cafe: hot soup ready, can send to the shelters.', 'INC-cafe', INFO, ATTACH, ('UPDATE', 'cafe-food'), 'Resource update.'),
    ('30:10', 'motel-missing', 'team-03', 'motel', 'Correction from the beach motel: one guest from room 12 is missing. Was not upstairs.', 'INC-motel', LS, CORR, ('CORRECTION', 'motel-ok'), 'Correction raising possible life safety.'),
    ('30:50', 'h48-dog-out', 'team-10', 'house-48-kirkham', '48th and Kirkham: dog is out of the garage, owner has it.', 'INC-house-48-kirkham', INFO, ATTACH, ('UPDATE', 'h48-dog'), 'Need met.'),
    ('31:30', 'grocery-low', 'team-04', 'grocery', 'Grocery store: water running low, about 50 bottles left.', 'INC-grocery', INFO, ATTACH, ('UPDATE', 'grocery-water'), 'Resource update.'),
    ('32:10', 'h46l-repeat', 'team-08', 'house-46-lawton', 'Repeating 46th and Lawton: basement water holding with sandbags.', 'INC-house-46-lawton', INFO, ATTACH, ('REPEAT', 'h46l-bags'), 'Repeat: no extra heat.'),
    ('32:50', 'school-not-done', 'team-11', 'school', 'School main building search is not complete. We cannot give an all-clear.', 'INC-school', LS, ATTACH, ('UPDATE', 'school-upstairs'), 'Unresolved: do not mark resolved.'),
    ('33:30', 'h43-moved', 'team-06', 'house-43-lawton', '43rd and Lawton: elderly man moved to the south shelter with blankets.', 'INC-house-43-lawton', INFO, ATTACH, ('UPDATE', 'h43-cold'), 'Need met.'),
    ('34:10', 'h44-safe', 'team-16', 'house-44-judah', '44th and Judah: utility crew has cut power to the line. Area is safe.', 'INC-house-44-judah', INFO, ATTACH, ('UPDATE', 'h44-wire'), 'Lowers a life-safety incident: needs a human.'),
    ('34:50', 's-shelter-cots', 'team-12', 'south-shelter', 'South shelter received 20 cots. Still need water for 37 people.', 'INC-south-shelter', NEED, ATTACH, ('UPDATE', 's-shelter-more'), 'Need continues.'),
    ('35:30', 'dunes-found', 'team-10', None, 'Found the person near the dunes: a surfer with a hurt ankle, walking him to the parking lot.', 'INC-dunes', LS, ATTACH, ('UPDATE', 'dunes-shout'), 'Injury: keep for a human.'),
    ('36:10', 'apt-batteries', 'team-05', 'apartments', 'Apartment block: batteries arrived for the oxygen machines.', 'INC-apartments', INFO, ATTACH, ('UPDATE', 'apt-medic'), 'Lowers a life-safety incident: needs a human.'),
    ('36:50', 'h45-tarp', 'team-11', 'house-45-kirkham', '45th and Kirkham: tarp on the roof, leak stopped.', 'INC-house-45-kirkham', INFO, ATTACH, ('UPDATE', 'h45-tree'), 'Need met.'),
    ('37:30', 'motel-repeat', 'team-03', 'motel', 'Repeating: motel guest from room 12 still missing.', 'INC-motel', LS, ATTACH, ('REPEAT', 'motel-missing'), 'Repeat: no extra heat.'),
    ('38:10', 'grocery-repeat', 'team-14', 'grocery', 'Repeating grocery store: about 50 bottles of water left.', 'INC-grocery', INFO, ATTACH, ('REPEAT', 'grocery-low'), 'Repeat.'),
    ('38:50', 'h41-clear', 'team-07', 'house-41-moraga', '41st and Moraga all clear, gas off, residents back home.', 'INC-house-41-moraga', INFO, ATTACH, ('UPDATE', 'h41-off'), 'Status update.'),
    ('39:30', 'hw-out', 'team-13', 'hardware-store', 'Hardware store: out of sandbags now.', 'INC-hardware-store', INFO, ATTACH, ('UPDATE', 'hw-left'), 'Resource update.'),
]

sec = lambda mmss: int(mmss[:2]) * 60 + int(mmss[3:])
iso = lambda s: f"2026-10-25T18:{s // 60:02d}:{s % 60:02d}Z"
places = {p['placeId']: p for p in MAP['places']}
command = MAP['commandPost']
# The dunes are open beach, not a place: the beach patrol walks to this point for those reports.
DUNES = (-560.0, 380.0)


def codec_fit():
    """Least-squares packet bytes ~ a + b * text bytes over the measured LLM-codec packets."""
    rows = [json.loads(l) for l in (ROOT / 'services/codec-radio/data/replay_400.jsonl').read_text().splitlines()]
    pts = [(r['raw_bytes'], r['packet_bytes']) for r in rows if r['method'] == 'llm' and r['decoded_ok']]
    n, sx, sy = len(pts), sum(x for x, _ in pts), sum(y for _, y in pts)
    b = (n * sum(x * y for x, y in pts) - sx * sy) / (n * sum(x * x for x, _ in pts) - sx * sx)
    return (sy - b * sx) / n, b, n


def road_graph():
    """Vertices merged on a 1 m grid; edges along every road polyline."""
    key = lambda x, z: (round(x), round(z))
    adj = {}
    for r in MAP['roads']:
        pts = list(zip(r['p'][0::2], r['p'][1::2]))
        for (x1, z1), (x2, z2) in zip(pts, pts[1:]):
            a, b, d = key(x1, z1), key(x2, z2), math.dist((x1, z1), (x2, z2))
            adj.setdefault(a, []).append((b, d))
            adj.setdefault(b, []).append((a, d))
    return adj


def route(adj, start, end):
    """Shortest street path between two points, plus the off-road legs to and from the nearest vertices."""
    near = lambda p: min(adj, key=lambda v: math.dist(v, p))
    s, e = near(start), near(end)
    dist, prev, heap = {s: 0}, {}, [(0, s)]
    while heap:
        d, v = heapq.heappop(heap)
        if v == e:
            break
        if d > dist[v]:
            continue
        for w, c in adj[v]:
            if d + c < dist.get(w, math.inf):
                dist[w], prev[w] = d + c, v
                heapq.heappush(heap, (d + c, w))
    path, v = [e], e
    while v != s:
        v = prev[v]
        path.append(v)
    return [start, *reversed(path), end]


def track(adj, kind, stops):
    """[t, x, z] samples: wait at each stop until its report, then travel to arrive 25 s before the next one."""
    speed = DRIVE if kind == 'truck' else WALK
    out = [[0, *stops[0][1]]]
    for (t0, p0), (t1, p1) in zip(stops, stops[1:]):
        path = route(adj, p0, p1)
        length = sum(math.dist(a, b) for a, b in zip(path, path[1:]))
        travel = length / speed
        leave = max(t0 + 10, t1 - 25 - travel)
        if leave + travel > t1:  # cannot make it walking: hurry (still recorded honestly in the track)
            travel = max(t1 - 5 - leave, 1)
        out.append([round(leave, 1), *p0])
        done = 0
        for a, b in zip(path, path[1:]):
            done += math.dist(a, b)
            out.append([round(leave + travel * done / length, 1), round(b[0], 1), round(b[1], 1)])
    out.append([DURATION, *out[-1][1:]])
    return out


def main():
    a, b, n = codec_fit()
    order = sorted(R, key=lambda r: sec(r[0]))
    ids = {r[1]: f'S{i + 1:02d}' for i, r in enumerate(order)}
    adj = road_graph()
    where = lambda r: (places[r[3]]['x'], places[r[3]]['z']) if r[3] else DUNES
    teams = []
    for tid, (label, kind) in TEAMS.items():
        mine = [r for r in order if r[2] == tid]
        stops = [(sec(r[0]), where(r)) for r in mine] + [(DURATION - 60, (command['x'], command['z']))]
        stops = [(max(0, stops[0][0] - 120), stops[0][1])] + stops
        teams.append({'teamId': tid, 'label': label, 'kind': kind, 'track': track(adj, kind, stops)})

    reports, authored, events, labels = {}, {}, [], {}
    for i, r in enumerate(order):
        t, key, team, place, text, inc, att, act, rel, note = r[:10]
        held = r[10] if len(r) > 10 else None
        mid, raw = ids[key], len(text.encode())
        sent = sec(held) if held else sec(t)
        reports[mid] = {'sourceId': team, 'placeId': place, 'sentAt': iso(sent), 'text': text, 'transmitAt': sec(t),
                        'heldSince': sec(held) if held else None, 'rawBytes': raw, 'packetBytes': round(a + b * raw)}
        rels = [{'kind': rel[0], 'target': ids[rel[1]]}] if rel else []
        candidate = inc if act in (ATTACH, CORR) else None
        authored[mid] = {
            'suggestion': {'action': act, 'candidateIncidentId': candidate, 'attention': att},
            'proposal': {'incidentId': inc, 'relations': rels, 'suggestedAttention': att, 'uncertainties': [note]} if candidate else None,
        }
        events.append({'position': i + 1, 'gate': None, 'gateRequiresIncident': None, 'radioCandidate': i == 0, 'input': {
            'sourceId': team, 'messageId': mid, 'text': text, 'origin': 'scenario', 'sentAt': iso(sent), 'reportedEventAt': None,
            'reportedLocation': {'placeId': place, 'source': 'sender_explicit'} if place else None,
            'transport': {'verification': 'not_applicable', 'encoding': 'not_applicable', 'measurementSource': 'not_applicable',
                          'originalBytes': None, 'applicationPacketBytes': None}}})
        labels[mid] = {'key': key, 'incidentId': inc, 'attention': att, 'action': act, 'relation': rels[0] if rels else None,
                       'interpretation': note}

    about = 'Synthetic Outer Sunset storm-flood exercise. Fictional; every report is authored. '
    (ROOT / 'fixtures/private/exercise/exercise.json').write_text(json.dumps({
        'exerciseVersion': 'sunset-1', 'about': about + 'What the live run receives, in transmit order.',
        'places': [{'placeId': p['placeId'], 'label': p['label'], 'position': {'x': p['x'], 'z': p['z']}, 'aliases': p['aliases'],
                    'subareas': [{'subareaId': 'school.gym', 'aliases': ['school gym', 'school sports hall']},
                                 {'subareaId': 'school.main_building', 'aliases': ['school main building', 'main building']}]
                    if p['placeId'] == 'school' else []} for p in MAP['places']],
        'startingState': {'afterMessageId': None, 'provenance': 'authored', 'about': 'Starts empty.', 'incidents': []},
        'events': events}, indent=1) + '\n')
    (ROOT / 'fixtures/private/exercise/expectations.json').write_text(json.dumps({
        'private': True, 'neverModelInput': True, 'provenance': 'authored',
        'about': 'Authored labels for the Outer Sunset exercise. Test assertions only; never Laya or Claude input.',
        'labels': labels,
        'invariants': {
            'lateOlderReport': {'report': ids['gym-late'], 'mustNotLower': 'INC-school', 'newerConcern': ids['school-upstairs']},
            'question': ids['school-question'],
            'unplaced': [ids[k] for k in ('dunes-shout', 'dunes-repeat', 'dunes-found')],
            'finalAttention': {inc: att for inc, att in {r[5]: r[6] for r in order if r[6]}.items()},
        }}, indent=1) + '\n')
    (ROOT / 'fixtures/replay/sunset-exercise.json').write_text(json.dumps({
        'label': 'Outer Sunset storm-flood exercise', 'about': about + 'Suggestions and proposals here are AUTHORED fixture '
        'outputs (provider fixture), not model results. Team tracks are simulated. Packet sizes are estimated: '
        f'packet bytes = {a:.1f} + {b:.3f} x text bytes, fit on {n} measured LLM-codec packets (replay_400.jsonl).',
        'exerciseVersion': 'sunset-1', 'startAt': START, 'durationSeconds': DURATION,
        'codecEstimate': {'intercept': round(a, 2), 'slope': round(b, 4), 'samples': n},
        'reports': reports, 'initial': {'deliver': [], 'incidents': []}, 'script': [ids[r[1]] for r in order],
        'authored': authored, 'teams': teams, 'relays': MAP['relays'], 'commandPost': command,
    }, separators=(',', ':')) + '\n')
    print(f'{len(order)} reports, {len({r[5] for r in order})} incidents, {len(teams)} teams; codec {a:.1f} + {b:.3f}x (n={n})')


if __name__ == '__main__':
    main()
