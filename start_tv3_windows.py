"""Windows TV3 launcher. Requires Python 3 and Edge or Chrome; stdlib only."""
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import os
import shutil
import subprocess
import sys
import time

from exhibition_server import Handler

ROOT = Path(__file__).resolve().parent


def numeric_setting(name, default, minimum, maximum):
    value = os.environ.get(name, str(default))
    if not value.isascii() or not value.isdecimal() or not minimum <= int(value) <= maximum:
        raise ValueError(f'{name}: {minimum}~{maximum} 사이의 숫자를 입력해 주세요.')
    return int(value)


def find_browser(env=None):
    env = os.environ if env is None else env
    override = env.get('CHROME_BIN')
    if override:
        candidate = Path(override)
        if not candidate.is_file():
            raise FileNotFoundError('CHROME_BIN에 지정한 브라우저 파일을 찾지 못했습니다.')
        return candidate
    for key in ('ProgramFiles(x86)', 'ProgramFiles', 'LOCALAPPDATA'):
        folder = env.get(key)
        if not folder:
            continue
        for relative in ('Microsoft/Edge/Application/msedge.exe', 'Google/Chrome/Application/chrome.exe'):
            candidate = Path(folder) / relative
            if candidate.is_file():
                return candidate
    for name in ('msedge', 'chrome'):
        found = shutil.which(name)
        if found:
            return Path(found)
    raise FileNotFoundError('Microsoft Edge 또는 Google Chrome을 설치한 뒤 다시 실행해 주세요.')


def browser_command(browser, url, profile):
    command = [str(browser), f'--user-data-dir={profile}', '--kiosk']
    if browser.name.lower() == 'msedge.exe':
        command += [url, '--edge-kiosk-type=fullscreen']
    else:
        command += [f'--app={url}']
    return command + [
        '--use-fake-ui-for-media-stream',  # Actual camera; no visitor permission click.
        '--autoplay-policy=no-user-gesture-required',
        '--no-first-run', '--no-default-browser-check', '--disable-features=Translate',
    ]


STARTUP_GRACE = 90   # 모델 로딩·카메라 권한까지 기다리는 시간(초)
HEARTBEAT_LIMIT = 45  # 이 시간 동안 게임 화면이 살아 있다는 신호가 없으면 다시 연다


def restart_reason(exit_code, started, last_heartbeat, now):
    """Why the kiosk browser should be reopened, or None."""
    if exit_code is not None and exit_code != 0:
        return f'브라우저가 비정상 종료되었습니다 (코드 {exit_code}).'
    if now - started < STARTUP_GRACE:
        return None
    if last_heartbeat is None or now - last_heartbeat > HEARTBEAT_LIMIT:
        return '게임 화면이 응답하지 않습니다.'
    return None


def stop_process(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()


def main():
    if sys.platform != 'win32':
        print('Windows용 실행기입니다. macOS에서는 start_tv3.command를 열어 주세요.')
        return 1
    server = worker = process = None
    try:
        port = numeric_setting('GAME_PORT', 8777, 1024, 65535)
        camera = numeric_setting('GAME_CAMERA', 0, 0, 99)
        browser = find_browser()
        server = ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, directory=str(ROOT)))
        worker = Thread(target=server.serve_forever, daemon=True)
        worker.start()
        # The default browser layout preserves the arch; only this installation launcher
        # requests the calibrated physical TV layout, matching the macOS launcher.
        url = f'http://127.0.0.1:{port}/chicken_game.html?display=tv3&camera={camera}'
        print('OVEN SAUNA · 3번 TV 게임 시작')
        print('TV를 세로 방향으로 설정해 주세요. 종료: Alt + F4')
        print('첫 실행 때는 Windows 설정에서 카메라 사용을 허용해 주세요.')
        command = browser_command(browser, url, ROOT / '.kiosk-profile-tv3-windows')
        server.last_heartbeat = None
        process = subprocess.Popen(command)
        started = time.monotonic()
        while True:
            code = process.poll()
            if code == 0:
                return 0  # Alt + F4: the operator closed the game on purpose.
            reason = restart_reason(code, started, server.last_heartbeat, time.monotonic())
            if reason:
                print(f'{reason} 게임을 다시 엽니다.')
                stop_process(process)
                time.sleep(3)
                server.last_heartbeat = None
                process = subprocess.Popen(command)
                started = time.monotonic()
            time.sleep(2)
    except KeyboardInterrupt:
        return 0
    except OSError as error:
        if getattr(error, 'winerror', None) == 10048:
            print('이미 게임이 실행 중이거나 포트가 사용 중입니다. 실행 중인 게임을 먼저 닫아 주세요.')
        else:
            print(f'실행하지 못했습니다: {error}')
        return 1
    except (ValueError, RuntimeError) as error:
        print(error)
        return 1
    finally:
        # Only shut down this launcher's own browser and local server.
        if process is not None and process.poll() is None:
            process.terminate()
        if server is not None:
            if worker is not None:
                server.shutdown()
                worker.join(timeout=2)
            server.server_close()


if __name__ == '__main__':
    sys.exit(main())
