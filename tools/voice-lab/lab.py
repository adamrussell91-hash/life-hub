"""Local casting state and persistence. No MLX imports or production app access."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import copy
import hashlib
import json
import math
from pathlib import Path
import re
import secrets
import threading
import time
import uuid
import wave

ROOT = Path(__file__).resolve().parent
MODEL = "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit"
REVISION = "5c390979e4b93af5f2932f90742ca99c7dd04687"
CLONE_MODEL = "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-4bit"
CLONE_REVISION = "0d6bb6fe33f92d47a507e23b9148940e8366ab5b"
APPROVED_CANDIDATE_ID = "1ec4ccc7fdbb42da9fc1b8c772f15916"
APPROVED_SEED = 45
APPROVED_WAV = ROOT / "approved" / "chadwick-approved-seed-45.wav"
APPROVED_JSON = ROOT / "approved" / "chadwick-approved-seed-45.json"
APPROVED_WAV_SHA256 = "a7f70712f1891ee81b38c09aeb9616f8aebabb1b578e586f1944bc655198b1ae"
REFERENCE_WAV = ROOT / ".runtime" / "chadwick-candidate-6-reference.wav"
REFERENCE_END_SECONDS = 9.944
REFERENCE_TEXT = (
    "Bro. BRO. That chest press? Your pecs are about to file a restraining order against that shirt. "
    "Wider shoulders, thicker arms, the whole situation. Absolute unit behavior."
)
SCRIPTS = [
    {"id": "conversation", "title": "Conversation audition", "text":
     "Bro. BRO. That chest press? Your pecs are about to file a restraining order against that shirt. "
     "Wider shoulders, thicker arms, the whole situation. Absolute unit behavior. "
     "And those glutes? Dude, I'm gonna need a cold shower. For recovery. Obviously. "
     "Anyway! Smooth reps, big guy. If your shoulder complains, we change the movement. "
     "I'm building a masterpiece here, not collecting injuries. "
     "You matched last week's weight, legend. I'm actually proud of you. "
     "Don't make it weird. I already made it weird. "
     "Right, beast. One good pump and you're a public safety hazard."},
    {"id": "numbers", "title": "Numbers and exercise names", "text":
     "Alright, big guy. Three sets of eight to ten cable lateral raises. Start at five kilograms, "
     "keep two reps in reserve, and rest for ninety seconds. Wider shoulders, bro. Your shirts are "
     "already sweating. Then two sets of twelve cable crunches. Tighter waist, absolute unit energy. "
     "You matched last week's weight. That's progress, legend. I'm getting emotionally attached to "
     "these gains. Just the gains. Anyway, how did the shoulder feel on that last set?"},
]
CHADWICK_DIRECTION = (ROOT / "chadwick-voice.txt").read_text().strip()

PRESETS = [
    {"id": "chadwick", "title": "Chadwick Flexington", "description": CHADWICK_DIRECTION},
    {"id": "hype", "title": "Chadwick — maximum hype", "description": CHADWICK_DIRECTION +
     " Push the excited bursts and emphatic punchlines further. Bright, exuberant, boyishly cocky delivery."},
    {"id": "flustered", "title": "Chadwick — more flustered", "description": CHADWICK_DIRECTION +
     " Make the fleeting awkward admissions more audible: a tiny catch, a sheepish pause, then a rushed "
     "return to confident hype. Keep the loud youthful energy and cheeky grin."},
]
SEED_NOTE = ("Each candidate uses the next MLX random seed. Blank chooses a random starting seed. "
             "The same seed and settings are a best-effort repeat on the same model, software and Mac; "
             "a seed does not lock a permanent voice identity.")

VOICE_LOCK_TESTS = [
    {"id": "reaction", "title": "Short reaction",
     "text": "Bro. That rep was insane."},
    {"id": "coaching", "title": "Normal coaching",
     "text": "Big guy, keep your ribs down, drive through the floor, and give me two clean reps. Smooth and controlled."},
    {"id": "numbers", "title": "Numbers and exercise terms",
     "text": "Three sets of eight to ten cable lateral raises at five kilograms, then rest for ninety seconds."},
    {"id": "joint_safety", "title": "Joint-safety cue",
     "text": "Dude, if that shoulder pinches, stop. We can chase the pump without grinding your joint into dust."},
    {"id": "aside", "title": "Quiet flustered aside",
     "text": "Okay, your back looks... massive. Like, distractingly massive. Anyway! Chest up, legend."},
    {"id": "long_form", "title": "Longer coaching passage",
     "text": "Listen, beast. Match last week's load, keep one or two reps in reserve, and own every inch of the lowering phase. "
             "If the form stays clean, we add weight next session. If it doesn't, we hold steady, because those magnificent "
             "shoulders deserve progress without the emergency-room subplot."},
]


@dataclass(frozen=True)
class Request:
    description: str = PRESETS[0]["description"]
    script_id: str = "conversation"
    count: int = 3
    seed: int | None = None
    temperature: float = .9
    top_p: float = 1.0
    top_k: int = 50
    repetition_penalty: float = 1.05
    max_tokens: int = 1536

    @classmethod
    def parse(cls, value):
        if not isinstance(value, dict):
            raise ValueError("Expected a JSON object.")
        defaults = asdict(cls())
        unknown = set(value) - set(defaults)
        if unknown:
            raise ValueError("Unknown settings: " + ", ".join(sorted(unknown)))
        fields = defaults | value
        description = fields["description"]
        if not isinstance(description, str) or not 1 <= len(description.strip()) <= 3000:
            raise ValueError("Voice description must contain 1–3000 characters.")
        fields["description"] = description.strip()
        if fields["script_id"] not in [x["id"] for x in SCRIPTS]:
            raise ValueError("Choose one of the fixed audition scripts.")
        for name, lower, upper in [("count", 1, 8), ("seed", 0, 2**32 - 1),
                                   ("top_k", 1, 100), ("max_tokens", 128, 4096)]:
            item = fields[name]
            if name == "seed" and item is None:
                continue
            if type(item) is not int or not lower <= item <= upper:
                raise ValueError(f"{name} must be an integer from {lower} to {upper}.")
        for name, lower, upper in [("temperature", .1, 1.5), ("top_p", .05, 1),
                                   ("repetition_penalty", 1, 2)]:
            item = fields[name]
            if type(item) not in (int, float) or not math.isfinite(item) or not lower <= item <= upper:
                raise ValueError(f"{name} must be a number from {lower} to {upper}.")
        return cls(**fields)

    @property
    def script(self):
        return next(x["text"] for x in SCRIPTS if x["id"] == self.script_id)

    @property
    def settings(self):
        return {k: getattr(self, k) for k in
                ("temperature", "top_p", "top_k", "repetition_penalty", "max_tokens")}

    def seeds(self):
        start = secrets.randbits(32) if self.seed is None else self.seed
        return [(start + n) % 2**32 for n in range(self.count)]


@dataclass(frozen=True)
class VoiceLockRequest:
    test_ids: tuple[str, ...] = tuple(item["id"] for item in VOICE_LOCK_TESTS)
    seed: int = 600
    temperature: float = .9
    top_p: float = 1.0
    top_k: int = 50
    repetition_penalty: float = 1.5
    max_tokens: int = 768

    @classmethod
    def parse(cls, value):
        if not isinstance(value, dict):
            raise ValueError("Expected a JSON object.")
        defaults = asdict(cls())
        unknown = set(value) - set(defaults)
        if unknown:
            raise ValueError("Unknown Voice Lock settings: " + ", ".join(sorted(unknown)))
        fields = defaults | value
        test_ids = fields["test_ids"]
        valid_ids = {item["id"] for item in VOICE_LOCK_TESTS}
        if (not isinstance(test_ids, (list, tuple)) or not test_ids
                or any(not isinstance(item, str) or item not in valid_ids for item in test_ids)
                or len(set(test_ids)) != len(test_ids)):
            raise ValueError("Choose one or more unique Voice Lock validation lines.")
        fields["test_ids"] = tuple(test_ids)
        for name, lower, upper in [("seed", 0, 2**32 - 1), ("top_k", 1, 100),
                                   ("max_tokens", 128, 2048)]:
            item = fields[name]
            if type(item) is not int or not lower <= item <= upper:
                raise ValueError(f"{name} must be an integer from {lower} to {upper}.")
        for name, lower, upper in [("temperature", .1, 1.5), ("top_p", .05, 1),
                                   ("repetition_penalty", 1, 2)]:
            item = fields[name]
            if type(item) not in (int, float) or not math.isfinite(item) or not lower <= item <= upper:
                raise ValueError(f"{name} must be a number from {lower} to {upper}.")
        return cls(**fields)

    @property
    def tests(self):
        selected = set(self.test_ids)
        return [item for item in VOICE_LOCK_TESTS if item["id"] in selected]

    @property
    def settings(self):
        return {key: getattr(self, key) for key in
                ("temperature", "top_p", "top_k", "repetition_penalty", "max_tokens")}

    def seeds(self):
        return [(self.seed + index) % 2**32 for index in range(len(self.tests))]


@dataclass(frozen=True)
class LifeHubVoiceRequest:
    """A bounded set of existing workout cues to render with the approved voice."""

    session_id: str
    cues: tuple[dict, ...]

    @classmethod
    def parse(cls, value):
        if not isinstance(value, dict):
            raise ValueError("Expected a JSON object.")
        unknown = set(value) - {"session_id", "cues"}
        if unknown:
            raise ValueError("Unknown Life Hub voice fields: " + ", ".join(sorted(unknown)))
        session_id = value.get("session_id")
        if not isinstance(session_id, str) or not 1 <= len(session_id.strip()) <= 240:
            raise ValueError("session_id must contain 1–240 characters.")
        raw_cues = value.get("cues")
        if not isinstance(raw_cues, list) or not 1 <= len(raw_cues) <= 48:
            raise ValueError("Choose 1–48 workout cues.")
        cues, identifiers, total = [], set(), 0
        for item in raw_cues:
            if not isinstance(item, dict) or set(item) != {"id", "text"}:
                raise ValueError("Each cue must contain only id and text.")
            cue_id, cue_text = item["id"], item["text"]
            if (not isinstance(cue_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}", cue_id)
                    or cue_id in identifiers):
                raise ValueError("Cue ids must be unique safe identifiers up to 120 characters.")
            if not isinstance(cue_text, str) or not 1 <= len(cue_text.strip()) <= 600:
                raise ValueError("Each cue must contain 1–600 characters of existing workout text.")
            cue_text = re.sub(r"\s+", " ", cue_text).strip()
            total += len(cue_text)
            if total > 12000:
                raise ValueError("Workout cues exceed the 12,000-character limit.")
            identifiers.add(cue_id)
            cues.append({"id": cue_id, "text": cue_text})
        return cls(session_id=session_id.strip(), cues=tuple(cues))

    @property
    def settings(self):
        return {"temperature": .9, "top_p": 1.0, "top_k": 50,
                "repetition_penalty": 1.5, "max_tokens": 768}

    def seed_for(self, cue):
        material = f"{APPROVED_CANDIDATE_ID}\0{CLONE_REVISION}\0{cue['text']}".encode()
        return int.from_bytes(hashlib.sha256(material).digest()[:4], "big")

    def seeds(self):
        return [self.seed_for(cue) for cue in self.cues]


def reference_info():
    available = APPROVED_WAV.is_file() and APPROVED_JSON.is_file()
    return {"available": available, "candidate_id": APPROVED_CANDIDATE_ID,
            "candidate_number": 6, "seed": APPROVED_SEED,
            "reference_seconds": REFERENCE_END_SECONDS,
            "reference_text": REFERENCE_TEXT,
            "wav_url": "/reference.wav" if available else None}


def approved_voice_profile():
    return {
        "name": "Chadwick Flexington",
        "candidate_id": APPROVED_CANDIDATE_ID,
        "candidate_number": 6,
        "candidate_seed": APPROVED_SEED,
        "approved_wav_sha256": APPROVED_WAV_SHA256,
        "reference_text": REFERENCE_TEXT,
        "reference_seconds": REFERENCE_END_SECONDS,
        "clone_model": CLONE_MODEL,
        "clone_model_revision": CLONE_REVISION,
        "settings": LifeHubVoiceRequest("profile", tuple()).settings,
    }


def verify_approved_voice():
    if not APPROVED_WAV.is_file() or APPROVED_WAV.is_symlink():
        raise RuntimeError("Candidate 6 approved WAV is missing from the local voice profile.")
    digest = hashlib.sha256()
    with APPROVED_WAV.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != APPROVED_WAV_SHA256:
        raise RuntimeError("Candidate 6 approved WAV does not match the locked voice profile.")
    return True


def make_reference_clip(source, output, duration_seconds=REFERENCE_END_SECONDS):
    source, output = Path(source), Path(output)
    if not source.is_file() or source.is_symlink():
        raise RuntimeError("Candidate 6 reference WAV is missing. Restore the approved local copy first.")
    if type(duration_seconds) not in (int, float) or not math.isfinite(duration_seconds) or duration_seconds <= 0:
        raise ValueError("Reference duration must be positive.")
    output.parent.mkdir(parents=True, exist_ok=True)
    partial = output.with_suffix(output.suffix + ".partial")
    try:
        with wave.open(str(source), "rb") as input_audio:
            if (input_audio.getnchannels(), input_audio.getsampwidth(), input_audio.getcomptype()) != (1, 2, "NONE"):
                raise RuntimeError("Candidate 6 must be an uncompressed mono PCM16 WAV.")
            frame_count = int(round(duration_seconds * input_audio.getframerate()))
            if frame_count > input_audio.getnframes():
                raise RuntimeError("Candidate 6 is shorter than its approved reference window.")
            frames = input_audio.readframes(frame_count)
            with wave.open(str(partial), "wb") as clipped:
                clipped.setnchannels(1)
                clipped.setsampwidth(2)
                clipped.setframerate(input_audio.getframerate())
                clipped.writeframes(frames)
        partial.replace(output)
    except Exception:
        partial.unlink(missing_ok=True)
        raise
    return output


def config():
    return {"scripts": SCRIPTS, "presets": PRESETS, "defaults": asdict(Request()),
            "model": MODEL, "model_revision": REVISION, "seed_note": SEED_NOTE,
            "voice_lock": {"tests": VOICE_LOCK_TESTS, "defaults": asdict(VoiceLockRequest()),
                           "model": CLONE_MODEL, "model_revision": CLONE_REVISION,
                           "reference": reference_info()}}


class Store:
    def __init__(self, directory, url_prefix="/audio"):
        self.directory = Path(directory).resolve()
        self.directory.mkdir(parents=True, exist_ok=True)
        self.url_prefix = url_prefix.rstrip("/")
        self.lock = threading.Lock()

    def list(self):
        candidates = []
        for path in self.directory.glob("*.json"):
            try:
                item = json.loads(path.read_text())
                if (item["id"] == path.stem and isinstance(item["number"], int)
                        and self.audio_path(item["id"]).is_file()):
                    candidates.append(item)
            except (OSError, ValueError, KeyError, TypeError):
                continue
        return sorted(candidates, key=lambda item: item["number"], reverse=True)

    def audio_path(self, candidate_id):
        if not isinstance(candidate_id, str) or not re.fullmatch(r"[0-9a-f]{32}", candidate_id):
            raise ValueError("Invalid candidate ID.")
        path = self.directory / f"{candidate_id}.wav"
        if path.is_symlink():
            raise ValueError("Candidate files must be local WAV files.")
        return path

    def save(self, metadata, pcm, sample_rate):
        if not pcm or len(pcm) % 2 or type(sample_rate) is not int or sample_rate <= 0:
            raise ValueError("The model produced no valid PCM audio. Try another seed.")
        with self.lock:
            candidate_id = uuid.uuid4().hex
            wav_path = self.audio_path(candidate_id)
            json_path = wav_path.with_suffix(".json")
            partial_wav = wav_path.with_suffix(".wav.partial")
            partial_json = json_path.with_suffix(".json.partial")
            existing = self.list()
            record = {**metadata, "id": candidate_id,
                      "number": max((x["number"] for x in existing), default=0) + 1,
                      "created_at": datetime.now(timezone.utc).isoformat(),
                      "sample_rate": sample_rate, "duration_seconds": len(pcm) / 2 / sample_rate,
                      "wav_url": f"{self.url_prefix}/{candidate_id}.wav"}
            if isinstance(record.get("generation_seconds"), (int, float)) and record["duration_seconds"]:
                record["realtime_factor"] = round(record["generation_seconds"] / record["duration_seconds"], 3)
            try:
                with wave.open(str(partial_wav), "wb") as output:
                    output.setnchannels(1)
                    output.setsampwidth(2)
                    output.setframerate(sample_rate)
                    output.writeframes(pcm)
                partial_json.write_text(json.dumps(record, indent=2, allow_nan=False) + "\n")
                partial_wav.replace(wav_path)
                partial_json.replace(json_path)
            except Exception:
                partial_wav.unlink(missing_ok=True)
                partial_json.unlink(missing_ok=True)
                wav_path.unlink(missing_ok=True)
                raise
            return record


class LifeHubVoiceStore:
    """Content-addressed, local-only WAV cache for production workout cues."""

    def __init__(self, directory):
        self.directory = Path(directory).resolve()
        self.directory.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()

    def key(self, text, seed, settings):
        identity = {
            "profile": APPROVED_CANDIDATE_ID,
            "reference_sha256": APPROVED_WAV_SHA256,
            "model_revision": CLONE_REVISION,
            "text": text,
            "seed": seed,
            "settings": settings,
        }
        packed = json.dumps(identity, sort_keys=True, separators=(",", ":")).encode()
        return hashlib.sha256(packed).hexdigest()[:32]

    def audio_path(self, cache_id):
        if not isinstance(cache_id, str) or not re.fullmatch(r"[0-9a-f]{32}", cache_id):
            raise ValueError("Invalid Life Hub voice cache ID.")
        path = self.directory / f"{cache_id}.wav"
        if path.is_symlink():
            raise ValueError("Cached voice files must be local WAV files.")
        return path

    def load(self, cache_id):
        wav_path = self.audio_path(cache_id)
        json_path = wav_path.with_suffix(".json")
        try:
            record = json.loads(json_path.read_text())
            if record.get("id") != cache_id or not wav_path.is_file():
                return None
            return record
        except (OSError, ValueError, TypeError):
            return None

    def save(self, cache_id, metadata, pcm, sample_rate):
        if not pcm or len(pcm) % 2 or type(sample_rate) is not int or sample_rate <= 0:
            raise ValueError("The model produced no valid PCM audio. Try the cue again.")
        wav_path = self.audio_path(cache_id)
        json_path = wav_path.with_suffix(".json")
        partial_wav = wav_path.with_suffix(".wav.partial")
        partial_json = json_path.with_suffix(".json.partial")
        record = {
            **metadata,
            "id": cache_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "sample_rate": sample_rate,
            "duration_seconds": len(pcm) / 2 / sample_rate,
            "wav_url": f"/life-hub/audio/{cache_id}.wav",
        }
        if isinstance(record.get("generation_seconds"), (int, float)) and record["duration_seconds"]:
            record["realtime_factor"] = round(record["generation_seconds"] / record["duration_seconds"], 3)
        with self.lock:
            existing = self.load(cache_id)
            if existing:
                return existing
            try:
                with wave.open(str(partial_wav), "wb") as output:
                    output.setnchannels(1)
                    output.setsampwidth(2)
                    output.setframerate(sample_rate)
                    output.writeframes(pcm)
                partial_json.write_text(json.dumps(record, indent=2, allow_nan=False) + "\n")
                partial_wav.replace(wav_path)
                partial_json.replace(json_path)
            except Exception:
                partial_wav.unlink(missing_ok=True)
                partial_json.unlink(missing_ok=True)
                raise
        return record


class BusyError(Exception):
    pass


class JobGate:
    def __init__(self):
        self.lock = threading.Lock()
        self.active = None

    def claim(self, name):
        with self.lock:
            if self.active is not None:
                raise BusyError("Another local voice job is already running. Let it finish or cancel it first.")
            self.active = name

    def release(self, name):
        with self.lock:
            if self.active == name:
                self.active = None


class Manager:
    def __init__(self, store, engine, gate=None, job_name="casting"):
        self.store, self.engine = store, engine
        self.gate, self.job_name = gate, job_name
        self.lock = threading.Lock()
        self.job = {"status": "idle", "message": "Ready to cast Chadwick.", "completed": 0,
                    "total": 0, "started_at": None, "error": None, "cancel_requested": False}

    def state(self):
        with self.lock:
            job = copy.deepcopy(self.job)
        return {"job": job, "candidates": self.store.list()}

    def submit(self, value):
        request = Request.parse(value)
        with self.lock:
            if self.job["status"] in ("loading", "generating"):
                raise BusyError("A batch is already running. Let it finish or stop after this candidate.")
        if self.gate:
            self.gate.claim(self.job_name)
        with self.lock:
            self.job = {"status": "loading", "message": "Preparing the voice model…", "completed": 0,
                        "total": request.count, "started_at": datetime.now(timezone.utc).isoformat(),
                        "error": None, "cancel_requested": False}
        try:
            threading.Thread(target=self._run, args=(request,), daemon=True).start()
        except Exception:
            if self.gate:
                self.gate.release(self.job_name)
            raise

    def cancel(self):
        with self.lock:
            if self.job["status"] in ("loading", "generating"):
                self.job["cancel_requested"] = True
                self.job["message"] = "Stopping after the current download or candidate finishes."

    def _update(self, **values):
        with self.lock:
            self.job.update(values)

    def _cancelled(self):
        with self.lock:
            return self.job["cancel_requested"]

    def _run(self, request):
        try:
            load_seconds = self.engine.load(lambda message: self._update(message=message))
            for index, seed in enumerate(request.seeds()):
                if self._cancelled():
                    break
                self._update(status="generating", message=f"Generating candidate {index + 1} of {request.count}…")
                started = time.perf_counter()
                pcm, sample_rate, extra = self.engine.generate(request, seed)
                elapsed = time.perf_counter() - started
                self.store.save({**extra, "description": request.description, "script_id": request.script_id,
                                 "script": request.script, "seed": seed, "settings": request.settings,
                                 "generation_seconds": round(elapsed, 3),
                                 "load_seconds": round(load_seconds if index == 0 else 0, 3),
                                 "model": MODEL, "model_revision": REVISION}, pcm, sample_rate)
                self._update(completed=index + 1)
            if self._cancelled():
                self._update(status="cancelled", message="Stopped. Finished candidates are saved.")
            else:
                self._update(status="completed", message=f"{request.count} candidates saved. Ready to listen.")
        except Exception as exc:
            self._update(status="error", error=str(exc), message="Generation stopped. Finished candidates are saved.")
        finally:
            if self.gate:
                self.gate.release(self.job_name)


class VoiceLockManager:
    def __init__(self, store, engine, gate=None):
        self.store, self.engine, self.gate = store, engine, gate
        self.job_name = "voice-lock"
        self.lock = threading.Lock()
        self.job = {"status": "idle", "message": "Ready to test the approved Chadwick voice.",
                    "completed": 0, "total": 0, "started_at": None, "error": None,
                    "cancel_requested": False}

    def state(self):
        with self.lock:
            job = copy.deepcopy(self.job)
        return {"job": job, "clips": self.store.list()}

    def submit(self, value):
        request = VoiceLockRequest.parse(value)
        if not reference_info()["available"]:
            raise ValueError("Candidate 6 reference files are missing from the approved local folder.")
        verify_approved_voice()
        with self.lock:
            if self.job["status"] in ("loading", "generating"):
                raise BusyError("A Voice Lock pack is already running.")
        if self.gate:
            self.gate.claim(self.job_name)
        with self.lock:
            self.job = {"status": "loading", "message": "Preparing the voice-cloning model…",
                        "completed": 0, "total": len(request.tests),
                        "started_at": datetime.now(timezone.utc).isoformat(), "error": None,
                        "cancel_requested": False}
        try:
            threading.Thread(target=self._run, args=(request,), daemon=True).start()
        except Exception:
            if self.gate:
                self.gate.release(self.job_name)
            raise

    def cancel(self):
        with self.lock:
            if self.job["status"] in ("loading", "generating"):
                self.job["cancel_requested"] = True
                self.job["message"] = "Stopping after the current download or validation line finishes."

    def _update(self, **values):
        with self.lock:
            self.job.update(values)

    def _cancelled(self):
        with self.lock:
            return self.job["cancel_requested"]

    def _run(self, request):
        tests = request.tests
        try:
            load_seconds = self.engine.load(lambda message: self._update(message=message))
            for index, (test, seed) in enumerate(zip(tests, request.seeds())):
                if self._cancelled():
                    break
                self._update(status="generating",
                             message=f"Generating Voice Lock line {index + 1} of {len(tests)}…")
                started = time.perf_counter()
                pcm, sample_rate, extra = self.engine.generate(request, test, seed)
                elapsed = time.perf_counter() - started
                self.store.save({**extra, "test_id": test["id"], "title": test["title"],
                                 "text": test["text"], "seed": seed, "settings": request.settings,
                                 "reference_candidate_id": APPROVED_CANDIDATE_ID,
                                 "reference_seed": APPROVED_SEED,
                                 "reference_text": REFERENCE_TEXT,
                                 "reference_seconds": REFERENCE_END_SECONDS,
                                 "generation_seconds": round(elapsed, 3),
                                 "load_seconds": round(load_seconds if index == 0 else 0, 3),
                                 "model": CLONE_MODEL, "model_revision": CLONE_REVISION}, pcm, sample_rate)
                self._update(completed=index + 1)
            if self._cancelled():
                self._update(status="cancelled", message="Stopped. Finished Voice Lock clips are saved.")
            else:
                self._update(status="completed", message=f"{len(tests)} Voice Lock clips saved. Compare them with Candidate 6.")
        except Exception as exc:
            self._update(status="error", error=str(exc),
                         message="Voice Lock stopped. Finished clips are saved.")
        finally:
            if self.gate:
                self.gate.release(self.job_name)


class LifeHubVoiceManager:
    """Pre-generates and caches an ordered workout cue playlist."""

    def __init__(self, store, engine, gate=None):
        self.store, self.engine, self.gate = store, engine, gate
        self.job_name = "life-hub"
        self.lock = threading.Lock()
        self.job = {"status": "idle", "message": "Candidate 6 is ready for a workout.",
                    "completed": 0, "total": 0, "cached": 0, "session_id": None,
                    "started_at": None, "error": None, "cancel_requested": False}
        self.clips = []

    def state(self):
        with self.lock:
            return {"job": copy.deepcopy(self.job), "clips": copy.deepcopy(self.clips),
                    "profile": approved_voice_profile()}

    def submit(self, value):
        request = LifeHubVoiceRequest.parse(value)
        if not reference_info()["available"]:
            raise ValueError("Candidate 6 reference files are missing from the approved local folder.")
        verify_approved_voice()
        with self.lock:
            if self.job["status"] in ("loading", "generating"):
                raise BusyError("A Chadwick workout is already being prepared.")
        if self.gate:
            self.gate.claim(self.job_name)
        with self.lock:
            self.clips = []
            self.job = {"status": "loading", "message": "Checking Chadwick's local cue cache…",
                        "completed": 0, "total": len(request.cues), "cached": 0,
                        "session_id": request.session_id,
                        "started_at": datetime.now(timezone.utc).isoformat(), "error": None,
                        "cancel_requested": False}
        try:
            threading.Thread(target=self._run, args=(request,), daemon=True).start()
        except Exception:
            if self.gate:
                self.gate.release(self.job_name)
            raise

    def cancel(self):
        with self.lock:
            if self.job["status"] in ("loading", "generating"):
                self.job["cancel_requested"] = True
                self.job["message"] = "Stopping after the current cue finishes."

    def _update(self, **values):
        with self.lock:
            self.job.update(values)

    def _cancelled(self):
        with self.lock:
            return self.job["cancel_requested"]

    def _append(self, cue, record, cached):
        clip = {**record, "cue_id": cue["id"], "text": cue["text"], "cached": cached}
        with self.lock:
            self.clips.append(clip)
            self.job["completed"] = len(self.clips)
            if cached:
                self.job["cached"] += 1

    def _run(self, request):
        try:
            pending = []
            for cue, seed in zip(request.cues, request.seeds()):
                cache_id = self.store.key(cue["text"], seed, request.settings)
                if self.store.load(cache_id) is None:
                    pending.append(cache_id)
            load_seconds = 0
            if pending:
                load_seconds = self.engine.load(lambda message: self._update(message=message))
            for index, (cue, seed) in enumerate(zip(request.cues, request.seeds())):
                if self._cancelled():
                    break
                cache_id = self.store.key(cue["text"], seed, request.settings)
                record = self.store.load(cache_id)
                if record:
                    self._append(cue, record, True)
                    continue
                self._update(status="generating",
                             message=f"Preparing Chadwick cue {index + 1} of {len(request.cues)}…")
                started = time.perf_counter()
                pcm, sample_rate, extra = self.engine.generate(request, cue, seed)
                elapsed = time.perf_counter() - started
                record = self.store.save(cache_id, {
                    **extra,
                    "text": cue["text"],
                    "seed": seed,
                    "settings": request.settings,
                    "reference_candidate_id": APPROVED_CANDIDATE_ID,
                    "reference_seed": APPROVED_SEED,
                    "reference_text": REFERENCE_TEXT,
                    "reference_seconds": REFERENCE_END_SECONDS,
                    "generation_seconds": round(elapsed, 3),
                    "load_seconds": round(load_seconds, 3),
                    "model": CLONE_MODEL,
                    "model_revision": CLONE_REVISION,
                }, pcm, sample_rate)
                load_seconds = 0
                self._append(cue, record, False)
            if self._cancelled():
                self._update(status="cancelled", message="Stopped. Finished Chadwick cues are cached.")
            else:
                self._update(status="completed", message="Chadwick is ready. Press play when you are.")
        except Exception as exc:
            self._update(status="error", error=str(exc), message="Chadwick voice preparation failed.")
        finally:
            if self.gate:
                self.gate.release(self.job_name)
