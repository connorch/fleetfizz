import { Environment, Lightformer } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

// Read from the backdrop's CSS, so each theme sets its own look.
export interface Palette {
  readonly background: string;
  readonly bubble: string;
  // The color deep in the background; equal to `background` for no glow.
  readonly glow: string;
  // How much the bubbles emit their own color (0 = none).
  readonly emissive: number;
  // Fresnel rim strength: how much the bubble edge lights up.
  readonly rim: number;
}

const COUNT = 80;
const CAMERA_Z = 10;
const NEAR_SHARE = 0.08; // bubbles right in front of the camera

interface Bubble {
  x: number;
  y: number;
  z: number;
  radius: number;
  rise: number; // world units per second
  sway: number;
  phase: number;
  freq: number;
  // Half extents of the visible field at this depth, so wrap-around is
  // invisible however far the bubble is from the camera.
  halfW: number;
  halfH: number;
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

const seed = (width: number, height: number): Bubble[] =>
  Array.from({ length: COUNT }, (_, i) => {
    const near = i < COUNT * NEAR_SHARE;
    const z = near ? rand(6, 8.5) : rand(-14, 5);
    const dist = CAMERA_Z - z;
    const radius = near ? rand(0.15, 0.35) : rand(0.18, 0.55);
    const halfW = (width / 2) * (dist / CAMERA_Z) * 1.15 + radius;
    const halfH = (height / 2) * (dist / CAMERA_Z) * 1.15 + radius;
    return {
      x: rand(-halfW, halfW),
      y: rand(-halfH, halfH),
      z,
      radius,
      rise: rand(0.1, 0.22),
      sway: rand(0.1, 0.4),
      phase: rand(0, Math.PI * 2),
      freq: rand(0.2, 0.6),
      halfW,
      halfH,
    };
  });

const dummy = new THREE.Object3D();

// Patches the physical material with a fresnel rim: the edge of each bubble
// glows with the bubble color, and the center is more transparent.
const useRimShader = (palette: Palette) => {
  const uniforms = useRef({
    uRim: { value: palette.rim },
    uRimColor: { value: new THREE.Color(palette.bubble) },
  });
  uniforms.current.uRim.value = palette.rim;
  uniforms.current.uRimColor.value.set(palette.bubble);
  return useMemo(
    () => (shader: THREE.WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, uniforms.current);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform float uRim;\nuniform vec3 uRimColor;",
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.5);
          diffuseColor.a *= mix(0.45, 1.0, fresnel);`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\ntotalEmissiveRadiance += uRimColor * fresnel * uRim;",
        );
    },
    [],
  );
};

function BubbleField({ palette }: { palette: Palette }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const { width, height } = useThree((s) => s.viewport);
  const bubbles = useMemo(() => seed(width, height), [width, height]);
  const elapsed = useRef(0);
  const onBeforeCompile = useRimShader(palette);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const step = Math.min(dt, 0.05);
    elapsed.current += step;
    const t = elapsed.current;
    bubbles.forEach((b, i) => {
      b.y += b.rise * step;
      if (b.y > b.halfH) {
        b.y = -b.halfH;
        b.x = rand(-b.halfW, b.halfW);
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
      <sphereGeometry args={[1, 32, 32]} />
      {/* Additive: a bubble only brightens what is behind it, so it reads as
          glass on the fizz backdrop and as a glow on the dark one. */}
      <meshPhysicalMaterial
        color={palette.bubble}
        emissive={palette.bubble}
        emissiveIntensity={palette.emissive}
        transparent
        opacity={0.35}
        roughness={0.15}
        metalness={0}
        clearcoat={1}
        clearcoatRoughness={0.1}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        onBeforeCompile={onBeforeCompile}
      />
    </instancedMesh>
  );
}

const GLOW_Z = -30;

// A far plane with a radial gradient from `glow` at its center out to
// `background`: the light deep in the abyss. Flat when the two are equal.
function Abyss({ palette }: { palette: Palette }) {
  const { width, height } = useThree((s) => s.viewport);
  const scale = (CAMERA_Z - GLOW_Z) / CAMERA_Z;
  const uniforms = useMemo(
    () => ({
      uBackground: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uAspect: { value: 1 },
    }),
    [],
  );
  uniforms.uBackground.value.set(palette.background);
  uniforms.uGlow.value.set(palette.glow);
  uniforms.uAspect.value = width / height;
  return (
    <mesh position-z={GLOW_Z} scale={[width * scale, height * scale, 1]}>
      <planeGeometry />
      <shaderMaterial
        uniforms={uniforms}
        depthWrite={false}
        vertexShader={`varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
        fragmentShader={`uniform vec3 uBackground; uniform vec3 uGlow; uniform float uAspect;
          varying vec2 vUv;
          void main() {
            vec2 d = (vUv - vec2(0.5, 0.42)) * vec2(uAspect, 1.0);
            float glow = pow(smoothstep(0.75, 0.0, length(d)), 2.2);
            gl_FragColor = vec4(mix(uBackground, uGlow, glow), 1.0);
            #include <colorspace_fragment>
          }`}
      />
    </mesh>
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
      camera={{ position: [0, 0, CAMERA_Z], fov: 45 }}
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
      <Abyss palette={palette} />
      <Lights />
      <BubbleField palette={palette} />
    </Canvas>
  );
}
