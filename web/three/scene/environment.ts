/**
 * Procedural environment for the slabs' reflections: a faint Monad-purple softbox above, a thin red
 * strip low behind the row (the rim light) and a dim cool fill in front. Rendered once into a PMREM
 * cube map: no HDR files, no network. Client only.
 */
import { Color, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, PMREMGenerator, Scene, Vector3, type WebGLRenderer } from "three";
import { SCENE_COLORS } from "../palette";

type Panel = { size: [number, number]; position: [number, number, number]; lookAt: [number, number, number]; color: readonly [number, number, number]; strength: number };

const PANELS: Panel[] = [
  // Softbox above: the purple haze, reflected on the tops and upper edges.
  { size: [36, 14], position: [8, 10, -2], lookAt: [8, 0, -1], color: SCENE_COLORS.monad, strength: 0.55 },
  // Rim strip behind and below the row: a thin red line on every bevel that faces back.
  { size: [48, 0.9], position: [8, 0.5, -7], lookAt: [8, 0.5, 0], color: SCENE_COLORS.liq, strength: 2.4 },
  // Cool fill in front, very dim: keeps the faces facing the camera from going pitch black.
  { size: [14, 5], position: [-6, 2.5, 12], lookAt: [6, 0.8, 0], color: SCENE_COLORS.hairline, strength: 0.09 },
];

/** Builds the environment map; the caller owns (and disposes) the returned render target. */
export function createEnvironment(renderer: WebGLRenderer) {
  const scene = new Scene();
  scene.background = new Color(0, 0, 0);
  const disposables: { dispose(): void }[] = [];
  for (const panel of PANELS) {
    const geometry = new PlaneGeometry(...panel.size);
    const material = new MeshBasicMaterial({
      color: new Color(panel.color[0] * panel.strength, panel.color[1] * panel.strength, panel.color[2] * panel.strength),
      side: DoubleSide,
      toneMapped: false,
    });
    const mesh = new Mesh(geometry, material);
    mesh.position.set(...panel.position);
    mesh.lookAt(...panel.lookAt);
    scene.add(mesh);
    disposables.push(geometry, material);
  }
  const generator = new PMREMGenerator(renderer);
  const target = generator.fromScene(scene, 0.035, 0.1, 100, { size: 128, position: new Vector3(6, 0.6, 0) });
  generator.dispose();
  for (const item of disposables) item.dispose();
  return target;
}
