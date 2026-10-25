import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import meta from './metadata.json';

const map = document.querySelector<HTMLDivElement>('#map')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#182c34');
const camera = new THREE.PerspectiveCamera(37, innerWidth / innerHeight, .5, 4000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), 350), new THREE.Plane(new THREE.Vector3(-1, 0, 0), 350), new THREE.Plane(new THREE.Vector3(0, 0, 1), 250), new THREE.Plane(new THREE.Vector3(0, 0, -1), 250)];
map.append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.maxPolarAngle = Math.PI / 2.15;
controls.minDistance = 180; controls.maxDistance = 1600;
controls.enableDamping = true;
const center = new THREE.Vector3(0, meta.terrainMaxY * .48, 0);
controls.target.copy(center);
const overview = new THREE.Vector3(590, 530, 700);
camera.position.copy(overview);
scene.add(new THREE.HemisphereLight('#d9ecff', '#6b7751', 1.1));
const sun = new THREE.DirectionalLight('#ffe4bc', 2.2); sun.position.set(-350, 650, 300); scene.add(sun);
const rim = new THREE.DirectionalLight('#9cc6df', .6); rim.position.set(300, 150, -450); scene.add(rim);
const base = new THREE.Mesh(new THREE.BoxGeometry(714, 16, 514), new THREE.MeshStandardMaterial({ color: '#263d3e', roughness: 1 }));
base.position.y = -12; scene.add(base);
const grid = new THREE.GridHelper(2200, 44, '#385052', '#253b42'); grid.position.y = -22; scene.add(grid);
const points = [
  { id: 'school', label: 'School', x: 0, z: 0, color: '#8ed5d0' },
  { id: 'residence', label: 'Residence', x: 80, z: 20, color: '#ffb490' },
  { id: 'shelter', label: 'Shelter', x: -120, z: 40, color: '#f3d581' },
] as const;
const pins: { point: THREE.Vector3; label: HTMLDivElement }[] = [];
for (const p of points) {
  const y = meta.exerciseGroundY[p.id];
  const group = new THREE.Group(); group.position.set(p.x, y, p.z);
  const circle = new THREE.Mesh(new THREE.RingGeometry(6, 7.3, 48), new THREE.MeshBasicMaterial({ color: p.color, side: THREE.DoubleSide, transparent: true, opacity: .9, depthTest: false }));
  circle.rotation.x = -Math.PI / 2; circle.position.y = 1; circle.renderOrder = 5; group.add(circle);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 24, 8), new THREE.MeshBasicMaterial({ color: p.color })); stem.position.y = 13; group.add(stem);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(3.3, 16, 12), new THREE.MeshBasicMaterial({ color: p.color, depthTest: false, transparent: true })); beacon.position.y = 26; beacon.renderOrder = 6; group.add(beacon);
  scene.add(group);
  const label = document.createElement('div'); label.className = 'pin'; label.textContent = p.label; label.style.setProperty('--c', p.color); document.body.append(label);
  pins.push({ point: new THREE.Vector3(p.x, y + 34, p.z), label });
}
let model: THREE.Group | null = null;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.load('/scene/residential/montclair.glb', (gltf) => {
  model = gltf.scene; scene.add(model);
  document.querySelector('#status')!.textContent = `BLOSM ready · ${(meta.assetBytes / 1024).toFixed(0)} KB · ${meta.landscaping.trees} small landscape trees`;
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.name.startsWith('buildings-')) return;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(object.geometry, 32), new THREE.LineBasicMaterial({ color: '#39413a', transparent: true, opacity: .32 }));
    object.add(edges);
  });
}, undefined, () => { document.querySelector('#status')!.textContent = '3D asset unavailable · aligned 2D fallback'; document.querySelector<HTMLImageElement>('#fallback')!.style.display = 'block'; });
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
controls.addEventListener('start', () => { moving = false; });
const projected = new THREE.Vector3();
function render() {
  requestAnimationFrame(render);
  if (moving) { camera.position.lerp(destination, .07); controls.target.lerp(target, .07); if (camera.position.distanceTo(destination) < .2) moving = false; }
  controls.update();
  for (const pin of pins) { projected.copy(pin.point).project(camera); pin.label.style.left = `${(projected.x * .5 + .5) * innerWidth}px`; pin.label.style.top = `${(-projected.y * .5 + .5) * innerHeight}px`; pin.label.hidden = projected.z > 1; }
  renderer.render(scene, camera);
}
render();
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
renderer.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); document.querySelector<HTMLImageElement>('#fallback')!.style.display = 'block'; });
