#!/bin/bash
# Makes a synthetic two-voice test meeting with macOS `say`. Invented people, invented lines.
# usage: make-test-meeting.sh OUT_DIR   -> OUT_DIR/test-meeting.wav and OUT_DIR/taps.json
# Voices: Karen (Chair) and Daniel (Tom). Keep OUT_DIR outside the repo; delete it after the check.
set -euo pipefail
OUT="${1:?usage: make-test-meeting.sh OUT_DIR}"
FF="${FFMPEG:-/opt/homebrew/bin/ffmpeg}"
FP="${FFPROBE:-/opt/homebrew/bin/ffprobe}"
mkdir -p "$OUT"; chmod 700 "$OUT"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

LINES=(
"Chair|Karen|Okay, let's get started. First item is the Year 11 assessment schedule for next term."
"Tom|Daniel|Thanks. I have drafted the timeline, and the main change is moving the essay task to week six."
"Chair|Karen|Week six clashes with the excursion. Could we push it to week seven instead?"
"Tom|Daniel|Yes, week seven works. I will update the draft and send it round by Friday."
"Chair|Karen|Good. Second item, the marking roster for the trial exams."
"Tom|Daniel|I can take the second half of the creative responses, but I will need the marking guidelines early."
"Chair|Karen|I will circulate the guidelines on Monday."
"Tom|Daniel|Great, thank you. That settles it."
"Chair|Karen|Right, decision then. The essay task moves to week seven, and Tom marks the second half of the responses."
"Tom|Daniel|Agreed. Nothing else from me."
)
# silence gap of 0.6 s
"$FF" -loglevel error -y -f lavfi -i anullsrc=r=16000:cl=mono -t 0.6 -c:a pcm_s16le "$WORK/gap.wav"
: > "$WORK/list.txt"
echo "[" > "$OUT/taps.json"
T=0; N=0; FIRST=1
for L in "${LINES[@]}"; do
  IFS='|' read -r WHO VOICE TEXT <<<"$L"
  say -v "$VOICE" -o "$WORK/$N.aiff" "$TEXT"
  "$FF" -loglevel error -y -i "$WORK/$N.aiff" -ac 1 -ar 16000 -c:a pcm_s16le "$WORK/$N.wav"
  D=$("$FP" -v error -show_entries format=duration -of csv=p=0 "$WORK/$N.wav")
  # a tap one second into each turn, as a person tapping a little late
  MS=$(awk -v t="$T" 'BEGIN{printf "%d", (t+1.0)*1000}')
  REF=$([ "$WHO" = "Chair" ] && echo me || echo "shared:person:invented-tom")
  [ $FIRST -eq 0 ] && echo "," >> "$OUT/taps.json"
  printf '{"who":"%s","at_ms":%s}' "$REF" "$MS" >> "$OUT/taps.json"; FIRST=0
  printf "file '%s'\nfile '%s'\n" "$WORK/$N.wav" "$WORK/gap.wav" >> "$WORK/list.txt"
  T=$(awk -v t="$T" -v d="$D" 'BEGIN{print t+d+0.6}')
  N=$((N+1))
done
echo "]" >> "$OUT/taps.json"
"$FF" -loglevel error -y -f concat -safe 0 -i "$WORK/list.txt" -c:a pcm_s16le "$OUT/test-meeting.wav"
chmod 600 "$OUT"/*
echo "Made $OUT/test-meeting.wav (${T}s) and $OUT/taps.json"
