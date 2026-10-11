import { Environment, Lightformer } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

export interface Palette {
  // CSS colors, read from the backdrop so they follow the theme.
  readonly background: string;
  readonly bubble: string;
}

const COUNT = 90;
const DEPTH = 6;

// One bubble's constants. Position is updated every frame in BubbleField.
interface Bubble {
  x: number;
  y: number;
  z: number;
  radius: number;
  rise: number; // units per second
  sway: number; // sideways amplitude
  phase: number;
  freq: number;
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

const seed = (width: number, height: number): Bubble[] =>
  Array.from({ length: COUNT }, () => {
    // Small bubbles drift slow and far away; big ones are rarer and nearer.
    const z = rand(-DEPTH, 1);
    const near = (z + DEPTH) / (DEPTH + 1);
    return {
      x: rand(-width / 2, width / 2),
      y: rand(-height / 2, height / 2),
      z,
      radius: rand(0.08, 0.22) * (0.6 + near * 1.2),
      rise: rand(0.12, 0.3) * (0.5 + near),
      sway: rand(0.1, 0.35),
      phase: rand(0, Math.PI * 2),
      freq: rand(0.3, 0.8),
    };
  });

const dummy = new THREE.Object3D();

function BubbleField({ palette }: { palette: Palette }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const { width, height } = useThree((s) => s.viewport);
  // Field is wider than the viewport so bubbles in the back (which project
  // smaller) still fill the edges.
  const bubbles = useMemo(() => seed(width * 1.8, height * 1.8), [width, height]);

  const elapsed = useRef(0);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const step = Math.min(dt, 0.05);
    elapsed.current += step;
    const t = elapsed.current;
    const top = height * 0.9;
    bubbles.forEach((b, i) => {
      b.y += b.rise * step;
      if (b.y > top) {
        b.y = -top;
        b.x = rand(-width * 0.9, width * 0.9);
      }
      const x = b.x + Math.sin(t * b.freq + b.phase) * b.sway;
      dummy.position.set(x, b.y, b.z);
      dummy.scale.setScalar(b.radius);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <sphereGeometry args={[1, 24, 24]} />
      {/* Additive: a bubble only brightens what is behind it, so it reads as
          glass on the fizz backdrop and as a glow on the dark one. */}
      <meshPhysicalMaterial
        color={palette.bubble}
        emissive={palette.bubble}
        emissiveIntensity={0.18}
        transparent
        opacity={0.35}
        roughness={0.15}
        metalness={0}
        clearcoat={1}
        clearcoatRoughness={0.1}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
}

// Lit by a few soft panels instead of an HDR, so nothing is fetched.
function Lights() {
  return (
    <Environment resolution={64}>
      <Lightformer intensity={3} position={[0, 5, -9]} scale={[10, 10, 1]} />
      <Lightformer
        intensity={1}
        position={[-5, 1, -1]}
        rotation-y={Math.PI / 2}
        scale={[20, 2, 1]}
      />
      <Lightformer
        intensity={1}
        position={[5, -1, -1]}
        rotation-y={-Math.PI / 2}
        scale={[20, 2, 1]}
      />
    </Environment>
  );
}

export interface BubblesProps {
  palette: Palette;
  animate: boolean;
  onReady: () => void;
}

export default function Bubbles({ palette, animate, onReady }: BubblesProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 10], fov: 45 }}
      dpr={[1, 1.5]}
      gl={{ alpha: false, antialias: true }}
      // No tone mapping: the backdrop must stay the exact brand color.
      flat
      frameloop={animate ? "always" : "demand"}
      onCreated={onReady}
      style={{ pointerEvents: "none" }}
    >
      {/* The scene paints the same color as the backdrop div, so additive
          blending happens in WebGL and the canvas fade-in is seamless. */}
      <color attach="background" args={[palette.background]} />
      <Lights />
      <BubbleField palette={palette} />
    </Canvas>
  );
}
