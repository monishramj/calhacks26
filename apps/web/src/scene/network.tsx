// Moving team radios and the simulated LoRa mesh, drawn from the scenario clock every frame (no React re-renders).
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, Group, InstancedMesh, LineBasicMaterial,
  LineSegments, Mesh, MeshBasicMaterial, Object3D, SRGBColorSpace,
} from 'three';
import { clock } from '../network/clock';
import { DELIVERIES, nodesAt, positionAt, RANGE_M, SCENARIO } from '../network/mesh';

const TEAM = '#4ea1ff';
const HELD = '#f2c94c';
const PACKET = '#7cf0c4';
const TRAIL_S = 90; // seconds of trail behind each team
const TRAIL_STEPS = 12;
const teams = SCENARIO.teams;
const held = (teamId: string, t: number) => DELIVERIES.some((d) => d.teamId === teamId && (d.heldSince ?? d.firstTry) <= t && d.sentAt > t && d.heldSince !== null);

/** Team radios: a pin and a fading trail per team. `strong` in the network view, faint over the incident view. */
export function Teams({ strong }: { strong: boolean }) {
  const pins = useRef<InstancedMesh>(null);
  const halo = useRef<InstancedMesh>(null);
  const trail = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(teams.length * TRAIL_STEPS * 2 * 3), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(teams.length * TRAIL_STEPS * 2 * 3), 3));
    return g;
  }, []);
  const o = useMemo(() => new Object3D(), []);
  const c = useMemo(() => new Color(), []);
  useFrame(() => {
    const t = clock.t, pos = trail.attributes.position as BufferAttribute, col = trail.attributes.color as BufferAttribute;
    teams.forEach((team, i) => {
      const p = positionAt(team.track, t), h = held(team.teamId, t);
      o.rotation.set(0, 0, 0); o.position.set(p.x, strong ? 14 : 10, p.z); o.scale.setScalar(strong ? 2.6 : 1.8); o.updateMatrix();
      pins.current!.setMatrixAt(i, o.matrix); pins.current!.setColorAt(i, c.set(h ? HELD : TEAM));
      o.rotation.set(-Math.PI / 2, 0, 0); o.position.y = .4; o.scale.setScalar(h ? 34 + Math.sin(performance.now() / 200) * 8 : strong ? 22 : 14); o.updateMatrix();
      halo.current!.setMatrixAt(i, o.matrix); halo.current!.setColorAt(i, c);
      for (let k = 0; k < TRAIL_STEPS; k++) {
        const a = positionAt(team.track, t - (TRAIL_S * k) / TRAIL_STEPS), b = positionAt(team.track, t - (TRAIL_S * (k + 1)) / TRAIL_STEPS);
        const j = (i * TRAIL_STEPS + k) * 2, fade = (1 - k / TRAIL_STEPS) * (strong ? .9 : .5);
        pos.setXYZ(j, a.x, 1, a.z); pos.setXYZ(j + 1, b.x, 1, b.z);
        col.setXYZ(j, .3 * fade, .63 * fade, fade); col.setXYZ(j + 1, .3 * fade * .7, .63 * fade * .7, fade * .7);
      }
    });
    pins.current!.instanceMatrix.needsUpdate = halo.current!.instanceMatrix.needsUpdate = true;
    pins.current!.instanceColor!.needsUpdate = halo.current!.instanceColor!.needsUpdate = true;
    pos.needsUpdate = col.needsUpdate = true;
  });
  return <group>
    <instancedMesh ref={pins} args={[undefined, undefined, teams.length]} renderOrder={6}>
      <sphereGeometry args={[3.2, 16, 12]} /><meshBasicMaterial transparent opacity={strong ? 1 : .75} depthTest={false} />
    </instancedMesh>
    <instancedMesh ref={halo} args={[undefined, undefined, teams.length]}>
      <ringGeometry args={[.7, 1, 32]} /><meshBasicMaterial transparent opacity={strong ? .8 : .45} side={DoubleSide} depthWrite={false} />
    </instancedMesh>
    <lineSegments geometry={trail}><lineBasicMaterial vertexColors transparent opacity={.9} depthWrite={false} /></lineSegments>
  </group>;
}

function tag(text: string, color: string) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d')!;
  g.fillStyle = 'rgba(14,24,28,.88)'; g.beginPath(); g.roundRect(2, 2, 252, 60, 14); g.fill();
  g.fillStyle = color; g.font = '600 30px system-ui'; g.textBaseline = 'middle'; g.fillText(text, 18, 33);
  const tex = new CanvasTexture(cv); tex.colorSpace = SRGBColorSpace;
  return tex;
}

function Mast({ x, z, h, label, color, big }: { x: number; z: number; h: number; label: string; color: string; big?: boolean }) {
  const tex = useMemo(() => tag(label, color), [label, color]);
  return <group position={[x, h, z]}>
    <mesh position={[0, big ? 12 : 9, 0]}><cylinderGeometry args={[.5, .8, big ? 24 : 18, 8]} /><meshStandardMaterial color="#cfd6da" metalness={.5} roughness={.4} /></mesh>
    <mesh position={[0, big ? 25 : 19, 0]}><sphereGeometry args={[big ? 7 : 5, 16, 12]} /><meshBasicMaterial color={color} /></mesh>
    <mesh rotation-x={-Math.PI / 2} position={[0, -h + .6, 0]}>
      <ringGeometry args={[RANGE_M - 6, RANGE_M, 96]} /><meshBasicMaterial color={color} transparent opacity={.45} depthWrite={false} side={DoubleSide} />
    </mesh>
    <sprite position={[0, big ? 38 : 31, 0]} scale={[64, 16, 1]} renderOrder={9}><spriteMaterial map={tex} depthTest={false} transparent /></sprite>
  </group>;
}

const MAX_LINKS = 400;
const MAX_PACKETS = 12;

/** Relays, the command post, links in range right now, and packets hopping toward the command post. */
export function Network() {
  const links = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(MAX_LINKS * 2 * 3), 3));
    return new LineSegments(g, new LineBasicMaterial({ color: '#7fb2c9', transparent: true, opacity: .6, depthWrite: false }));
  }, []);
  const route = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(MAX_PACKETS * 4 * 2 * 3), 3));
    return new LineSegments(g, new LineBasicMaterial({ color: PACKET, transparent: true, opacity: .9, depthWrite: false }));
  }, []);
  const packets = useRef<Group>(null);
  const lastLinks = useRef(-1);
  useFrame(() => {
    const t = clock.t;
    // Links change slowly: recompute twice a second of exercise time.
    if (Math.abs(t - lastLinks.current) > .5) {
      lastLinks.current = t;
      const nodes = nodesAt(t), pos = links.geometry.attributes.position as BufferAttribute;
      let n = 0;
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length && n < MAX_LINKS; j++) {
        const a = nodes[i], b = nodes[j];
        if (a.kind === 'team' && b.kind === 'team') continue; // team-to-team links clutter the view
        if (Math.hypot(a.x - b.x, a.z - b.z) <= RANGE_M) { pos.setXYZ(2 * n, a.x, 4, a.z); pos.setXYZ(2 * n + 1, b.x, 4, b.z); n++; }
      }
      links.geometry.setDrawRange(0, n * 2); pos.needsUpdate = true;
    }
    // Packets in flight (and their route) from shortly before sending until 6 s after delivery.
    const live = DELIVERIES.filter((d) => d.sentAt - 1 <= t && t <= d.deliveredAt + 6).slice(0, MAX_PACKETS);
    const rpos = route.geometry.attributes.position as BufferAttribute;
    let r = 0;
    packets.current!.children.forEach((child, i) => {
      const d = live[i], m = child as Mesh;
      m.visible = !!d;
      if (!d) return;
      const at = (id: string, time: number) => nodesAt(time).find((nd) => nd.id === id)!;
      for (const hop of d.hops) {
        const a = at(hop.from, hop.start), b = at(hop.to, hop.start);
        rpos.setXYZ(r++, a.x, 6, a.z); rpos.setXYZ(r++, b.x, 6, b.z);
      }
      const hop = d.hops.find((h) => t <= h.end) ?? d.hops.at(-1)!;
      const a = at(hop.from, hop.start), b = at(hop.to, hop.start);
      const f = Math.min(Math.max((t - hop.start) / (hop.end - hop.start), 0), 1);
      m.position.set(a.x + (b.x - a.x) * f, 14 + Math.sin(f * Math.PI) * 18, a.z + (b.z - a.z) * f);
      m.scale.setScalar(t > d.deliveredAt ? 1.6 + (t - d.deliveredAt) * .4 : 1.6);
      (m.material as MeshBasicMaterial).opacity = t > d.deliveredAt ? Math.max(0, 1 - (t - d.deliveredAt) / 6) : 1;
    });
    route.geometry.setDrawRange(0, r); rpos.needsUpdate = true;
  });
  const { x, z, h } = SCENARIO.commandPost;
  return <group>
    <primitive object={links} />
    <primitive object={route} />
    <group ref={packets}>
      {Array.from({ length: MAX_PACKETS }, (_, i) => <mesh key={i} visible={false} renderOrder={8}>
        <sphereGeometry args={[9, 16, 12]} /><meshBasicMaterial color={PACKET} transparent blending={AdditiveBlending} depthTest={false} />
      </mesh>)}
    </group>
    <Mast x={x} z={z} h={h} label="Command post" color="#f2994a" big />
    {SCENARIO.relays.map((r, i) => <Mast key={i} x={r.x} z={r.z} h={r.h} label={`Relay ${i + 1}`} color="#9ad0e6" />)}
  </group>;
}
