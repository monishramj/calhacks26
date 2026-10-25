"""Run with Blender --background --factory-startup --python this.py -- OPTIONS.

Uses the official BLOSM add-on from an external checkout. No credentials,
preferences or Blender source files are committed to the frontend.
"""
import argparse
import hashlib
import json
import math
import random
from pathlib import Path
import sys

import addon_utils
import bmesh
import bpy
from mathutils import Vector

args_parser = argparse.ArgumentParser()
args_parser.add_argument('--addon-parent', required=True)
args_parser.add_argument('--cache', required=True)
args_parser.add_argument('--osm', required=True)
args_parser.add_argument('--output', required=True)
args_parser.add_argument('--water', help='Prepared shoreline polygon in the same projection')
args_parser.add_argument('--geo-libs', help='Blender-Python-compatible Shapely directory for precise coast clipping')
args_parser.add_argument('--lat', type=float, default=37.8291)
args_parser.add_argument('--lon', type=float, default=-122.2046)
args = args_parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
sys.path.insert(0, str(Path(args.addon_parent).resolve()))
addon_utils.enable('blosm', default_set=True)
import blosm
# BLOSM's simple building renderer imports gui as a top-level module. Alias the
# registered package module rather than loading its relative imports twice.
sys.modules['gui'] = blosm.gui
from util.transverse_mercator import TransverseMercator

output = Path(args.output).resolve()
output.mkdir(parents=True, exist_ok=True)
cache = Path(args.cache).resolve()
cache.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.addons['blosm'].preferences.dataDir = str(cache)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene['lat'], scene['lon'] = args.lat, args.lon
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
projection = TransverseMercator(lat=args.lat, lon=args.lon)
bounds = dict(minX=-350, maxX=350, minZ=-250, maxZ=250)
south, west = projection.toGeographic(bounds['minX'], -bounds['maxZ'])
north, east = projection.toGeographic(bounds['maxX'], -bounds['minZ'])
settings = scene.blosm
settings.commandLineMode = True
settings.minLat, settings.maxLat = south, north
settings.minLon, settings.maxLon = west, east
settings.relativeToInitialImport = True
settings.dataType = 'terrain'
result = bpy.ops.blosm.import_data()
if result != {'FINISHED'}:
    raise RuntimeError('BLOSM terrain import failed: ' + repr(result))
terrain_name = settings.terrainObject
print('TERRAIN_IMPORTED', terrain_name, flush=True)

settings.dataType = 'osm'
settings.osmSource = 'file'
settings.osmFilepath = str(Path(args.osm).resolve())
settings.mode = '3Dsimple'
settings.importForExport = True
settings.singleObject = True
settings.loadMissingMembers = False
settings.forests = False
settings.vegetation = True
settings.highways = True
settings.railways = False
settings.water = True
settings.buildings = True
settings.subdivide = True
settings.subdivisionSize = 20
result = bpy.ops.blosm.import_data()
if result != {'FINISHED'}:
    raise RuntimeError('BLOSM OSM import failed: ' + repr(result))
print('OSM_IMPORTED', [(obj.name, obj.type) for obj in scene.objects], flush=True)

palette = {
    'terrain': (0.22, 0.32, 0.20, 1),
    'buildings': (0.19, 0.21, 0.23, 1),
    'roads': (0.20, 0.23, 0.23, 1),
    'water': (0.06, 0.24, 0.32, 1),
    'vegetation': (0.13, 0.30, 0.21, 1),
}
materials = {}
for name, color in palette.items():
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = color
    shader.inputs['Roughness'].default_value = 0.9
    materials[name] = material

# Generic CC0 materials, unrelated to actual building appearance. Source JPEGs
# remain unchanged and are embedded by the exporter (no runtime texture requests).
texture_sources = []
# Residential walls are quiet pastel stucco, avoiding office-window textures.
for key, color in [('Facade001', (.77, .66, .49, 1)), ('Facade003', (.64, .74, .68, 1)),
                   ('RoofingTiles006', (.32, .20, .13, 1)), ('canopy', (.13, .28, .13, 1)),
                   ('trunk', (.23, .17, .11, 1))]:
    material = bpy.data.materials.new('residential-' + key)
    material.diffuse_color = color
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = color
    shader.inputs['Roughness'].default_value = .95
    materials[key] = material

def texture_building(mesh):
    # Connected components make each building keep one facade, independent of
    # polygon order. World-meter UVs preserve window scale across the crop.
    # BLOSM's simple renderer bakes dark wall vertex colors; remove those
    # and its old UV sets so they cannot multiply or override the new textures.
    for attribute in list(mesh.color_attributes):
        mesh.color_attributes.remove(attribute)
    for layer in list(mesh.uv_layers):
        mesh.uv_layers.remove(layer)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.normal_update()
    uv = bm.loops.layers.uv.verify()
    remaining = set(bm.verts)
    while remaining:
        root = min(remaining, key=lambda v: tuple(v.co))
        component, pending = set(), [root]
        while pending:
            vertex = pending.pop()
            if vertex in component:
                continue
            component.add(vertex)
            pending.extend(edge.other_vert(vertex) for edge in vertex.link_edges)
        remaining.difference_update(component)
        min_x = min(v.co.x for v in component)
        min_y = min(v.co.y for v in component)
        min_z = min(v.co.z for v in component)
        facade = 1 + (int(math.floor(min_x / 17)) + int(math.floor(min_y / 17))) % 2
        for face in {f for vertex in component for f in vertex.link_faces}:
            roof = abs(face.normal.z) > .5
            face.material_index = (3 if face.normal.z < .98 else 0) if roof else facade
            for loop in face.loops:
                co = loop.vert.co
                if roof:
                    loop[uv].uv = ((co.x - min_x) / 8, (co.y - min_y) / 8)
                else:
                    horizontal = co.y - min_y if abs(face.normal.x) > abs(face.normal.y) else co.x - min_x
                    loop[uv].uv = (horizontal / 24, (co.z - min_z) / 30)
    bm.to_mesh(mesh)
    bm.free()

terrain_obj = scene.objects.get(terrain_name)
terrain_world = [terrain_obj.matrix_world @ v.co for v in terrain_obj.data.vertices]
vertical_origin = min(v.z for v in terrain_world)
terrain_max = max(v.z for v in terrain_world) - vertical_origin
from mathutils.bvhtree import BVHTree
terrain_tree = BVHTree.FromPolygons(terrain_world, [tuple(face.vertices) for face in terrain_obj.data.polygons])
exercise_ground = {}
for name, x, z in [('school', 0, 0), ('residence', 80, 20), ('shelter', -120, 40)]:
    hit, _, _, _ = terrain_tree.ray_cast(Vector((x, -z, 1000)), Vector((0, 0, -1)))
    if hit is None:
        raise RuntimeError('Exercise anchor is outside the imported terrain')
    exercise_ground[name] = hit.z - vertical_origin
road_validation = []
generic_counts = {}
meshes = []
for obj in list(scene.objects):
    if obj.name.startswith('profile_') or obj.name.endswith('_envelope'):
        bpy.data.objects.remove(obj, do_unlink=True)
        continue
    if obj.type not in {'MESH', 'CURVE'}:
        bpy.data.objects.remove(obj, do_unlink=True)
        continue
    original_name = obj.name.lower().split('.osm_')[-1]
    group = 'terrain' if obj.name == terrain_name else (
        'buildings' if 'building' in original_name else
        'water' if 'water' in original_name or 'coast' in original_name else
        'roads' if 'road' in original_name or 'highway' in original_name or 'path' in original_name else
        'vegetation'
    )
    # Evaluate curves/modifiers directly, including hidden BLOSM road objects.
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = bpy.data.meshes.new_from_object(evaluated)
    mesh.transform(obj.matrix_world)
    generic = bpy.data.objects.new('baked-' + group, mesh)
    scene.collection.objects.link(generic)
    bpy.data.objects.remove(obj, do_unlink=True)
    obj = generic
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for vertex in bm.verts:
        vertex.co.z -= vertical_origin
    # Crop without shifting or scaling the projection. Blender Y is north.
    for point, normal in [
        ((bounds['minX'], 0, 0), (1, 0, 0)),
        ((bounds['maxX'], 0, 0), (-1, 0, 0)),
        ((0, -bounds['maxZ'], 0), (0, 1, 0)),
        ((0, -bounds['minZ'], 0), (0, -1, 0)),
    ]:
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
            dist=0.001, plane_co=point, plane_no=normal, clear_inner=True, clear_outer=False)
    if group == 'roads':
        # BLOSM curve modifiers can retain heights above a steep terrain after
        # evaluation. Drape the exported surface itself, in the same world frame.
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        for _ in range(10):
            long_edges = [edge for edge in bm.edges if edge.calc_length() > 4]
            if not long_edges:
                break
            bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1, use_grid_fill=True)
        missing_ground = []
        for vertex in bm.verts:
            hit, _, _, _ = terrain_tree.ray_cast(Vector((vertex.co.x, vertex.co.y, 1000)), Vector((0, 0, -1)))
            if hit is None:
                missing_ground.append(vertex)
                continue
            vertex.co.z = hit.z - vertical_origin + 1.15
        if missing_ground:
            bmesh.ops.delete(bm, geom=missing_ground, context='VERTS')
        bm.normal_update()
        errors = []
        for face in bm.faces:
            center = face.calc_center_median()
            hit, _, _, _ = terrain_tree.ray_cast(Vector((center.x, center.y, 1000)), Vector((0, 0, -1)))
            if hit is not None:
                errors.append(abs(center.z - (hit.z - vertical_origin + 1.15)))
        road_validation.append(dict(vertices=len(bm.verts), maxFaceCenterErrorMeters=max(errors, default=0)))
    if group == 'terrain' and args.water:
        shore = json.loads(Path(args.water).read_text())
        if args.geo_libs:
            sys.path.insert(0, str(Path(args.geo_libs).resolve()))
        from shapely.geometry import Polygon
        from shapely.ops import triangulate
        sea = Polygon(shore)
        bm.normal_update()
        for face in list(bm.faces):
            footprint = Polygon([(vertex.co.x, vertex.co.y) for vertex in face.verts])
            if footprint.is_empty or not footprint.is_valid:
                continue
            clipped = footprint.difference(sea)
            if clipped.equals(footprint):
                continue
            origin = face.verts[0].co.copy()
            normal = face.normal.copy()
            parts = [clipped] if clipped.geom_type == 'Polygon' else getattr(clipped, 'geoms', [])
            for part in parts:
                if part.is_empty or part.geom_type != 'Polygon':
                    continue
                for triangle in triangulate(part):
                    if not part.covers(triangle):
                        continue
                    vertices = []
                    for x, y in list(triangle.exterior.coords)[:-1]:
                        z = origin.z - (normal.x * (x - origin.x) + normal.y * (y - origin.y)) / normal.z if abs(normal.z) > 1e-6 else origin.z
                        vertices.append(bm.verts.new((x, y, z)))
                    bm.faces.new(vertices)
            bmesh.ops.delete(bm, geom=[face], context='FACES_ONLY')
    bm.to_mesh(obj.data)
    bm.free()
    if group == 'terrain':
        # Sample the final clipped render triangles, not BLOSM's original quads.
        # Non-planar quads can triangulate differently and cause road burial.
        obj.data.calc_loop_triangles()
        terrain_tree = BVHTree.FromPolygons(
            [vertex.co + Vector((0, 0, vertical_origin)) for vertex in obj.data.vertices],
            [tuple(triangle.vertices) for triangle in obj.data.loop_triangles], all_triangles=True)
    if not obj.data.polygons:
        bpy.data.objects.remove(obj, do_unlink=True)
        continue
    if group == 'roads':
        # A shallow slab extends down into terrain; the top clears interpolation
        # differences without thin surfaces flickering through the ground.
        for polygon in obj.data.polygons:
            if polygon.normal.z < 0:
                polygon.flip()
        modifier = obj.modifiers.new('road-slab', 'SOLIDIFY')
        modifier.thickness = 1.3
        modifier.offset = -1
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        slab = bpy.data.meshes.new_from_object(evaluated)
        obj.modifiers.clear()
        obj.data = slab
    obj.data.materials.clear()
    obj.data.materials.append(materials[group])
    if group == 'terrain':
        obj.data.materials.append(materials['water'])
    for polygon in obj.data.polygons:
        polygon.material_index = 1 if group == 'terrain' and all(obj.data.vertices[i].co.z <= .25 for i in polygon.vertices) else 0
    if group == 'buildings':
        for key in ['Facade001', 'Facade003', 'RoofingTiles006']:
            obj.data.materials.append(materials[key])
        texture_building(obj.data)
    generic_counts[group] = generic_counts.get(group, 0) + 1
    obj.name = group + '-' + str(generic_counts[group])
    obj.data.name = obj.name + '-mesh'
    meshes.append(obj)

# Authored landscaping for legibility, not surveyed tree locations. Keep trees
# clear of mapped buildings/roads and sample their elevation from the real terrain.
if args.geo_libs:
    sys.path.insert(0, str(Path(args.geo_libs).resolve()))
from shapely.geometry import Polygon, Point
from shapely.ops import unary_union
obstacles = []
for obj in meshes:
    if not obj.name.startswith(('buildings-', 'roads-')):
        continue
    for face in obj.data.polygons:
        polygon = Polygon([(obj.data.vertices[i].co.x, obj.data.vertices[i].co.y) for i in face.vertices])
        if polygon.is_valid and polygon.area > .1:
            obstacles.append(polygon)
forbidden = unary_union(obstacles).buffer(5)
rng = random.Random(21026)
canopies, trunks = bmesh.new(), bmesh.new()
tree_count = 0
tree_positions = []
for attempt in range(1800):
    if tree_count >= 55:
        break
    x, y = rng.uniform(-340, 340), rng.uniform(-240, 240)
    if forbidden.contains(Point(x, y)) or any((x - px)**2 + (y - py)**2 < 24**2 for px, py in tree_positions) or any((x - px)**2 + (y - py)**2 < 25**2 for px, py in [(0, 0), (80, -20), (-120, -40)]):
        continue
    hit, _, _, _ = terrain_tree.ray_cast(Vector((x, y, 1000)), Vector((0, 0, -1)))
    if hit is None:
        continue
    z, height = hit.z - vertical_origin, rng.uniform(3.5, 5.5)
    result = bmesh.ops.create_cone(trunks, cap_ends=True, cap_tris=True, segments=6,
        radius1=.5, radius2=.3, depth=height)
    bmesh.ops.translate(trunks, verts=result['verts'], vec=Vector((x, y, z + height / 2)))
    result = bmesh.ops.create_icosphere(canopies, subdivisions=1, radius=rng.uniform(2, 3))
    bmesh.ops.scale(canopies, verts=result['verts'], vec=Vector((1, 1, 1.2)))
    bmesh.ops.translate(canopies, verts=result['verts'], vec=Vector((x, y, z + height)))
    tree_positions.append((x, y))
    tree_count += 1
for bm, name, material in [(canopies, 'authored-tree-canopies', 'canopy'), (trunks, 'authored-tree-trunks', 'trunk')]:
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(materials[material])
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    meshes.append(obj)

triangles = sum(sum(len(poly.vertices) - 2 for poly in obj.data.polygons) for obj in meshes)
if args.water:
    from mathutils.geometry import tessellate_polygon
    shore = json.loads(Path(args.water).read_text())
    points = [Vector((x, y, .35 - vertical_origin)) for x, y in shore[:-1]]
    triangles_water = tessellate_polygon([points])
    indices = {tuple(point): index for index, point in enumerate(points)}
    faces = [[point if isinstance(point, int) else indices[tuple(point)] for point in triangle] for triangle in triangles_water]
    water_mesh = bpy.data.meshes.new('shoreline-water-mesh')
    water_mesh.from_pydata(points, [], faces)
    water_mesh.materials.append(materials['water'])
    water_object = bpy.data.objects.new('shoreline-water', water_mesh)
    scene.collection.objects.link(water_object)
    triangles += len(faces)
if triangles > 100000:
    raise RuntimeError(f'Asset exceeds 100k triangle budget: {triangles}')
for name, x, z in [('school', 0, 0), ('residence', 80, 20), ('shelter', -120, 40)]:
    anchor = bpy.data.objects.new('place:' + name, None)
    anchor.location = (x, -z, 0)
    scene.collection.objects.link(anchor)
glb_path = output / 'bay-area.glb'
bpy.ops.export_scene.gltf(filepath=str(glb_path), export_format='GLB', export_yup=True,
    export_extras=False, export_cameras=False, export_lights=False, export_animations=False,
    export_apply=True)
if glb_path.stat().st_size > 3000000:
    raise RuntimeError('Uncompressed asset exceeds 3MB budget; optimize before publishing')
golden = []
for lat, lon in [(args.lat, args.lon), (args.lat + .001, args.lon),
                 (args.lat, args.lon + .001), (args.lat - .001, args.lon - .001)]:
    x, y, _ = projection.fromGeographic(lat, lon)
    golden.append(dict(latitude=lat, longitude=lon, x=x, z=-y))
metadata = {
    'schemaVersion': 1,
    'label': 'Montclair residential hills',
    'asset': 'bay-area.glb',
    'topdown': 'topdown.png',
    'projection': {'kind': 'blosm-spherical-transverse-mercator', 'radiusMeters': 6378137,
        'scaleFactor': 1, 'originLatitude': args.lat, 'originLongitude': args.lon,
        'verticalOriginMeters': vertical_origin, 'axes': 'x=east,y=up,z=south', 'units': 'meters'},
    'geographicBounds': {'south': south, 'west': west, 'north': north, 'east': east},
    'sceneBounds': bounds,
    'terrainMaxY': terrain_max,
    'exerciseGroundY': exercise_ground,
    'triangleCount': triangles,
    'roadDrape': {'surfaceOffsetMeters': 1.15, 'slabThicknessMeters': 1.3, 'maxEdgeMeters': 4, 'objects': road_validation},
    'assetBytes': glb_path.stat().st_size,
    'assetSha256': hashlib.sha256(glb_path.read_bytes()).hexdigest(),
    'osmSha256': hashlib.sha256(Path(args.osm).read_bytes()).hexdigest(),
    'blenderVersion': bpy.app.version_string,
    'blosmVersion': '.'.join(map(str, blosm.bl_info['version'])),
    'genericTextures': texture_sources,
    'attribution': 'Map data (c) OpenStreetMap contributors (ODbL). Elevation: Mapzen terrain tiles (Skadi).',
    'sources': ['https://www.openstreetmap.org/copyright', 'https://github.com/tilezen/joerd',
        'https://github.com/vvoovv/blosm', 'https://meshview.bayme.sh/map'],
    'coverageUse': 'Residential deployment illustration, not measured LoRa coverage. No third-party node positions bundled.',
    'landscaping': {'kind': 'authored procedural', 'trees': tree_count, 'seed': 21026, 'note': 'Decorative landscaping; not surveyed trees'},
    'appearance': 'Generic pastel stucco and slate/terracotta roofs; not actual building colors',
    'goldenCoordinates': golden,
}
(output / 'scene-meta.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
camera_data = bpy.data.cameras.new('topdown-camera')
camera = bpy.data.objects.new('topdown-camera', camera_data)
scene.collection.objects.link(camera)
camera.location = (0, 0, 1000)
camera.rotation_euler = (0, 0, 0)
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 700
camera_data.clip_end = 2000
scene.camera = camera
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.world.use_nodes = True
scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value = (.55, .65, .8, 1)
scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value = .8
sun_data = bpy.data.lights.new('preview-sun', 'SUN')
sun_data.energy = 2
sun = bpy.data.objects.new('preview-sun', sun_data)
scene.collection.objects.link(sun)
sun.rotation_euler = (.4, -.5, -.3)
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
scene.display.shading.background_type = 'WORLD'
scene.world.color = (0.02, 0.05, 0.06)
scene.render.resolution_x = 1400
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.filepath = str(output / 'topdown.png')
bpy.ops.render.render(write_still=True)
print('BAKE_COMPLETE', json.dumps(metadata), flush=True)
