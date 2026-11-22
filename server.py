"""Local-only development server and explicit Colab scene export receiver."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import json
import os
import sys

ROOT = Path(__file__).resolve().parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5178

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript', '.glb': 'model/gltf-binary'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def do_GET(self):
        parts = self.path.split('?', 1)[0].split('/')
        if any(part.startswith('.') for part in parts if part):
            self.send_error(403)
            return
        super().do_GET()

    def do_POST(self):
        if self.path != '/_scene' or self.headers.get('Origin') != f'http://127.0.0.1:{PORT}':
            self.send_error(403)
            return
        length = int(self.headers.get('Content-Length', '0'))
        if not 0 < length <= 50_000_000 or self.headers.get('Content-Type') != 'application/json':
            self.send_error(400)
            return
        payload = self.rfile.read(length)
        scene = json.loads(payload)
        if scene.get('schema') != 'sanfang-colab-scene-v1':
            self.send_error(400)
            return
        target = ROOT / 'colab' / 'sanfang-scene.json'
        target.parent.mkdir(exist_ok=True)
        target.write_bytes(payload)
        response = json.dumps({'ok': True, 'bytes': length, 'path': 'colab/sanfang-scene.json'}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(response)))
        self.end_headers()
        self.wfile.write(response)

if __name__ == '__main__':
    print(f'Sanfang Colab V4: http://127.0.0.1:{PORT}/', flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
