"""Preview Next's static export with the clean URLs used by Cloudflare Pages."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse

class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        original = super().translate_path(path)
        if not Path(original).suffix and Path(original + '.html').is_file():
            return original + '.html'
        return original

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=3105)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1] / 'out'
    ThreadingHTTPServer(('127.0.0.1', args.port), lambda *a, **kw: Handler(*a, directory=str(root), **kw)).serve_forever()
