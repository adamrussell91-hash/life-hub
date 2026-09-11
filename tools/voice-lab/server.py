"""Loopback-only HTTP UI. MLX runs on one separate worker, never request threads."""
from __future__ import annotations

import argparse
import fcntl
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import re
import threading
from urllib.parse import urlsplit
import webbrowser

from lab import (APPROVED_WAV, BusyError, JobGate, LifeHubVoiceManager,
                 LifeHubVoiceStore, Manager, ROOT, Store, VoiceLockManager, config)

STATIC = {"/": ("index.html", "text/html; charset=utf-8"),
          "/app.js": ("app.js", "text/javascript; charset=utf-8"),
          "/style.css": ("style.css", "text/css; charset=utf-8")}


LIFE_HUB_ORIGIN = "https://life-hub.adam-russell.com"


def is_life_hub_origin(origin):
    return origin == LIFE_HUB_ORIGIN or bool(
        re.fullmatch(r"http://(?:127\.0\.0\.1|localhost):\d{1,5}", origin or "")
    )


def is_life_hub_path(path):
    return path.startswith("/api/life-hub/") or path.startswith("/life-hub/audio/")


def make_server(manager, voice_lock_manager=None, life_hub_manager=None,
                reference_audio=APPROVED_WAV, port=8765):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            # Polling is deliberately quiet. Inference errors also appear in the UI.
            pass

        def _trusted(self):
            hosts = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
            origin = self.headers.get("Origin")
            return (self.headers.get("Host") in hosts
                    and (origin is None or origin in {f"http://{h}" for h in hosts})
                    and self.headers.get("Sec-Fetch-Site") != "cross-site")

        def _trusted_life_hub(self):
            hosts = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
            origin = self.headers.get("Origin")
            return self.headers.get("Host") in hosts and (origin is None or is_life_hub_origin(origin))

        def _cors_headers(self):
            path = urlsplit(self.path).path
            origin = self.headers.get("Origin")
            if not is_life_hub_path(path) or not is_life_hub_origin(origin):
                return {}
            return {
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, X-Chadwick-Voice",
                "Access-Control-Max-Age": "600",
                "Vary": "Origin",
            }

        def _send(self, status, data, content_type="application/json", extra=None):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy",
                             "default-src 'self'; script-src 'self'; style-src 'self'; "
                             "media-src 'self'; connect-src 'self'; img-src 'self' data:; "
                             "frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
            for key, value in {**self._cors_headers(), **(extra or {})}.items():
                self.send_header(key, value)
            self.end_headers()
            if self.command != "HEAD":
                try:
                    self.wfile.write(data)
                except (BrokenPipeError, ConnectionResetError):
                    pass

        def _json(self, status, data):
            self._send(status, json.dumps(data, allow_nan=False).encode())

        def _audio(self, audio, missing_message):
            try:
                data = audio.read_bytes()
            except OSError:
                return self._json(404, {"error": missing_message})
            size = len(data)
            headers = {"Accept-Ranges": "bytes"}
            requested = self.headers.get("Range")
            if requested:
                try:
                    start, end = parse_range(requested, size)
                except ValueError:
                    return self._send(416, b"", "audio/wav", {"Content-Range": f"bytes */{size}"})
                headers["Content-Range"] = f"bytes {start}-{end}/{size}"
                return self._send(206, data[start:end + 1], "audio/wav", headers)
            return self._send(200, data, "audio/wav", headers)

        def do_HEAD(self):
            self.do_GET()

        def do_OPTIONS(self):
            path = urlsplit(self.path).path
            if not is_life_hub_path(path) or not self._trusted_life_hub():
                return self._json(403, {"error": "Life Hub voice access is not allowed from this page."})
            requested_method = self.headers.get("Access-Control-Request-Method")
            requested_headers = {
                item.strip().lower()
                for item in self.headers.get("Access-Control-Request-Headers", "").split(",")
                if item.strip()
            }
            if requested_method not in (None, "GET", "HEAD", "POST") or not requested_headers <= {
                    "content-type", "x-chadwick-voice"}:
                return self._json(403, {"error": "Unsupported Life Hub voice request."})
            return self._send(204, b"")

        def do_GET(self):
            path = urlsplit(self.path).path
            if is_life_hub_path(path):
                if not self._trusted_life_hub():
                    return self._json(403, {"error": "Life Hub voice access is not allowed from this page."})
            elif not self._trusted():
                return self._json(403, {"error": "Open the lab using its localhost URL."})
            if path == "/api/life-hub/state":
                if life_hub_manager is None:
                    return self._json(404, {"error": "Life Hub voice is unavailable."})
                return self._json(200, life_hub_manager.state())
            if path == "/api/config":
                return self._json(200, config())
            if path == "/api/state":
                return self._json(200, manager.state())
            if path == "/api/voice-lock/state":
                if voice_lock_manager is None:
                    return self._json(404, {"error": "Voice Lock is unavailable."})
                return self._json(200, voice_lock_manager.state())
            if path in STATIC:
                filename, content_type = STATIC[path]
                return self._send(200, (ROOT / "static" / filename).read_bytes(), content_type)
            match = re.fullmatch(r"/audio/([0-9a-f]{32})\.wav", path)
            if match:
                try:
                    audio = manager.store.audio_path(match[1])
                except ValueError:
                    return self._json(404, {"error": "Candidate WAV not found."})
                return self._audio(audio, "Candidate WAV not found.")
            lock_match = re.fullmatch(r"/voice-lock/audio/([0-9a-f]{32})\.wav", path)
            if lock_match and voice_lock_manager is not None:
                try:
                    audio = voice_lock_manager.store.audio_path(lock_match[1])
                except ValueError:
                    return self._json(404, {"error": "Voice Lock WAV not found."})
                return self._audio(audio, "Voice Lock WAV not found.")
            life_match = re.fullmatch(r"/life-hub/audio/([0-9a-f]{32})\.wav", path)
            if life_match and life_hub_manager is not None:
                try:
                    audio = life_hub_manager.store.audio_path(life_match[1])
                except ValueError:
                    return self._json(404, {"error": "Chadwick cue WAV not found."})
                return self._audio(audio, "Chadwick cue WAV not found.")
            if path == "/reference.wav":
                return self._audio(reference_audio, "Candidate 6 reference WAV not found.")
            self._json(404, {"error": "Not found."})

        def do_POST(self):
            path = urlsplit(self.path).path
            if is_life_hub_path(path):
                if not self._trusted_life_hub() or self.headers.get("X-Chadwick-Voice") != "1":
                    return self._json(403, {"error": "Life Hub voice access is not allowed from this page."})
            elif not self._trusted() or self.headers.get("X-Voice-Lab") != "1":
                return self._json(403, {"error": "Use the local Voice Lab page to generate audio."})
            if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                return self._json(415, {"error": "Send application/json."})
            if self.headers.get("Transfer-Encoding"):
                return self._json(400, {"error": "Chunked requests are not supported."})
            try:
                size = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self._json(400, {"error": "Invalid content length."})
            limit = 32768 if is_life_hub_path(path) else 16384
            if not 0 <= size <= limit:
                return self._json(413, {"error": f"Request is too large (maximum {limit // 1024} KB)."})
            try:
                value = json.loads(self.rfile.read(size))
                if not isinstance(value, dict):
                    raise ValueError("Expected a JSON object.")
                if path == "/api/life-hub/prepare" and life_hub_manager is not None:
                    life_hub_manager.submit(value)
                    return self._json(202, life_hub_manager.state())
                if path == "/api/life-hub/cancel" and life_hub_manager is not None:
                    life_hub_manager.cancel()
                    return self._json(200, life_hub_manager.state())
                if path == "/api/generate":
                    manager.submit(value)
                    return self._json(202, manager.state())
                if path == "/api/cancel":
                    manager.cancel()
                    return self._json(200, manager.state())
                if path == "/api/voice-lock/generate" and voice_lock_manager is not None:
                    voice_lock_manager.submit(value)
                    return self._json(202, voice_lock_manager.state())
                if path == "/api/voice-lock/cancel" and voice_lock_manager is not None:
                    voice_lock_manager.cancel()
                    return self._json(200, voice_lock_manager.state())
                return self._json(404, {"error": "Not found."})
            except (ValueError, UnicodeDecodeError) as exc:
                return self._json(400, {"error": str(exc)})
            except BusyError as exc:
                return self._json(409, {"error": str(exc)})

    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    httpd.daemon_threads = True
    return httpd


def parse_range(value, size):
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", value)
    if not match or not any(match.groups()):
        raise ValueError("Invalid byte range")
    first, last = match.groups()
    if first:
        start, end = int(first), min(int(last), size - 1) if last else size - 1
    else:
        start, end = max(0, size - int(last)), size - 1
    if not 0 <= start <= end < size:
        raise ValueError("Unsatisfiable byte range")
    return start, end


def main():
    parser = argparse.ArgumentParser(description="Chadwick Voice Lab — local Apple Silicon auditions")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-open", action="store_true", help="Do not open a browser automatically")
    args = parser.parse_args()
    from backend import CloneEngine, Engine
    runtime = ROOT / ".runtime"
    runtime.mkdir(exist_ok=True)
    lock = (runtime / "server.lock").open("a+")
    try:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock.seek(0)
        existing_port = lock.read().strip()
        if existing_port.isdigit():
            url = f"http://127.0.0.1:{existing_port}"
            print(f"Voice Lab is already running: {url}", flush=True)
            if not args.no_open:
                webbrowser.open(url)
            return
        raise SystemExit("Voice Lab is already starting. Try again in a moment.")
    try:
        gate = JobGate()
        voice_engine = Engine()
        clone_engine = CloneEngine(release_other=voice_engine.unload)
        voice_engine.release_other = clone_engine.unload
        casting = Manager(Store(ROOT / "outputs"), voice_engine, gate=gate, job_name="casting")
        voice_lock = VoiceLockManager(Store(ROOT / "voice-lock", "/voice-lock/audio"),
                                      clone_engine, gate=gate)
        life_hub = LifeHubVoiceManager(LifeHubVoiceStore(ROOT / "life-hub-cache"),
                                       clone_engine, gate=gate)
        httpd = make_server(casting, voice_lock, life_hub, port=args.port)
    except OSError as exc:
        raise SystemExit(f"Could not open port {args.port}: {exc}. Try --port 8766.") from exc
    lock.seek(0)
    lock.truncate()
    lock.write(str(httpd.server_port))
    lock.flush()
    url = f"http://127.0.0.1:{httpd.server_port}"
    print(f"Chadwick Voice Lab: {url}\nCandidates are saved in {ROOT / 'outputs'}"
          f"\nVoice Lock clips are saved in {ROOT / 'voice-lock'}"
          f"\nLife Hub voice is available while this companion is running."
          f"\nPress Control-C to stop.", flush=True)
    if not args.no_open:
        threading.Timer(.4, webbrowser.open, args=(url,)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nVoice Lab stopped. Saved candidates are kept.", flush=True)
    finally:
        httpd.server_close()
        lock.close()


if __name__ == "__main__":
    main()
