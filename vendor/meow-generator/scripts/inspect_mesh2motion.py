"""Inspect Mesh2Motion Blender rigs and actions without modifying source assets."""

import json
import pathlib
import re
import sys

import bpy


def inspect_file(path: pathlib.Path) -> dict:
    bpy.ops.wm.open_mainfile(filepath=str(path))
    armatures = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    actions = []
    for action in bpy.data.actions:
        paths = sorted({curve.data_path for curve in action.fcurves})
        bones = sorted(
            {
                match.group(1)
                for value in paths
                if (match := re.search(r'pose\.bones\["([^"]+)"\]', value))
            }
        )
        keyed = {
            "rotation_quaternion": sum("rotation_quaternion" in value for value in paths),
            "rotation_euler": sum("rotation_euler" in value for value in paths),
            "location": sum("location" in value for value in paths),
            "scale": sum("scale" in value for value in paths),
        }
        actions.append(
            {
                "name": action.name,
                "frame_start": float(action.frame_range[0]),
                "frame_end": float(action.frame_range[1]),
                "fcurves": len(action.fcurves),
                "keyed_channels": keyed,
                "bones": bones,
                "keyframes": sum(
                    len(curve.keyframe_points)
                    for curve in action.fcurves
                ),
            }
        )

    return {
        "file": path.name,
        "fps": bpy.context.scene.render.fps / bpy.context.scene.render.fps_base,
        "libraries": [
            {"name": library.name, "filepath": library.filepath}
            for library in bpy.data.libraries
        ],
        "armatures": [
            {
                "name": armature.name,
                "bones": [bone.name for bone in armature.data.bones],
                "pose_bones": [bone.name for bone in armature.pose.bones],
            }
            for armature in armatures
        ],
        "actions": actions,
        "objects": [
            {"name": obj.name, "type": obj.type}
            for obj in bpy.data.objects
        ],
    }


def main() -> None:
    values = sys.argv[sys.argv.index("--") + 1 :]
    output = None
    if values[:1] == ["--output"]:
        output = pathlib.Path(values[1])
        values = values[2:]
    paths = [pathlib.Path(value) for value in values]
    report = [inspect_file(path) for path in paths]
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    if output:
        output.write_text(payload, encoding="utf-8")
        print(f"MESH2MOTION_REPORT_WRITTEN={output}")
    else:
        print("MESH2MOTION_REPORT_BEGIN")
        print(payload)
        print("MESH2MOTION_REPORT_END")


if __name__ == "__main__":
    main()
