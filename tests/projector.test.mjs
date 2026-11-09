// projector() against Three.js's Vector3.project and Babylon.js's Vector3.Project, perspective and orthographic.
// Run: node --test tests/   (needs: npm install --no-save three @babylonjs/core)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { projector, swarmBuild } from '../skills/swarm-build/assets/swarm-build.js';

const box = { left: 100, top: 50, width: 800, height: 450, right: 900, bottom: 500 };
const el = { getBoundingClientRect: () => box };
let seed = 7;
const rnd = (a, b) => a + (b - a) * (((seed = (seed * 16807) % 2147483647) - 1) / 2147483646);

for (const make of [() => new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 500), () => new THREE.OrthographicCamera(-20, 20, 11.25, -11.25, 0.1, 500)]) {
  const kind = make().type;
  test(`${kind}: matches Vector3.project for arrays, objects and Object3Ds`, () => {
    let compared = 0;
    for (let k = 0; k < 60; k++) {
      const cam = make();
      cam.position.set(rnd(-20, 20), rnd(1, 20), rnd(-20, 20));
      cam.lookAt(rnd(-3, 3), 0, rnd(-3, 3));
      cam.updateMatrixWorld();
      const toScreen = projector(cam, el, { margin: 1e9 });
      for (let i = 0; i < 20; i++) {
        const p = new THREE.Vector3(rnd(-15, 15), rnd(0, 8), rnd(-15, 15));
        if (cam.isPerspectiveCamera && p.clone().applyMatrix4(cam.matrixWorldInverse).z >= 0) {
          assert.equal(toScreen([p.x, p.y, p.z]), null, 'a point behind the camera is null');
          continue;
        }
        const n = p.clone().project(cam);
        const want = { x: box.left + ((n.x + 1) / 2) * box.width, y: box.top + ((1 - n.y) / 2) * box.height };
        const obj = new THREE.Object3D();
        obj.position.copy(p);
        for (const got of [toScreen([p.x, p.y, p.z]), toScreen({ x: p.x, y: p.y, z: p.z }), toScreen(obj)]) {
          assert.ok(got, 'a point in front of the camera projects');
          assert.ok(Math.abs(got.x - want.x) < 1e-6 && Math.abs(got.y - want.y) < 1e-6, `off by ${got.x - want.x}, ${got.y - want.y}`);
        }
        compared++;
      }
    }
    assert.ok(compared > 500);
  });
}

test('null for points off the element, behind the camera, or not points at all', () => {
  const cam = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 500);
  cam.position.set(0, 0, 10);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  const toScreen = projector(cam, el);
  assert.deepEqual(toScreen([0, 0, 0]), { x: 500, y: 275 });
  assert.equal(toScreen([500, 0, 0]), null);
  assert.equal(toScreen([0, 0, 20]), null);
  assert.equal(toScreen([NaN, 0, 0]), null);
  assert.equal(toScreen(null), null);
  assert.equal(projector(null, el)([0, 0, 0]), null);
});

test('Babylon: matches Vector3.Project for cameras, nodes and both handednesses', async () => {
  const B = await import('@babylonjs/core');
  const engine = new B.NullEngine({ renderWidth: 800, renderHeight: 450, textureSize: 256 });
  const viewport = new B.Viewport(0, 0, 1, 1).toGlobal(800, 450);
  let compared = 0;
  for (const rightHanded of [false, true]) {
    const scene = new B.Scene(engine);
    scene.useRightHandedSystem = rightHanded;
    const cams = [new B.FreeCamera('free', new B.Vector3(0, 5, -20), scene), new B.ArcRotateCamera('arc', 0.8, 1.1, 30, B.Vector3.Zero(), scene)];
    const ortho = new B.FreeCamera('ortho', new B.Vector3(4, 12, -18), scene);
    Object.assign(ortho, { mode: B.Camera.ORTHOGRAPHIC_CAMERA, orthoLeft: -20, orthoRight: 20, orthoTop: 11.25, orthoBottom: -11.25 });
    cams.push(ortho);
    for (const cam of cams) {
      scene.activeCamera = cam;
      for (let k = 0; k < 30; k++) {
        if (cam.alpha !== undefined) { cam.alpha = rnd(0, 6.28); cam.beta = rnd(0.3, 1.4); }
        else { cam.position.set(rnd(-20, 20), rnd(1, 20), rnd(-25, -5)); cam.setTarget(new B.Vector3(rnd(-3, 3), 0, rnd(-3, 3))); }
        const view = cam.getViewMatrix(true), transform = view.multiply(cam.getProjectionMatrix(true));
        const toScreen = projector(cam, el, { margin: 1e9 });
        for (let i = 0; i < 10; i++) {
          const p = new B.Vector3(rnd(-15, 15), rnd(0, 8), rnd(-15, 15));
          const depth = B.Vector3.TransformCoordinates(p, view).z * (rightHanded ? -1 : 1);
          if (cam.mode !== B.Camera.ORTHOGRAPHIC_CAMERA && depth <= 0.2) {
            if (depth <= 0) assert.equal(toScreen([p.x, p.y, p.z]), null, 'a point behind the camera is null');
            continue;
          }
          const want = B.Vector3.Project(p, B.Matrix.IdentityReadOnly, transform, viewport);
          const node = new B.TransformNode('n', scene);
          node.position.copyFrom(p);
          for (const got of [toScreen([p.x, p.y, p.z]), toScreen(node)]) {
            assert.ok(got, `${cam.name}: a point in front of the camera projects`);
            assert.ok(Math.abs(got.x - (box.left + want.x)) < 0.01 && Math.abs(got.y - (box.top + want.y)) < 0.01,   // Babylon's matrices are 32-bit floats
              `${cam.name} rh=${rightHanded}: off by ${got.x - box.left - want.x}, ${got.y - box.top - want.y}`);
          }
          node.dispose();
          compared++;
        }
      }
    }
    scene.dispose();
  }
  engine.dispose();
  assert.ok(compared > 1000, 'compared ' + compared);
});

test('follows a camera moved since the last render, and is on the default export', () => {
  const cam = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 500);
  cam.position.set(0, 0, 10);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  const toScreen = projector(cam, el);
  cam.position.x = 3;                                  // moved, matrices not yet updated (no render since)
  const ref = cam.clone();
  ref.updateMatrixWorld();
  const n = new THREE.Vector3(0, 0, 0).project(ref);
  assert.ok(Math.abs(toScreen([0, 0, 0]).x - (box.left + ((n.x + 1) / 2) * box.width)) < 1e-6);
  assert.equal(swarmBuild.projector, projector);
});
