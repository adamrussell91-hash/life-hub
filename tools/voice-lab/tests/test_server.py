import http.client
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import lab
import server
from test_lab import FakeCloneEngine, FakeEngine, wait_done


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.manager = lab.Manager(lab.Store(Path(self.directory.name)), FakeEngine())
        self.lock_manager = lab.VoiceLockManager(
            lab.Store(Path(self.directory.name) / "voice-lock", "/voice-lock/audio"), FakeCloneEngine())
        self.life_manager = lab.LifeHubVoiceManager(
            lab.LifeHubVoiceStore(Path(self.directory.name) / "life-hub-cache"), FakeCloneEngine())
        self.reference_audio = Path(self.directory.name) / "reference.wav"
        with self.reference_audio.open("wb") as output:
            output.write(b"RIFF-reference")
        self.server = server.make_server(self.manager, self.lock_manager, self.life_manager,
                                         reference_audio=self.reference_audio, port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_port

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.directory.cleanup()

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        connection.request(method, path, body, headers or {})
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def post(self, path, value):
        return self.request("POST", path, json.dumps(value),
                            {"Content-Type": "application/json", "X-Voice-Lab": "1"})

    def test_only_explicit_public_assets_are_exposed(self):
        for path in ("/lab.py", "/.cache/model.safetensors", "/../lab.py", "/%2e%2e/lab.py"):
            with self.subTest(path=path):
                self.assertEqual(self.request("GET", path)[0], 404)
        status, headers, body = self.request("GET", "/api/config")
        self.assertEqual(status, 200)
        self.assertIn("scripts", json.loads(body))
        self.assertIn("voice_lock", json.loads(body))
        self.assertNotIn("Access-Control-Allow-Origin", headers)

    def test_cross_origin_and_rebinding_requests_rejected(self):
        self.assertEqual(self.request("GET", "/api/state", headers={"Host": "evil.example"})[0], 403)
        self.assertEqual(self.request("POST", "/api/generate", "{}", {
            "Content-Type": "application/json", "X-Voice-Lab": "1",
            "Origin": "https://evil.example"})[0], 403)
        self.assertEqual(self.request("POST", "/api/generate", "{}", {
            "Content-Type": "application/json"})[0], 403)
        self.assertEqual(self.request("POST", "/api/generate", "{}", {
            "Content-Type": "text/plain", "X-Voice-Lab": "1"})[0], 415)

    def test_life_hub_api_allows_only_explicit_app_origins(self):
        origin = "https://life-hub.adam-russell.com"
        status, headers, body = self.request("GET", "/api/life-hub/state", headers={
            "Origin": origin, "Sec-Fetch-Site": "cross-site"
        })
        self.assertEqual(status, 200)
        self.assertEqual(headers["Access-Control-Allow-Origin"], origin)
        self.assertEqual(json.loads(body)["profile"]["candidate_number"], 6)

        status, headers, _ = self.request("OPTIONS", "/api/life-hub/prepare", headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-chadwick-voice",
        })
        self.assertEqual(status, 204)
        self.assertEqual(headers["Access-Control-Allow-Origin"], origin)

        self.assertEqual(self.request("GET", "/api/life-hub/state", headers={
            "Origin": "https://evil.example", "Sec-Fetch-Site": "cross-site"
        })[0], 403)

    def test_life_hub_prepares_cached_workout_playlist_and_serves_audio(self):
        origin = f"http://127.0.0.1:4173"
        value = {"session_id": "session-a", "cues": [
            {"id": "bench-start", "text": "Chest up, big guy."},
            {"id": "bench-rest", "text": "Breathe and reset, bro."},
        ]}
        status, headers, _ = self.request("POST", "/api/life-hub/prepare", json.dumps(value), {
            "Content-Type": "application/json", "X-Chadwick-Voice": "1", "Origin": origin
        })
        self.assertEqual(status, 202)
        self.assertEqual(headers["Access-Control-Allow-Origin"], origin)
        wait_done(self.life_manager)
        state = json.loads(self.request("GET", "/api/life-hub/state", headers={"Origin": origin})[2])
        self.assertEqual(state["job"]["status"], "completed")
        self.assertEqual([clip["cue_id"] for clip in state["clips"]], ["bench-start", "bench-rest"])
        audio_url = state["clips"][0]["wav_url"]
        status, headers, audio = self.request("GET", audio_url, headers={"Origin": origin})
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "audio/wav")
        self.assertEqual(headers["Access-Control-Allow-Origin"], origin)
        self.assertEqual(audio[:4], b"RIFF")

    def test_malformed_and_oversized_requests_return_json_errors(self):
        headers = {"Content-Type": "application/json", "X-Voice-Lab": "1"}
        for data, expected in [("{", 400), ("null", 400), ("x" * 20000, 413)]:
            status, _, body = self.request("POST", "/api/generate", data, headers)
            self.assertEqual(status, expected)
            self.assertIn("error", json.loads(body))

    def test_generation_and_wav_range_playback(self):
        status, _, _ = self.post("/api/generate", {"count": 1, "seed": 31})
        self.assertEqual(status, 202)
        wait_done(self.manager)
        state = json.loads(self.request("GET", "/api/state")[2])
        candidate = state["candidates"][0]
        url = candidate["wav_url"]
        status, headers, body = self.request("GET", url)
        self.assertEqual(status, 200)
        self.assertEqual(body[:4], b"RIFF")
        self.assertEqual(headers["Content-Type"], "audio/wav")
        status, headers, portion = self.request("GET", url, headers={"Range": "bytes=0-43"})
        self.assertEqual(status, 206)
        self.assertEqual(portion, body[:44])
        self.assertEqual(headers["Content-Range"], f"bytes 0-43/{len(body)}")
        self.assertEqual(self.request("GET", url, headers={"Range": "bytes=-10"})[2], body[-10:])
        self.assertEqual(self.request("GET", url, headers={"Range": "bytes=999999-"})[0], 416)
        status, headers, empty = self.request("HEAD", url)
        self.assertEqual(status, 200)
        self.assertEqual(int(headers["Content-Length"]), len(body))
        self.assertEqual(empty, b"")
        self.assertEqual(self.request("GET", "/audio/../lab.py")[0], 404)

    def test_voice_lock_generation_state_reference_and_audio_are_exposed(self):
        status, _, _ = self.post("/api/voice-lock/generate",
                                 {"seed": 80, "test_ids": ["reaction", "numbers"]})
        self.assertEqual(status, 202)
        wait_done(self.lock_manager)
        state = json.loads(self.request("GET", "/api/voice-lock/state")[2])
        self.assertEqual(state["job"]["status"], "completed")
        self.assertEqual(len(state["clips"]), 2)
        clip = state["clips"][0]
        self.assertTrue(clip["wav_url"].startswith("/voice-lock/audio/"))
        status, headers, audio = self.request("GET", clip["wav_url"])
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "audio/wav")
        self.assertEqual(audio[:4], b"RIFF")
        status, headers, reference = self.request("GET", "/reference.wav")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "audio/wav")
        self.assertEqual(reference, b"RIFF-reference")


if __name__ == "__main__":
    unittest.main()
