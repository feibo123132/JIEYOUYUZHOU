import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createFlatFishFin, createFlatFishTail } from './fishTail.js';

const OUTLINE_COLOR = '#4a3428';
export const WEATHER_AMOUNT_LIMITS = Object.freeze({
  rain: 4,
  cloud: 2,
  fish: 4,
});
// 鱼雨是“雨滴尺度”的小鱼，不是玩具尺寸。默认回收上限为 56，
// “鱼量”调到 4 倍时上限提高到 224，但仍保留回收机制。
const BASE_MAX_FISH = 56;
const MAX_FISH = BASE_MAX_FISH * WEATHER_AMOUNT_LIMITS.fish;
const BASE_SPAWN_INTERVAL = 0.18;
const BASE_RAIN_DROP_COUNT = 220;
const MAX_RAIN_DROP_COUNT = BASE_RAIN_DROP_COUNT * WEATHER_AMOUNT_LIMITS.rain;
const BASE_CLOUD_COUNT = 8;
const MAX_CLOUD_COUNT = 16;
// 鱼雨尺寸更小，因此使用更小的视觉接触间隙；物理刚体位置保持不变。
const FISH_VISUAL_CONTACT_LIFT = 0.0035;
const clampAmount = (amount, max = 2) => (
  THREE.MathUtils.clamp(Number(amount) || 0, 0, max)
);

function makeGradientMap() {
  const data = new Uint8Array([224, 255]);
  const texture = new THREE.DataTexture(data, 2, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function outlineOf(geometry, thickness = 0.014) {
  const outlineGeometry = geometry.clone();
  const positions = outlineGeometry.getAttribute('position');
  const normals = outlineGeometry.getAttribute('normal');
  for (let i = 0; i < positions.count; i++) {
    positions.setXYZ(
      i,
      positions.getX(i) + normals.getX(i) * thickness,
      positions.getY(i) + normals.getY(i) * thickness,
      positions.getZ(i) + normals.getZ(i) * thickness
    );
  }
  positions.needsUpdate = true;
  return new THREE.Mesh(
    outlineGeometry,
    new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide })
  );
}

function createFishMesh(color, accent, gradientMap) {
  const fish = new THREE.Group();
  fish.name = 'weather-fish';

  const bodyGeometry = new THREE.SphereGeometry(0.28, 10, 7);
  bodyGeometry.scale(1.35, 0.7, 0.58);
  const bodyPosition = bodyGeometry.getAttribute('position');
  for (let i = 0; i < bodyPosition.count; i++) {
    const x = bodyPosition.getX(i);
    const headBias = THREE.MathUtils.clamp((x + 0.378) / 0.756, 0, 1);
    const taper = THREE.MathUtils.lerp(0.76, 1.03, headBias);
    bodyPosition.setY(i, bodyPosition.getY(i) * taper);
    bodyPosition.setZ(i, bodyPosition.getZ(i) * THREE.MathUtils.lerp(0.84, 1.02, headBias));
  }
  bodyPosition.needsUpdate = true;
  bodyGeometry.computeVertexNormals();
  bodyGeometry.computeBoundingSphere();
  const body = new THREE.Mesh(
    bodyGeometry,
    new THREE.MeshToonMaterial({ color, gradientMap })
  );
  fish.add(body, outlineOf(bodyGeometry));

  fish.add(createFlatFishTail({
    rootX: -0.31,
    rearX: -0.56,
    halfHeight: 0.18,
    color: accent,
    gradientMap,
    outlineColor: OUTLINE_COLOR,
  }));

  const dorsalFin = createFlatFishFin({
    rootWidth: 0.15,
    height: 0.18,
    sweep: -0.035,
    color: accent,
    gradientMap,
    outlineColor: OUTLINE_COLOR,
  });
  dorsalFin.position.set(-0.035, 0.18, 0);
  dorsalFin.rotation.z = -0.08;
  fish.add(dorsalFin);

  const eyeOutline = new THREE.Mesh(
    new THREE.CircleGeometry(0.058, 18),
    new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.DoubleSide })
  );
  eyeOutline.position.set(0.22, 0.07, 0.164);
  const eyeWhite = new THREE.Mesh(
    new THREE.CircleGeometry(0.048, 18),
    new THREE.MeshBasicMaterial({ color: '#fff9e9', side: THREE.DoubleSide })
  );
  eyeWhite.position.set(0.22, 0.07, 0.166);
  const pupil = new THREE.Mesh(
    new THREE.CircleGeometry(0.019, 16),
    new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.DoubleSide })
  );
  pupil.position.set(0.235, 0.073, 0.168);
  fish.add(eyeOutline, eyeWhite, pupil);

  fish.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      material.shadowSide = object.userData.doubleSidedShadow
        ? THREE.DoubleSide
        : THREE.FrontSide;
    }
  });

  return fish;
}

/**
 * “下雨”天气的限量小鱼刚体。
 * 与玩具复用同一个 Cannon world，因此会自然碰撞地面、猫和其他物件。
 */
export function createFishRain(scene, world) {
  const group = new THREE.Group();
  group.name = 'fish-rain';
  scene.add(group);

  const gradientMap = makeGradientMap();
  const palette = [
    ['#8bc9ca', '#e8bb72'],
    ['#e89cae', '#f4cf72'],
    ['#9fb6dd', '#f2c98a'],
    ['#a9d7ae', '#e9a873'],
    ['#d5afd8', '#efc76e'],
  ];
  const fish = [];
  let enabled = false;
  let spawnClock = 0;
  let amount = 1;

  const activeMaxFish = () => Math.min(
    MAX_FISH,
    Math.round(BASE_MAX_FISH * amount)
  );
  const activeSpawnInterval = () => amount > 0
    ? BASE_SPAWN_INTERVAL / Math.max(0.08, amount)
    : Infinity;

  function remove(entry) {
    group.remove(entry.mesh);
    world.removeBody(entry.body);
    entry.mesh.traverse((object) => {
      if (!object.isMesh) return;
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material?.dispose();
    });
    const index = fish.indexOf(entry);
    if (index >= 0) fish.splice(index, 1);
  }

  function spawn() {
    const maxFish = activeMaxFish();
    if (maxFish <= 0) return;
    if (fish.length >= maxFish) remove(fish[0]);

    const [color, accent] = palette[Math.floor(Math.random() * palette.length)];
    const scale = THREE.MathUtils.lerp(0.18, 0.34, Math.pow(Math.random(), 0.72));
    const mesh = createFishMesh(color, accent, gradientMap);
    mesh.scale.setScalar(scale);
    group.add(mesh);

    const body = new CANNON.Body({
      mass: 0.05 * Math.pow(scale / 0.25, 2.2),
      linearDamping: 0.08,
      angularDamping: 0.2,
      position: new CANNON.Vec3(
        THREE.MathUtils.randFloat(-3.6, 3.6),
        THREE.MathUtils.randFloat(4.0, 6.7),
        THREE.MathUtils.randFloat(-2.8, 2.8)
      ),
    });
    body.addShape(new CANNON.Box(new CANNON.Vec3(
      0.36 * scale,
      0.14 * scale,
      0.13 * scale
    )));
    body.velocity.set(
      THREE.MathUtils.randFloat(-0.3, 0.3),
      THREE.MathUtils.randFloat(-0.35, -0.08),
      THREE.MathUtils.randFloat(-0.3, 0.3)
    );
    body.angularVelocity.set(
      THREE.MathUtils.randFloat(-3.8, 3.8),
      THREE.MathUtils.randFloat(-3.8, 3.8),
      THREE.MathUtils.randFloat(-3.8, 3.8)
    );
    body.quaternion.setFromEuler(
      THREE.MathUtils.randFloat(-0.5, 0.5),
      THREE.MathUtils.randFloat(-Math.PI, Math.PI),
      THREE.MathUtils.randFloat(-0.7, 0.7)
    );
    world.addBody(body);
    fish.push({ mesh, body });
  }

  function clear() {
    while (fish.length) remove(fish[fish.length - 1]);
    spawnClock = 0;
  }

  function setEnabled(nextEnabled) {
    nextEnabled = !!nextEnabled;
    if (enabled === nextEnabled) return;
    enabled = nextEnabled;
    spawnClock = nextEnabled ? activeSpawnInterval() : 0;
    if (!nextEnabled) clear();
  }

  function setAmount(nextAmount) {
    amount = clampAmount(nextAmount, WEATHER_AMOUNT_LIMITS.fish);
    const maxFish = activeMaxFish();
    while (fish.length > maxFish) remove(fish[0]);
    spawnClock = Math.min(spawnClock, activeSpawnInterval());
  }

  function update(dt) {
    if (enabled && amount > 0) {
      const spawnInterval = activeSpawnInterval();
      spawnClock += dt;
      while (spawnClock >= spawnInterval) {
        spawnClock -= spawnInterval;
        spawn();
      }
    }

    for (const entry of [...fish]) {
      entry.mesh.position.copy(entry.body.position);
      entry.mesh.position.y += FISH_VISUAL_CONTACT_LIFT;
      entry.mesh.quaternion.copy(entry.body.quaternion);
      if (entry.body.position.y < -2.5) remove(entry);
    }
  }

  return {
    update,
    clear,
    setEnabled,
    setAmount,
    get count() { return fish.length; },
    get maxCount() { return activeMaxFish(); },
    get amount() { return amount; },
  };
}

/**
 * 与小鱼雨叠加的正常雨幕。雨滴只负责视觉，不进入物理世界；
 * 小鱼仍然保留刚体碰撞，避免为大量细雨创建不必要的碰撞体。
 */
export function createRainField(scene) {
  const group = new THREE.Group();
  group.name = 'weather-rain';
  group.visible = false;
  scene.add(group);

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(MAX_RAIN_DROP_COUNT * 2 * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: '#b9d6df',
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const streaks = new THREE.LineSegments(geometry, material);
  streaks.name = 'rain-streaks';
  streaks.frustumCulled = false;
  streaks.renderOrder = 8;
  group.add(streaks);

  const drops = Array.from({ length: MAX_RAIN_DROP_COUNT }, () => ({
    x: 0,
    y: 0,
    z: 0,
    length: 0.3,
    speed: 8,
    drift: 0.1,
  }));
  let enabled = false;
  let amount = 1;

  const activeDropCount = () => Math.min(
    MAX_RAIN_DROP_COUNT,
    Math.round(BASE_RAIN_DROP_COUNT * amount)
  );

  function syncDrawRange() {
    geometry.setDrawRange(0, activeDropCount() * 2);
    material.opacity = THREE.MathUtils.lerp(0.46, 0.82, Math.min(amount, 1.4) / 1.4);
  }

  function resetDrop(drop, initial = false) {
    drop.x = THREE.MathUtils.randFloat(-6.5, 6.5);
    drop.y = initial
      ? THREE.MathUtils.randFloat(0.2, 7.4)
      : THREE.MathUtils.randFloat(5.4, 7.6);
    drop.z = THREE.MathUtils.randFloat(-5.2, 5.2);
    drop.length = THREE.MathUtils.randFloat(0.22, 0.62);
    drop.speed = THREE.MathUtils.randFloat(7.2, 12.8);
    drop.drift = THREE.MathUtils.randFloat(0.08, 0.24);
  }

  function writeDrop(index, drop) {
    const offset = index * 6;
    positions[offset] = drop.x;
    positions[offset + 1] = drop.y;
    positions[offset + 2] = drop.z;
    positions[offset + 3] = drop.x - drop.drift * drop.length;
    positions[offset + 4] = drop.y - drop.length;
    positions[offset + 5] = drop.z + drop.drift * drop.length * 0.35;
  }

  drops.forEach((drop, index) => {
    resetDrop(drop, true);
    writeDrop(index, drop);
  });
  geometry.attributes.position.needsUpdate = true;
  syncDrawRange();

  function setEnabled(nextEnabled) {
    enabled = !!nextEnabled;
    group.visible = enabled;
    if (enabled) {
      drops.forEach((drop, index) => {
        resetDrop(drop, true);
        writeDrop(index, drop);
      });
      geometry.attributes.position.needsUpdate = true;
    }
  }

  function setAmount(nextAmount) {
    amount = clampAmount(nextAmount, WEATHER_AMOUNT_LIMITS.rain);
    const count = activeDropCount();
    for (let index = 0; index < count; index++) {
      resetDrop(drops[index], true);
      writeDrop(index, drops[index]);
    }
    syncDrawRange();
    geometry.attributes.position.needsUpdate = true;
  }

  function update(dt) {
    if (!enabled) return;
    const count = activeDropCount();
    for (let index = 0; index < count; index++) {
      const drop = drops[index];
      drop.y -= drop.speed * dt;
      drop.x -= drop.drift * dt * 1.8;
      if (drop.y < 0.04 || Math.abs(drop.x) > 7) resetDrop(drop);
      writeDrop(index, drop);
    }
    geometry.attributes.position.needsUpdate = true;
  }

  return {
    group,
    update,
    setEnabled,
    setAmount,
    get enabled() { return enabled; },
    get count() { return enabled ? activeDropCount() : 0; },
    get amount() { return amount; },
  };
}

/**
 * 程序化天气音效，不依赖外部音频文件。
 * 雨声在用户点击雨天后才创建 AudioContext，满足浏览器自动播放策略；
 * 雷声复用同一上下文，以低频噪声和短促低音形成远近层次。
 */
export function createWeatherAudio() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  let context = null;
  let master = null;
  let rainSource = null;
  let rainGain = null;
  let rainAmount = 1;
  let thunderVoices = 0;

  const rainGainValue = () => Math.max(0.0001, 0.105 * Math.min(rainAmount, 1.8));

  function ensureContext() {
    if (!AudioContextCtor) return null;
    if (!context) {
      context = new AudioContextCtor();
      master = context.createGain();
      master.gain.value = 0.72;
      master.connect(context.destination);
    }
    if (context.state === 'suspended') context.resume().catch(() => {});
    return context;
  }

  function makeNoiseBuffer(ctx, seconds, shape = null) {
    const length = Math.ceil(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let smoothed = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      smoothed += (white - smoothed) * 0.18;
      data[i] = shape ? shape(i / ctx.sampleRate, white, smoothed) : white * 0.72 + smoothed * 0.28;
    }
    return buffer;
  }

  function startRain() {
    if (rainSource) return;
    const ctx = ensureContext();
    if (!ctx) return;
    const source = ctx.createBufferSource();
    source.buffer = makeNoiseBuffer(ctx, 2.4);
    source.loop = true;
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 620;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 7200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(rainGainValue(), ctx.currentTime + 0.55);
    source.connect(highpass).connect(lowpass).connect(gain).connect(master);
    source.start();
    rainSource = source;
    rainGain = gain;
  }

  function stopRain() {
    if (!rainSource || !context) return;
    const source = rainSource;
    const gain = rainGain;
    rainSource = null;
    rainGain = null;
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);
    source.stop(context.currentTime + 0.38);
  }

  function setRain(enabled) {
    if (enabled) startRain();
    else stopRain();
  }

  function setRainAmount(nextAmount) {
    rainAmount = clampAmount(nextAmount, WEATHER_AMOUNT_LIMITS.rain);
    if (!context || !rainGain) return;
    rainGain.gain.cancelScheduledValues(context.currentTime);
    rainGain.gain.setValueAtTime(Math.max(rainGain.gain.value, 0.0001), context.currentTime);
    rainGain.gain.linearRampToValueAtTime(rainGainValue(), context.currentTime + 0.18);
  }

  function playThunder(intensity = 1) {
    const ctx = ensureContext();
    if (!ctx) return;
    thunderVoices += 1;
    const duration = THREE.MathUtils.randFloat(2.7, 4.1);
    const source = ctx.createBufferSource();
    source.buffer = makeNoiseBuffer(ctx, duration, (time, white, smoothed) => {
      const decay = Math.exp(-time * 1.15);
      const firstCrack = Math.exp(-Math.pow((time - 0.045) / 0.035, 2));
      const echo = 0.52 * Math.exp(-Math.pow((time - 0.48) / 0.18, 2));
      return (smoothed * 0.88 + white * 0.12) * decay + white * (firstCrack + echo) * 0.34;
    });
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(1150, ctx.currentTime);
    lowpass.frequency.exponentialRampToValueAtTime(210, ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.46 * intensity, ctx.currentTime + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    source.connect(lowpass).connect(gain).connect(master);
    source.addEventListener('ended', () => {
      thunderVoices = Math.max(0, thunderVoices - 1);
    }, { once: true });
    source.start();

    const rumble = ctx.createOscillator();
    const rumbleGain = ctx.createGain();
    rumble.type = 'sine';
    rumble.frequency.setValueAtTime(58, ctx.currentTime);
    rumble.frequency.exponentialRampToValueAtTime(34, ctx.currentTime + duration * 0.8);
    rumbleGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    rumbleGain.gain.exponentialRampToValueAtTime(0.14 * intensity, ctx.currentTime + 0.08);
    rumbleGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration * 0.82);
    rumble.connect(rumbleGain).connect(master);
    rumble.start();
    rumble.stop(ctx.currentTime + duration);
  }

  return {
    prepare: ensureContext,
    setRain,
    setRainAmount,
    playThunder,
    getState: () => ({
      available: !!AudioContextCtor,
      contextState: context?.state ?? 'idle',
      rainActive: !!rainSource,
      rainAmount,
      thunderVoices,
    }),
  };
}

/**
 * 低模手绘云层。云团本身可见并写入主灯 ShadowMap，
 * 所以它们飘过猫咪上空时会在木地板和地毯上留下真实移动云影。
 */
export function createCloudField(scene) {
  const group = new THREE.Group();
  group.name = 'weather-clouds';
  group.visible = false;
  scene.add(group);

  const gradientMap = makeGradientMap();
  const cloudMaterial = new THREE.MeshToonMaterial({
    color: '#d8dee0',
    gradientMap,
    transparent: true,
    opacity: 0.94,
  });
  cloudMaterial.shadowSide = THREE.FrontSide;
  const cloudGeometry = new THREE.SphereGeometry(0.52, 10, 7);
  const clouds = [];
  const lobeLayouts = [
    [[-0.6, 0, 0, 1.2, 0.7, 0.8], [0, 0.14, 0, 1.35, 0.95, 0.9], [0.62, 0, 0, 1.1, 0.68, 0.76]],
    [[-0.72, 0, 0, 1.0, 0.62, 0.72], [-0.12, 0.2, 0, 1.25, 0.9, 0.84], [0.52, 0.1, 0, 1.35, 0.76, 0.82], [0.95, -0.04, 0, 0.8, 0.55, 0.64]],
  ];

  for (let i = 0; i < MAX_CLOUD_COUNT; i++) {
    const cloud = new THREE.Group();
    const layout = lobeLayouts[i % lobeLayouts.length];
    for (const [x, y, z, sx, sy, sz] of layout) {
      const lobe = new THREE.Mesh(cloudGeometry, cloudMaterial);
      lobe.position.set(x, y, z);
      lobe.scale.set(sx, sy, sz);
      lobe.castShadow = true;
      cloud.add(lobe);

      const outline = outlineOf(cloudGeometry, 0.025);
      outline.position.copy(lobe.position);
      outline.scale.copy(lobe.scale);
      outline.castShadow = false;
      cloud.add(outline);
    }
    const row = Math.floor(i / BASE_CLOUD_COUNT);
    const scale = THREE.MathUtils.lerp(0.34, 0.66, (i % 5) / 4)
      * (row === 0 ? 1 : 0.88);
    cloud.scale.setScalar(scale);
    cloud.position.set(
      -6.5 + (i % BASE_CLOUD_COUNT) * 1.85,
      3.35 + (i % 3) * 0.38 + row * 0.18,
      -3.6 + (i % 4) * 0.78 + row * 1.15
    );
    cloud.rotation.y = (i % 2 ? 1 : -1) * 0.12;
    cloud.userData.speed = 0.23 + (i % 4) * 0.055;
    clouds.push(cloud);
    group.add(cloud);
  }

  let mode = 'sunny';
  let amount = 1;

  const activeCloudCount = () => Math.min(
    MAX_CLOUD_COUNT,
    Math.round(BASE_CLOUD_COUNT * amount)
  );

  function syncVisibility() {
    const count = activeCloudCount();
    group.visible = mode !== 'sunny' && count > 0;
    clouds.forEach((cloud, index) => {
      cloud.visible = index < count;
    });
  }

  function setMode(nextMode) {
    mode = nextMode;
    if (mode === 'thunder') {
      cloudMaterial.color.set('#69717e');
      cloudMaterial.opacity = 0.98;
    } else if (mode === 'fishRain') {
      cloudMaterial.color.set('#9eacb0');
      cloudMaterial.opacity = 0.94;
    } else {
      cloudMaterial.color.set('#d8dee0');
      cloudMaterial.opacity = 0.94;
    }
    syncVisibility();
  }

  function setAmount(nextAmount) {
    amount = clampAmount(nextAmount);
    syncVisibility();
  }

  function update(dt) {
    if (!group.visible) return;
    for (const cloud of clouds) {
      if (!cloud.visible) continue;
      cloud.position.x += cloud.userData.speed * dt;
      cloud.rotation.y += Math.sin(cloud.position.x * 0.3) * dt * 0.004;
      if (cloud.position.x > 7.2) cloud.position.x = -7.2;
    }
  }

  return {
    group,
    setMode,
    setAmount,
    update,
    get count() { return group.visible ? activeCloudCount() : 0; },
    get amount() { return amount; },
  };
}
