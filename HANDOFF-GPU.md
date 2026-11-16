# Handoff for a GPU session: segmented Molt models

## Start prompt (paste into a Claude Code session on EVILAEGIS, in a checkout of this repo)

> Read `CLAUDE.md`, `README.md` and `HANDOFF-GPU.md` here. Then read the knowledge base in the Stellar Derelict repo
> (`docs/knowledge-base/`): `local-ai-studios.md`, `gotchas.md`, and `rules.md` rules 7, 9, 10, 13, 15, 17, 23 and 26.
> Announce GPU work before starting, run one GPU job at a time, and stop the studios when done.
>
> Build the real models for Bug Front with Flux Studio (concepts) and Hunyuan (3D), in this order, pushing to `main`
> after each stage with screenshots from `node tools/closeup.mjs`:
>
> 1. **Reaver first, end to end, as the proof.** Concept in the Molt look, then a GLB that meets the part contract
>    in this file (one named node per part id, origins at the joints). Try generating the parts separately and
>    assembling them before trying to cut a fused mesh. Wire it in through `src/data/bugModels.json` and check in
>    the game that each part can be shot off. Send me the contact sheet and a screenshot before doing the rest.
> 2. **Lobber, Skirr, Bulwark, Augur** the same way.
> 3. **A first-person arms-and-weapon model** for the Repeater, then the Scattergun, to replace
>    `src/game/viewModel.ts`: two armoured forearms and gauntlets in the Warden livery gripping the weapon, seen
>    from the wearer's eyes. Keep the muzzle point and the Scattergun's moving pump.
> 4. **Wardens that animate better than the current puppet** (`src/game/wardenRig.ts` swings legs and leans the
>    torso on the fused figure). Fused Hunyuan meshes have not rigged well before (rule 15), so the likely route is
>    a Warden built from separate parts (torso, head, two arms with the weapon, two legs) animated as rigid
>    pieces. This needs a loader and animation code as well as models; propose the approach before building it.
> 5. **Listen to the audio in the game** and list what needs a re-roll (`tools/gen-sfx.sh <id>`, then
>    `tools/pack-audio.sh`). It was generated and levelled by script and nobody has heard it.
>
> Run the gates before every push: `npm run typecheck`, `npm test`, `npm run e2e`, `npm run build`. Update
> `README.md` and this file as each stage lands.

The cloud sessions that built the game could not reach the GPU PC, so nothing in this file has been run against the
real studios.

The shooter needs bugs whose parts are **separate meshes**, because each part is hit, read out and torn off on its
own. The fused single-mesh figures the Stellar Derelict pipeline makes (Hunyuan shape, paint, optimise) cannot be used
as they are: there is no claw to remove. Until models that meet this contract exist, the game draws stand-in rigs.

## The contract (one GLB per caste)

- **One node per part id**, named exactly as below. Everything under a node is that part: it is what a shot at it
  hits and what flies off when it is severed. Extra nodes are ignored.
- **Each part node's origin is at its joint** (where it meets the body), because the game animates a part by rotating
  its node and throws it from there. `core` has its origin at the model origin.
- **Axes:** the bug faces +z, +y is up, the model origin is on the ground under the body. Units are metres.
- Optional node **`muzzle`**: where bile leaves from (Lobber: tail bulb; Bulwark: head nozzle).
- Meshopt and WebP are fine (the loader has the decoder). Aim for the sizes below; `scale` in the manifest corrects it.
- Armour plates must sit outside the body they cover: a bullet is stopped by whatever mesh it reaches first.

| Caste | File | Part node names | Size |
|---|---|---|---|
| Reaver | `bug-reaver.glb` | `core`, `head`, `claw-l`, `claw-r`, `leg-fl`, `leg-fr`, `leg-hl`, `leg-hr` | about 2.4 m tall with scythes raised, 3 m long |
| Lobber | `bug-lobber.glb` | `core`, `head`, `tail`, `leg-fl`, `leg-fr`, `leg-hl`, `leg-hr` | body 1.5 m tall, tail arching to 3 m |
| Skirr | `bug-skirr.glb` | `core`, `head`, `wing-l`, `wing-r`, `claw-l`, `claw-r`, `tail` | 5.5 m wingspan, 2.5 m long; origin 0.6 m under the body |
| Bulwark | `bug-bulwark.glb` | `core`, `head`, `plate-fl`, `plate-fr`, `plate-hl`, `plate-hr`, `leg-fl`, `leg-fr`, `leg-ml`, `leg-mr`, `leg-hl`, `leg-hr` | 3.4 m tall, 5 m long |
| Augur | `bug-augur.glb` | `core`, `head` (the cranium), `plate-l`, `plate-r` (brow plates in front of it), `feeler-l`, `feeler-r`, `claw-c` (proboscis), `leg-fl`, `leg-fr`, `leg-ml`, `leg-mr`, `leg-hl`, `leg-hr` | 4.5 m tall, 8 m long |

Left is the bug's own left (+x). The ids are the ones in `src/sim/castes.ts`; if a caste's parts change there, change
this table.

## Ways to get there (owner's choice)

1. **Generate, then cut.** Make the whole creature as now, then split it in Blender along the joints (bisect, fill
   the cut faces with an ichor-coloured cap), name the pieces, set each origin to its joint, export GLB. Cut **before**
   painting if possible: a painted Hunyuan mesh is a triangle soup and does not simplify (KB gotcha, 2026-11-13).
2. **Generate the parts separately** (a scythe, a leg, a head, a body) in the same style and assemble them in Blender
   under named nodes. Slower, cleaner stumps, and one leg model serves every leg.

Look: the Molt as in Stellar Derelict's stalkers (dark red-black new chitin under flaking pale old shell), scaled up
for an open field. Ichor in the game is acid green (`#b6ff3a`).

## Wiring a model in

1. Put the file in `public/assets/models/`.
2. In `src/data/bugModels.json` set that caste to `{ "file": "bug-reaver.glb", "scale": 1 }`.
3. `npm run dev`. The title's loading line counts it; if a part node is missing the console names it and the game
   keeps the stand-in for that caste. `node tools/closeup.mjs <dir>` takes a close-up of every caste.
4. `tests/unit/rig.test.ts` shows the contract in code.

## Also for a GPU session

- **Rigged, animated Wardens.** The squad figures are fused miniatures skinned by position in `src/game/wardenRig.ts`
  (legs and torso only). A figure with a real skeleton and walk, fire and death clips would replace the puppet.
- **A first-person arms-and-weapon model** for the Repeater and the Scattergun; `src/game/viewModel.ts` builds them
  from primitives now.
- **Sound by ear** (KB rule 9): everything was generated with ElevenLabs from text prompts and levelled by script;
  nobody has listened to it in the game yet. Re-roll one id with `tools/gen-sfx.sh <id>` after deleting nothing: a
  named id is regenerated in place; then `tools/pack-audio.sh`.
