import * as THREE from 'three';

const _fallback = new THREE.Vector3();

export function createStaticIdleState({
  tailPivot = _fallback,
  earLeftPivot = _fallback,
  earRightPivot = _fallback,
} = {}) {
  return {
    uniforms: {
      uStaticIdleTime: { value: 0 },
      uStaticIdleEnabled: { value: 1 },
      uStaticTailPivot: { value: tailPivot.clone() },
      uStaticEarLeftPivot: { value: earLeftPivot.clone() },
      uStaticEarRightPivot: { value: earRightPivot.clone() },
    },
    lastSample: {
      enabled: true,
      tailAngle: 0,
      leftEarAngle: 0,
      rightEarAngle: 0,
    },
  };
}

const STATIC_IDLE_DECLARATIONS = `
attribute vec3 idleRegion;
attribute float idleTailU;
uniform float uStaticIdleTime;
uniform float uStaticIdleEnabled;
uniform vec3 uStaticTailPivot;
uniform vec3 uStaticEarLeftPivot;
uniform vec3 uStaticEarRightPivot;

vec2 staticIdleRotate(vec2 point, float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);
  return mat2(cosine, -sine, sine, cosine) * point;
}
`;

const STATIC_IDLE_TRANSFORM = `
{
  float idleEnabled = clamp(uStaticIdleEnabled, 0.0, 1.0);
  float tailPhase =
    sin(uStaticIdleTime * 1.08) +
    sin(uStaticIdleTime * 0.47 + 1.3) * 0.28;
  float tailTip = smoothstep(0.02, 0.88, idleTailU);
  float tailAngle = tailPhase * 0.095 * idleRegion.x * tailTip * idleEnabled;
  vec3 tailPoint = transformed - uStaticTailPivot;
  tailPoint.xz = staticIdleRotate(tailPoint.xz, tailAngle);
  transformed = uStaticTailPivot + tailPoint;
  transformed.y +=
    sin(uStaticIdleTime * 1.26 + idleTailU * 2.7) *
    0.012 *
    idleRegion.x *
    tailTip *
    idleEnabled;

  float leftEarAngle = (
    sin(uStaticIdleTime * 1.42 + 0.55) +
    sin(uStaticIdleTime * 0.63 + 2.1) * 0.24
  ) * 0.038 * idleRegion.y * idleEnabled;
  vec3 leftEarPoint = transformed - uStaticEarLeftPivot;
  leftEarPoint.xy = staticIdleRotate(leftEarPoint.xy, leftEarAngle);
  leftEarPoint.yz = staticIdleRotate(leftEarPoint.yz, leftEarAngle * 0.28);
  transformed = uStaticEarLeftPivot + leftEarPoint;

  float rightEarAngle = (
    sin(uStaticIdleTime * 1.42 + 2.35) +
    sin(uStaticIdleTime * 0.59 + 0.4) * 0.24
  ) * -0.038 * idleRegion.z * idleEnabled;
  vec3 rightEarPoint = transformed - uStaticEarRightPivot;
  rightEarPoint.xy = staticIdleRotate(rightEarPoint.xy, rightEarAngle);
  rightEarPoint.yz = staticIdleRotate(rightEarPoint.yz, rightEarAngle * 0.28);
  transformed = uStaticEarRightPivot + rightEarPoint;
}
`;

export function injectStaticIdle(material, state) {
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey?.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    if (previousCompile) previousCompile(shader, renderer);
    Object.assign(shader.uniforms, state.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         ${STATIC_IDLE_DECLARATIONS}`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         ${STATIC_IDLE_TRANSFORM}`
      );
  };
  material.customProgramCacheKey = () => `${previousCacheKey?.() ?? ''}|static-idle-v1`;
  return material;
}

export function updateStaticIdle(state, time, enabled = true) {
  const active = !!enabled;
  state.uniforms.uStaticIdleTime.value = time;
  state.uniforms.uStaticIdleEnabled.value = active ? 1 : 0;
  const tailAngle = active
    ? (Math.sin(time * 1.08) + Math.sin(time * 0.47 + 1.3) * 0.28) * 0.095
    : 0;
  const leftEarAngle = active
    ? (Math.sin(time * 1.42 + 0.55) + Math.sin(time * 0.63 + 2.1) * 0.24) * 0.038
    : 0;
  const rightEarAngle = active
    ? (Math.sin(time * 1.42 + 2.35) + Math.sin(time * 0.59 + 0.4) * 0.24) * -0.038
    : 0;
  state.lastSample = {
    enabled: active,
    tailAngle,
    leftEarAngle,
    rightEarAngle,
  };
  return state.lastSample;
}
