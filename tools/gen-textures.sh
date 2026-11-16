#!/usr/bin/env bash
# Generates the game's textures with FLUX.1 schnell through the Hugging Face router (provider fal-ai).
# Needs a Hugging Face token: in a cloud session the proxy injects it; elsewhere export HF_TOKEN.
# Originals go to art/flux/ (kept out of the build); `tools/pack-textures.py` writes the sized JPGs the game loads.
# Usage: tools/gen-textures.sh [name ...]   (no names: every entry in tools/textures.tsv that has no original yet)
set -euo pipefail
cd "$(dirname "$0")/.."
TOKEN="${HF_TOKEN:-hf_proxyinjected}"
while IFS=$'\t' read -r name w h seed prompt; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  if [[ $# -gt 0 ]]; then [[ " $* " == *" $name "* ]] || continue; elif [[ -f "art/flux/$name.jpg" ]]; then continue; fi
  body=$(python3 -c 'import json,sys; print(json.dumps({"prompt":sys.argv[1],"image_size":{"width":int(sys.argv[2]),"height":int(sys.argv[3])},"num_inference_steps":4,"seed":int(sys.argv[4])}))' "$prompt" "$w" "$h" "$seed")
  url=$(curl -sS -m 180 https://router.huggingface.co/fal-ai/fal-ai/flux/schnell -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$body" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["images"][0]["url"] if "images" in d else "ERR "+json.dumps(d)[:200])')
  if [[ "$url" == ERR* ]]; then echo "$name: $url"; continue; fi
  curl -sS -m 120 -o "art/flux/$name.jpg" "$url" && echo "$name: ok"
done < tools/textures.tsv
