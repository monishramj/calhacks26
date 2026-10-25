"""Build a shoreline polygon from the same OSM extract (bake-only Shapely).

Usage: python prepare_water.py ADDON_PARENT OSM_FILE OUTPUT_JSON
Uses BLOSM's projection class directly so bake coordinates have one source.
"""
import importlib.util
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
from shapely.geometry import LineString, box
from shapely.ops import split, unary_union

addon_parent, osm_file, output = sys.argv[1:]
spec = importlib.util.spec_from_file_location('blosm_projection', Path(addon_parent) / 'blosm/util/transverse_mercator.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
projection = module.TransverseMercator(lat=37.79545, lon=-122.3949)
root = ET.parse(osm_file).getroot()
nodes = {node.attrib['id']: projection.fromGeographic(float(node.attrib['lat']), float(node.attrib['lon']))[:2] for node in root.findall('node')}
lines = []
for way in root.findall('way'):
    if not any(tag.attrib.get('k') == 'natural' and tag.attrib.get('v') == 'coastline' for tag in way.findall('tag')):
        continue
    points = [nodes[ref.attrib['ref']] for ref in way.findall('nd') if ref.attrib['ref'] in nodes]
    if len(points) > 1:
        lines.append(LineString(points))
boundary = box(-350, -250, 350, 250)
parts = split(boundary, unary_union(lines))
if len(parts.geoms) < 2:
    raise RuntimeError('OSM shoreline does not split the crop; inspect source')
# The SF Bay is on the east side of this specific crop. No fitted/fictional shore.
sea = max(parts.geoms, key=lambda part: part.centroid.x)
Path(output).write_text(json.dumps(list(sea.exterior.coords)), encoding='utf-8')
print('WATER_POLYGON', len(sea.exterior.coords), 'vertices', round(sea.area), 'square meters')
