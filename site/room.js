import * as THREE from './vendor/three.module.min.js';

/** A local, procedural room: no model downloads, game state, wallet or transactions.
 * @param {{paused:boolean,logo:string}} options */
export function createRoom(options) {
  const canvas = /** @type {HTMLCanvasElement} */ (document.querySelector('#room'));
  const wrap = /** @type {HTMLElement} */ (document.querySelector('#scene-wrap'));
  let renderer;
  const attributes = { alpha: true, antialias: true, powerPreference: /** @type {WebGLPowerPreference} */ ('low-power') };
  const context = canvas.getContext('webgl2', attributes) || canvas.getContext('webgl', attributes);
  if (!context) throw new Error('WebGL unavailable; retain the local image.');
  try { renderer = new THREE.WebGLRenderer({ canvas, context, ...attributes }); }
  catch { throw new Error('WebGL unavailable; retain the local image.'); }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x17251b, .011);
  const camera = new THREE.OrthographicCamera(-6, 6, 4.7, -4.7, .1, 60);
  const target = new THREE.Vector3(0, 1.35, 0);
  camera.position.set(8.8, 8, 10.8);
  camera.lookAt(target);

  const materials = {
    paper: new THREE.MeshStandardMaterial({ color: 0xe2e7d4, roughness: .86 }),
    floor: new THREE.MeshStandardMaterial({ color: 0xaebda4, roughness: .92 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x152c20, roughness: .6 }),
    green: new THREE.MeshStandardMaterial({ color: 0x2fa85c, roughness: .55 }),
    moss: new THREE.MeshStandardMaterial({ color: 0x1f8a4c, roughness: .7 }),
    mint: new THREE.MeshStandardMaterial({ color: 0x98d780, roughness: .65 }),
    cream: new THREE.MeshStandardMaterial({ color: 0xf4ebcd, roughness: .85 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x153925, emissive: 0x5ea857, emissiveIntensity: .36, roughness: .35 }),
    glow: new THREE.MeshStandardMaterial({ color: 0xb8f190, emissive: 0xa3ed6a, emissiveIntensity: .9, roughness: .3 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xf4d091, emissive: 0xf4bb6c, emissiveIntensity: .5, roughness: .65 }),
  };
  const room = new THREE.Group();
  scene.add(room);
  /** @param {number[]} size @param {number[]} position @param {any} material @param {any} [parent] */
  function box(size, position, material, parent = room) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  /** @param {number} r @param {number} h @param {number[]} position @param {any} material @param {any} [parent] */
  function cylinder(r, h, position, material, parent = room) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48), material);
    mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  /** @param {number[][]} points @param {number} radius @param {any} material @param {any} [parent] */
  function tube(points, radius, material, parent = room) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, radius, 8, false), material);
    parent.add(mesh); return mesh;
  }
  /** @param {string[]} lines @param {number} w @param {number} h @param {number[]} position @param {{bg?:string,ink?:string,rotation?:number,size?:number}} [settings] */
  function sign(lines, w, h, position, settings = {}) {
    const art = document.createElement('canvas'); art.width = 768; art.height = Math.round(768 * h / w);
    const ctx = /** @type {CanvasRenderingContext2D} */ (art.getContext('2d'));
    ctx.fillStyle = settings.bg || '#1c3927'; ctx.fillRect(0, 0, art.width, art.height);
    ctx.fillStyle = settings.ink || '#daf3b7'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `500 ${settings.size || Math.min(72, art.height / (lines.length + 1))}px 'Space Grotesk', sans-serif`;
    lines.forEach((line, i) => ctx.fillText(line, 384, (i + 1) * art.height / (lines.length + 1), 730));
    const texture = new THREE.CanvasTexture(art); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture }));
    mesh.position.set(...position); mesh.rotation.y = settings.rotation || 0; room.add(mesh); return mesh;
  }

  scene.add(new THREE.HemisphereLight(0xedf9dc, 0x406a3d, 2.3));
  const key = new THREE.DirectionalLight(0xffe7bf, 4.2); key.position.set(3, 8, 5); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -6; key.shadow.camera.right = 6; key.shadow.camera.top = 7; key.shadow.camera.bottom = -6; key.shadow.normalBias = .035; key.shadow.bias = -.0002;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9be1bb, 1.5); fill.position.set(-5, 5, 1); scene.add(fill);
  const lamp = new THREE.PointLight(0xffcf85, 5, 5, 2); lamp.position.set(-.7, 2.4, -1.6); scene.add(lamp);
  const petLight = new THREE.PointLight(0xb6f399, 2, 4, 2); petLight.position.set(.3, 1, .7); scene.add(petLight);

  // Layered plinth, paper walls and a faint printed grid.
  box([6.6, .35, 6.1], [0, -.3, 0], materials.dark);
  box([6.55, .18, 6.05], [0, -.05, 0], materials.floor);
  box([.15, 3.75, 6.05], [-3.2, 1.86, 0], materials.paper);
  box([6.55, 3.75, .15], [0, 1.86, -3], materials.paper);
  box([6.6, .09, .2], [0, 3.76, -3], materials.cream);
  box([.2, .09, 6.15], [-3.2, 3.76, 0], materials.cream);
  box([6.4, .2, .08], [0, .1, -2.89], materials.moss);
  box([.08, .2, 5.85], [-3.09, .1, 0], materials.moss);
  const gridMaterial = new THREE.LineBasicMaterial({ color: 0x62765b, transparent: true, opacity: .16 });
  const gridPoints = [];
  for (let i = -6; i <= 6; i++) {
    const x = i * .5;
    gridPoints.push(new THREE.Vector3(x, .055, -2.9), new THREE.Vector3(x, .055, 3));
    gridPoints.push(new THREE.Vector3(-3.1, .055, x), new THREE.Vector3(3.2, .055, x));
    if (x >= 0 && x <= 3.5) {
      gridPoints.push(new THREE.Vector3(-3.11, x, -2.9), new THREE.Vector3(3.22, x, -2.9));
      gridPoints.push(new THREE.Vector3(-3.11, x, -2.9), new THREE.Vector3(-3.11, x, 3));
    }
    gridPoints.push(new THREE.Vector3(x, .1, -2.9), new THREE.Vector3(x, 3.7, -2.9));
    gridPoints.push(new THREE.Vector3(-3.11, .1, x), new THREE.Vector3(-3.11, 3.7, x));
  }
  room.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gridPoints), gridMaterial));

  // Five visual stages from the creator's concept; not a claim of deployed automation.
  const stages = ['SFPT trades', 'Treasury', 'Bridge', 'FP / Base', 'Pet stake'];
  const stageLights = [];
  stages.forEach((label, i) => {
    const x = -2.45 + i * 1.22;
    box([1.02, .38, .12], [x, 3.12, -2.77], materials.dark);
    sign([label], .93, .25, [x, 3.12, -2.699], { size: 88 });
    const light = box([.42, .045, .04], [x, 3.38, -2.69], materials.glow.clone());
    light.material.emissiveIntensity = i < 2 ? .8 : .12; stageLights.push(light);
    if (i < 4) box([.2, .035, .035], [x + .62, 3.12, -2.76], materials.moss);
  });
  sign(['A shared pet lab · concept route'], 3.0, .28, [.15, 3.59, -2.905], { bg: '#e2e7d4', ink: '#295638', size: 48 });

  // Trading desk, terminal, soft lamp and little keyboard.
  box([3.15, .15, 1.15], [.85, 1.13, -2.18], materials.cream);
  for (const x of [-.55, 2.22]) for (const z of [-2.57, -1.8]) box([.12, 1.06, .12], [x, .57, z], materials.moss);
  box([1.45, .93, .12], [1.32, 1.87, -2.48], materials.dark);
  sign(['SFPT / IMD', 'Test terminal', '2% token buy tax'], 1.3, .78, [1.32, 1.87, -2.409], { size: 78 });
  box([.15, .24, .14], [1.32, 1.29, -2.48], materials.dark);
  box([.7, .04, .25], [1.32, 1.23, -2.4], materials.dark);
  const keyboard = box([1.05, .055, .32], [1.25, 1.24, -1.87], materials.moss);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 9; col++) box([.074, .023, .06], [.81 + col * .11, 1.277, -1.98 + row * .085], materials.mint);
  cylinder(.21, .035, [-.46, 1.24, -2.13], materials.dark);
  tube([[-.46, 1.25, -2.13], [-.46, 1.87, -2.13], [-.66, 2.12, -1.93]], .038, materials.moss);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(.3, .27, 32, 1, true), materials.moss); shade.position.set(-.66, 2.03, -1.93); room.add(shade);
  cylinder(.23, .035, [-.66, 1.93, -1.93], materials.gold);
  cylinder(.1, .2, [2.02, 1.31, -1.88], materials.paper);
  tube([[1.3, 1.23, -2.7], [1.3, .3, -2.8], [.1, .11, -2.75], [.05, .12, -.5]], .025, materials.dark);

  // Pedestal and chunky, friendly pet based on the supplied LCD logo.
  cylinder(1.12, .14, [.25, .14, .65], materials.dark);
  cylinder(1.04, .075, [.25, .25, .65], materials.glow);
  cylinder(.95, .16, [.25, .36, .65], materials.moss);
  cylinder(.86, .055, [.25, .465, .65], materials.mint);
  const pet = new THREE.Group(); pet.position.set(.25, .52, .65); room.add(pet);
  const shape = new THREE.Shape();
  const outline = [[-.68, .1], [-.82, .25], [-.82, 1.2], [-.99, 1.2], [-.99, 1.75], [-.76, 1.75], [-.76, 1.93], [-.42, 1.93], [-.42, 1.62], [.43, 1.62], [.43, 1.93], [.77, 1.93], [.77, 1.75], [.98, 1.75], [.98, 1.2], [.81, 1.2], [.81, .25], [.67, .1]];
  outline.forEach(([x, y], i) => { if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y); }); shape.closePath();
  const petBody = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .61, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .055, bevelThickness: .055 }), materials.green);
  petBody.position.z = -.32; petBody.castShadow = true; petBody.receiveShadow = true; pet.add(petBody);
  for (const x of [-.39, .39]) {
    box([.25, .31, .05], [x, 1.02, .365], materials.dark, pet);
    box([.095, .095, .02], [x - .025, 1.095, .398], materials.cream, pet);
    box([.04, .04, .02], [x + .055, .936, .398], materials.mint, pet);
    box([.2, .065, .035], [x * 1.4, .79, .365], materials.mint, pet);
    box([.36, .16, .4], [x, .065, .13], materials.moss, pet);
  }
  box([.3, .075, .06], [0, .65, .38], materials.dark, pet);
  for (const x of [-.17, .17]) box([.065, .11, .06], [x, .7, .38], materials.dark, pet);
  const hand = new THREE.Group(); hand.position.set(.92, .82, 0); pet.add(hand);
  box([.2, .46, .25], [.08, 0, 0], materials.green, hand);
  box([.2, .45, .25], [-.98, .71, 0], materials.green, pet);
  sign(['Super Fren Pet', 'Illustrated nest · $SFPT'], 1.7, .38, [.25, .45, 1.65], { size: 58 });

  // Bridge window: a quiet green halo with an explicitly conceptual label.
  box([.08, 1.3, 1.55], [-3.06, 2.0, -.8], materials.dark);
  const portal = sign(['IMD → FP', 'LayerZero idea', 'Concept only'], 1.32, 1.06, [-3.006, 2, -.8], { bg: '#2a6141', ink: '#d3f5ae', rotation: Math.PI / 2, size: 86 });
  const portalLight = new THREE.PointLight(0xb9f3a0, 2, 3, 2); portalLight.position.set(-2.55, 2.05, -.7); room.add(portalLight);
  for (const y of [1.29, 2.69]) box([.12, .055, 1.65], [-3, y, -.8], materials.glow);

  // Quiet keeper arm, community board, leafy plant and logo cartridge.
  box([.76, .56, .66], [2.34, .36, .87], materials.paper);
  box([.55, .08, .47], [2.34, .69, .87], materials.moss);
  cylinder(.15, .16, [2.34, .8, .87], materials.dark);
  tube([[2.34, .87, .87], [2.34, 1.38, .87], [1.93, 1.59, .87], [1.76, 1.23, .87]], .075, materials.paper);
  box([.25, .2, .23], [1.78, 1.18, .87], materials.moss);
  for (const x of [1.66, 1.9]) box([.045, .17, .045], [x, 1.06, .87], materials.dark);
  sign(['Keeper', 'Concept'], .59, .33, [2.34, .39, 1.209], { bg: '#e2e7d4', ink: '#285537', size: 130 });
  box([.06, .85, 1.15], [-3.06, 2.55, 1.55], materials.moss);
  sign(['Pet lab', 'Community board', 'SFPT ✳'], 1.04, .73, [-3.019, 2.55, 1.55], { rotation: Math.PI / 2, bg: '#dbe5c7', ink: '#2d563b', size: 83 });
  cylinder(.28, .45, [-2.12, .3, 1.92], materials.cream);
  cylinder(.23, .04, [-2.12, .54, 1.92], materials.dark);
  for (let i = 0; i < 8; i++) {
    const angle = i * 2.4;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6), i % 2 ? materials.moss : materials.green);
    leaf.scale.set(.7, 2.9, 1); leaf.rotation.set(Math.cos(angle) * .6, angle, Math.sin(angle) * .8);
    leaf.position.set(-2.12 + Math.sin(angle) * .2, .76 + (i % 3) * .11, 1.92 + Math.cos(angle) * .2); room.add(leaf);
  }
  box([.65, .76, .11], [-1.9, .5, 2.63], materials.dark);
  const logoMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const logoDisplay = new THREE.Mesh(new THREE.PlaneGeometry(.57, .57), logoMaterial); logoDisplay.position.set(-1.9, .55, 2.69); room.add(logoDisplay);
  const loader = new THREE.TextureLoader();
  /** @param {string} url */
  function loadLogo(url) {
    loader.load(url, texture => { texture.colorSpace = THREE.SRGBColorSpace; texture.minFilter = THREE.LinearFilter; logoMaterial.map?.dispose(); logoMaterial.map = texture; logoMaterial.needsUpdate = true; renderOnce(); }, undefined, () => { /* Keep the previous local texture if a remote image lacks CORS. */ });
  }
  loadLogo(new URL('./assets/logo.jpg', import.meta.url).href);
  if (options.logo !== new URL('./assets/logo.jpg', import.meta.url).href) loadLogo(options.logo);
  const logoHandler = event => loadLogo(/** @type {CustomEvent<string>} */ (event).detail);
  document.addEventListener('sfpt:logo', logoHandler);

  sign(['Every trade feeds the pet*', '*A creative concept, not a live feature'], 2.6, .48, [.1, .058, 2.5], { bg: '#c6d4b8', ink: '#295236', size: 50 }).rotation.x = -Math.PI / 2;

  // Trace particle illustrates the active 2% split, independent of the room's concept pipeline.
  const token = new THREE.Mesh(new THREE.IcosahedronGeometry(.1, 0), materials.gold);
  token.visible = false; room.add(token);
  const taxToken = new THREE.Mesh(new THREE.IcosahedronGeometry(.07, 0), materials.glow);
  taxToken.visible = false; room.add(taxToken);
  const traceCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(1.32, 1.85, -2.15), new THREE.Vector3(1.5, 2.8, -.8), new THREE.Vector3(.25, 2.7, .7)]);
  const taxCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(1.32, 1.85, -2.15), new THREE.Vector3(.6, 2.65, -1.8), new THREE.Vector3(-1.23, 3.12, -2.5)]);
  let traceStart = -1;
  let paused = options.paused;
  let visible = true;
  let frame = 0;
  let destroyed = false;
  let pointerX = 0;
  let pointerY = 0;
  let elapsed = 0;
  let lastTime = 0;

  function renderOnce() { if (!destroyed) renderer.render(scene, camera); }
  function size() {
    const width = wrap.clientWidth; const height = wrap.clientHeight; const aspect = width / height;
    const halfHeight = Math.max(4.45, 5.15 / aspect);
    camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect; camera.top = halfHeight; camera.bottom = -halfHeight; camera.updateProjectionMatrix();
    renderer.setSize(width, height, false); renderOnce();
  }
  function animate(now) {
    frame = 0;
    if (paused || !visible || document.hidden || destroyed) { lastTime = 0; return; }
    if (lastTime) elapsed += Math.min(50, now - lastTime) / 1000;
    lastTime = now;
    pet.position.y = .52 + Math.sin(elapsed * 1.9) * .035;
    pet.rotation.y = Math.sin(elapsed * .65) * .045;
    hand.rotation.z = .12 + Math.sin(elapsed * 2.3) * .12;
    portalLight.intensity = 1.8 + Math.sin(elapsed * 1.2) * .3;
    camera.position.x += (8.8 + pointerX * .5 - camera.position.x) * .035;
    camera.position.y += (8 + pointerY * .25 - camera.position.y) * .035;
    camera.lookAt(target);
    if (traceStart >= 0) {
      const progress = (now - traceStart) / 2400;
      if (progress >= 1) { token.visible = false; taxToken.visible = false; traceStart = -1; hand.rotation.z = 0; }
      else { token.visible = true; taxToken.visible = true; token.position.copy(traceCurve.getPoint(progress)); taxToken.position.copy(taxCurve.getPoint(progress)); token.rotation.y += .06; hand.rotation.z = Math.sin(progress * Math.PI * 8) * .5; petLight.intensity = 2 + Math.sin(progress * Math.PI) * 3; stageLights[1].material.emissiveIntensity = 1.6; }
    } else { petLight.intensity = 2; stageLights[1].material.emissiveIntensity = .8; }
    renderOnce(); frame = requestAnimationFrame(animate);
  }
  function resume() { if (!frame && !paused && visible && !document.hidden && !destroyed) frame = requestAnimationFrame(animate); }
  function stop() { cancelAnimationFrame(frame); frame = 0; lastTime = 0; }
  const motionHandler = event => {
    paused = /** @type {CustomEvent<boolean>} */ (event).detail;
    if (paused) { stop(); token.visible = false; taxToken.visible = false; traceStart = -1; pet.position.y = .52; hand.rotation.z = 0; petLight.intensity = 2; stageLights[1].material.emissiveIntensity = .8; renderOnce(); } else resume();
  };
  document.addEventListener('sfpt:motion', motionHandler);
  const traceHandler = () => { if (!paused) { traceStart = performance.now(); resume(); } };
  document.addEventListener('sfpt:trace', traceHandler);
  const visibilityHandler = () => { if (document.hidden) stop(); else resume(); };
  document.addEventListener('visibilitychange', visibilityHandler);
  wrap.addEventListener('pointermove', event => { if (paused || event.pointerType !== 'mouse') return; const rect = wrap.getBoundingClientRect(); pointerX = (event.clientX - rect.left) / rect.width - .5; pointerY = .5 - (event.clientY - rect.top) / rect.height; });
  wrap.addEventListener('pointerleave', () => { pointerX = 0; pointerY = 0; });
  const scrollHandler = () => { if (!paused && visible) { target.y = 1.35 + Math.min(window.scrollY, 500) * .00015; } };
  window.addEventListener('scroll', scrollHandler, { passive: true });
  const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) resume(); else stop(); }, { threshold: .05 });
  observer.observe(wrap);
  const resizeObserver = new ResizeObserver(size); resizeObserver.observe(wrap);
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); stop(); wrap.classList.remove('scene-ready'); const fallback = document.querySelector('#scene-fallback'); if (fallback instanceof HTMLElement) fallback.hidden = false; });
  size();
  wrap.classList.add('scene-ready');
  const fallback = document.querySelector('#scene-fallback'); if (fallback instanceof HTMLElement) fallback.hidden = true;
  canvas.dataset.ready = 'true';
  resume();
  window.addEventListener('pageshow', event => { if (event.persisted) { size(); resume(); } });
  window.addEventListener('pagehide', event => {
    if (event.persisted) { stop(); return; }
    destroyed = true; stop(); observer.disconnect(); resizeObserver.disconnect();
    document.removeEventListener('sfpt:logo', logoHandler); document.removeEventListener('sfpt:motion', motionHandler); document.removeEventListener('sfpt:trace', traceHandler); document.removeEventListener('visibilitychange', visibilityHandler); window.removeEventListener('scroll', scrollHandler);
    scene.traverse(item => { item.geometry?.dispose(); const list = Array.isArray(item.material) ? item.material : item.material ? [item.material] : []; list.forEach(material => { material.map?.dispose(); material.dispose(); }); }); renderer.dispose();
  });
}
