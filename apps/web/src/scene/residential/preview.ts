import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import meta from './metadata.json';

const map = document.querySelector<HTMLDivElement>('#map')!;
const scene = new THREE.Scene();
// Dusk sky gradient + distance fog so the diorama reads in depth.
const sky = document.createElement('canvas'); sky.width = 2; sky.height = 256;
const g = sky.getContext('2d')!; const grad = g.createLinearGradient(0, 0, 0, 256);
grad.addColorStop(0, '#0d1820'); grad.addColorStop(.62, '#1d3540'); grad.addColorStop(1, '#4a5f5c');
g.fillStyle = grad; g.fillRect(0, 0, 2, 256);
const skyTexture = new THREE.CanvasTexture(sky); skyTexture.colorSpace = THREE.SRGBColorSpace;
scene.background = skyTexture;
scene.fog = new THREE.Fog('#24404a', 1100, 2900);
const camera = new THREE.PerspectiveCamera(37, innerWidth / innerHeight, .5, 4000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), 350), new THREE.Plane(new THREE.Vector3(-1, 0, 0), 350), new THREE.Plane(new THREE.Vector3(0, 0, 1), 250), new THREE.Plane(new THREE.Vector3(0, 0, -1), 250)];
map.append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.maxPolarAngle = Math.PI / 2.15;
controls.minDistance = 180; controls.maxDistance = 1600;
controls.enableDamping = true;
controls.autoRotate = true; controls.autoRotateSpeed = .35; // slow idle drift; stops on first interaction
const center = new THREE.Vector3(0, meta.terrainMaxY * .48, 0);
controls.target.copy(center);
const overview = new THREE.Vector3(590, 530, 700);
camera.position.copy(overview);
scene.add(new THREE.HemisphereLight('#cfe3ff', '#5d6a45', .85));
// Low warm sun with real shadows: long, soft shadows are most of the "pop".
const sun = new THREE.DirectionalLight('#ffd29a', 3.1); sun.position.set(-430, 380, 260); sun.target.position.set(0, 60, 0);
sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -.0004; sun.shadow.normalBias = .8;
Object.assign(sun.shadow.camera, { left: -460, right: 460, top: 420, bottom: -420, near: 50, far: 1600 });
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight('#9cc6df', .6); rim.position.set(300, 150, -450); scene.add(rim);
const base = new THREE.Mesh(new THREE.BoxGeometry(714, 16, 514), new THREE.MeshStandardMaterial({ color: '#1b2c30', roughness: 1 }));
base.position.y = -12; scene.add(base);

const points = [
  { id: 'school', label: 'School', x: 0, z: 0, color: '#8ed5d0' },
  { id: 'residence', label: 'Residence', x: 80, z: 20, color: '#ffb490' },
  { id: 'shelter', label: 'Shelter', x: -120, z: 40, color: '#f3d581' },
] as const;
const pins: { point: THREE.Vector3; label: HTMLDivElement; pulse: THREE.Mesh; beacon: THREE.Mesh }[] = [];
for (const p of points) {
  const y = meta.exerciseGroundY[p.id];
  const group = new THREE.Group(); group.position.set(p.x, y, p.z);
  const circle = new THREE.Mesh(new THREE.RingGeometry(6, 7.3, 48), new THREE.MeshBasicMaterial({ color: p.color, side: THREE.DoubleSide, transparent: true, opacity: .9, depthTest: false }));
  circle.rotation.x = -Math.PI / 2; circle.position.y = 1; circle.renderOrder = 5; group.add(circle);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 24, 8), new THREE.MeshBasicMaterial({ color: p.color })); stem.position.y = 13; group.add(stem);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(3.3, 16, 12), new THREE.MeshBasicMaterial({ color: p.color, depthTest: false, transparent: true })); beacon.position.y = 26; beacon.renderOrder = 6; group.add(beacon);
  scene.add(group);
  const label = document.createElement('div'); label.className = 'pin'; label.textContent = p.label; label.style.setProperty('--c', p.color); document.body.append(label);
    const pulse = new THREE.Mesh(new THREE.RingGeometry(5, 7, 48), new THREE.MeshBasicMaterial({ color: p.color, side: THREE.DoubleSide, transparent: true, depthTest: false }));
  pulse.rotation.x = -Math.PI / 2; pulse.position.y = 1.2; pulse.renderOrder = 5; group.add(pulse);
  pins.push({ point: new THREE.Vector3(p.x, y + 34, p.z), label, pulse, beacon });
}
let model: THREE.Group | null = null;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.load('/scene/residential/montclair.glb', (gltf) => {
  model = gltf.scene; scene.add(model);
  document.querySelector("#status")!.textContent = `BLOSM ready · ${(meta.assetBytes / 1024).toFixed(0)} KB · authored landscaping`;
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = !object.name.startsWith('terrain') && !object.name.startsWith('roads');
    object.receiveShadow = true;
    for (const m of [object.material].flat() as THREE.MeshStandardMaterial[]) {
      if (m.name === 'terrain') { m.color.set('#7f9c68'); m.roughness = 1; }
      if (m.name === 'roads') { m.color.set('#5a5f62'); m.roughness = .9; }
      if (m.name === 'residential-canopy') m.color.set('#5f8f4e');
    }
    if (!object.name.startsWith('buildings-')) return;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(object.geometry, 32), new THREE.LineBasicMaterial({ color: '#2f3530', transparent: true, opacity: .22 }));
    object.add(edges);
  });
  scatterTrees(model);
}, undefined, () => { document.querySelector('#status')!.textContent = '3D asset unavailable · aligned 2D fallback'; document.querySelector<HTMLImageElement>('#fallback')!.style.display = 'block'; });
// Authored landscaping (not OSM-surveyed): small trees only on open terrain, never on roads,
// buildings, or within 25 m of an exercise site, so streets and incidents stay readable.
function scatterTrees(root: THREE.Object3D) {
  const terrain: THREE.Object3D[] = []; const blockers: THREE.Object3D[] = [];
  root.traverse((o) => { if (o instanceof THREE.Mesh) (o.name.startsWith('terrain') ? terrain : blockers).push(o); });
  root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(); const down = new THREE.Vector3(0, -1, 0);
  const spots: THREE.Vector3[] = []; let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 4000 && spots.length < 420; i++) {
    const x = -340 + rand() * 680, z = -240 + rand() * 480;
    if (points.some((p) => Math.hypot(p.x - x, p.z - z) < 25)) continue;
    ray.set(new THREE.Vector3(x, 400, z), down);
    const hit = ray.intersectObjects([...terrain, ...blockers], false)[0];
    if (!hit || !hit.object.name.startsWith('terrain')) continue;
    if (spots.some((q) => Math.hypot(q.x - x, q.z - z) < 11)) continue;
    // Keep clear of road slabs a few meters to either side.
    if ([[4, 0], [-4, 0], [0, 4], [0, -4]].some(([dx, dz]) => { ray.set(new THREE.Vector3(x + dx, 400, z + dz), down); const h = ray.intersectObjects([...terrain, ...blockers], false)[0]; return h && !h.object.name.startsWith('terrain'); })) continue;
    spots.push(hit.point.clone());
  }
  const canopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .95, flatShading: true }), spots.length);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.35, .5, 1, 6), new THREE.MeshStandardMaterial({ color: '#5b4632', roughness: 1 }), spots.length);
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const greens = ['#5d8a4a', '#6f9a52', '#4f7a45', '#7fa35c'].map((c) => new THREE.Color(c));
  spots.forEach((s, i) => {
    const h = 3.5 + rand() * 3, r = 2.4 + rand() * 1.8;
    m.compose(new THREE.Vector3(s.x, s.y + h / 2, s.z), q, new THREE.Vector3(1, h, 1)); trunk.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(s.x, s.y + h + r * .6, s.z), q, new THREE.Vector3(r, r * 1.15, r)); canopy.setMatrixAt(i, m);
    canopy.setColorAt(i, greens[i % greens.length]);
  });
  for (const mesh of [canopy, trunk]) { mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'authored-tree-scatter'; root.add(mesh); }
}
// Fixed radius and fixed scale. These are three illustrative contributions, not a flood or RF model.
const heat = new THREE.Group(); heat.visible = false; scene.add(heat);
for (const p of points) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(45, 48, 24), new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: .18, depthWrite: false }));
  mesh.scale.y = .22; mesh.position.set(p.x, meta.terrainMaxY + 14, p.z); heat.add(mesh);
}
function button(id: string, action: (button: HTMLButtonElement) => void) { document.querySelector<HTMLButtonElement>('#' + id)!.onclick = (event) => action(event.currentTarget as HTMLButtonElement); }
let destination = overview.clone(); let target = center.clone();
button('overview', (b) => { destination = overview.clone(); target = center.clone(); b.setAttribute('aria-pressed', 'true'); document.querySelector('#top')!.setAttribute('aria-pressed', 'false'); });
button('top', (b) => { destination = new THREE.Vector3(0, 1000, .01); target = center.clone(); b.setAttribute('aria-pressed', 'true'); document.querySelector('#overview')!.setAttribute('aria-pressed', 'false'); });
button('heat', (b) => { heat.visible = !heat.visible; b.setAttribute('aria-pressed', String(heat.visible)); });
let trees = true;
button('trees', (b) => { trees = !trees; model?.traverse((o) => { if (o.name.startsWith('authored-tree-')) o.visible = trees; }); b.setAttribute('aria-pressed', String(trees)); });
let moving = false;
for (const id of ['overview', 'top']) document.querySelector('#' + id)!.addEventListener('click', () => { moving = true; });
controls.addEventListener('start', () => { moving = false; controls.autoRotate = false; });
const projected = new THREE.Vector3();
function render() {
  requestAnimationFrame(render);
  if (moving) { camera.position.lerp(destination, .07); controls.target.lerp(target, .07); if (camera.position.distanceTo(destination) < .2) moving = false; }
  controls.update();
  const t = performance.now() / 1000;
  pins.forEach((pin, i) => {
    const phase = (t * .7 + i / 3) % 1; // expanding ring, staggered per site
    pin.pulse.scale.setScalar(1 + phase * 3.2); (pin.pulse.material as THREE.MeshBasicMaterial).opacity = .75 * (1 - phase);
    pin.beacon.scale.setScalar(1 + .18 * Math.sin(t * 3 + i));
  });
  for (const pin of pins) { projected.copy(pin.point).project(camera); pin.label.style.left = `${(projected.x * .5 + .5) * innerWidth}px`; pin.label.style.top = `${(-projected.y * .5 + .5) * innerHeight}px`; pin.label.hidden = projected.z > 1; }
  renderer.render(scene, camera);
}
render();
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
renderer.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); document.querySelector<HTMLImageElement>('#fallback')!.style.display = 'block'; });
