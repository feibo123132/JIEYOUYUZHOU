import * as THREE from 'three';
import SOURCE_DATA from './mesh2motionClips.json' with { type: 'json' };

export const SOURCE_BONE_ORDER = SOURCE_DATA.boneOrder;
export const SOURCE_BONE_STRIDE = SOURCE_DATA.stride;

const BONE_OFFSET = new Map(
  SOURCE_BONE_ORDER.map((name, index) => [name, index * SOURCE_BONE_STRIDE])
);
const CLIP_BY_ID = new Map(SOURCE_DATA.clips.map((clip) => [clip.id, clip]));
const REST_VALUES = CLIP_BY_ID.get('rest-pose').samples[0];
const FOOT_BONES = ['frontLFoot', 'frontRFoot', 'backLFoot', 'backRFoot'];

const readQuaternion = (values, offset, target) => target.set(
  values[offset + 4],
  values[offset + 5],
  values[offset + 6],
  values[offset + 3]
).normalize();

export function getSourceClip(actionId) {
  return CLIP_BY_ID.get(actionId) ?? CLIP_BY_ID.get('idle');
}

export function getSourceBone(sample, name, position, quaternion) {
  const offset = BONE_OFFSET.get(name);
  if (offset == null) return false;
  position?.set(sample.values[offset], sample.values[offset + 1], sample.values[offset + 2]);
  if (quaternion) readQuaternion(sample.values, offset, quaternion);
  return true;
}

export function getRestBone(name, position, quaternion) {
  const offset = BONE_OFFSET.get(name);
  if (offset == null) return false;
  position?.set(REST_VALUES[offset], REST_VALUES[offset + 1], REST_VALUES[offset + 2]);
  if (quaternion) readQuaternion(REST_VALUES, offset, quaternion);
  return true;
}

export function sampleMesh2MotionSource(actionId, progress, output = null) {
  const clip = getSourceClip(actionId);
  const count = clip.samples.length;
  const cursor = THREE.MathUtils.clamp(progress, 0, 1) * Math.max(0, count - 1);
  const indexA = Math.floor(cursor);
  const indexB = Math.min(count - 1, indexA + 1);
  const mix = cursor - indexA;
  const frameA = clip.samples[indexA];
  const frameB = clip.samples[indexB];
  const values = output?.values?.length === frameA.length
    ? output.values
    : new Float32Array(frameA.length);

  for (let boneIndex = 0; boneIndex < SOURCE_BONE_ORDER.length; boneIndex++) {
    const offset = boneIndex * SOURCE_BONE_STRIDE;
    values[offset] = THREE.MathUtils.lerp(frameA[offset], frameB[offset], mix);
    values[offset + 1] = THREE.MathUtils.lerp(frameA[offset + 1], frameB[offset + 1], mix);
    values[offset + 2] = THREE.MathUtils.lerp(frameA[offset + 2], frameB[offset + 2], mix);

    let bw = frameB[offset + 3];
    let bx = frameB[offset + 4];
    let by = frameB[offset + 5];
    let bz = frameB[offset + 6];
    const dot = frameA[offset + 3] * bw
      + frameA[offset + 4] * bx
      + frameA[offset + 5] * by
      + frameA[offset + 6] * bz;
    if (dot < 0) {
      bw = -bw;
      bx = -bx;
      by = -by;
      bz = -bz;
    }
    const aw = frameA[offset + 3];
    const ax = frameA[offset + 4];
    const ay = frameA[offset + 5];
    const az = frameA[offset + 6];
    const qw = THREE.MathUtils.lerp(aw, bw, mix);
    const qx = THREE.MathUtils.lerp(ax, bx, mix);
    const qy = THREE.MathUtils.lerp(ay, by, mix);
    const qz = THREE.MathUtils.lerp(az, bz, mix);
    const qLength = Math.hypot(qw, qx, qy, qz) || 1;
    values[offset + 3] = qw / qLength;
    values[offset + 4] = qx / qLength;
    values[offset + 5] = qy / qLength;
    values[offset + 6] = qz / qLength;
  }

  const sample = output ?? {};
  sample.actionId = clip.id;
  sample.fps = clip.fps;
  sample.frame = clip.frameStart + cursor;
  sample.values = values;
  sample.sourceFrameA = indexA;
  sample.sourceFrameB = indexB;
  sample.mix = mix;
  return sample;
}

export function sourceGroundHeight(sample) {
  let ground = Infinity;
  for (const name of FOOT_BONES) {
    const offset = BONE_OFFSET.get(name);
    ground = Math.min(ground, sample.values[offset + 2]);
  }
  return ground;
}

export function restGroundHeight() {
  let ground = Infinity;
  for (const name of FOOT_BONES) {
    const offset = BONE_OFFSET.get(name);
    ground = Math.min(ground, REST_VALUES[offset + 2]);
  }
  return ground;
}

export const MESH2MOTION_SOURCE_INFO = Object.freeze({
  source: SOURCE_DATA.source,
  clips: SOURCE_DATA.clips.length,
  bones: SOURCE_BONE_ORDER.length,
  sampledFrames: SOURCE_DATA.clips.reduce((sum, clip) => sum + clip.samples.length, 0),
});
