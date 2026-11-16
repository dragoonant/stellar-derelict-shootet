#!/usr/bin/env bash
# Generates the music with the ElevenLabs music API from tools/music.tsv into art/eleven/music/.
# Usage: tools/gen-music.sh [id ...]   (no ids: every track that has no file yet). About 15 credits a second.
set -euo pipefail
cd "$(dirname "$0")/.."
KEY="${ELEVENLABS_API_KEY:-proxy-injected}"
while IFS=$'\t' read -r id ms prompt; do
  [[ -z "$id" || "$id" == \#* ]] && continue
  if [[ $# -gt 0 ]]; then [[ " $* " == *" $id "* ]] || continue; elif [[ -f "art/eleven/music/$id.mp3" ]]; then continue; fi
  body=$(python3 -c 'import json,sys; print(json.dumps({"prompt":sys.argv[1],"music_length_ms":int(sys.argv[2])}))' "$prompt" "$ms")
  code=$(curl -sS -m 400 -o "art/eleven/music/$id.tmp" -w "%{http_code}" "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128" -H "xi-api-key: $KEY" -H "Content-Type: application/json" -d "$body")
  if [[ "$code" == 200 ]]; then mv "art/eleven/music/$id.tmp" "art/eleven/music/$id.mp3"; echo "$id ok"; else echo "$id HTTP $code $(head -c 300 "art/eleven/music/$id.tmp")"; rm -f "art/eleven/music/$id.tmp"; fi
done < tools/music.tsv
