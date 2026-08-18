import * as THREE from 'three';
import { createRng } from './rng.js';

const OUTLINE_COLOR = '#4a3428';
const CONTAINER_CONTACT_LIFT = 0.016;
const CONTAINER_OUTLINE_SCALE_BLEND = 0.52;

export const CONTAINER_TYPES = [
  { id: 'cardboard', name: '纸箱' },
  { id: 'flowerpot', name: '花盆' },
  { id: 'basket', name: '藤编篮' },
  { id: 'basin', name: '搪瓷盆' },
  { id: 'bucket', name: '小水桶' },
  { id: 'storage', name: '布艺收纳箱' },
];

const CONTAINER_OPENINGS = {
  cardboard: { shape: 'rect', width: 0.995, depth: 0.915 },
  flowerpot: { shape: 'round', width: 1.0, depth: 1.0 },
  basket: { shape: 'round', width: 1.064, depth: 1.064 },
  basin: { shape: 'round', width: 1.27, depth: 1.27 },
  bucket: { shape: 'round', width: 1.014, depth: 1.014 },
  storage: { shape: 'rect', width: 1.095, depth: 0.895 },
};

const PALETTES = {
  cardboard: [
    ['#d9a968', '#b9783e', '#f0c783'],
    ['#c99458', '#9f6338', '#e7bd7a'],
    ['#e3b878', '#b17a49', '#f3d197'],
  ],
  flowerpot: [
    ['#c96f4c', '#8f4938', '#e7a46d'],
    ['#e28c55', '#a4563f', '#f2b77d'],
    ['#b76d55', '#7e4940', '#da9775'],
  ],
  basket: [
    ['#d7aa63', '#986a3d', '#efc77e'],
    ['#c89557', '#7f5738', '#e3b56d'],
    ['#e0b978', '#9b7148', '#f2d393'],
  ],
  basin: [
    ['#dce6dd', '#718f87', '#f7f1d7'],
    ['#d8d7ea', '#81789c', '#f5eed8'],
    ['#d4e3ec', '#6d8fa0', '#fff3dc'],
  ],
  bucket: [
    ['#bcc9c9', '#6c8587', '#e5eeee'],
    ['#c8c3b7', '#7b7569', '#ece8dd'],
    ['#abbccb', '#607a8f', '#dce8ef'],
  ],
  storage: [
    ['#9bb9a6', '#5c806a', '#c7d8ca'],
    ['#d59b88', '#9b6255', '#efc3b3'],
    ['#a8aecb', '#6f7395', '#d6d8e7'],
  ],
};

function descriptorFromSeed(seed) {
  const rng = createRng(seed);
  const type = rng.pick(CONTAINER_TYPES);
  const palettes = PALETTES[type.id];
  return {
    ...type,
    palette: rng.pick(palettes),
    scale: rng.range(0.92, 1.12),
    yaw: rng.range(-0.065, 0.065),
    accentSide: rng.chance(0.5) ? -1 : 1,
  };
}

export function getContainerDescriptor(seed) {
  return descriptorFromSeed(seed);
}

function toonMaterial(color, side = THREE.FrontSide) {
  const material = new THREE.MeshToonMaterial({ color, side });
  material.shadowSide = THREE.FrontSide;
  return material;
}

function outlineMaterial() {
  return new THREE.MeshBasicMaterial({
    color: OUTLINE_COLOR,
    side: THREE.BackSide,
  });
}

function outlinedMesh(geometry, material, {
  name = 'containerPart',
  outlineScale = 1.035,
  castShadow = true,
  receiveShadow = true,
} = {}) {
  const holder = new THREE.Group();
  holder.name = `${name}Group`;

  const outline = new THREE.Mesh(geometry.clone(), outlineMaterial());
  outline.name = `${name}Outline`;
  const matchedOutlineScale = 1 + (outlineScale - 1) * CONTAINER_OUTLINE_SCALE_BLEND;
  outline.scale.setScalar(matchedOutlineScale);
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.renderOrder = -1;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;

  holder.add(outline, mesh);
  return holder;
}

function addPart(parent, geometry, material, transform = {}, options = {}) {
  const part = outlinedMesh(geometry, material, options);
  if (transform.position) part.position.set(...transform.position);
  if (transform.rotation) part.rotation.set(...transform.rotation);
  if (transform.scale) part.scale.set(...transform.scale);
  parent.add(part);
  return part;
}

function addCardboard(group, colors) {
  const [base, dark, light] = colors;
  const wallMat = toonMaterial(base);
  const sideMat = toonMaterial(light);
  const flapMat = toonMaterial(light);
  const seamMat = toonMaterial(dark);

  addPart(group, new THREE.BoxGeometry(1.12, 0.43, 0.065, 5, 3, 1), wallMat, {
    position: [0, 0.225, 0.49],
  }, { name: 'cardboardFront', outlineScale: 1.028 });
  addPart(group, new THREE.BoxGeometry(1.12, 0.43, 0.065, 5, 3, 1), wallMat, {
    position: [0, 0.225, -0.49],
  }, { name: 'cardboardBack', outlineScale: 1.028 });
  for (const side of [-1, 1]) {
    addPart(group, new THREE.BoxGeometry(0.065, 0.43, 0.92, 1, 3, 4), sideMat, {
      position: [side * 0.53, 0.225, 0],
    }, { name: `cardboardSide${side}`, outlineScale: 1.028 });
  }

  addPart(group, new THREE.BoxGeometry(1.05, 0.035, 0.34, 5, 1, 2), flapMat, {
    position: [0, 0.5, 0.61],
    rotation: [-0.22, 0, 0],
  }, { name: 'cardboardFrontFlap', outlineScale: 1.025 });
  addPart(group, new THREE.BoxGeometry(1.05, 0.035, 0.3, 5, 1, 2), flapMat, {
    position: [0, 0.5, -0.61],
    rotation: [0.18, 0, 0],
  }, { name: 'cardboardBackFlap', outlineScale: 1.025 });
  for (const side of [-1, 1]) {
    addPart(group, new THREE.BoxGeometry(0.3, 0.035, 0.82, 2, 1, 4), sideMat, {
      position: [side * 0.64, 0.49, 0],
      rotation: [0, 0, side * 0.2],
    }, { name: `cardboardSideFlap${side}`, outlineScale: 1.025 });
  }

  const tape = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.012, 0.07),
    seamMat
  );
  tape.position.set(0, 0.31, 0.528);
  tape.castShadow = false;
  group.add(tape);
  return 0.43;
}

function addOpenVessel(group, {
  colors,
  topRadius,
  bottomRadius,
  height,
  segments = 32,
  rimTube = 0.045,
  name,
}) {
  const [base, dark, light] = colors;
  const wall = new THREE.CylinderGeometry(
    topRadius,
    bottomRadius,
    height,
    segments,
    3,
    true
  );
  addPart(group, wall, toonMaterial(base, THREE.DoubleSide), {
    position: [0, height * 0.5, 0],
  }, { name: `${name}Wall`, outlineScale: 1.025 });

  addPart(
    group,
    new THREE.TorusGeometry(topRadius + rimTube * 0.12, rimTube, 10, segments),
    toonMaterial(light),
    { position: [0, height + 0.002, 0], rotation: [Math.PI / 2, 0, 0] },
    { name: `${name}Rim`, outlineScale: 1.06 }
  );

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(bottomRadius * 0.82, segments),
    toonMaterial(dark, THREE.DoubleSide)
  );
  floor.name = `${name}Interior`;
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.035;
  floor.receiveShadow = true;
  group.add(floor);

  // A back-face outline expands below y=0 and can still be swallowed by the
  // rug at a shallow camera angle. Give every round nest a real dark contact
  // ring just above its base, so the contour is stable instead of relying on
  // sub-pixel depth luck.
  const contactStroke = new THREE.Mesh(
    new THREE.TorusGeometry(bottomRadius, 0.007, 6, segments),
    new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR })
  );
  contactStroke.name = `${name}ContactStroke`;
  contactStroke.position.y = 0.013;
  contactStroke.rotation.x = Math.PI / 2;
  contactStroke.castShadow = false;
  contactStroke.receiveShadow = false;
  contactStroke.renderOrder = 2;
  group.add(contactStroke);
  return height;
}

function addFlowerpot(group, colors) {
  const height = addOpenVessel(group, {
    colors,
    topRadius: 0.55,
    bottomRadius: 0.38,
    height: 0.52,
    rimTube: 0.055,
    name: 'flowerpot',
  });
  addPart(
    group,
    new THREE.TorusGeometry(0.46, 0.028, 8, 32),
    toonMaterial(colors[1]),
    { position: [0, 0.16, 0], rotation: [Math.PI / 2, 0, 0] },
    { name: 'flowerpotBand', outlineScale: 1.04 }
  );
  return height;
}

function addBasket(group, colors) {
  const height = addOpenVessel(group, {
    colors,
    topRadius: 0.58,
    bottomRadius: 0.48,
    height: 0.46,
    rimTube: 0.048,
    name: 'basket',
  });
  for (const y of [0.13, 0.25, 0.37]) {
    const radius = THREE.MathUtils.lerp(0.49, 0.56, y / height);
    addPart(
      group,
      new THREE.TorusGeometry(radius, 0.018, 7, 32),
      toonMaterial(colors[1]),
      { position: [0, y, 0], rotation: [Math.PI / 2, 0, 0] },
      { name: 'basketBand', outlineScale: 1.055, castShadow: false }
    );
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const radius = 0.515;
    const rod = addPart(
      group,
      new THREE.CylinderGeometry(0.012, 0.012, 0.38, 7),
      toonMaterial(colors[2]),
      {
        position: [Math.cos(a) * radius, 0.24, Math.sin(a) * radius],
        rotation: [Math.sin(a) * 0.14, 0, -Math.cos(a) * 0.14],
      },
      { name: 'basketRod', outlineScale: 1.075, castShadow: false }
    );
    rod.renderOrder = 1;
  }
  const handle = addPart(
    group,
    new THREE.TorusGeometry(0.55, 0.035, 8, 36, Math.PI),
    toonMaterial(colors[1]),
    { position: [0, 0.46, -0.37], rotation: [0, 0, 0] },
    { name: 'basketHandle', outlineScale: 1.055 }
  );
  handle.rotation.z = 0.01;
  return height;
}

function addBasin(group, colors) {
  const height = addOpenVessel(group, {
    colors,
    topRadius: 0.68,
    bottomRadius: 0.5,
    height: 0.31,
    rimTube: 0.045,
    name: 'basin',
  });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 9, 7),
      toonMaterial(colors[1])
    );
    dot.position.set(Math.cos(a) * 0.64, 0.255, Math.sin(a) * 0.64);
    dot.castShadow = false;
    group.add(dot);
  }
  return height;
}

function addBucket(group, colors) {
  const height = addOpenVessel(group, {
    colors,
    topRadius: 0.55,
    bottomRadius: 0.45,
    height: 0.53,
    rimTube: 0.043,
    name: 'bucket',
  });
  addPart(
    group,
    new THREE.TorusGeometry(0.61, 0.025, 7, 38, Math.PI),
    toonMaterial(colors[1]),
    { position: [0, 0.51, -0.03] },
    { name: 'bucketHandle', outlineScale: 1.08 }
  );
  for (const side of [-1, 1]) {
    addPart(
      group,
      new THREE.SphereGeometry(0.05, 10, 8),
      toonMaterial(colors[2]),
      { position: [side * 0.54, 0.5, 0] },
      { name: 'bucketHandleJoint', outlineScale: 1.08 }
    );
  }
  return height;
}

function addStorage(group, colors) {
  const [base, dark, light] = colors;
  const wallMat = toonMaterial(base);
  const sideMat = toonMaterial(light);
  const width = 1.15;
  const depth = 0.95;
  const height = 0.48;

  addPart(group, new THREE.BoxGeometry(width, height, 0.055, 5, 3, 1), wallMat, {
    position: [0, height * 0.5, depth * 0.5],
  }, { name: 'storageFront', outlineScale: 1.026 });
  addPart(group, new THREE.BoxGeometry(width, height, 0.055, 5, 3, 1), wallMat, {
    position: [0, height * 0.5, -depth * 0.5],
  }, { name: 'storageBack', outlineScale: 1.026 });
  for (const side of [-1, 1]) {
    addPart(group, new THREE.BoxGeometry(0.055, height, depth, 1, 3, 5), sideMat, {
      position: [side * width * 0.5, height * 0.5, 0],
    }, { name: 'storageSide', outlineScale: 1.026 });
  }

  addPart(group, new THREE.BoxGeometry(width + 0.06, 0.055, 0.07), toonMaterial(dark), {
    position: [0, height, depth * 0.5],
  }, { name: 'storageFrontRim', outlineScale: 1.04 });
  addPart(group, new THREE.BoxGeometry(width + 0.06, 0.055, 0.07), toonMaterial(dark), {
    position: [0, height, -depth * 0.5],
  }, { name: 'storageBackRim', outlineScale: 1.04 });

  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.13, 0.018, 7, 20, Math.PI),
    toonMaterial(dark)
  );
  handle.name = 'storageHandle';
  handle.position.set(0, 0.31, depth * 0.53);
  handle.rotation.z = Math.PI;
  handle.castShadow = false;
  group.add(handle);
  return height;
}

export function createContainer(seed, { fitScale = 1 } = {}) {
  const descriptor = descriptorFromSeed(seed);
  const group = new THREE.Group();
  group.name = `CatContainer_${descriptor.id}`;

  let rimY = 0.45;
  if (descriptor.id === 'cardboard') rimY = addCardboard(group, descriptor.palette);
  if (descriptor.id === 'flowerpot') rimY = addFlowerpot(group, descriptor.palette);
  if (descriptor.id === 'basket') rimY = addBasket(group, descriptor.palette);
  if (descriptor.id === 'basin') rimY = addBasin(group, descriptor.palette);
  if (descriptor.id === 'bucket') rimY = addBucket(group, descriptor.palette);
  if (descriptor.id === 'storage') rimY = addStorage(group, descriptor.palette);

  // The crouching body is longer than it is tall. Fit the opening in X/Z
  // without making the walls unnecessarily high, then give rectangular
  // containers a little extra depth so their back wall clears the haunches.
  const horizontalScale = descriptor.scale * THREE.MathUtils.clamp(fitScale, 0.9, 2.5);
  const depthPadding = descriptor.id === 'cardboard' || descriptor.id === 'storage'
    ? 1.1
    : 1;
  group.scale.set(
    horizontalScale,
    descriptor.scale,
    horizontalScale * depthPadding
  );
  // The rug surface sits slightly above the scene floor. Lift the whole nest
  // independently so the back-face outline at its base remains depth-visible.
  group.position.y = CONTAINER_CONTACT_LIFT;
  group.position.z = -0.1;
  group.rotation.y = descriptor.yaw;
  const opening = CONTAINER_OPENINGS[descriptor.id];
  group.userData.container = {
    id: descriptor.id,
    name: descriptor.name,
    seed,
    rimY: rimY * descriptor.scale + CONTAINER_CONTACT_LIFT,
    scale: horizontalScale,
    depthScale: horizontalScale * depthPadding,
    heightScale: descriptor.scale,
    contactLift: CONTAINER_CONTACT_LIFT,
    openingShape: opening.shape,
    openingWidth: opening.width * horizontalScale,
    openingDepth: opening.depth * horizontalScale * depthPadding,
    offsetZ: group.position.z,
  };
  return group;
}
