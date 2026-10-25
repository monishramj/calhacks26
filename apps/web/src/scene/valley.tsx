import { useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { attentionColor, densityAt, HEATMAP_BASE, HEATMAP_HEIGHT_SCALE, PLACES, placePosition, type SceneIncident } from './model';

function Controls({ onFailure }: { onFailure: () => void }) {
  const { camera, gl, invalidate } = useThree();
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.target.set(-30, 0, 15);
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
  return <sprite position={[x, 25, z]} scale={[48, 9, 1]} renderOrder={5}><spriteMaterial map={texture} depthTest={false} /></sprite>;
}

export function heatmapGeometry(incidents: readonly SceneIncident[]): BufferGeometry {
  const segmentsX = 88, segmentsZ = 56;
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const low = new Color('#286c79'), middle = new Color('#91bf9c'), high = new Color('#e5c179'), peak = new Color('#f09972');
  for (let z = 0; z <= segmentsZ; z++) for (let x = 0; x <= segmentsX; x++) {
    const px = -220 + x * 5, pz = -120 + z * 5;
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
};

function World({ incidents, selectedIncidentId, onSelectIncident, heatmap }: ValleyProps) {
  const visible = incidents.filter((row) => row.status === 'OPEN' && placePosition(row.confirmedPlaceId));
  return <>
    <color attach="background" args={['#142c30']} />
    <ambientLight intensity={1.3} />
    <directionalLight position={[-80, 180, 90]} intensity={2.1} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 20]}><planeGeometry args={[440, 280]} /><meshStandardMaterial color="#243e3d" roughness={1} /></mesh>
    <gridHelper args={[440, 22, '#49635a', '#314d46']} position={[0, -.8, 20]} />
    <mesh rotation={[-Math.PI / 2, 0, -.07]} position={[0, -.3, -72]}><planeGeometry args={[460, 24]} /><meshStandardMaterial color="#32748b" roughness={.4} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.2, 90]}><planeGeometry args={[440, 5]} /><meshStandardMaterial color="#69766b" /></mesh>
    {PLACES.map((place) => <group key={place.id}>
      <mesh position={[place.x, 5, place.z]}><boxGeometry args={[place.id === 'residence' ? 17 : 29, 10, 19]} /><meshStandardMaterial color={heatmap ? '#455950' : '#8c9c86'} /></mesh>
      {place.id === 'school' && <mesh position={[place.x - 23, 3.5, place.z + 3]}><boxGeometry args={[13, 7, 25]} /><meshStandardMaterial color={heatmap ? '#455950' : '#738e7f'} /></mesh>}
      <PlaceLabel name={place.name} x={place.x} z={place.z + 24} />
    </group>)}
    {heatmap && <Heatmap incidents={incidents} />}
    {visible.map((row, index) => {
      const place = placePosition(row.confirmedPlaceId)!;
      const selected = row.incidentId === selectedIncidentId;
      const offset = visible.slice(0, index).filter((other) => other.confirmedPlaceId === row.confirmedPlaceId).length * 10;
      const top = heatmap ? HEATMAP_BASE + densityAt(place, incidents) * HEATMAP_HEIGHT_SCALE + 9 : 19;
      return <group key={row.incidentId} position={[place.x + offset, top, place.z - 8]}>
        <mesh onClick={(event) => { event.stopPropagation(); onSelectIncident(row.incidentId); }}>
          <sphereGeometry args={[selected ? 5 : 4, 16, 12]} />
          <meshStandardMaterial color={attentionColor(row.attention)} emissive={attentionColor(row.attention)} emissiveIntensity={selected ? .5 : .15} />
        </mesh>
        {selected && <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[6, 7, 32]} /><meshBasicMaterial color="#fff4d3" side={DoubleSide} /></mesh>}
      </group>;
    })}
  </>;
}

export function ValleyCanvas(props: ValleyProps & { onFailure: () => void }) {
  return <Canvas orthographic camera={{ position: [230, 270, 300], zoom: 1.7, near: .1, far: 2000 }} dpr={[1, 1.5]} frameloop="demand" aria-label="Fictional river valley 3D scene">
    <Controls onFailure={props.onFailure} />
    <World {...props} />
  </Canvas>;
}
