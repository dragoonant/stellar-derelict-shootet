# Stellar Derelict: Bug Front — agent orientation

An original first-person shooter in the Stellar Derelict universe: Wardens against the Molt, with per-part damage.
Credit the owner as **evilgouki**; never write a real name, email or home path anywhere in this repo.

- **This is an original game.** Its inspiration is the bug-war film genre, but no names, characters, creature or ship
  designs, or text from any film or published game go in. Castes, squad and ships are our own.
- **Read first:** `README.md` (state, castes, commands), then `HANDOFF-GPU.md` if the task is about models.
- **Layering:** `src/sim` (pure rules and data: castes, damage, waves, save) ← `src/game` (three.js, input, audio,
  HUD) ← `src/main.ts` (screens). The HUD does no rules maths: every shown number comes from `src/sim`.
- **A bug is a set of parts.** `CASTES` lists part ids; a rig (`src/game/bugRig.ts`) has one Object3D per part id;
  `applyDamage` decides what comes off; `abilities` decides what the bug can still do. Change behaviour there, with a
  unit test, not in the steering code.
- **Owner decisions (2026-11-14, do not re-ask):** bugs wait for generated segmented models, stand-ins until then;
  planet surface; wave survival; AI squadmates; desktop and phone; castes Reaver, Lobber, Skirr, Bulwark, Augur;
  blood on marines as well as ichor on bugs; deploy to GitHub Pages from `main`.
- **Standing rules** live in the Stellar Derelict repo's knowledge base (`docs/knowledge-base/rules.md`). The ones
  already built in here: save and Continue (22), no long-press selection (24), models loaded before the start
  button enables (26), audio "not verified by ear" until the owner listens (9), own look per game (21: the Warden
  Service field bulletin, olive and signal yellow).

## Gates before every push

`npm run typecheck`, `npm test`, `npm run e2e`, `npm run build`.

## Cloud-session notes

- Playwright is pinned to 1.63.0 to match the container's Chromium in `/opt/pw-browsers`; never run `playwright install` here.
- `window.__bf` is the game object: tests and `tools/*.mjs` drive it (`spawn`, `aimAt`, `fire(false)`, `explode`, `skipToWave`, `god`).
- No GPU in the cloud: new 3D models wait for a GPU PC session. Textures (Flux via the Hugging Face router) and audio
  (ElevenLabs) are generated from the cloud by the scripts in `tools/`; the keys are network secrets the proxy injects
  for `router.huggingface.co` and `api.elevenlabs.io`, so the scripts send a placeholder.
- Owner, 2026-11-16: wants moving models, not static figures, and a real model holding the gun in first person.
