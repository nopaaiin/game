#!/bin/bash
# 치킨 조리 게임 실행기
# 사용법: bash start_game.sh
# 크롬 전체화면(키오스크)으로 열고 카메라 권한과 소리를 자동 허용하므로 클릭이 필요 없습니다.
# 종료: Command + Q

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
PORT=8777

lsof -ti tcp:$PORT | xargs kill 2>/dev/null
python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT
sleep 1

URL="http://127.0.0.1:$PORT/chicken_game.html"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ -x "$CHROME" ]; then
  echo "게임 실행 중: $URL"
  echo "종료: 크롬에서 Command + Q"
  "$CHROME" \
    --user-data-dir="$HOME/.chicken_game_chrome" \
    --kiosk \
    --use-fake-ui-for-media-stream \
    --autoplay-policy=no-user-gesture-required \
    --no-first-run --no-default-browser-check \
    --disable-features=Translate \
    "$URL"
else
  echo "크롬이 없어 기본 브라우저로 엽니다. 처음 한 번은 카메라 허용이 필요할 수 있어요."
  open "$URL"
  echo "종료하려면 이 창에서 Control + C"
  wait $SERVER_PID
fi
