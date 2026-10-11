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

const COUNT = 50;
const CAMERA_Z = 10;
const NEAR_SHARE = 0.08; // bubbles right in front of the camera
const FOG_Z = -14; // far bubbles fade out around here

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
    // A near bubble at z 8.8 is 1.2 from the camera: at radius 0.7 it fills
    // the screen. Most are smaller, but the occasional giant drifts through.
    const z = near ? rand(6.5, 8.8) : rand(FOG_Z, 5);
    const dist = CAMERA_Z - z;
    const radius = near ? rand(0.25, 0.7) : rand(0.25, 0.75);
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

// Patches the physical material: a fresnel rim lights each bubble's edge with
// the bubble color and makes the center more transparent, and the surface
// wobbles over time so no bubble stays a perfect sphere.
const useBubbleShader = (palette: Palette) => {
  const uniforms = useRef({
    uTime: { value: 0 },
    uRim: { value: palette.rim },
    uRimColor: { value: new THREE.Color(palette.bubble) },
  });
  uniforms.current.uRim.value = palette.rim;
  uniforms.current.uRimColor.value.set(palette.bubble);
  const onBeforeCompile = useMemo(
    () => (shader: THREE.WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, uniforms.current);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          // Each instance wobbles on its own clock, seeded by where it is.
          float seed = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;
          float w = sin(position.y * 2.5 + uTime * 1.1 + seed) * sin(position.x * 1.5 - uTime * 0.7 + seed)
                  + 0.6 * sin(position.z * 3.0 + uTime * 0.9 - seed);
          transformed += normal * w * 0.06;`,
        );
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
  return { uniforms: uniforms.current, onBeforeCompile };
};

function BubbleField({ palette }: { palette: Palette }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const { width, height } = useThree((s) => s.viewport);
  const bubbles = useMemo(() => seed(width, height), [width, height]);
  const elapsed = useRef(0);
  const { uniforms, onBeforeCompile } = useBubbleShader(palette);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const step = Math.min(dt, 0.05);
    elapsed.current += step;
    const t = elapsed.current;
    uniforms.uTime.value = t;
    bubbles.forEach((b, i) => {
      b.y += b.rise * step;
      if (b.y > b.halfH) {
        b.y = -b.halfH;
        b.x = rand(-b.halfW, b.halfW);
      }
      const x = b.x + Math.sin(t * b.freq + b.phase) * b.sway;
      // A slow squash and stretch on top of the surface wobble.
      const squish = Math.sin(t * b.freq * 1.3 + b.phase) * 0.08;
      dummy.position.set(x, b.y, b.z);
      dummy.scale.set(b.radius * (1 + squish), b.radius * (1 - squish), b.radius);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <sphereGeometry args={[1, 48, 48]} />
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

// A far plane painted like the surface of a vat: several soft light sources
// that drift, breathe, and churn through low-frequency noise, from `glow` out
// to `background`. Flat when the two colors are equal.
function Abyss({ palette }: { palette: Palette }) {
  const { width, height } = useThree((s) => s.viewport);
  const scale = (CAMERA_Z - GLOW_Z) / CAMERA_Z;
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBackground: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uAspect: { value: 1 },
    }),
    [],
  );
  uniforms.uBackground.value.set(palette.background);
  uniforms.uGlow.value.set(palette.glow);
  uniforms.uAspect.value = width / height;
  useFrame((_, dt) => {
    uniforms.uTime.value += Math.min(dt, 0.05);
  });
  return (
    <mesh position-z={GLOW_Z} scale={[width * scale, height * scale, 1]}>
      <planeGeometry />
      <shaderMaterial
        uniforms={uniforms}
        depthWrite={false}
        vertexShader={`varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
        fragmentShader={`uniform float uTime; uniform vec3 uBackground; uniform vec3 uGlow; uniform float uAspect;
          varying vec2 vUv;

          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
          }
          float blob(vec2 p, vec2 c, float r) { return pow(smoothstep(r, 0.0, length(p - c)), 2.0); }

          void main() {
            float t = uTime;
            vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
            // Three sources wander slowly and breathe; the first is the deep one.
            float g = blob(p, vec2(0.12 * sin(t * 0.11), -0.08 + 0.1 * cos(t * 0.09)), 0.62 + 0.06 * sin(t * 0.17));
            g += 0.55 * blob(p, vec2(-0.38 + 0.12 * sin(t * 0.07 + 1.0), 0.18 + 0.14 * sin(t * 0.1 + 2.0)), 0.42);
            g += 0.45 * blob(p, vec2(0.42 + 0.14 * cos(t * 0.08 + 2.5), -0.3 + 0.12 * sin(t * 0.13 + 1.2)), 0.48);
            // Churn: two octaves of drifting noise modulate the light.
            float n = noise(p * 3.0 + vec2(t * 0.04, -t * 0.03)) * 0.65 + noise(p * 7.0 - vec2(t * 0.06, t * 0.02)) * 0.35;
            g *= 0.6 + 0.8 * n;
            gl_FragColor = vec4(mix(uBackground, uGlow, clamp(g, 0.0, 1.0)), 1.0);
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
      // The canvas is blurred by CSS, so full resolution is wasted.
      dpr={1}
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
      {/* Fog to black is, under additive blending, a fade to nothing: far
          bubbles sink into the depth instead of stopping at a wall. */}
      <fog attach="fog" args={["black", CAMERA_Z - 2, CAMERA_Z - FOG_Z]} />
      <Abyss palette={palette} />
      <Lights />
      <BubbleField palette={palette} />
    </Canvas>
  );
}
