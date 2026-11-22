"""Read-only static service for Cloud Run; never serves the project checkout."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import json
import os

PUBLIC_ROOT = Path(os.environ.get("PUBLIC_ROOT", Path(__file__).resolve().parents[1] / ".site")).resolve()


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".mjs": "text/javascript", ".glb": "model/gltf-binary"}

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Cache-Control", "public, max-age=300")
        super().end_headers()

    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if path == "/healthz":
            body = json.dumps({"status": "ok", "service": "sanfang-qixiang"}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if any(part.startswith(".") for part in path.split("/") if part) or "\\" in path:
            self.send_error(404)
            return
        super().do_GET()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def do_POST(self):
        self.send_error(405, "Read-only service; export scenes locally or in Codex")


def main():
    if not (PUBLIC_ROOT / "index.html").is_file():
        raise SystemExit("Missing public files; run python scripts/build_site.py first")
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer((os.environ.get("HOST", "0.0.0.0"), port), partial(Handler, directory=str(PUBLIC_ROOT)))
    print(f"Sanfang static service listening on :{server.server_port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
