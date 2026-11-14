import * as THREE from "three";
export function startHero() {
  const canvas = document.getElementById("hero-canvas");
  const host = canvas.parentElement;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
  } catch {
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0.2, 8.8);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x52634b, 3));
  const light = new THREE.DirectionalLight(0xffffff, 5);
  light.position.set(3, 5, 4);
  scene.add(light);
  const rim = new THREE.DirectionalLight(0xb1c8ee, 4);
  rim.position.set(-4, 1, -3);
  scene.add(rim);
  const group = new THREE.Group();
  scene.add(group);
  const material = new THREE.MeshStandardMaterial({
    color: 0x283d50,
    metalness: 0.45,
    roughness: 0.3,
  });
  const cushion = new THREE.MeshStandardMaterial({
    color: 0x14232d,
    roughness: 0.9,
  });
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.15, 20, 80, Math.PI),
    material,
  );
  band.position.y = 0.2;
  group.add(band);
  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(1.06, 0.1, 16, 60, Math.PI),
    cushion,
  );
  inner.position.set(0, 0.19, 0.05);
  group.add(inner);
  for (const side of [-1, 1]) {
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.28, 48),
      material,
    );
    cup.rotation.z = Math.PI / 2;
    cup.scale.z = 1.25;
    cup.position.set(side * 1.04, -0.45, 0);
    group.add(cup);
    const pad = new THREE.Mesh(
      new THREE.TorusGeometry(0.4, 0.14, 16, 48),
      cushion,
    );
    pad.rotation.y = Math.PI / 2;
    pad.scale.y = 1.3;
    pad.position.set(side * 0.89, -0.45, 0);
    group.add(pad);
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.55, 12),
      material,
    );
    arm.position.set(side * 1.08, -0.02, 0);
    group.add(arm);
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.36, 0.04, 40),
      material,
    );
    disc.rotation.z = Math.PI / 2;
    disc.position.set(side * 1.2, -0.45, 0);
    group.add(disc);
  }
  group.rotation.set(0.1, -0.45, -0.25);
  group.position.y = 0.25;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.9, 0.008, 8, 100),
    new THREE.MeshBasicMaterial({ color: 0xa1ad86 }),
  );
  ring.rotation.x = 0.9;
  ring.rotation.y = 0.2;
  ring.position.y = -0.25;
  scene.add(ring);
  let visible = true,
    frame,
    pointerX = 0,
    pointerY = 0;
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  host.addEventListener("pointermove", (e) => {
    const rect = host.getBoundingClientRect();
    pointerX = (e.clientX - rect.left) / rect.width - 0.5;
    pointerY = (e.clientY - rect.top) / rect.height - 0.5;
  });
  function animate(time) {
    frame = undefined;
    if (!visible || document.hidden) return;
    group.position.y = 0.3 + Math.sin(time * 0.0006) * 0.12;
    group.rotation.y += (-0.45 + pointerX * 0.4 - group.rotation.y) * 0.025;
    group.rotation.x += (0.1 + pointerY * 0.2 - group.rotation.x) * 0.025;
    renderer.render(scene, camera);
    host.classList.add("ready");
    frame = requestAnimationFrame(animate);
  }
  const start = () => {
    if (visible && !document.hidden && frame === undefined)
      frame = requestAnimationFrame(animate);
  };
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible && frame !== undefined) {
      cancelAnimationFrame(frame);
      frame = undefined;
    }
    start();
  }).observe(host);
  document.addEventListener("visibilitychange", start);
  start();
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    host.classList.remove("ready");
    visible = false;
    if (frame) cancelAnimationFrame(frame);
  });
  window.addEventListener(
    "pagehide",
    () => {
      if (frame) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      scene.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) o.material.dispose();
      });
      renderer.dispose();
    },
    { once: true },
  );
}
