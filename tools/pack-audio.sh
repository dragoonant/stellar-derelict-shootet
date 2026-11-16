#!/usr/bin/env bash
# Levels the ElevenLabs originals in art/eleven/ and writes the files the game loads into public/assets/audio/.
# Effects: leading silence trimmed, peak set to -1 dBFS. Voices and music: loudness-normalised to -16 LUFS.
set -euo pipefail
cd "$(dirname "$0")/.."
out=public/assets/audio
mkdir -p $out/sfx $out/voice $out/music
for f in art/eleven/sfx/*.mp3; do
  id=$(basename "$f" .mp3)
  trim="silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.01"
  peak=$(ffmpeg -hide_banner -i "$f" -af "$trim,volumedetect" -f null - 2>&1 | sed -n 's/.*max_volume: \(-\{0,1\}[0-9.]*\) dB.*/\1/p')
  gain=$(python3 -c "print(max(-12, min(20, -1 - float('${peak:-0}'))))")
  ffmpeg -hide_banner -loglevel error -y -i "$f" -af "$trim,volume=${gain}dB" -ac 1 -b:a 96k "$out/sfx/$id.mp3"
done
for f in art/eleven/voice/*.mp3; do
  ffmpeg -hide_banner -loglevel error -y -i "$f" -af "silenceremove=start_periods=1:start_threshold=-50dB,highpass=f=180,lowpass=f=5200,loudnorm=I=-16:TP=-1.5:LRA=11" -ac 1 -b:a 80k "$out/voice/$(basename "$f")"
done
for f in art/eleven/music/*.mp3; do
  ffmpeg -hide_banner -loglevel error -y -i "$f" -af "loudnorm=I=-16:TP=-1.5:LRA=11" -b:a 112k "$out/music/$(basename "$f")"
done
du -sh $out/sfx $out/voice $out/music
