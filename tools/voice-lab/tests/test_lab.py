import json
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
import wave

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import lab


class CoreTests(unittest.TestCase):
    def test_approved_profile_matches_candidate_6_audio(self):
        profile = json.loads((lab.ROOT / "chadwick-profile.json").read_text())
        self.assertEqual(profile["candidate"]["id"], lab.APPROVED_CANDIDATE_ID)
        self.assertEqual(profile["candidate"]["sha256"], lab.APPROVED_WAV_SHA256)
        self.assertTrue(lab.verify_approved_voice())

    def test_life_hub_request_accepts_bounded_existing_cues_only(self):
        request = lab.LifeHubVoiceRequest.parse({
            "session_id": "data/fitness/2026/09/session.md",
            "cues": [
                {"id": "bench-start", "text": "Bro, chest up and own the rep."},
                {"id": "bench-rest", "text": "Shake it out, big guy."},
            ],
        })
        self.assertEqual(request.session_id, "data/fitness/2026/09/session.md")
        self.assertEqual([cue["id"] for cue in request.cues], ["bench-start", "bench-rest"])
        self.assertEqual(len(request.seeds()), 2)
        self.assertEqual(request.seeds(), lab.LifeHubVoiceRequest.parse({
            "session_id": request.session_id,
            "cues": list(request.cues),
        }).seeds())
        for bad in (
            {"session_id": "", "cues": [{"id": "a", "text": "hello"}]},
            {"session_id": "x", "cues": []},
            {"session_id": "x", "cues": [{"id": "a", "text": ""}]},
            {"session_id": "x", "cues": [{"id": "a", "text": "x" * 601}]},
            {"session_id": "x", "cues": [{"id": "a", "text": "one"}, {"id": "a", "text": "two"}]},
            {"session_id": "x", "cues": [{"id": "a", "text": "hello"}], "temperature": .2},
        ):
            with self.subTest(value=bad), self.assertRaises(ValueError):
                lab.LifeHubVoiceRequest.parse(bad)

    def test_life_hub_voice_manager_generates_then_reuses_stable_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            engine = FakeCloneEngine()
            store = lab.LifeHubVoiceStore(Path(directory))
            manager = lab.LifeHubVoiceManager(store, engine)
            value = {
                "session_id": "session-a",
                "cues": [
                    {"id": "start", "text": "Bro, chest up."},
                    {"id": "rest", "text": "Breathe, big guy."},
                    {"id": "rest-repeat", "text": "Breathe, big guy."},
                ],
            }
            manager.submit(value)
            wait_done(manager)
            first = manager.state()
            self.assertEqual(first["job"]["status"], "completed")
            self.assertEqual(len(first["clips"]), 3)
            self.assertEqual(first["clips"][1]["wav_url"], first["clips"][2]["wav_url"])
            self.assertEqual(engine.generated, 2)
            first_urls = [clip["wav_url"] for clip in first["clips"]]

            manager.submit(value)
            wait_done(manager)
            second = manager.state()
            self.assertEqual([clip["wav_url"] for clip in second["clips"]], first_urls)
            self.assertEqual(second["job"]["cached"], 3)
            self.assertEqual(engine.generated, 2)

    def test_voice_lock_request_uses_only_fixed_validation_lines(self):
        request = lab.VoiceLockRequest.parse({"seed": 900, "test_ids": ["reaction", "numbers"]})
        self.assertEqual([item["id"] for item in request.tests], ["reaction", "numbers"])
        self.assertEqual(request.seeds(), [900, 901])
        for bad in ({"test_ids": []}, {"test_ids": ["unknown"]},
                    {"test_ids": ["reaction", "reaction"]}, {"text": "replace it"}):
            with self.subTest(value=bad), self.assertRaises(ValueError):
                lab.VoiceLockRequest.parse(bad)

    def test_reference_clip_copies_the_exact_approved_window(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "approved.wav"
            output = Path(directory) / "reference.wav"
            with wave.open(str(source), "wb") as audio:
                audio.setnchannels(1)
                audio.setsampwidth(2)
                audio.setframerate(10)
                audio.writeframes(b"\x01\x00" * 30)
            lab.make_reference_clip(source, output, 1.2)
            with wave.open(str(output), "rb") as audio:
                self.assertEqual(audio.getnframes(), 12)
                self.assertEqual(audio.getframerate(), 10)
                self.assertEqual(audio.getnchannels(), 1)
                self.assertEqual(audio.getsampwidth(), 2)

    def test_invalid_controls_never_reach_inference(self):
        bad = [
            {"description": " "}, {"description": "x" * 3001},
            {"count": 0}, {"count": 9}, {"count": True}, {"count": 1.5},
            {"seed": -1}, {"seed": 4294967296}, {"seed": True},
            {"temperature": float("nan")}, {"temperature": 0},
            {"top_p": 0}, {"top_p": 1.1}, {"top_k": 0},
            {"repetition_penalty": .5}, {"max_tokens": 0},
            {"script_id": "unknown"}, {"text": "override"},
        ]
        for value in bad:
            with self.subTest(value=value), self.assertRaises(ValueError):
                lab.Request.parse(value)

    def test_batch_seeds_advance_and_wrap(self):
        request = lab.Request.parse({"seed": 4294967295, "count": 3})
        self.assertEqual(request.seeds(), [4294967295, 0, 1])

    def test_random_batch_records_valid_distinct_seeds(self):
        seeds = lab.Request.parse({"seed": None, "count": 8}).seeds()
        self.assertEqual(len(set(seeds)), 8)
        self.assertTrue(all(0 <= x <= 4294967295 for x in seeds))

    def test_cannot_replace_fixed_audition(self):
        request = lab.Request.parse({"script_id": "conversation"})
        self.assertNotEqual(request.script, lab.Request.parse({"script_id": "numbers"}).script)
        with self.assertRaises(ValueError):
            lab.Request.parse({"script_id": "conversation", "script": "Replace the audition"})

    def test_save_persists_wav_metadata_without_overwriting(self):
        with tempfile.TemporaryDirectory() as directory:
            store = lab.Store(Path(directory))
            first = store.save({"seed": 11}, b"\x00\x00\xff\x7f" * 120, 24000)
            second = store.save({"seed": 12}, b"\x00\x00" * 480, 24000)
            self.assertNotEqual(first["id"], second["id"])
            self.assertEqual([first["number"], second["number"]], [1, 2])
            reloaded = lab.Store(Path(directory)).list()
            self.assertEqual({x["seed"] for x in reloaded}, {11, 12})
            with wave.open(str(store.audio_path(first["id"])), "rb") as audio:
                self.assertEqual(audio.getnframes(), 240)
                self.assertEqual(audio.getframerate(), 24000)
                self.assertEqual(audio.getsampwidth(), 2)
            self.assertEqual(first["duration_seconds"], .01)
            with self.assertRaises(ValueError):
                store.audio_path("../outside")
            (Path(directory) / "broken.json").write_text("{")
            self.assertEqual(len(store.list()), 2)

    def test_empty_audio_does_not_create_a_candidate(self):
        with tempfile.TemporaryDirectory() as directory:
            store = lab.Store(Path(directory))
            with self.assertRaises(ValueError):
                store.save({}, b"", 24000)
            self.assertEqual(store.list(), [])

    def test_batch_persists_supported_settings_and_load_timing(self):
        with tempfile.TemporaryDirectory() as directory:
            engine = FakeEngine()
            manager = lab.Manager(lab.Store(Path(directory)), engine)
            manager.submit({"count": 2, "seed": 40, "temperature": .7})
            wait_done(manager)
            result = manager.state()
            self.assertEqual(result["job"]["status"], "completed")
            self.assertEqual(result["job"]["completed"], 2)
            candidates = sorted(result["candidates"], key=lambda c: c["number"])
            self.assertEqual([c["seed"] for c in candidates], [40, 41])
            self.assertEqual(candidates[0]["settings"]["temperature"], .7)
            self.assertEqual(candidates[0]["load_seconds"], .25)
            self.assertEqual(candidates[1]["load_seconds"], 0)

    def test_busy_rejected_and_cancel_preserves_completed_audio(self):
        with tempfile.TemporaryDirectory() as directory:
            engine = FakeEngine(block=True)
            manager = lab.Manager(lab.Store(Path(directory)), engine)
            manager.submit({"count": 3, "seed": 9})
            self.assertTrue(engine.entered.wait(2))
            with self.assertRaises(lab.BusyError):
                manager.submit({"count": 1})
            manager.cancel()
            engine.release.set()
            wait_done(manager)
            state = manager.state()
            self.assertEqual(state["job"]["status"], "cancelled")
            self.assertEqual(len(state["candidates"]), 1)

    def test_inference_failure_visible_and_next_job_can_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            engine = FakeEngine(fail=True)
            manager = lab.Manager(lab.Store(Path(directory)), engine)
            manager.submit({"count": 1})
            wait_done(manager)
            self.assertEqual(manager.state()["job"]["status"], "error")
            self.assertIn("test inference failure", manager.state()["job"]["error"])
            self.assertEqual(manager.state()["candidates"], [])
            engine.fail = False
            manager.submit({"count": 1})
            wait_done(manager)
            self.assertEqual(manager.state()["job"]["status"], "completed")

    def test_voice_lock_saves_each_validation_clip_with_speed_and_reference(self):
        with tempfile.TemporaryDirectory() as directory:
            manager = lab.VoiceLockManager(lab.Store(Path(directory)), FakeCloneEngine())
            manager.submit({"seed": 70, "test_ids": ["reaction", "numbers"]})
            wait_done(manager)
            state = manager.state()
            self.assertEqual(state["job"]["status"], "completed")
            clips = sorted(state["clips"], key=lambda item: item["number"])
            self.assertEqual([item["test_id"] for item in clips], ["reaction", "numbers"])
            self.assertEqual([item["seed"] for item in clips], [70, 71])
            self.assertEqual(clips[0]["reference_candidate_id"], lab.APPROVED_CANDIDATE_ID)
            self.assertEqual(clips[0]["realtime_factor"],
                             round(clips[0]["generation_seconds"] / clips[0]["duration_seconds"], 3))

    def test_shared_gate_rejects_overlapping_cast_and_voice_lock_jobs(self):
        gate = lab.JobGate()
        with tempfile.TemporaryDirectory() as directory:
            casting_engine = FakeEngine(block=True)
            casting = lab.Manager(lab.Store(Path(directory) / "casting"), casting_engine,
                                  gate=gate, job_name="casting")
            voice_lock = lab.VoiceLockManager(lab.Store(Path(directory) / "lock"),
                                              FakeCloneEngine(), gate=gate)
            casting.submit({"count": 1})
            self.assertTrue(casting_engine.entered.wait(2))
            with self.assertRaises(lab.BusyError):
                voice_lock.submit({})
            casting_engine.release.set()
            wait_done(casting)
            voice_lock.submit({"test_ids": ["reaction"]})
            wait_done(voice_lock)
            self.assertEqual(voice_lock.state()["job"]["status"], "completed")


class FakeEngine:
    """Only the expensive MLX boundary is substituted; jobs/files are real."""
    def __init__(self, block=False, fail=False):
        self.block, self.fail = block, fail
        self.entered, self.release = threading.Event(), threading.Event()
        self.loaded = False

    def load(self, progress):
        progress("Loading test engine")
        elapsed = 0 if self.loaded else .25
        self.loaded = True
        return elapsed

    def generate(self, request, seed):
        self.entered.set()
        if self.block:
            self.release.wait(3)
        if self.fail:
            raise RuntimeError("test inference failure")
        return b"\x00\x00" * 240, 24000, {"warning": None, "runtime": {"test": True}}


class FakeCloneEngine:
    def __init__(self):
        self.generated = 0

    def load(self, progress):
        progress("Loading test clone engine")
        return .5

    def generate(self, request, test, seed):
        self.generated += 1
        return b"\x00\x00" * 240, 24000, {"warning": None, "token_count": 3}


def wait_done(manager):
    deadline = time.monotonic() + 4
    while manager.state()["job"]["status"] in ("loading", "generating"):
        if time.monotonic() > deadline:
            raise AssertionError("Job did not finish")
        time.sleep(.01)


if __name__ == "__main__":
    unittest.main()
