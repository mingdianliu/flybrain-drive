# Scene asset attribution

## NeuroMechFly morphology

Body-segment STL meshes: NeLy-EPFL / FlyGym, commit 38c8ec61034cd59bc5ba0de20688d4a3c0000d60, Apache-2.0 (full license in FLY-LICENSE.txt).
https://github.com/NeLy-EPFL/flygym

Rigging and neutral-pose metadata: NeLy-EPFL / fly-svg-maker, assets/model.json; exact revision and SHA-256 recorded in source-manifest.json. Derived from NeuroMechFly under Apache-2.0; original notice retained in FLY-NOTICE.txt.
https://github.com/NeLy-EPFL/fly-svg-maker

References: Lobato-Rios et al. (2022), NeuroMechFly, Nature Methods; Wang-Chen et al. (2024), NeuroMechFly v2, Nature Methods, https://doi.org/10.1038/s41592-024-02497-y.

Modifications: smoothed vertex normals, mirrored right-side segments as prescribed by upstream metadata, display materials, display scale, seated pose, and visual front-leg inverse kinematics. This morphology derives from a female fly; it is not a subject-matched reconstruction of the male MaleCNS brain. No NeuroMechFly biomechanical or muscle solver is being run here.

## Vehicle, pedestrian, environment and loaders

Bundled from the Three.js r180 example distribution. The repository's MIT license is retained in ../vendor/THREE-LICENSE.txt. Original example credits:

- Ferrari 458 Italia model by vicent091036: https://sketchfab.com/models/57bf6cc56931426e87494f554df1dab6 ; distributed example: https://github.com/mrdoob/three.js/blob/r180/examples/webgl_materials_car.html . Modified display materials and instrument display. The model's original steering-wheel assembly is articulated; foreleg grip targets are vertices on its original rim.
- Venice Sunset HDR environment: bundled with Three.js r180, original https://polyhaven.com/a/venice_sunset (CC0).
- GLTFLoader, DRACOLoader, HDRLoader/RGBELoader, STLLoader, BufferGeometryUtils, SkeletonUtils and bundled Draco decoder: from the same Three.js r180 distribution. Draco upstream: https://github.com/google/draco (Apache-2.0).

Downloaded asset URLs and SHA-256 hashes are recorded in source-manifest.json. City layout, signals, traffic rules, streets, facades and street furniture are project code. MaleCNS graph data has a separate CC BY 4.0 license; see ../model-notes.html.

## Civilian pedestrians — Quaternius (CC0)

Four original characters with authored Idle and Walk skeletal animations:

- Casual and Formal, Ultimate Modular Women: https://quaternius.com/packs/ultimatemodularwomen.html
- Casual_2 and Casual_Hoodie, Ultimate Modular Men: https://quaternius.com/packs/ultimatemodularcharacters.html

Downloaded from the author's linked public folders. Verbatim license: pedestrians/QUATERNIUS-LICENSE.txt (upstream file is headed “Ultimate Modular Males” in both packs). Both pack pages identify the assets as CC0. Exact source URLs, upstream hashes and packaged hashes: pedestrians/source-manifest.json.

Modifications: packaged embedded glTF as GLB; retained mesh, rig, Idle and Walk; removed unused animation data. Scene instances have varied height, path placement, correctly aligned +Z facing, and walk/idle blending. No generated human geometry or facial textures.

Reproduce these four assets: python3 scripts/fetch-pedestrian-assets.py.
