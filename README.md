# Stellar Derelict: Bug Front

An original first-person shooter for the browser, set in the Stellar Derelict universe: you are a Warden holding
Outpost Kessel with your squad while the Molt swarm comes up out of the ground. The point of the game is that the Molt
come apart where you shoot them: scythes, legs, wings, tails, armour plates and heads are separate targets, each with
its own hit points, and a bug fights differently with every part it loses.

An original game by evilgouki. Unofficial, non-commercial, no publisher's names, designs or art.

## Play

`npm install`, then `npm run dev`. Six waves, then a run to the landing pad for the lifter.

| | Keyboard and mouse | Phone or tablet (landscape) |
|---|---|---|
| Move | WASD, Shift sprints, Space jumps | left thumb stick (push far to sprint), JUMP |
| Aim | mouse | drag on the right; FIRE also aims while held |
| Fire | left button | FIRE |
| Grenade | right button or G | NADE |
| Reload, change weapon | R; Q, wheel, 1, 2 | RELOAD, SWAP |
| Pause, mute | P or Esc; M | II |

The suit reseals itself to 60 after five quiet seconds, and every cleared wave patches suits and refills ammunition.
The game saves at the start of every wave; **Continue** on the title returns to the start of that wave with the squad,
suit, ammunition and score as they stood.

## The Molt

| Caste | What comes off | What that does |
|---|---|---|
| Reaver | 2 scythes, 4 legs, head | fewer scythes hit softer, none leaves a weak bite; each leg slows it, one leg is a crawl; headless it thrashes blind for 4 s and dies |
| Lobber | bile tail, 4 legs, head | no tail, nothing to throw: it has to walk in and bite |
| Skirr | 2 wings, 2 talons, stinger, head | one wing off and it falls out of the sky and crawls |
| Bulwark | 4 armour plates, spray head, 6 legs | plates shield the body from bullets and soak 70% of a blast; no head, no spray |
| Augur | 2 brow plates, cranium, 2 feelers, proboscis, 6 legs | feelers off ends the swarm's speed link; the cranium behind the brow plates kills it, and the swarm dies with it |

All of it is data in `src/sim/castes.ts` and rules in `src/sim/damage.ts`.

## State (2026-11-16, art and sound pass)

- Playable start to finish: title, three difficulties, six waves, extraction, win and loss screens, save and Continue.
- **Squad:** the five Warden figures from Stellar Derelict, skinned in code (`src/game/wardenRig.ts`) so they walk,
  lean into the aim and move along the wall to face the threat, and run for the lifter. It is a puppet (legs and
  torso), not a full character rig.
- **First person:** armoured arms on the Repeater and the Scattergun, modelled in code (`src/game/viewModel.ts`).
- **Textures and title poster:** FLUX.1 schnell through the Hugging Face router (`tools/gen-textures.sh`,
  prompts in `tools/textures.tsv`, originals in `art/flux/`).
- **Sound:** 31 effects, 27 voice lines (the Stellar Derelict voices on the owner's ElevenLabs account) and 6 music
  tracks from ElevenLabs (`tools/gen-sfx.sh`, `gen-voice.sh`, `gen-music.sh`; originals in `art/eleven/`; levelled by
  `tools/pack-audio.sh`). **Not verified by ear.**
- **The Molt are still stand-in rigs built from primitives**, now textured. Generated, segmented models need a GPU
  session (`HANDOFF-GPU.md`, `src/data/bugModels.json`); no hosted image-to-3D service was reachable from the cloud.
- Not built yet: more maps, a mission with objectives, weapon pickups, squad orders.

## Commands

| Command | What |
|---|---|
| `npm run dev` | Dev server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests (sim rules, save, rigs) |
| `npm run e2e` | Playwright against a production build (port `PW_PORT`, default 5361) |
| `npm run build` | Production build in `dist/` |
| `tools/gen-textures.sh`, `tools/pack-textures.py` | Flux textures: generate, then size into `public/assets/tex/` |
| `tools/gen-sfx.sh`, `gen-voice.sh`, `gen-music.sh`, `pack-audio.sh` | ElevenLabs audio: generate, then level into `public/assets/audio/` |
| `node tools/bot.mjs [recruit\|regular\|veteran] [url]` | A bot plays a whole deployment through the page and logs it |
| `node tools/closeup.mjs <out dir> [url]` | Close-up screenshots of each caste's rig |

Deploy: a push to `main` runs the gates and force-pushes `dist/` to the `gh-pages` branch
(`.github/workflows/deploy.yml`). GitHub Pages must be set to serve the `gh-pages` branch.
