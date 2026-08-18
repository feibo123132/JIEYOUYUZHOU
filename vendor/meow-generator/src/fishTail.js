import * as THREE from 'three';

const DEFAULT_OUTLINE_COLOR = '#4a3428';

function triangleGeometry(rootX, rearX, halfHeight) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([
      rootX, 0, 0,
      rearX, halfHeight, 0,
      rearX, -halfHeight, 0,
    ], 3)
  );
  geometry.setIndex([0, 2, 1]);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A fish tail is a graphic fin, not a low-poly cone. Keep both the color
 * surface and its hand-drawn border in one flat, double-sided triangle so the
 * silhouette stays readable without exposing a third side as the fish rolls.
 */
export function createFlatFishTail({
  rootX,
  rearX,
  halfHeight,
  color,
  gradientMap,
  outlineColor = DEFAULT_OUTLINE_COLOR,
}) {
  const tail = new THREE.Group();
  tail.name = 'fish-tail-flat';
  tail.userData.fishTailStyle = 'outlined-triangle-plane';

  const fillGeometry = triangleGeometry(rootX, rearX, halfHeight);
  const fillMaterial = new THREE.MeshToonMaterial({
    color,
    ...(gradientMap ? { gradientMap } : {}),
    side: THREE.DoubleSide,
  });
  fillMaterial.shadowSide = THREE.DoubleSide;
  const fill = new THREE.Mesh(fillGeometry, fillMaterial);
  fill.name = 'fish-tail-fill';
  fill.userData.doubleSidedShadow = true;

  const outlineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(rootX, 0, 0),
    new THREE.Vector3(rearX, halfHeight, 0),
    new THREE.Vector3(rearX, -halfHeight, 0),
  ]);
  const outline = new THREE.LineLoop(
    outlineGeometry,
    new THREE.LineBasicMaterial({
      color: outlineColor,
      linewidth: 2,
      depthTest: true,
      depthWrite: false,
    })
  );
  outline.name = 'fish-tail-outline';
  outline.renderOrder = 2;

  tail.add(fill, outline);
  return tail;
}

/**
 * A softly rounded, graphic fin that keeps the fish readable from either side
 * without adding a cone-like volume.
 */
export function createFlatFishFin({
  rootWidth = 0.12,
  height = 0.15,
  sweep = -0.025,
  color,
  gradientMap,
  outlineColor = DEFAULT_OUTLINE_COLOR,
}) {
  const shape = new THREE.Shape();
  const halfRoot = rootWidth * 0.5;
  shape.moveTo(-halfRoot, 0);
  shape.quadraticCurveTo(sweep - rootWidth * 0.2, height * 0.78, sweep, height);
  shape.quadraticCurveTo(sweep + rootWidth * 0.52, height * 0.45, halfRoot, 0);
  shape.quadraticCurveTo(0, -rootWidth * 0.08, -halfRoot, 0);

  const fin = new THREE.Group();
  fin.name = 'fish-fin-flat';

  const fill = new THREE.Mesh(
    new THREE.ShapeGeometry(shape, 12),
    new THREE.MeshToonMaterial({
      color,
      ...(gradientMap ? { gradientMap } : {}),
      side: THREE.DoubleSide,
    })
  );
  fill.name = 'fish-fin-fill';
  fill.userData.doubleSidedShadow = true;

  const outlinePoints = shape.getPoints(24).map((point) => (
    new THREE.Vector3(point.x, point.y, 0.001)
  ));
  const outline = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(outlinePoints),
    new THREE.LineBasicMaterial({
      color: outlineColor,
      linewidth: 2,
      depthTest: true,
      depthWrite: false,
    })
  );
  outline.name = 'fish-fin-outline';
  outline.renderOrder = 2;

  fin.add(fill, outline);
  return fin;
}
