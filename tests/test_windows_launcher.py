"""Portable launcher checks. Native Windows camera/kiosk QA still needs a Windows PC."""
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from unittest import TestCase, main, mock
from urllib.error import HTTPError
from urllib.request import urlopen
import os
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import start_tv3_windows as launcher
from exhibition_server import Handler


class WindowsLauncherTests(TestCase):
    def test_browser_in_a_path_with_spaces_and_korean(self):
        with TemporaryDirectory(prefix='TV3 게임 ') as folder:
            edge = Path(folder) / 'Microsoft/Edge/Application/msedge.exe'
            edge.parent.mkdir(parents=True)
            edge.touch()
            self.assertEqual(launcher.find_browser({'ProgramFiles(x86)': folder}), edge)
            command = launcher.browser_command(edge, 'http://127.0.0.1:8777/chicken_game.html?display=tv3&camera=0', Path(folder) / '사용자 프로필')
            self.assertEqual(command[0], str(edge))
            self.assertIn('--edge-kiosk-type=fullscreen', command)
            self.assertIn('--user-data-dir=' + str(Path(folder) / '사용자 프로필'), command)
            self.assertNotIn('--use-fake-device-for-media-stream', command)

    def test_chrome_fallback_uses_the_app_url(self):
        with TemporaryDirectory() as folder:
            chrome = Path(folder) / 'Google/Chrome/Application/chrome.exe'
            chrome.parent.mkdir(parents=True)
            chrome.touch()
            self.assertEqual(launcher.find_browser({'LOCALAPPDATA': folder}), chrome)
            command = launcher.browser_command(chrome, 'http://127.0.0.1:8777/', Path(folder))
            self.assertIn('--app=http://127.0.0.1:8777/', command)

    def test_invalid_port_fails_before_starting_anything(self):
        with mock.patch.dict(os.environ, {'GAME_PORT': '65536'}):
            with self.assertRaises(ValueError):
                launcher.numeric_setting('GAME_PORT', 8777, 1024, 65535)

    def test_browser_launch_failure_closes_its_server(self):
        with mock.patch.object(sys, 'platform', 'win32'), \
             mock.patch.object(launcher, 'find_browser', return_value=Path('msedge.exe')), \
             mock.patch.object(launcher, 'ThreadingHTTPServer') as server_class, \
             mock.patch.object(launcher, 'Thread'), \
             mock.patch.object(launcher.subprocess, 'Popen', side_effect=OSError('test launch failure')), \
             mock.patch('builtins.print'):
            self.assertEqual(launcher.main(), 1)
            server_class.return_value.shutdown.assert_called_once()
            server_class.return_value.server_close.assert_called_once()

    def test_local_server_types_and_private_profile_guard(self):
        with TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'model.wasm').write_bytes(b'\x00asm')
            (root / 'font.woff2').write_bytes(b'wOF2')
            (root / '.kiosk-profile-tv3-windows').mkdir()
            (root / '.kiosk-profile-tv3-windows' / 'Preferences').write_text('private')
            with ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=folder)) as server:
                thread = Thread(target=server.serve_forever, daemon=True)
                thread.start()
                try:
                    base = f'http://127.0.0.1:{server.server_port}'
                    for file, mime in [('model.wasm', 'application/wasm'), ('font.woff2', 'font/woff2')]:
                        with urlopen(base + '/' + file) as response:
                            self.assertEqual(response.headers['Content-Type'], mime)
                            self.assertEqual(response.read(), (root / file).read_bytes())
                    with self.assertRaises(HTTPError) as caught:
                        urlopen(base + '/.kiosk-profile-tv3-windows/Preferences')
                    self.assertEqual(caught.exception.code, 404)
                finally:
                    server.shutdown()
                    thread.join()

    def test_restart_rules(self):
        self.assertIsNone(launcher.restart_reason(None, 0, None, 30))            # still starting
        self.assertIsNotNone(launcher.restart_reason(None, 0, None, 120))        # never reported alive
        self.assertIsNone(launcher.restart_reason(None, 0, 100, 120))            # alive
        self.assertIsNotNone(launcher.restart_reason(None, 0, 100, 200))         # frozen
        self.assertIsNotNone(launcher.restart_reason(3, 0, 100, 101))            # crashed

    def test_heartbeat_endpoint(self):
        from urllib.request import Request
        with TemporaryDirectory() as folder:
            with ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=folder)) as server:
                server.last_heartbeat = None
                thread = Thread(target=server.serve_forever, daemon=True)
                thread.start()
                try:
                    with urlopen(Request(f'http://127.0.0.1:{server.server_port}/__heartbeat', method='POST', data=b'')) as response:
                        self.assertEqual(response.status, 204)
                    self.assertIsNotNone(server.last_heartbeat)
                finally:
                    server.shutdown()
                    thread.join()


if __name__ == '__main__':
    main()
