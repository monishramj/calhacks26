"""Convert an Overpass JSON export of the Outer Sunset (SF) into public/scene/sunset.json.

Usage: python3 build_sunset.py <overpass.json> <out.json>
Query: way[building|highway|natural|leisure|landuse] in bbox 37.7535,-122.5135,37.7615,-122.4985 with `out geom tags`.
Coordinates become local metres with the school building's centroid at the origin: x east, z south.
Exercise sites are synthetic overlays on real buildings and carry generic labels only: school at (0, 0), and the
buildings nearest the spec positions residence (80, 20) and shelter (-120, 40) (GROUND_TRUTH §18).
Map data (c) OpenStreetMap contributors, ODbL.
"""
import hashlib, json, math, sys

LAT0, LON0 = 37.7575, -122.505  # provisional origin; the school centroid replaces it
BOUNDS = (-940, 340, -400, 540)  # minX, maxX, minZ, maxZ around the school
SPEC = {'residence': (80, 20), 'shelter': (-120, 40)}
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
                              'h': height(t, a, w['id']), 'kind': t.get('building')})
        elif t.get('highway') in ROAD_WIDTH:
            if any(inside(p) for p in pts):
                roads.append({'w': ROAD_WIDTH[t['highway']], 'p': flat(pts)})
        elif t.get('natural') == 'coastline':
            coast = flat(pts)
        elif t.get('leisure') in ('park', 'playground', 'parklet') or t.get('landuse') in ('allotments', 'grass'):
            if len(pts) >= 4 and any(inside(p) for p in pts):
                parks.append(flat(pts))
        elif t.get('leisure') == 'pitch' and len(pts) >= 4 and any(inside(p) for p in pts):
            pitches.append(flat(pts))

    # Exercise sites: the school building, then the building nearest each spec position.
    school = min((b for b in buildings if b['kind'] == 'school'), key=lambda b: math.dist(b['c'], (0, 0)))
    sites = {'school': (school, (0, 0))}
    for name, spot in SPEC.items():
        sites[name] = (min(buildings, key=lambda b: math.dist(b['c'], spot)), spot)
    for name, (b, (x, z)) in sites.items():
        b['site'] = name
        sites[name] = {'x': x, 'z': z, 'h': b['h']}

    doc = {
        'schemaVersion': 1,
        'label': 'Outer Sunset, San Francisco',
        'attribution': 'Map data (c) OpenStreetMap contributors (ODbL)',
        'origin': {'lat': round(LAT0, 7), 'lon': round(LON0, 7)},
        'bounds': dict(zip(('minX', 'maxX', 'minZ', 'maxZ'), BOUNDS)),
        'osmSha256': hashlib.sha256(raw).hexdigest(),
        'sites': sites,
        'buildings': [{'h': b['h'], 'p': flat(b['pts']), **({'site': b['site']} if 'site' in b else {})}
                      for b in buildings],
        'roads': roads, 'parks': parks, 'pitches': pitches, 'coast': coast,
    }
    json.dump(doc, open(out, 'w'), separators=(',', ':'))
    print(f"{len(buildings)} buildings, {len(roads)} roads, {len(parks)} parks, sites {sites}")


if __name__ == '__main__':
    main(*sys.argv[1:3])
