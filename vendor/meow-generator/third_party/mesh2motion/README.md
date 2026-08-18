# Mesh2Motion source notice

The motion timing and rig responsibilities used by `src/mesh2motionRig.js` were
derived from the Mesh2Motion fox/cat assets:

- <https://mesh2motion.org/>
- <https://github.com/Mesh2Motion/mesh2motion-assets/blob/main/rig-variations/fox-cat.blend>
- <https://github.com/Mesh2Motion/mesh2motion-assets/tree/main/rigs/fox>

The upstream asset repository is released under CC0 1.0:
<https://github.com/Mesh2Motion/mesh2motion-assets/blob/main/LICENSE>.

No upstream mesh, texture, or `.blend` binary is bundled in this repository.
`src/mesh2motionClips.json` contains only the compact positions and
quaternions of 19 semantic bones sampled from all 555 source frames. They are
generated reproducibly with `scripts/extract_mesh2motion_clips.py`; the
application combines that CC0 motion data with an original procedural
surface-retargeting implementation.
