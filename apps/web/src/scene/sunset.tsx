import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, DataTexture, DoubleSide, Float32BufferAttribute,
  InstancedMesh, MathUtils, Mesh, Object3D, PlaneGeometry, RepeatWrapping, Shape, ShapeGeometry, ShapeUtils, SRGBColorSpace,
  Vector2, Vector3,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SUNSET } from './georeference';
import { attentionColor, attentionLabel, densityAt, HEATMAP_HEIGHT_SCALE, PLACES, placePosition, type SceneIncident } from './model';

export type CameraView = 'overview' | 'top' | 'selected';
const B = SUNSET.bounds;
const W = B.maxX - B.minX;
const D = B.maxZ - B.minZ;
const CX = (B.minX + B.maxX) / 2;
const CZ = (B.minZ + B.maxZ) / 2;
// Outer Sunset stucco: whites, creams, pastel blues, greens and pinks.
const STUCCO = ['#ece6da', '#e4dccb', '#d9e2e4', '#cfdccf', '#e8d6cc', '#d8d2e2', '#efe4c4', '#c9d6dd', '#f1ece3', '#dcd3c0'];
const FOG = '#aebcc2';
// Overview: looking north-west over the three sites toward the beach.
const HOME_TARGET = new Vector3(-20, 0, 20);
const HOME = new Vector3(380, 480, 700);

const pairs = (flat: number[]) => Array.from({ length: flat.length / 2 }, (_, i) => [flat[2 * i], flat[2 * i + 1]] as [number, number]);
const hash = (x: number, z: number) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };

// ---- ground: one painted texture for lots, streets, parks, pitches and the beach -------------------------

const PX = 1.6; // texture pixels per metre
function paintGround(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * PX); canvas.height = Math.round(D * PX);
  const g = canvas.getContext('2d')!;
  const tx = (x: number) => (x - B.minX) * PX;
  const tz = (z: number) => (z - B.minZ) * PX;
  const path = (flat: number[], close: boolean) => {
    g.beginPath(); pairs(flat).forEach(([x, z], i) => (i ? g.lineTo(tx(x), tz(z)) : g.moveTo(tx(x), tz(z))));
    if (close) g.closePath();
  };
  g.fillStyle = '#a5ab92'; g.fillRect(0, 0, canvas.width, canvas.height); // backyards and lots
  for (let i = 0; i < 9000; i++) { // grass and gravel speckle
    g.fillStyle = hash(i, 1) > .5 ? 'rgba(80,96,62,.12)' : 'rgba(210,205,190,.10)';
    g.fillRect(hash(i, 2) * canvas.width, hash(i, 3) * canvas.height, 3 + hash(i, 4) * 5, 3 + hash(i, 5) * 5);
  }
  g.fillStyle = '#86a46c'; SUNSET.parks.forEach((p) => { path(p, true); g.fill(); });
  for (const p of SUNSET.pitches) { path(p, true); g.fillStyle = '#6f9a5a'; g.fill(); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1.2; g.stroke(); }
  // Beach: sand from the coastline to 120 m inland, then dunes blending into the Great Highway.
  const coast = pairs(SUNSET.coast);
  const sand = (inland: number, color: string) => {
    g.beginPath(); coast.forEach(([x, z], i) => (i ? g.lineTo(tx(x + inland), tz(z)) : g.moveTo(tx(x + inland), tz(z))));
    g.lineTo(0, canvas.height + 2000); g.lineTo(-2000, canvas.height + 2000); g.lineTo(-2000, -2000); g.lineTo(0, -2000); g.closePath();
    g.fillStyle = color; g.fill();
  };
  sand(150, '#cdbf98'); sand(115, '#dccca2'); sand(18, '#c4b38a'); // dunes, dry sand, wet sand
  const roads = [...SUNSET.roads].sort((a, b) => a.w - b.w);
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const r of roads) if (r.w >= 8) { path(r.p, false); g.strokeStyle = '#cfcbc1'; g.lineWidth = (r.w + 4) * PX; g.stroke(); } // sidewalks
  for (const r of roads) { path(r.p, false); g.strokeStyle = r.w >= 8 ? '#50555b' : r.w >= 4 ? '#6b6f72' : '#bdb6a3'; g.lineWidth = r.w * PX; g.stroke(); }
  g.setLineDash([5 * PX, 6 * PX]);
  for (const r of roads) if (r.w >= 15) { path(r.p, false); g.strokeStyle = '#e8d38a'; g.lineWidth = .35 * PX; g.stroke(); }
  g.setLineDash([]);
  const tex = new CanvasTexture(canvas); tex.colorSpace = SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

function landGeometry(): ShapeGeometry {
  // Land polygon: the coastline on the west, the scene bounds elsewhere. UVs follow world metres.
  const coast = pairs(SUNSET.coast).filter(([, z]) => z > B.minZ - 300 && z < B.maxZ + 300).sort((a, b) => a[1] - b[1]);
  const shape = new Shape();
  shape.moveTo(coast[0][0], -coast[0][1]);
  coast.forEach(([x, z]) => shape.lineTo(x, -z));
  shape.lineTo(B.maxX + 400, -coast[coast.length - 1][1]); shape.lineTo(B.maxX + 400, -coast[0][1]); shape.closePath();
  const geometry = new ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position as BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[2 * i] = (pos.getX(i) - B.minX) / W; uv[2 * i + 1] = 1 - (pos.getZ(i) - B.minZ) / D; }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  return geometry;
}

// ---- buildings: extruded OSM footprints with window-textured stucco walls and flat roofs ---------------

function windowTexture(): CanvasTexture {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#e6e6e6'; g.fillRect(0, 120, 128, 8); // floor line
  g.fillStyle = '#5c6c78'; g.fillRect(30, 34, 68, 58); // window
  g.fillStyle = '#8fa3b0'; g.fillRect(34, 38, 60, 22); // sky reflection
  g.strokeStyle = '#f7f7f2'; g.lineWidth = 4; g.strokeRect(30, 34, 68, 58);
  g.beginPath(); g.moveTo(64, 34); g.lineTo(64, 92); g.stroke();
  const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; t.anisotropy = 4;
  return t;
}

type Footprint = { h: number; p: number[]; site?: string };
function buildingGeometry(list: readonly Footprint[]) {
  const wall: number[] = [], wallUv: number[] = [], wallColor: number[] = [], roof: number[] = [], roofColor: number[] = [];
  const color = new Color();
  for (const b of list) {
    let pts = pairs(b.p);
    let signed = 0;
    for (let i = 0; i < pts.length; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length]; signed += x1 * z2 - x2 * z1; }
    if (signed > 0) pts = pts.reverse(); // consistent winding so walls face outward
    color.set(STUCCO[Math.floor(hash(pts[0][0], pts[0][1]) * STUCCO.length)]);
    let run = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
      const len = Math.hypot(x2 - x1, z2 - z1);
      const u1 = run / 3.4, u2 = (run + len) / 3.4, v = b.h / 3.1;
      run += len;
      wall.push(x1, 0, z1, x2, 0, z2, x2, b.h, z2, x1, 0, z1, x2, b.h, z2, x1, b.h, z1);
      wallUv.push(u1, 0, u2, 0, u2, v, u1, 0, u2, v, u1, v);
      for (let k = 0; k < 6; k++) wallColor.push(color.r, color.g, color.b);
    }
    const tris = ShapeUtils.triangulateShape(pts.map(([x, z]) => new Vector2(x, z)), []);
    const shade = .72 + hash(pts[0][1], pts[0][0]) * .12;
    for (const t of tris) for (const k of [t[0], t[2], t[1]]) { roof.push(pts[k][0], b.h, pts[k][1]); roofColor.push(shade, shade, shade * .98); }
  }
  const walls = new BufferGeometry();
  walls.setAttribute('position', new Float32BufferAttribute(wall, 3));
  walls.setAttribute('uv', new Float32BufferAttribute(wallUv, 2));
  walls.setAttribute('color', new Float32BufferAttribute(wallColor, 3));
  walls.computeVertexNormals();
  const roofs = new BufferGeometry();
  roofs.setAttribute('position', new Float32BufferAttribute(roof, 3));
  roofs.setAttribute('color', new Float32BufferAttribute(roofColor, 3));
  roofs.computeVertexNormals();
  return { walls, roofs };
}

function Town() {
  const ground = useMemo(paintGround, []);
  const land = useMemo(landGeometry, []);
  const windows = useMemo(windowTexture, []);
  const { walls, roofs } = useMemo(() => buildingGeometry(SUNSET.buildings), []);
  return <group>
    <mesh geometry={land} receiveShadow><meshStandardMaterial map={ground} roughness={.95} /></mesh>
    <mesh geometry={walls} castShadow receiveShadow><meshStandardMaterial map={windows} vertexColors roughness={.85} /></mesh>
    <mesh geometry={roofs} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={.9} /></mesh>
    <Trees /><Cars />
  </group>;
}

// ---- ocean: animated normal-mapped water with a foam line ------------------------------------------------

function Ocean() {
  const normal = useMemo(() => {
    const n = 256, data = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const a = Math.sin(x / n * Math.PI * 8 + Math.sin(y / n * Math.PI * 4) * 1.5), b = Math.cos(y / n * Math.PI * 10 + Math.sin(x / n * Math.PI * 6));
      const i = 4 * (y * n + x);
      data[i] = 128 + a * 40; data[i + 1] = 128 + b * 40; data[i + 2] = 255; data[i + 3] = 255;
    }
    const t = new DataTexture(data, n, n); t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(40, 40); t.needsUpdate = true;
    return t;
  }, []);
  const foam = useRef<Mesh>(null);
  useFrame((_, dt) => {
    normal.offset.x += dt * .006; normal.offset.y += dt * .003;
    if (foam.current) (foam.current.material as { opacity: number }).opacity = .45 + Math.sin(performance.now() / 900) * .15;
  });
  const foamGeometry = useMemo(() => {
    const coast = pairs(SUNSET.coast).sort((a, b) => a[1] - b[1]);
    const pos: number[] = [];
    for (let i = 0; i < coast.length - 1; i++) {
      const [x1, z1] = coast[i], [x2, z2] = coast[i + 1];
      pos.push(x1 - 10, .15, z1, x2 - 10, .15, z2, x2 + 2, .15, z2, x1 - 10, .15, z1, x2 + 2, .15, z2, x1 + 2, .15, z1);
    }
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    return g;
  }, []);
  return <group>
    <mesh rotation-x={-Math.PI / 2} position={[CX - 600, -.6, CZ]} receiveShadow>
      <planeGeometry args={[W + 3200, D + 3200]} />
      <meshStandardMaterial color="#3d6670" normalMap={normal} normalScale={new Vector2(.45, .45)} roughness={.22} metalness={.15} />
    </mesh>
    <mesh ref={foam} geometry={foamGeometry}><meshBasicMaterial color="#f3f5f0" transparent opacity={.5} depthWrite={false} /></mesh>
  </group>;
}

// ---- trees and parked cars (instanced, deterministic) ---------------------------------------------------

function inside(x: number, z: number, poly: [number, number][]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

function Trees() {
  const spots = useMemo(() => {
    const out: [number, number, number][] = [];
    for (const flat of SUNSET.parks) {
      const poly = pairs(flat), xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
      for (let x = Math.min(...xs); x < Math.max(...xs); x += 13) for (let z = Math.min(...zs); z < Math.max(...zs); z += 13) {
        const jx = x + (hash(x, z) - .5) * 9, jz = z + (hash(z, x) - .5) * 9;
        if (hash(jx, jz) > .45 && inside(jx, jz, poly)) out.push([jx, jz, 4 + hash(jz, jx) * 4]);
      }
    }
    // Windswept Monterey cypress line along the dunes, west of the Great Highway.
    for (const [x, z] of pairs(SUNSET.coast)) if (z > B.minZ && z < B.maxZ && hash(x, z) > .3) out.push([x + 135 + hash(z, 1) * 12, z, 5 + hash(x, 2) * 3]);
    return out;
  }, []);
  const crown = useRef<InstancedMesh>(null), trunk = useRef<InstancedMesh>(null);
  useEffect(() => {
    const o = new Object3D(), c = new Color();
    spots.forEach(([x, z, s], i) => {
      o.position.set(x, s * 1.15, z); o.scale.set(s * 1.1, s * .8, s * 1.1); o.rotation.y = hash(x, z) * 6; o.updateMatrix();
      crown.current!.setMatrixAt(i, o.matrix); crown.current!.setColorAt(i, c.setHSL(.27 + hash(z, x) * .06, .32, .26 + hash(x, x) * .08));
      o.position.set(x, s * .35, z); o.scale.set(.5, s * .7, .5); o.updateMatrix(); trunk.current!.setMatrixAt(i, o.matrix);
    });
    crown.current!.instanceMatrix.needsUpdate = trunk.current!.instanceMatrix.needsUpdate = true;
    if (crown.current!.instanceColor) crown.current!.instanceColor.needsUpdate = true;
  }, [spots]);
  return <group>
    <instancedMesh ref={crown} args={[undefined, undefined, spots.length]} castShadow><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial roughness={1} flatShading /></instancedMesh>
    <instancedMesh ref={trunk} args={[undefined, undefined, spots.length]} castShadow><cylinderGeometry args={[.5, .6, 1, 6]} /><meshStandardMaterial color="#5a4636" /></instancedMesh>
  </group>;
}

const CAR_COLORS = ['#c9ccce', '#2b2f36', '#8e1f24', '#f2f2ee', '#3c5a7a', '#6c7175', '#b8a77c', '#204a3a'];
function Cars() {
  const cars = useMemo(() => {
    const out: { x: number; z: number; a: number; c: string }[] = [];
    for (const r of SUNSET.roads) {
      if (r.w < 11 || r.w > 15) continue; // parked along residential streets only
      const pts = pairs(r.p);
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
        const len = Math.hypot(x2 - x1, z2 - z1), a = Math.atan2(z2 - z1, x2 - x1);
        const nx = -(z2 - z1) / len, nz = (x2 - x1) / len;
        for (let d = 8; d < len - 8; d += 7.5) for (const side of [-1, 1]) {
          if (hash(x1 + d, z1 + side) > .42) continue;
          const off = side * (r.w / 2 - 1.3);
          const x = x1 + (x2 - x1) * d / len + nx * off, z = z1 + (z2 - z1) * d / len + nz * off;
          out.push({ x, z, a, c: CAR_COLORS[Math.floor(hash(x, z) * CAR_COLORS.length)] });
        }
      }
    }
    return out;
  }, []);
  const body = useRef<InstancedMesh>(null), cabin = useRef<InstancedMesh>(null);
  useEffect(() => {
    const o = new Object3D(), c = new Color();
    cars.forEach((car, i) => {
      o.rotation.set(0, -car.a, 0);
      o.position.set(car.x, .55, car.z); o.scale.set(4.4, .8, 1.8); o.updateMatrix(); body.current!.setMatrixAt(i, o.matrix);
      body.current!.setColorAt(i, c.set(car.c));
      o.position.set(car.x, 1.25, car.z); o.scale.set(2.4, .65, 1.6); o.updateMatrix(); cabin.current!.setMatrixAt(i, o.matrix);
    });
    body.current!.instanceMatrix.needsUpdate = cabin.current!.instanceMatrix.needsUpdate = true;
    if (body.current!.instanceColor) body.current!.instanceColor.needsUpdate = true;
  }, [cars]);
  return <group>
    <instancedMesh ref={body} args={[undefined, undefined, cars.length]} castShadow><boxGeometry /><meshStandardMaterial roughness={.4} metalness={.3} /></instancedMesh>
    <instancedMesh ref={cabin} args={[undefined, undefined, cars.length]}><boxGeometry /><meshStandardMaterial color="#2d3a44" roughness={.2} metalness={.4} /></instancedMesh>
  </group>;
}

// ---- exercise sites, incident beacons and labels --------------------------------------------------------

function labelTexture(title: string, detail: string | null, accent: string, selected: boolean) {
  const c = document.createElement('canvas'); c.width = 512; c.height = detail ? 150 : 96;
  const g = c.getContext('2d')!;
  g.fillStyle = selected ? 'rgba(255,250,236,.97)' : 'rgba(17,30,34,.88)';
  g.beginPath(); g.roundRect(4, 4, 504, c.height - 8, 18); g.fill();
  g.fillStyle = accent; g.beginPath(); g.roundRect(4, 4, 14, c.height - 8, [18, 0, 0, 18]); g.fill();
  g.fillStyle = selected ? '#14262a' : '#f1efe6'; g.font = '600 46px system-ui'; g.textBaseline = 'middle';
  g.fillText(title, 40, detail ? 52 : 50);
  if (detail) { g.fillStyle = selected ? '#4a3a2a' : accent; g.font = '500 34px system-ui'; g.fillText(detail, 40, 108); }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace;
  return { t, aspect: c.width / c.height };
}

function Label({ title, detail, accent, selected, position }: { title: string; detail: string | null; accent: string; selected: boolean; position: [number, number, number] }) {
  const { t, aspect } = useMemo(() => labelTexture(title, detail, accent, selected), [title, detail, accent, selected]);
  const h = detail ? 15 : 10;
  return <sprite position={position} scale={[h * aspect, h, 1]} renderOrder={10}>
    <spriteMaterial map={t} depthTest={false} transparent />
  </sprite>;
}

function Beacon({ incident, offset, selected, onSelect }: { incident: SceneIncident; offset: number; selected: boolean; onSelect: () => void }) {
  const place = PLACES.find((p) => p.id === incident.confirmedPlaceId)!;
  const site = place;
  const color = attentionColor(incident.attention);
  const ring = useRef<Mesh>(null);
  useFrame(() => {
    const t = (performance.now() / 1600 + offset * .3) % 1;
    if (ring.current) { ring.current.scale.setScalar(8 + t * (selected ? 34 : 24)); (ring.current.material as { opacity: number }).opacity = (1 - t) * .8; }
  });
  const click = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(); };
  const x = site.x + offset * 14, z = site.z;
  return <group>
    <mesh position={[x, site.h + 30, z]} onClick={click} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
      <cylinderGeometry args={[selected ? 2.4 : 1.6, selected ? 2.4 : 1.6, 60, 12, 1, true]} />
      <meshBasicMaterial color={color} transparent opacity={selected ? .75 : .5} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} />
    </mesh>
    <mesh ref={ring} rotation-x={-Math.PI / 2} position={[x, .5, z]} onClick={click}>
      <ringGeometry args={[.85, 1, 48]} />
      <meshBasicMaterial color={color} transparent depthWrite={false} side={DoubleSide} />
    </mesh>
    <Label title={place.name} detail={`${attentionLabel(incident.attention)} · ${incident.status.toLowerCase()}`} accent={color} selected={selected}
      position={[x, site.h + 68, z]} />
  </group>;
}

function SiteHighlights() {
  // A soft footprint glow under each exercise site, so the three synthetic sites read at a glance.
  return <group>{PLACES.map((p) => <mesh key={p.id} rotation-x={-Math.PI / 2} position={[p.x, .3, p.z]}>
    <circleGeometry args={[26, 48]} /><meshBasicMaterial color="#f6e7b8" transparent opacity={.22} depthWrite={false} />
  </mesh>)}</group>;
}

// ---- heatmap: confirmed open located incidents, draped on the ground with an optional raised surface -----

const RAMP = ['#2a4d8f', '#1f8a8a', '#7cc47a', '#f2c94c', '#f2994a', '#e2533b'];
function ramp(v: number, out: Color) {
  const t = MathUtils.clamp(v / 3, 0, 1) * (RAMP.length - 1), i = Math.floor(t);
  return out.set(RAMP[i]).lerp(new Color(RAMP[Math.min(i + 1, RAMP.length - 1)]), t - i);
}

function Heatmap({ incidents, raised }: { incidents: readonly SceneIncident[]; raised: boolean }) {
  const nx = 200, nz = Math.round(200 * D / W);
  const grid = useMemo(() => {
    const v = new Float32Array((nx + 1) * (nz + 1));
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) v[j * (nx + 1) + i] = densityAt({ x: B.minX + i / nx * W, z: B.minZ + j / nz * D }, incidents);
    return v;
  }, [incidents, nx, nz]);
  const draped = useMemo(() => {
    const data = new Uint8Array((nx + 1) * (nz + 1) * 4), c = new Color();
    grid.forEach((v, k) => {
      // The rotated plane's texture row 0 is its south edge (maxZ); grid row 0 is minZ.
      const i = k % (nx + 1), j = Math.floor(k / (nx + 1));
      ramp(v, c); const a = v <= 0 ? 0 : MathUtils.smoothstep(v, 0, .5) * 200;
      data.set([c.r * 255, c.g * 255, c.b * 255, a], 4 * ((nz - j) * (nx + 1) + i));
    });
    const t = new DataTexture(data, nx + 1, nz + 1); t.flipY = false; t.needsUpdate = true; t.colorSpace = SRGBColorSpace;
    return t;
  }, [grid, nx, nz]);
  const surface = useMemo(() => {
    const geometry = new PlaneGeometry(W, D, nx, nz);
    geometry.rotateX(-Math.PI / 2);
    const pos = geometry.attributes.position as BufferAttribute, colors = new Float32Array(pos.count * 3), c = new Color();
    const value = new Float32Array(pos.count);
    for (let k = 0; k < pos.count; k++) {
      const i = Math.round((pos.getX(k) + W / 2) / W * nx), j = Math.round((pos.getZ(k) + D / 2) / D * nz);
      value[k] = grid[j * (nx + 1) + i];
      pos.setY(k, value[k] * HEATMAP_HEIGHT_SCALE);
      ramp(value[k], c); colors.set([c.r, c.g, c.b], 3 * k);
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    // Keep only cells with density, so empty ground gets no floating sheet.
    const index = geometry.index!.array, kept: number[] = [];
    for (let t = 0; t < index.length; t += 3) if (value[index[t]] > 0 || value[index[t + 1]] > 0 || value[index[t + 2]] > 0) kept.push(index[t], index[t + 1], index[t + 2]);
    geometry.setIndex(kept);
    geometry.computeVertexNormals();
    return geometry;
  }, [grid, nx, nz]);
  return <group position={[CX, 0, CZ]}>
    <mesh rotation-x={-Math.PI / 2} position={[0, .8, 0]} renderOrder={2}>
      <planeGeometry args={[W, D]} /><meshBasicMaterial map={draped} transparent depthWrite={false} />
    </mesh>
    {raised && <mesh geometry={surface} position={[0, 16, 0]} renderOrder={3}>
      <meshStandardMaterial vertexColors transparent opacity={.55} depthWrite={false} side={DoubleSide} roughness={.6} />
    </mesh>}
  </group>;
}

// ---- camera ----------------------------------------------------------------------------------------------

function CameraRig({ view, focus, onFailure }: { view: CameraView; focus: { x: number; z: number } | null; onFailure: () => void }) {
  const { camera, gl } = useThree();
  const controls = useRef<OrbitControls>();
  const goal = useRef<{ pos: Vector3; target: Vector3; until: number } | null>(null);
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = true; c.maxPolarAngle = Math.PI / 2.15; c.minDistance = 60; c.maxDistance = 2200;
    c.target.copy(HOME_TARGET); controls.current = c;
    const lost = (event: Event) => { event.preventDefault(); onFailure(); };
    gl.domElement.addEventListener('webglcontextlost', lost);
    return () => { c.dispose(); gl.domElement.removeEventListener('webglcontextlost', lost); };
  }, [camera, gl, onFailure]);
  useEffect(() => {
    const f = view === 'selected' && focus ? focus : null;
    const target = f ? new Vector3(f.x, 0, f.z) : view === 'top' ? new Vector3(CX, 0, CZ) : HOME_TARGET;
    const pos = f ? new Vector3(f.x + 170, 210, f.z + 260) : view === 'top' ? new Vector3(CX, 1350, CZ + 1) : HOME;
    goal.current = { pos, target, until: performance.now() + 1400 };
  }, [view, focus?.x, focus?.z]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(() => {
    const c = controls.current; if (!c) return;
    const g = goal.current;
    if (g && performance.now() < g.until) { camera.position.lerp(g.pos, .07); c.target.lerp(g.target, .07); }
    c.update();
  });
  return null;
}

export function SunsetCanvas({ incidents, selectedIncidentId, onSelectIncident, heatmap, raised, view, onFailure }: {
  incidents: readonly SceneIncident[];
  selectedIncidentId: string | null;
  onSelectIncident: (incidentId: string | null) => void;
  heatmap: boolean;
  raised: boolean;
  view: CameraView;
  onFailure: () => void;
}) {
  const located = incidents.filter((row) => row.status === 'OPEN' && placePosition(row.confirmedPlaceId));
  const selected = located.find((row) => row.incidentId === selectedIncidentId);
  const focus = selected ? placePosition(selected.confirmedPlaceId) : null;
  return <Canvas shadows camera={{ position: HOME.toArray(), fov: 38, near: 1, far: 6000 }} dpr={[1, 2]}
    onPointerMissed={() => onSelectIncident(null)} gl={{ antialias: true }} aria-label="Outer Sunset exercise map · 3D">
    <color attach="background" args={[FOG]} />
    <fog attach="fog" args={[FOG, 900, 3200]} />
    <hemisphereLight args={['#dfe7ea', '#6f6a5c', 1.1]} />
    <directionalLight position={[-500, 650, 350]} intensity={1.6} color="#fff3e0" castShadow
      shadow-mapSize={[4096, 4096]} shadow-camera-left={-800} shadow-camera-right={800} shadow-camera-top={700} shadow-camera-bottom={-700}
      shadow-camera-far={2400} shadow-bias={-.0004} />
    <Town />
    <Ocean />
    <SiteHighlights />
    {PLACES.filter((p) => !located.some((row) => row.confirmedPlaceId === p.id)).map((p) =>
      <Label key={p.id} title={p.name} detail={null} accent="#9fb3b6" selected={false} position={[p.x, p.h + 24, p.z]} />)}
    {located.map((row, i) => <Beacon key={row.incidentId} incident={row} selected={row.incidentId === selectedIncidentId}
      offset={located.slice(0, i).filter((prior) => prior.confirmedPlaceId === row.confirmedPlaceId).length}
      onSelect={() => onSelectIncident(row.incidentId)} />)}
    {heatmap && <Heatmap incidents={incidents} raised={raised} />}
    <CameraRig view={view} focus={focus} onFailure={onFailure} />
  </Canvas>;
}
