#!/usr/bin/env python3
"""Local-only static preview with an explicitly empty launch-feed fixture. Never publish this server."""
import argparse
import http.server
import json
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        decoded = unquote(urlsplit(path).path)
        if decoded.startswith("/preview/"):
            decoded = decoded[len("/preview"):]
        clean = Path(decoded.lstrip("/"))
        if ".." in clean.parts:
            return str(ROOT / "dist/404.html")
        return str(ROOT / "dist" / clean)

    def do_GET(self):
        if urlsplit(self.path).path == "/simd-coin.json":
            body = json.dumps({"status": "launching", "market": {}}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    print(f"Preview: http://127.0.0.1:{args.port}/preview/ (empty launch data fixture)", flush=True)
    http.server.ThreadingHTTPServer(("0.0.0.0", args.port), Handler).serve_forever()
