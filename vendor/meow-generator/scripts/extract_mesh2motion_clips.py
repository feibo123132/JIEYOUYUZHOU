"""Extract compact semantic motion curves from the CC0 Mesh2Motion fox clips.

The source animation .blend files link their skeleton from rigs/rig-fox.blend.
Pass that local rig file explicitly so Blender can reload the missing library,
evaluate the real pose, and write normalized bone landmarks for the web rig.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector


BONES = {
    "hips": "DRV_Hips.001",
    "spineLow": "DRV_Spine_1.001",
    "spineHigh": "DRV_Spine_4.001",
    "head": "DRV_Head.001",
    "frontLUpper": "DRV_Front_Leg_Upper_L.001",
    "frontLLower": "DRV_Front_Leg_Lower_L.001",
    "frontLFoot": "DRV_Front_Leg_Foot_L.001",
    "frontRUpper": "DRV_Front_Leg_Upper_R.001",
    "frontRLower": "DRV_Front_Leg_Lower_R.001",
    "frontRFoot": "DRV_Front_Leg_Foot_R.001",
    "backLUpper": "DRV_Back_Leg_Upper_L.001",
    "backLLower": "DRV_Back_Leg_Lower_L.001",
    "backLFoot": "DRV_Back_Leg_Foot_L.001",
    "backRUpper": "DRV_Back_Leg_Upper_R.001",
    "backRLower": "DRV_Back_Leg_Lower_R.001",
    "backRFoot": "DRV_Back_Leg_Foot_R.001",
    "tailBase": "DRV_Tail_Base.001",
    "tailMid": "DRV_Tail_Mid.002",
    "tailTip": "DRV_Tail_Tip.001",
}


def rounded(values, digits=5):
    return [round(float(value), digits) for value in values]


def normalized_quaternion(quaternion: Quaternion) -> list[float]:
    value = quaternion.normalized()
    if value.w < 0:
        value = Quaternion((-value.w, -value.x, -value.y, -value.z))
    return rounded((value.w, value.x, value.y, value.z), 6)


def find_action() -> bpy.types.Action:
    actions = [
        action
        for action in bpy.data.actions
        if action.fcurves and not action.name.lower().startswith("rig")
    ]
    if not actions:
        raise RuntimeError("No animated action found")
    return max(actions, key=lambda action: len(action.fcurves))


def reload_rig_library(rig_path: pathlib.Path) -> None:
    for library in bpy.data.libraries:
        library.filepath = str(rig_path)
        library.reload()


def find_armature() -> bpy.types.Object:
    candidates = [
        obj
        for obj in bpy.data.objects
        if obj.type == "ARMATURE" and obj.pose and len(obj.pose.bones) > 0
    ]
    if not candidates:
        raise RuntimeError("The linked fox armature could not be reloaded")
    return max(candidates, key=lambda obj: len(obj.pose.bones))


def pose_sample(armature: bpy.types.Object) -> list[float]:
    sample = []
    armature_inverse = armature.matrix_world.inverted_safe()
    for bone_name in BONES.values():
        bone = armature.pose.bones.get(bone_name)
        if bone is None:
            raise RuntimeError(f"Missing pose bone {bone_name}")
        matrix = armature_inverse @ armature.matrix_world @ bone.matrix
        location, rotation, _scale = matrix.decompose()
        sample.extend(rounded(location, 5))
        sample.extend(normalized_quaternion(rotation))
    return sample


def inspect_clip(path: pathlib.Path, rig_path: pathlib.Path) -> dict:
    bpy.ops.wm.open_mainfile(filepath=str(path))
    reload_rig_library(rig_path)
    action = find_action()
    armature = find_armature()
    if armature.animation_data is None:
        armature.animation_data_create()
    armature.animation_data.action = action

    scene = bpy.context.scene
    start = int(round(action.frame_range[0]))
    end = int(round(action.frame_range[1]))
    samples = []
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        samples.append(pose_sample(armature))

    action_id = re.sub(r"^animation-fox-|\.blend$", "", path.name)
    return {
        "id": action_id,
        "name": action.name,
        "fps": round(scene.render.fps / scene.render.fps_base, 6),
        "frameStart": start,
        "frameEnd": end,
        "samples": samples,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rig", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("clips", nargs="+", type=pathlib.Path)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    args = parser.parse_args(argv)

    payload = {
        "source": "Mesh2Motion/mesh2motion-assets rigs/fox (CC0-1.0)",
        "boneOrder": list(BONES.keys()),
        "stride": 7,
        "clips": [inspect_clip(path, args.rig) for path in args.clips],
    }
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(
        f"MESH2MOTION_CLIPS_WRITTEN={args.output} "
        f"clips={len(payload['clips'])} bytes={args.output.stat().st_size}"
    )


if __name__ == "__main__":
    main()
