#!/usr/bin/env bash
# Generates squad and comms voice lines with ElevenLabs text-to-speech from tools/voice.tsv into art/eleven/voice/.
# The voice ids are the "Stellar Derelict ..." designed voices on the owner's ElevenLabs account.
# Usage: tools/gen-voice.sh [id ...]   (no ids: every line that has no file yet)
set -euo pipefail
cd "$(dirname "$0")/.."
KEY="${ELEVENLABS_API_KEY:-proxy-injected}"
declare -A VOICE=( [venn]=OgtzKBp1vkxno913pKKz [brandt]=MnUww8gvYDIK07LZOpF8 [okafor]=be8rIXK1kZq8Wl6AyWxY [riedel]=IcjC7ajPLTbTt8goPK3f [sato]=OzdWuUzuDhbiyUzlFXP1 [comms]=5p4E1QCcFH5jMGiv8x5V )
while IFS=$'\t' read -r id text; do
  [[ -z "$id" || "$id" == \#* ]] && continue
  if [[ $# -gt 0 ]]; then [[ " $* " == *" $id "* ]] || continue; elif [[ -f "art/eleven/voice/$id.mp3" ]]; then continue; fi
  who="${id%%-*}"
  body=$(python3 -c 'import json,sys; print(json.dumps({"text":sys.argv[1],"model_id":"eleven_turbo_v2_5","voice_settings":{"stability":0.4,"similarity_boost":0.8,"style":0.35}}))' "$text")
  code=$(curl -sS -m 120 -o "art/eleven/voice/$id.tmp" -w "%{http_code}" "https://api.elevenlabs.io/v1/text-to-speech/${VOICE[$who]}?output_format=mp3_44100_128" -H "xi-api-key: $KEY" -H "Content-Type: application/json" -d "$body")
  if [[ "$code" == 200 ]]; then mv "art/eleven/voice/$id.tmp" "art/eleven/voice/$id.mp3"; echo "$id ok"; else echo "$id HTTP $code $(head -c 200 "art/eleven/voice/$id.tmp")"; rm -f "art/eleven/voice/$id.tmp"; fi
done < tools/voice.tsv
