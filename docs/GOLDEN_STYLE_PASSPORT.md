# Golden Style Passport — 港都 MINATO CITY (Intersection A-3)

Status: target specification (`candidate` assets require owner approval before golden promotion).
Adapted from Stage-Gate v2 (`AI_STUDIO_PIPELINE_MASTER`) for Three.js + TypeScript production.

| Axis | Target | Reject |
|---|---|---|
| 1. Geometry | Deep Rock Galactic: expressive large chamfered masses, lofted anatomical/architectural silhouettes, beveled frames & pilasters | Raw box/cylinder/sphere primitives as final art; toy/voxel/Roblox massing |
| 2. Anatomy / proportions | Team Fortress 2: adult 7.5–8 head proportions, distinct class/enemy silhouettes, grounded weight & articulated limbs | Stick figures, spherical balloon heads, childlike Brawl Stars/Roblox proportions |
| 3. Materials | TF2 tonal value grouping + selective Borderlands 2 weathering, matte non-plastic surfaces, macro plaster/concrete breakup | Plastic gloss, uniform sterile flat fills, noisy high-frequency procedural static |
| 4. Color | Distinct local material colors, warm/cool hierarchy; fully readable without post-processing | Monochrome blue-violet night wash, arbitrary rainbow neon |
| 5. Contour | Selective graphic crease/edge accents on architectural & hero masses, never noisy global ink clutter | Global thick outlines over dense railings/spokes/faces |
| 6. Lighting | Clear primary light, restrained warm pools vs cool shadow fill, readable in BOTH Neutral Daylight (`day`) and Restrained Noir Night (`night`) | Bloom hiding geometry, black crush, flattering-only dark renders |
| 7. Camera | Unobstructed tactical 3/4 gameplay frame + honest close inspection in both Day and Night | Only studio renders or occluded camera angles |
| 8. Motion | Grounded stride, weapon recoil, hit stagger/knockback, vehicle contact & smooth roof cutaways | Floating/hovering actors, prop-into-building clipping, camera/keybind conflicts |
| 9. Sound | Cohesive procedural weapon/impact/shutter/ambient cues without harsh clipping | Generic repeated beeps or silent actions |
| 10. Technology | Synty-like production economy & visual clarity (not Synty aesthetics); strict automated geometry, AABB overlap & grounding audits | Unmeasured bloat, console errors/warnings, broken software-WebGL pacing |
| 11. Variations | Alternate retro-1980s Japanese port city (Minato A-3): Café, Records Shop, Arcade, Sakura Courtyard, Sunken B1, Elevated Overlook | Random mismatched assets, generic sci-fi cyberpunk |

## Acceptance Rules (Stage-Gate v2)
- Every sculpted 3D asset passes `inspectAssetStrict` (`|minY| <= 0.005m`, 0 degenerate triangles, 0 NaN vertices, 100% UV coverage on textured meshes, within triangle budget).
- Live Intersection A-3 scene passes `auditWorldPlacementAndLighting` (zero sidewalk prop/vehicle AABB intersection with buildings, flush `getTerrainHeightAt` grounding, active night emissives & neutral daylight parity).
- Visual verification inspects real Chromium renders in BOTH **Neutral Daylight (`?mood=day`)** and **Restrained Noir Night (`?mood=night`)**.
- Verified candidate assets are logged in `assets/library/registry.json` (`status: "candidate"` until owner approval).
