#!/usr/bin/env bash
# Generates sound effects with the ElevenLabs sound-generation API from tools/sfx.tsv into art/eleven/sfx/.
# Needs an ElevenLabs key: in a cloud session the proxy injects it; elsewhere export ELEVENLABS_API_KEY.
# Usage: tools/gen-sfx.sh [id ...]   (no ids: every entry that has no file yet)
set -euo pipefail
cd "$(dirname "$0")/.."
KEY="${ELEVENLABS_API_KEY:-proxy-injected}"
while IFS=$'\t' read -r id secs infl prompt; do
  [[ -z "$id" || "$id" == \#* ]] && continue
  if [[ $# -gt 0 ]]; then [[ " $* " == *" $id "* ]] || continue; elif [[ -f "art/eleven/sfx/$id.mp3" ]]; then continue; fi
  body=$(python3 -c 'import json,sys; print(json.dumps({"text":sys.argv[1],"duration_seconds":float(sys.argv[2]),"prompt_influence":float(sys.argv[3])}))' "$prompt" "$secs" "$infl")
  code=$(curl -sS -m 180 -o "art/eleven/sfx/$id.tmp" -w "%{http_code}" "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128" -H "xi-api-key: $KEY" -H "Content-Type: application/json" -d "$body")
  if [[ "$code" == 200 ]]; then mv "art/eleven/sfx/$id.tmp" "art/eleven/sfx/$id.mp3"; echo "$id ok"; else echo "$id HTTP $code $(head -c 200 "art/eleven/sfx/$id.tmp")"; rm -f "art/eleven/sfx/$id.tmp"; fi
done < tools/sfx.tsv
