import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ---------------------------------------------------------------- config
const S = 10;            // model is normalised so its largest side == S
const BASE_FOV = 55;
const MODEL_URL = '../watchtower.glb';

// Camera stops, expressed as multiples of S so they survive any model scale
const SECTIONS = [
  { label: 'Overview', title: 'The Watchtower', desc: 'A floating island, seen from afar.',
    pos: [1.2, 0.8, 1.4], target: [0, 0, 0] },
  { label: 'Crystals', title: 'Crystal Spires', desc: 'The glowing core of the tower.',
    pos: [0.55, 0.65, 0.8], target: [0.1, 0.25, 0] },
  { label: 'Base', title: 'Water & Earth', desc: 'The foundation below the spires.',
    pos: [-0.55, -0.05, 0.95], target: [0, -0.2, 0] },
  { label: 'Aerial', title: 'Bird\'s Eye', desc: 'Straight down from above.',
    pos: [0.05, 1.7, 0.25], target: [0, 0, 0] },
];

// ---------------------------------------------------------------- scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);
scene.fog = new THREE.FogExp2(0x111111, 0.014);

const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(S * 3, S * 2, S * 3); // intro start, far away

const canvas = document.getElementById('bg');
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvas || undefined });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
if (!canvas) document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enableZoom = false;           // wheel steps through sections (see Free mode)
controls.minDistance = S * 0.25;
controls.maxDistance = S * 4;
controls.autoRotateSpeed = 0.6;
controls.enabled = false;              // enabled after intro

// ---------------------------------------------------------------- lights
scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 1.1));

const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(6, 12, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
sun.shadow.bias = -0.0004;
scene.add(sun);

// pulsing glow near the crystals
const crystalLight = new THREE.PointLight(0xa66bff, 80, 0, 2);
crystalLight.position.set(S * 0.1, S * 0.35, 0);
scene.add(crystalLight);

// light that follows the cursor
const cursorLight = new THREE.PointLight(0xffffff, 90, 0, 2);
scene.add(cursorLight);

// ---------------------------------------------------------------- model
const pivot = new THREE.Group();   // tilts toward the cursor
const floater = new THREE.Group(); // bobs up and down
pivot.add(floater);
scene.add(pivot);
pivot.scale.setScalar(0.001);

// soft shadow on an invisible floor under the island
const shadowFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(S * 3, S * 3),
  new THREE.ShadowMaterial({ opacity: 0.35 })
);
shadowFloor.rotation.x = -Math.PI / 2;
shadowFloor.position.y = -S * 0.75;
shadowFloor.receiveShadow = true;
scene.add(shadowFloor);

// ---------------------------------------------------------------- particles
const N = 400;
const pPos = new Float32Array(N * 3);
const pSeed = new Float32Array(N);
for (let i = 0; i < N; i++) {
  pPos[i * 3] = (Math.random() - 0.5) * S * 3;
  pPos[i * 3 + 1] = Math.random() * S * 2.2 - S * 0.8;
  pPos[i * 3 + 2] = (Math.random() - 0.5) * S * 3;
  pSeed[i] = Math.random() * 10;
}
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const motes = new THREE.Points(pGeo, new THREE.PointsMaterial({
  color: 0xc8a2ff, size: 0.08, transparent: true, opacity: 0.7,
  depthWrite: false, blending: THREE.AdditiveBlending,
}));
scene.add(motes);

// ---------------------------------------------------------------- hover marker
const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.8, 1, 40),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide })
);
marker.renderOrder = 10;
marker.visible = false;
scene.add(marker);

// ---------------------------------------------------------------- UI
const $ = (id) => document.getElementById(id);
const ui = {
  loader: $('loader'), pct: $('pct'), bar: $('bar'),
  info: $('info'), count: $('count'), title: $('title'), desc: $('desc'),
  nav: $('nav'), free: $('free'),
};
const navButtons = SECTIONS.map((s, i) => {
  const b = document.createElement('button');
  b.textContent = `${i + 1} ${s.label}`;
  b.addEventListener('click', () => go(i));
  ui.nav.appendChild(b);
  return b;
});

function showSection(i) {
  navButtons.forEach((b, k) => b.classList.toggle('on', k === i));
  ui.info.classList.add('swap');
  setTimeout(() => {
    const s = SECTIONS[i] || { title: 'Focus', desc: 'Click anywhere on the model to fly to it.' };
    ui.count.textContent = i >= 0 ? `${String(i + 1).padStart(2, '0')} / ${String(SECTIONS.length).padStart(2, '0')}` : '--';
    ui.title.textContent = s.title;
    ui.desc.textContent = s.desc;
    ui.info.classList.remove('swap');
  }, 350);
}

// ---------------------------------------------------------------- camera tween
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

let tween = null;
function flyTo(pos, target, dur = 2.2) {
  tween = {
    t0: performance.now(), dur: dur * 1000,
    fromP: camera.position.clone(), toP: pos.clone(),
    fromT: controls.target.clone(), toT: target.clone(),
  };
  controls.enabled = false;
  controls.autoRotate = false;
}

function updateTween(now) {
  if (!tween) return;
  const k = Math.min((now - tween.t0) / tween.dur, 1);
  const e = easeInOut(k);
  camera.position.lerpVectors(tween.fromP, tween.toP, e);
  camera.position.y += Math.sin(Math.PI * e) * S * 0.12;    // arc over the move
  controls.target.lerpVectors(tween.fromT, tween.toT, e);
  camera.fov = BASE_FOV + Math.sin(Math.PI * e) * 12;        // dolly-zoom punch
  camera.updateProjectionMatrix();
  if (k >= 1) {
    tween = null;
    camera.fov = BASE_FOV;
    camera.updateProjectionMatrix();
    controls.enabled = true;
    markActive();
  }
}

// ---------------------------------------------------------------- navigation
let ready = false;
let freeMode = false;
let section = 0;

function go(i) {
  if (!ready) return;
  section = (i + SECTIONS.length) % SECTIONS.length;
  const s = SECTIONS[section];
  flyTo(new THREE.Vector3(...s.pos).multiplyScalar(S), new THREE.Vector3(...s.target).multiplyScalar(S));
  showSection(section);
}

let wheelLock = false;
addEventListener('wheel', (e) => {
  if (!ready || freeMode || wheelLock || Math.abs(e.deltaY) < 8) return;
  wheelLock = true;
  setTimeout(() => (wheelLock = false), 1500);
  go(section + Math.sign(e.deltaY));
}, { passive: true });

function setFree(v) {
  freeMode = v;
  controls.enableZoom = v;
  ui.free.textContent = `free: ${v ? 'on' : 'off'}`;
}
ui.free.addEventListener('click', () => setFree(!freeMode));

addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= String(SECTIONS.length)) go(Number(e.key) - 1);
  else if (e.key === 'ArrowRight') go(section + 1);
  else if (e.key === 'ArrowLeft') go(section - 1);
  else if (e.key === 'Escape') go(0);
  else if (e.key === 'f' || e.key === 'F') setFree(!freeMode);
});

// ---------------------------------------------------------------- idle auto-rotate
let idleTimer;
function markActive() {
  controls.autoRotate = false;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!tween && ready) controls.autoRotate = true; }, 4000);
}
controls.addEventListener('start', markActive);
controls.addEventListener('end', markActive);

// ---------------------------------------------------------------- pointer tracking
const mouse = new THREE.Vector2(0, 0);   // NDC
const tilt = new THREE.Vector2(0, 0);    // smoothed
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -S * 0.3);
const planeHit = new THREE.Vector3();
let hit = null;
let down = { x: 0, y: 0 };

addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
});
addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', (e) => {
  if (!ready || tween || !hit) return;
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return; // it was a drag
  // click -> fly to the clicked spot
  const dir = camera.position.clone().sub(hit.point).normalize();
  const n = hit.normal.clone();
  dir.lerp(n, 0.4).normalize();
  flyTo(hit.point.clone().add(dir.multiplyScalar(S * 0.35)), hit.point.clone(), 1.6);
  section = -1;
  showSection(-1);
});

let frame = 0;
function updatePointer() {
  raycaster.setFromCamera(mouse, camera);

  // cursor light rides on a plane through the model
  if (raycaster.ray.intersectPlane(plane, planeHit)) {
    cursorLight.position.lerp(planeHit.setY(planeHit.y + S * 0.25), 0.1);
  }

  // surface hit (every 3rd frame, raycasting a voxel model is not free)
  if (frame % 3 === 0 && ready && !tween) {
    const h = raycaster.intersectObject(floater, true)[0];
    if (h && h.face) {
      hit = {
        point: h.point.clone(),
        normal: h.face.normal.clone().transformDirection(h.object.matrixWorld),
      };
      marker.visible = true;
      marker.position.copy(hit.point).addScaledVector(hit.normal, 0.02);
      marker.lookAt(hit.point.clone().add(hit.normal));
      renderer.domElement.style.cursor = 'pointer';
    } else {
      hit = null;
      marker.visible = false;
      renderer.domElement.style.cursor = 'default';
    }
  }
  if (marker.visible) {
    const d = camera.position.distanceTo(marker.position);
    const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.15;
    marker.scale.setScalar(d * 0.02 * pulse);
  }
}

// ---------------------------------------------------------------- load
let introStart = 0;
const loader = new GLTFLoader();
loader.load(
  MODEL_URL,
  (gltf) => {
    const model = gltf.scene;

    // centre + normalise
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const k = S / Math.max(size.x, size.y, size.z);
    model.scale.setScalar(k);
    model.position.copy(centre).multiplyScalar(-k);

    model.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    floater.add(model);

    // play any exported animations
    if (gltf.animations?.length) {
      mixer = new THREE.AnimationMixer(model);
      gltf.animations.forEach((c) => mixer.clipAction(c).play());
    }

    // intro: fade out loader, fly in
    ui.loader.classList.add('done');
    ready = true;
    introStart = performance.now();
    const s = SECTIONS[0];
    controls.target.set(0, 0, 0);
    flyTo(new THREE.Vector3(...s.pos).multiplyScalar(S), new THREE.Vector3(...s.target).multiplyScalar(S), 3.8);
    showSection(0);
    ui.nav.classList.add('show');
  },
  (xhr) => {
    if (!xhr.lengthComputable) return;
    const p = Math.round((xhr.loaded / xhr.total) * 100);
    ui.pct.textContent = `${p}%`;
    ui.bar.style.width = `${p}%`;
  },
  (err) => {
    console.error('Model failed to load:', err);
    ui.pct.textContent = 'failed to load model';
  }
);
let mixer = null;

// ---------------------------------------------------------------- resize
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
});

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  const now = performance.now();
  frame++;

  mixer?.update(dt);

  // intro scale + spin
  let introSpin = 0;
  if (ready) {
    const k = Math.min((now - introStart) / 2800, 1);
    const e = easeOut(k);
    pivot.scale.setScalar(0.5 + 0.5 * e);
    introSpin = (1 - e) * Math.PI * 0.6;
  }

  // model follows the cursor a little + gentle float
  tilt.lerp(mouse, 0.05);
  pivot.rotation.y = tilt.x * 0.18 + introSpin;
  pivot.rotation.x = -tilt.y * 0.08;
  floater.position.y = Math.sin(t * 0.8) * S * 0.015;

  // glow pulse
  crystalLight.intensity = 80 + Math.sin(t * 2.2) * 35;

  // drifting motes
  const a = pGeo.attributes.position;
  for (let i = 0; i < N; i++) {
    let y = a.getY(i) + dt * (0.25 + (pSeed[i] % 1) * 0.5);
    if (y > S * 1.4) y = -S * 0.8;
    a.setY(i, y);
    a.setX(i, a.getX(i) + Math.sin(t * 0.5 + pSeed[i]) * dt * 0.15);
  }
  a.needsUpdate = true;

  updateTween(now);
  updatePointer();
  controls.update();
  renderer.render(scene, camera);
}
animate();