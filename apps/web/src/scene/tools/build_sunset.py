"""Convert an Overpass JSON export of the Outer Sunset (SF) into public/scene/sunset.json.

Usage: python3 build_sunset.py <overpass.json> <out.json>
Query: way[building|highway|natural|leisure|landuse] in bbox 37.7535,-122.5135,37.7615,-122.4985 with `out geom tags`.
Coordinates become local metres with the school building's centroid at the origin: x east, z south.
Exercise places are synthetic overlays on real buildings and carry generic labels only (never OSM names): the school
at (0, 0), shelters, shops, houses at street corners. Also picks the command post and rooftop relay sites.
Map data (c) OpenStreetMap contributors, ODbL.
"""
import hashlib, json, math, sys

LAT0, LON0 = 37.7575, -122.505  # provisional origin; the school centroid replaces it
BOUNDS = (-940, 340, -400, 540)  # minX, maxX, minZ, maxZ around the school
# Exercise places: (placeId, label, kind, how to pick). Tags only choose the building; labels stay generic.
TAGGED = [
    ('north-shelter', 'North shelter (church hall)', 'shelter', lambda t, c: t.get('amenity') == 'place_of_worship' and c[1] < -200 and c[0] > -200),
    ('south-shelter', 'South shelter (church hall)', 'shelter', lambda t, c: t.get('building') == 'church' and c[1] > 200),
    ('apartments', 'Apartment block', 'other', lambda t, c: t.get('building') == 'apartments' and c[0] > -100),
    ('grocery', 'Grocery store', 'other', lambda t, c: 'Grocery' in t.get('name', '')),
    ('motel', 'Beach motel', 'other', lambda t, c: t.get('name') == 'Beach Motel'),
    ('cafe', 'Beach cafe', 'other', lambda t, c: t.get('amenity') == 'restaurant'),
    ('corner-store', 'Corner store', 'other', lambda t, c: t.get('building') == 'retail' and c[0] < -200),
    ('hardware-store', 'Hardware store', 'other', lambda t, c: t.get('building') == 'retail' and c[1] > 150),
]
COMMAND_POST = lambda t, c: t.get('amenity') == 'fire_station'
# Houses beside a street corner: (avenue, street).
HOUSES = [('47th', 'Judah'), ('43rd', 'Lawton'), ('41st', 'Moraga'), ('46th', 'Lawton'), ('44th', 'Judah'),
          ('48th', 'Kirkham'), ('42nd', 'Judah'), ('40th', 'Moraga'), ('45th', 'Kirkham'), ('46th', 'Moraga')]
RELAY_CELLS = (4, 2)  # one rooftop relay on the tallest building in each cell of this grid over the bounds
ROAD_WIDTH = {'secondary': 20, 'secondary_link': 10, 'tertiary': 15, 'tertiary_link': 8, 'residential': 11,
              'service': 5, 'pedestrian': 4, 'footway': 2, 'path': 2, 'steps': 2}


def xy(p):
    return ((p['lon'] - LON0) * math.cos(math.radians(LAT0)) * 111320, -(p['lat'] - LAT0) * 110540)


def recenter(ways):
    """Move the origin to the centroid of the largest school building, so the spec coordinates hold."""
    global LAT0, LON0
    schools = [[xy(p) for p in w['geometry']] for w in ways if w.get('tags', {}).get('building') == 'school']
    x, z = centroid(max(schools, key=area)[:-1])
    LAT0, LON0 = LAT0 - z / 110540, LON0 + x / (math.cos(math.radians(LAT0)) * 111320)


def area(pts):
    return 0.5 * abs(sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1] for i in range(len(pts))))


def centroid(pts):
    return (sum(x for x, _ in pts) / len(pts), sum(z for _, z in pts) / len(pts))


def inside(c):
    return BOUNDS[0] <= c[0] <= BOUNDS[1] and BOUNDS[2] <= c[1] <= BOUNDS[3]


def flat(pts):
    return [round(v, 1) for p in pts for v in p]


def stable(seed, lo, hi):
    h = int(hashlib.sha256(str(seed).encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    return lo + h * (hi - lo)


def height(tags, a, wid):
    if tags.get('building:levels', '').isdigit():
        return int(tags['building:levels']) * 3.2 + 1
    kind = tags.get('building')
    if kind in ('apartments',) or a > 900:
        return round(stable(wid, 11, 14), 1)
    if kind in ('school', 'church') or tags.get('amenity') == 'place_of_worship':
        return 10.0
    if a < 25:
        return 3.0  # sheds, garages
    return round(stable(wid, 7.5, 10.5), 1)  # typical two storeys over a garage


def corners(roads):
    """Street-corner points keyed by (avenue, street): the shared OSM vertex of the two named roads."""
    named = {}
    for r in roads:
        if 'n' in r:
            named.setdefault(r['n'].split()[0], []).extend(zip(r['p'][0::2], r['p'][1::2]))
    aves = [k for k in named if k[0].isdigit()]
    streets = [k for k in named if k in ('Judah', 'Kirkham', 'Lawton', 'Moraga')]
    return {(a, s): min(((p, q) for p in named[a] for q in named[s]), key=lambda pq: math.dist(*pq))[0]
            for a in aves for s in streets}


def main(src, out):
    raw = open(src, 'rb').read()
    ways = json.loads(raw)['elements']
    recenter(ways)
    buildings, roads, parks, pitches, coast = [], [], [], [], []
    for w in ways:
        t, g = w.get('tags', {}), w.get('geometry') or []
        pts = [xy(p) for p in g]
        if len(pts) < 2:
            continue
        if 'building' in t:
            if len(pts) < 4 or not inside(centroid(pts)):
                continue
            a = area(pts)
            buildings.append({'id': w['id'], 'a': a, 'c': centroid(pts), 'pts': pts[:-1] if pts[0] == pts[-1] else pts,
                              'h': height(t, a, w['id']), 'kind': t.get('building'), 'tags': t})
        elif t.get('highway') in ROAD_WIDTH:
            if any(inside(p) for p in pts):
                roads.append({'w': ROAD_WIDTH[t['highway']], 'p': flat(pts), **({'n': t['name']} if 'name' in t else {})})
        elif t.get('natural') == 'coastline':
            coast = flat(pts)
        elif t.get('leisure') in ('park', 'playground', 'parklet') or t.get('landuse') in ('allotments', 'grass'):
            if len(pts) >= 4 and any(inside(p) for p in pts):
                parks.append(flat(pts))
        elif t.get('leisure') == 'pitch' and len(pts) >= 4 and any(inside(p) for p in pts):
            pitches.append(flat(pts))

    places, taken = [], set()

    def place(pid, label, kind, b, aliases, at=None):
        taken.add(id(b))
        b['site'] = pid
        x, z = at or b['c']
        places.append({'placeId': pid, 'label': label, 'kind': kind, 'x': round(x, 1), 'z': round(z, 1), 'h': b['h'], 'aliases': aliases})

    corner = corners(roads)
    near = lambda c: '{} & {}'.format(*min(corner, key=lambda k: math.dist(corner[k], c)))
    school = min((b for b in buildings if b['kind'] == 'school'), key=lambda b: math.dist(b['c'], (0, 0)))
    place('school', 'School', 'school', school, ['school', f"school at {near(school['c'])}"], (0, 0))
    for pid, label, kind, pick in TAGGED:
        b = max((b for b in buildings if id(b) not in taken and pick(b['tags'], b['c'])), key=lambda b: b['a'])
        place(pid, label, kind, b, [label.split(' (')[0].lower(), f"{label.split(' (')[0].lower()} at {near(b['c'])}"])
    for ave, street in HOUSES:
        c = corner[(ave, street)]
        b = min((b for b in buildings if id(b) not in taken and 60 <= b['a'] <= 250), key=lambda b: math.dist(b['c'], c))
        place(f'house-{ave[:2]}-{street.lower()}', f'House · {ave} & {street}', 'residence', b,
              [f'house on {ave} near {street}', f'{ave} and {street}'])
    post = max((b for b in buildings if COMMAND_POST(b['tags'], b['c'])), key=lambda b: b['a'])
    command = {'x': round(post['c'][0], 1), 'z': round(post['c'][1], 1), 'h': post['h']}
    relays = []
    cw, ch = (BOUNDS[1] - BOUNDS[0]) / RELAY_CELLS[0], (BOUNDS[3] - BOUNDS[2]) / RELAY_CELLS[1]
    for i in range(RELAY_CELLS[0]):
        for j in range(RELAY_CELLS[1]):
            cell = [b for b in buildings if BOUNDS[0] + i * cw <= b['c'][0] < BOUNDS[0] + (i + 1) * cw
                    and BOUNDS[2] + j * ch <= b['c'][1] < BOUNDS[2] + (j + 1) * ch and b['a'] > 80]
            if cell:
                b = max(cell, key=lambda b: (b['h'], b['a']))
                relays.append({'x': round(b['c'][0], 1), 'z': round(b['c'][1], 1), 'h': round(b['h'], 1)})

    doc = {
        'schemaVersion': 1,
        'label': 'Outer Sunset, San Francisco',
        'attribution': 'Map data (c) OpenStreetMap contributors (ODbL)',
        'origin': {'lat': round(LAT0, 7), 'lon': round(LON0, 7)},
        'bounds': dict(zip(('minX', 'maxX', 'minZ', 'maxZ'), BOUNDS)),
        'osmSha256': hashlib.sha256(raw).hexdigest(),
        'places': places, 'commandPost': command, 'relays': relays,
        'buildings': [{'h': b['h'], 'p': flat(b['pts']), **({'site': b['site']} if 'site' in b else {})}
                      for b in buildings],
        'roads': roads, 'parks': parks, 'pitches': pitches, 'coast': coast,
    }
    json.dump(doc, open(out, 'w'), separators=(',', ':'))
    print(f"{len(buildings)} buildings, {len(roads)} roads, {len(parks)} parks, {len(places)} places, {len(relays)} relays")


if __name__ == '__main__':
    main(*sys.argv[1:3])
