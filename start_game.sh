#!/bin/bash
# TV3 only. Operator launches once; visitors never click or touch.
set -euo pipefail
GAME_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$GAME_DIR"
PORT="${GAME_PORT:-8777}"
CAMERA="${GAME_CAMERA:-0}"
CHROME="${CHROME_BIN:-}"
for candidate in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "/Applications/Chromium.app/Contents/MacOS/Chromium" "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"; do
  if [ -z "$CHROME" ] && [ -x "$candidate" ]; then CHROME="$candidate"; fi
done
if [ -z "$CHROME" ] || [ ! -x "$CHROME" ]; then
  echo "전시 실행에는 Chrome 또는 Edge가 필요합니다. 설치 후 다시 실행해 주세요."
  echo "다른 설치 경로: CHROME_BIN='/브라우저/실행파일' bash start_game.sh"
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "로컬 게임 서버용 Python 3가 필요합니다."; exit 1
fi
if ! [[ "$PORT" =~ ^[0-9]+$ && "$CAMERA" =~ ^[0-9]+$ ]]; then
  echo "GAME_PORT와 GAME_CAMERA에는 숫자를 넣어 주세요."; exit 1
fi
SERVER_PID=""
cleanup(){ if [ -n "$SERVER_PID" ]; then kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; fi; }
trap cleanup EXIT
# A busy port is never killed; only this launcher's own server is stopped on exit.
python3 exhibition_server.py "$PORT" &
SERVER_PID=$!
READY=0
for attempt in {1..30}; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "서버를 열지 못했습니다. 다른 게임이 켜져 있다면 닫거나 GAME_PORT를 바꿔 주세요."; exit 1
  fi
  if python3 - "$PORT" <<'PY'
import sys, urllib.request
try:
    with urllib.request.urlopen('http://127.0.0.1:'+sys.argv[1]+'/__exhibition_health',timeout=.2) as r:
        sys.exit(0 if r.read()==b'chicken-pixel-tv3' else 1)
except Exception:
    sys.exit(1)
PY
  then READY=1; break; fi
  sleep .1
done
if [ "$READY" != 1 ]; then echo "서버 시작 시간을 초과했습니다."; exit 1; fi
URL="http://127.0.0.1:$PORT/chicken_game.html?display=tv3&camera=$CAMERA"
echo "3번 TV 전용 · 종료: Command + Q"
echo "운영자: 첫 설치 시 macOS 카메라 접근을 허용하고 TV를 세로 방향으로 설정해 주세요."
"$CHROME" \
  --user-data-dir="$GAME_DIR/.kiosk-profile-tv3" \
  --kiosk --app="$URL" \
  --use-fake-ui-for-media-stream \
  --autoplay-policy=no-user-gesture-required \
  --no-first-run --no-default-browser-check \
  --disable-features=Translate
