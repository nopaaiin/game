"""Local-only exhibition server. Uses only Python's standard library."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import sys


class Handler(SimpleHTTPRequestHandler):
    # Explicit types also work on Windows machines without font/WASM MIME entries.
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.wasm': 'application/wasm',
        '.woff2': 'font/woff2',
        '.tflite': 'application/octet-stream',
        '.data': 'application/octet-stream',
    }

    def do_GET(self):
        if self.path == '/__exhibition_health':
            data = b'chicken-pixel-tv3'
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        return super().do_GET()

    def translate_path(self, path):
        # Do not expose the local browser profile through the static server.
        if any(part.startswith('.') for part in unquote(urlsplit(path).path).split('/')):
            return str(Path(__file__).resolve().parent / '__not_public__')
        return super().translate_path(path)

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, *_args):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
    handler = partial(Handler, directory=str(Path(__file__).resolve().parent))
    with ThreadingHTTPServer(('127.0.0.1', port), handler) as server:
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
