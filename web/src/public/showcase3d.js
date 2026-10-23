/**
 * Vitrine 3D Gocelsys (three.js).
 * Chaque « univers » configuré dans la gestion (Site public) devient un objet 3D :
 * bouteille d'eau, boîte de mouchoirs, canette, flacon pompe — modélisés en code et teintés
 * à la couleur de l'univers, avec le texte d'étiquette choisi — ou la photo détourée d'un produit.
 * Les objets se relaient au rythme du scroll (setProgress 0 → 1), suivent légèrement la souris,
 * et chaque univers a ses particules. Textures dessinées sur canvas, éclairage procédural.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/* ----------------------------------------------------------------- couleurs */
function tint(hex, amount) {
  // amount > 0 éclaircit vers le blanc, < 0 assombrit vers le noir
  const c = new THREE.Color(hex);
  return amount >= 0 ? c.lerp(new THREE.Color("#ffffff"), amount) : c.lerp(new THREE.Color("#000000"), -amount);
}
const css = (c) => `#${c.getHexString()}`;

/* ----------------------------------------------------------------- textures */
function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function wordmark(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.font = `800 ${size}px "Plus Jakarta Sans Variable", "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("gocelsys", x, y);
}

function labelTexture({ bg, accent, title, sub }) {
  return canvasTexture(1024, 400, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // bande de couleur ondulée
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.72);
    for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * 0.72 + Math.sin(x / 70) * 14);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fill();
    for (const cx of [w * 0.25, w * 0.75]) {
      wordmark(ctx, cx, h * 0.34, 92, accent);
      ctx.fillStyle = "#14123A";
      ctx.font = `700 40px "Plus Jakarta Sans Variable", system-ui, sans-serif`;
      ctx.fillText(title, cx, h * 0.55);
      ctx.fillStyle = "#ffffff";
      ctx.font = `600 30px "Plus Jakarta Sans Variable", system-ui, sans-serif`;
      ctx.fillText(sub, cx, h * 0.86);
    }
  });
}

/* ----------------------------------------------------------------- modèles */
function waterBottle(env, { accent = "#22C3E6", title = "Eau minérale", sub = "1,5 L" } = {}) {
  const g = new THREE.Group();
  const profile = [
    [0, -1.55], [0.62, -1.55], [0.68, -1.45], [0.7, -1.1], [0.64, -0.95], [0.7, -0.8], [0.7, 0.55],
    [0.62, 0.8], [0.38, 1.18], [0.26, 1.32], [0.25, 1.5], [0, 1.5],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 72),
    new THREE.MeshPhysicalMaterial({
      color: "#bdefff", roughness: 0.05, metalness: 0, transmission: 0.92, thickness: 0.6, ior: 1.42,
      clearcoat: 1, clearcoatRoughness: 0.05, envMap: env, envMapIntensity: 1.2, transparent: true, opacity: 0.95,
    }),
  );
  g.add(body);
  const water = new THREE.Mesh(
    new THREE.LatheGeometry(profile.filter((p) => p.y < 0.75).map((p) => new THREE.Vector2(Math.max(0, p.x - 0.04), p.y)), 64),
    new THREE.MeshPhysicalMaterial({ color: "#22c3e6", roughness: 0.1, transmission: 0.6, thickness: 1, transparent: true, opacity: 0.55, envMap: env }),
  );
  g.add(water);
  const label = new THREE.Mesh(
    new THREE.CylinderGeometry(0.715, 0.715, 0.95, 72, 1, true),
    new THREE.MeshStandardMaterial({ map: labelTexture({ bg: "#ffffff", accent, title, sub }), roughness: 0.5, side: THREE.DoubleSide }),
  );
  label.position.y = -0.15;
  g.add(label);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.29, 0.29, 0.32, 48),
    new THREE.MeshStandardMaterial({ color: css(tint(accent, -0.25)), roughness: 0.35, envMap: env }),
  );
  cap.position.y = 1.62;
  g.add(cap);
  return g;
}

function tissueBox(env, { accent = "#6450FF", title = "Mouchoirs doux", sub = "100 feuilles · 3 plis" } = {}) {
  const g = new THREE.Group();
  const side = labelTexture({ bg: css(tint(accent, 0.9)), accent, title, sub });
  const dark = css(tint(accent, -0.2));
  const top = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = dark;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.arc((i % 4) * 150 + 40, Math.floor(i / 4) * 170 + 60, 26, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#14123A";
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, 150, 46, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  const mat = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.55, envMap: env, envMapIntensity: 0.6 });
  const plain = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.55, envMap: env, envMapIntensity: 0.6 });
  const box = new THREE.Mesh(new RoundedBoxGeometry(2.3, 1.25, 1.25, 4, 0.08), [plain, plain, mat(top), plain, mat(side), mat(side)]);
  g.add(box);
  // feuille qui dépasse : plan courbé
  const sheet = new THREE.PlaneGeometry(0.9, 0.9, 20, 20);
  const pos = sheet.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, Math.sin((x + 0.45) * 3.4) * 0.16 + Math.cos(y * 3) * 0.05);
  }
  sheet.computeVertexNormals();
  const tissue = new THREE.Mesh(sheet, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.95, side: THREE.DoubleSide }));
  tissue.position.set(0, 1.0, 0);
  tissue.rotation.set(-0.15, 0.2, 0.08);
  g.add(tissue);
  g.scale.setScalar(1.05);
  return g;
}

function sodaCan(env, { accent = "#F25A3C", title = "Jus tropical", sub = "33 cl" } = {}) {
  const g = new THREE.Group();
  const label = labelTexture({ bg: css(tint(accent, 0.92)), accent, title, sub });
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.72, 0.72, 2.5, 72, 1, true),
    new THREE.MeshPhysicalMaterial({ map: label, metalness: 0.35, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12, envMap: env }),
  );
  g.add(body);
  const metal = new THREE.MeshStandardMaterial({ color: "#d8d8e4", metalness: 1, roughness: 0.22, envMap: env });
  const topGeo = new THREE.LatheGeometry([[0, 1.37], [0.58, 1.37], [0.66, 1.33], [0.6, 1.3], [0.72, 1.25]].map(([x, y]) => new THREE.Vector2(x, y)), 72);
  g.add(new THREE.Mesh(topGeo, metal));
  const bottom = new THREE.Mesh(new THREE.LatheGeometry([[0, -1.33], [0.55, -1.33], [0.72, -1.25]].map(([x, y]) => new THREE.Vector2(x, y)), 72), metal);
  g.add(bottom);
  const tab = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 12, 32), metal);
  tab.rotation.x = Math.PI / 2;
  tab.position.set(0.18, 1.38, 0);
  g.add(tab);
  return g;
}

function soapPump(env, { accent = "#16B36A", title = "Savon liquide", sub = "500 ml" } = {}) {
  const g = new THREE.Group();
  const profile = [
    [0, -1.45], [0.78, -1.45], [0.86, -1.38], [0.88, -1.2], [0.88, 0.75], [0.84, 0.95], [0.66, 1.12], [0.36, 1.2], [0.3, 1.24], [0, 1.24],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 72),
    new THREE.MeshPhysicalMaterial({
      color: css(tint(accent, 0.55)), roughness: 0.08, transmission: 0.75, thickness: 0.9, ior: 1.45, clearcoat: 1,
      clearcoatRoughness: 0.06, envMap: env, transparent: true, opacity: 0.96,
    }),
  );
  g.add(body);
  const liquid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.8, 1.9, 64),
    new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.2, transmission: 0.35, thickness: 1, envMap: env }),
  );
  liquid.position.y = -0.45;
  g.add(liquid);
  const label = new THREE.Mesh(
    new THREE.CylinderGeometry(0.895, 0.895, 1.0, 72, 1, true),
    new THREE.MeshStandardMaterial({ map: labelTexture({ bg: "#ffffff", accent, title, sub }), roughness: 0.45, side: THREE.DoubleSide }),
  );
  label.position.y = -0.25;
  g.add(label);
  const white = new THREE.MeshStandardMaterial({ color: "#f5f5fa", roughness: 0.3, envMap: env });
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.28, 48), white);
  collar.position.y = 1.36;
  g.add(collar);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.4, 24), white);
  stem.position.y = 1.68;
  g.add(stem);
  const head = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.26, 0.42, 4, 0.08), white);
  head.position.y = 1.94;
  g.add(head);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.62, 20), white);
  nozzle.rotation.z = Math.PI / 2;
  nozzle.position.set(0.48, 1.97, 0);
  g.add(nozzle);
  g.position.y = -0.15;
  return g;
}

/** Photo détourée d'un produit : plan texturé (couleurs fidèles) + ombre douce au sol. */
function photoCard(url, onReady) {
  const g = new THREE.Group();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.7),
    new THREE.MeshBasicMaterial({
      map: canvasTexture(256, 64, (ctx, w, h) => {
        const grad = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
        grad.addColorStop(0, "rgba(0,0,0,0.38)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }),
      transparent: true, depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.75;
  g.add(shadow);
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  loader.load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const ratio = tex.image.width / tex.image.height;
    const h = 3.4;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(h * ratio, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.02, side: THREE.DoubleSide, toneMapped: false }),
    );
    plane.position.y = -0.05;
    g.add(plane);
    onReady?.();
  });
  g.userData.flat = true;
  return g;
}

function buildModel(env, slide) {
  const accent = css(tint(slide.color || "#4B35E0", 0.16));
  const label = { accent, title: slide.label_title || slide.word || "", sub: slide.label_sub || "" };
  switch (slide.model) {
    case "photo":
      return slide.image ? photoCard(slide.image) : waterBottle(env, label);
    case "box":
      return tissueBox(env, label);
    case "can":
      return sodaCan(env, label);
    case "pump":
      return soapPump(env, label);
    default:
      return waterBottle(env, { ...label, accent: css(tint(slide.color || "#22C3E6", 0.3)) });
  }
}

/* ----------------------------------------------------------------- particules */
function particles(color, count, size) {
  const geo = new THREE.SphereGeometry(size, 10, 10);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.2, transparent: true, opacity: 0.55 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const seeds = Array.from({ length: count }, () => ({
    x: (Math.random() - 0.5) * 9, y: (Math.random() - 0.5) * 6, z: -1 - Math.random() * 3,
    s: 0.4 + Math.random() * 1.2, v: 0.2 + Math.random() * 0.5, p: Math.random() * Math.PI * 2,
  }));
  return { mesh, seeds };
}

/* ----------------------------------------------------------------- scène */
const PARTICLES = { bottle: [26, 0.07], box: [22, 0.05], can: [30, 0.04], pump: [22, 0.08], photo: [22, 0.06] };

export function createShowcase(canvas, { reducedMotion = false, slides = [] } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  scene.add(new THREE.HemisphereLight("#ffffff", "#4B35E0", 0.9));
  const key = new THREE.DirectionalLight("#ffffff", 2.2);
  key.position.set(4, 6, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#a99dff", 1.6);
  rim.position.set(-5, 2, -4);
  scene.add(rim);

  const products = slides.map((s) => buildModel(env, s));
  const stage = new THREE.Group();
  products.forEach((p) => {
    p.visible = false;
    stage.add(p);
  });
  scene.add(stage);

  const fx = slides.map((s) => {
    const [count, size] = PARTICLES[s.model] || PARTICLES.bottle;
    return particles(css(tint(s.color || "#4B35E0", 0.7)), count, size);
  });
  fx.forEach((f) => {
    f.mesh.visible = false;
    scene.add(f.mesh);
  });

  const state = { progress: 0, mx: 0, my: 0, tx: 0, ty: 0, offsetX: 0 };
  const dummy = new THREE.Object3D();
  let raf = 0;
  let running = true;
  const timer = new THREE.Timer();

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < 700 ? 44 : 32;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const ease = (t) => t * t * (3 - 2 * t);

  function render() {
    timer.update();
    const t = timer.getElapsed();
    state.mx += (state.tx - state.mx) * 0.06;
    state.my += (state.ty - state.my) * 0.06;
    const n = products.length;
    const f = n > 1 ? Math.min(n - 1, Math.max(0, state.progress * (n - 1))) : 0;
    const index = Math.floor(f);
    const local = f - index;
    products.forEach((p, i) => {
      // chaque produit entre en tournant depuis le bas, sort en s'éloignant vers le haut
      let k = 1 - Math.min(1, Math.abs(f - i) * 1.6);
      k = ease(Math.max(0, k));
      p.visible = k > 0.001;
      if (!p.visible) return;
      const dir = i < f ? 1 : -1;
      const away = 1 - k;
      p.scale.setScalar((slides[i]?.model === "box" ? 0.86 : 1) * (0.55 + 0.45 * k));
      p.position.set(state.offsetX, dir * away * 2.6 + (reducedMotion ? 0 : Math.sin(t * 1.1 + i) * 0.08), -away * 2);
      if (p.userData.flat) {
        // une photo est plate : elle se balance doucement au lieu de tourner sur elle-même
        const sway = reducedMotion ? 0 : Math.sin(t * 0.8 + i) * 0.28;
        p.rotation.set(0.04 + state.my * 0.12 + dir * away * 0.4, sway + (f - i) * 0.9 + state.mx * 0.35, state.mx * 0.04);
        return;
      }
      const spin = reducedMotion ? 0.5 : t * 0.35;
      p.rotation.set(0.12 + state.my * 0.25 + dir * away * 0.6, spin + (f - i) * Math.PI * 1.2 + state.mx * 0.6, -0.08 + state.mx * 0.08);
    });
    fx.forEach((fxi, i) => {
      const k = Math.max(0, 1 - Math.abs(f - i) * 1.8);
      fxi.mesh.visible = !reducedMotion && k > 0.02;
      if (!fxi.mesh.visible) return;
      fxi.mesh.material.opacity = 0.55 * k;
      fxi.seeds.forEach((s, j) => {
        const y = ((s.y + t * s.v + 3) % 6) - 3;
        dummy.position.set(s.x + Math.sin(t + s.p) * 0.2, y, s.z);
        dummy.scale.setScalar(s.s);
        dummy.updateMatrix();
        fxi.mesh.setMatrixAt(j, dummy.matrix);
      });
      fxi.mesh.instanceMatrix.needsUpdate = true;
    });
    camera.position.x = state.mx * 0.3;
    camera.position.y = -state.my * 0.2;
    camera.lookAt(state.offsetX * 0.4, 0, 0);
    renderer.render(scene, camera);
    if (running) raf = requestAnimationFrame(render);
    return index + local;
  }
  raf = requestAnimationFrame(render);

  // Pause quand la vitrine n'est pas visible (économie batterie / CPU)
  const io = new IntersectionObserver(([e]) => {
    const visible = e.isIntersecting;
    if (visible && !running) {
      running = true;
      raf = requestAnimationFrame(render);
    } else if (!visible) {
      running = false;
      cancelAnimationFrame(raf);
    }
  });
  io.observe(canvas);

  return {
    setProgress(p) {
      state.progress = p;
    },
    setPointer(x, y) {
      state.tx = x;
      state.ty = y;
    },
    setOffset(x) {
      state.offsetX = x;
    },
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      scene.traverse((o) => {
        o.geometry?.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          if (!m) return;
          m.map?.dispose();
          m.dispose();
        });
      });
      renderer.dispose();
      pmrem.dispose();
    },
  };
}

export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return Boolean(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}
