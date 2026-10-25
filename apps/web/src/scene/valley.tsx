import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, Mesh, MeshStandardMaterial } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { SCENE_METADATA } from './georeference';
import { attentionColor, densityAt, HEATMAP_BASE, HEATMAP_HEIGHT_SCALE, PLACES, placePosition, type SceneIncident } from './model';

function Controls({ onFailure }: { onFailure: () => void }) {
  const { camera, gl, invalidate } = useThree();
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.target.set(0, 0, 0);
    controls.maxPolarAngle = Math.PI / 2.3;
    controls.minZoom = .6;
    controls.maxZoom = 5;
    const changed = () => invalidate();
    controls.addEventListener('change', changed);
    controls.update();
    const lost = (event: Event) => { event.preventDefault(); onFailure(); };
    gl.domElement.addEventListener('webglcontextlost', lost);
    invalidate();
    return () => { controls.dispose(); gl.domElement.removeEventListener('webglcontextlost', lost); };
  }, [camera, gl, invalidate, onFailure]);
  return null;
}

function PlaceLabel({ name, x, z }: { name: string; x: number; z: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#10262ae6'; ctx.fillRect(0, 0, 512, 96);
      ctx.font = '500 45px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e7ebdf'; ctx.fillText(name, 256, 48);
    }
    return new CanvasTexture(canvas);
  }, [name]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <sprite position={[x, 42, z]} scale={[60, 11, 1]} renderOrder={5}><spriteMaterial map={texture} depthTest={false} /></sprite>;
}

export function heatmapGeometry(incidents: readonly SceneIncident[]): BufferGeometry {
  const segmentsX = 140, segmentsZ = 100;
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const low = new Color('#286c79'), middle = new Color('#91bf9c'), high = new Color('#e5c179'), peak = new Color('#f09972');
  for (let z = 0; z <= segmentsZ; z++) for (let x = 0; x <= segmentsX; x++) {
    const px = -350 + x * 5, pz = -250 + z * 5;
    const density = densityAt({ x: px, z: pz }, incidents);
    positions.push(px, HEATMAP_BASE + density * HEATMAP_HEIGHT_SCALE, pz);
    const color = density <= 1 ? low.clone().lerp(middle, density)
      : density <= 2 ? middle.clone().lerp(high, density - 1) : high.clone().lerp(peak, Math.min(1, density - 2));
    colors.push(color.r, color.g, color.b);
    if (x < segmentsX && z < segmentsZ) {
      const a = z * (segmentsX + 1) + x, b = a + segmentsX + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function Heatmap({ incidents }: { incidents: readonly SceneIncident[] }) {
  const geometry = useMemo(() => heatmapGeometry(incidents), [incidents]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} renderOrder={2}><meshStandardMaterial vertexColors transparent opacity={.68} side={DoubleSide} depthWrite={false} roughness={1} /></mesh>;
}

type ValleyProps = {
  incidents: readonly SceneIncident[];
  selectedIncidentId: string | null;
  onSelectIncident: (id: string | null) => void;
  heatmap: boolean;
  baked?: boolean;
  onAssetFailure?: () => void;
};

class AssetBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onFailure?: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure?.(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function BakedMap({ heatmap }: { heatmap: boolean }) {
  const gltf = useLoader(GLTFLoader, `${import.meta.env.BASE_URL}scene/${SCENE_METADATA.asset}`, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));
  const scene = useMemo(() => {
    const copy = gltf.scene.clone(true);
    copy.traverse((object) => {
      if (object instanceof Mesh) object.material = Array.isArray(object.material) ? object.material.map((material) => material.clone()) : object.material.clone();
    });
    return copy;
  }, [gltf]);
  useEffect(() => {
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial)) continue;
        material.opacity = heatmap ? .28 : 1;
        material.transparent = heatmap;
        material.depthWrite = !heatmap;
        material.needsUpdate = true;
      }
    });
  }, [scene, heatmap]);
  useEffect(() => () => scene.traverse((object) => {
    if (object instanceof Mesh) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    }
  }), [scene]);
  return <primitive object={scene} dispose={null} />;
}

function ProceduralMap({ heatmap }: { heatmap: boolean }) {
  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}><planeGeometry args={[700, 500]} /><meshStandardMaterial color={heatmap ? '#1a302e' : '#243e3d'} roughness={1} /></mesh>
    <gridHelper args={[700, 35, '#49635a', '#314d46']} position={[0, -.8, 0]} />
    <mesh rotation={[-Math.PI / 2, 0, -.07]} position={[0, -.3, -72]}><planeGeometry args={[700, 24]} /><meshStandardMaterial color="#32748b" roughness={.4} /></mesh>
  </>;
}

function World({ incidents, selectedIncidentId, onSelectIncident, heatmap, baked = true, onAssetFailure }: ValleyProps) {
  const visible = incidents.filter((row) => row.status === 'OPEN' && placePosition(row.confirmedPlaceId));
  return <>
    <color attach="background" args={['#142c30']} />
    <ambientLight intensity={1.3} />
    <directionalLight position={[-80, 180, 90]} intensity={2.1} />
    {baked ? <AssetBoundary onFailure={onAssetFailure} fallback={<ProceduralMap heatmap={heatmap} />}><Suspense fallback={<ProceduralMap heatmap={heatmap} />}><BakedMap heatmap={heatmap} /></Suspense></AssetBoundary> : <ProceduralMap heatmap={heatmap} />}
    {PLACES.map((place) => <group key={place.id}>
      <mesh position={[place.x, (baked ? SCENE_METADATA.exerciseGroundY[place.id] : 0) + 5, place.z]}>
        <boxGeometry args={[place.id === 'residence' ? 17 : 25, 10, 16]} />
        <meshStandardMaterial color={heatmap ? '#455950' : '#bad2bb'} transparent={heatmap} opacity={heatmap ? .3 : 1} />
      </mesh>
      <PlaceLabel name={place.name} x={place.x} z={place.z + 24} />
    </group>)}
    {heatmap && <Heatmap incidents={incidents} />}
    {visible.map((row, index) => {
      const place = placePosition(row.confirmedPlaceId)!;
      const selected = row.incidentId === selectedIncidentId;
      const offset = visible.slice(0, index).filter((other) => other.confirmedPlaceId === row.confirmedPlaceId).length * 10;
      const top = heatmap ? HEATMAP_BASE + densityAt(place, incidents) * HEATMAP_HEIGHT_SCALE + 9 : 48;
      return <group key={row.incidentId} position={[place.x + offset, top, place.z - 8]}>
        <mesh renderOrder={6} onClick={(event) => { event.stopPropagation(); onSelectIncident(row.incidentId); }}>
          <sphereGeometry args={[selected ? 5 : 4, 16, 12]} />
          <meshStandardMaterial transparent color={attentionColor(row.attention)} emissive={attentionColor(row.attention)} emissiveIntensity={selected ? .5 : .15} depthTest={false} depthWrite={false} />
        </mesh>
        {selected && <mesh renderOrder={6} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[6, 7, 32]} /><meshBasicMaterial transparent color="#fff4d3" side={DoubleSide} depthTest={false} depthWrite={false} /></mesh>}
      </group>;
    })}
  </>;
}

export function ValleyCanvas(props: ValleyProps & { onFailure: () => void }) {
  return <Canvas orthographic camera={{ position: [330, 450, 430], zoom: 1, near: .1, far: 3000 }} dpr={[1, 1.5]} frameloop="demand" aria-label="SF waterfront 3D basemap · synthetic exercise incidents">
    <Controls onFailure={props.onFailure} />
    <World {...props} />
  </Canvas>;
}
