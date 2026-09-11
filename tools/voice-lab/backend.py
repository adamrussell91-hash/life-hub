"""Verified MLX-Audio VoiceDesign adapter; imports/model loading are lazy."""
from __future__ import annotations

import importlib.metadata
import inspect
import gc
import os
import platform
import shutil
import stat
import time
from pathlib import Path

from lab import (CLONE_MODEL, CLONE_REVISION, MODEL, REFERENCE_TEXT, REFERENCE_WAV,
                 REVISION, ROOT, VoiceLockRequest, make_reference_clip, APPROVED_WAV)

# Set before Hugging Face/transformers imports. No shared/global model caches.
for name, relative in {
    "HF_HOME": ".cache/huggingface",
    "HF_HUB_CACHE": ".cache/huggingface/hub",
    "HF_XET_CACHE": ".cache/huggingface/xet",
    "XDG_CACHE_HOME": ".cache",
    "TMPDIR": ".runtime/tmp",
}.items():
    location = ROOT / relative
    location.mkdir(parents=True, exist_ok=True)
    os.environ[name] = str(location)
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"


# macOS marks an iCloud placeholder with UF_DATALESS. A placeholder still
# reports as a normal file, so Path.is_file() alone can incorrectly tell the
# model loader that its cache is ready and leave it blocked on a later read.
DATALESS_FLAG = 0x40000000


def is_resident_file(path):
    try:
        metadata = Path(path).stat()
    except OSError:
        return False
    return stat.S_ISREG(metadata.st_mode) and not getattr(metadata, "st_flags", 0) & DATALESS_FLAG


def encode_pcm(samples, token_count, max_tokens):
    import numpy as np
    audio = np.asarray(samples, dtype=np.float32)
    if audio.ndim != 1 or audio.size == 0 or not np.isfinite(audio).all():
        raise ValueError("The model returned invalid or empty audio. Try another seed.")
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes()
    warning = ("Reached the token limit; this audition may end early. Increase Max tokens and try again."
               if token_count >= max_tokens else None)
    return pcm, warning


class Engine:
    def __init__(self, release_other=None):
        self.model = None
        self.release_other = release_other

    def unload(self):
        if self.model is None:
            return
        self.model = None
        gc.collect()
        try:
            import mlx.core as mx
            mx.clear_cache()
        except ImportError:
            pass

    def load(self, progress):
        if self.model is not None:
            return 0
        if self.release_other:
            self.release_other()
        started = time.perf_counter()
        if platform.system() != "Darwin" or platform.machine() != "arm64":
            raise RuntimeError("Voice Lab needs native Apple Silicon Python on macOS. Start it outside Rosetta.")
        import mlx.core as mx
        if not mx.metal.is_available():
            raise RuntimeError("Apple Metal is unavailable. Run Voice Lab in a normal local Mac terminal.")
        from huggingface_hub import snapshot_download
        from huggingface_hub.errors import LocalEntryNotFoundError
        from mlx_audio.tts.utils import load_model
        mx.set_cache_limit(128 * 1024**2)
        kwargs = {"repo_id": MODEL, "revision": REVISION,
                  "allow_patterns": ["*.json", "*.safetensors", "*.txt"], "token": False}
        # local_files_only can return an incomplete snapshot; check both required weight files.
        try:
            cached = Path(snapshot_download(**kwargs, local_files_only=True))
            complete = all(is_resident_file(cached / file) for file in
                           ("model.safetensors", "speech_tokenizer/model.safetensors",
                            "config.json", "vocab.json", "merges.txt", "tokenizer_config.json",
                            "speech_tokenizer/config.json"))
        except LocalEntryNotFoundError:
            complete = False
        if not complete:
            free = shutil.disk_usage(ROOT).free / 1024**3
            if free < 5:
                raise RuntimeError(f"Only {free:.1f} GB free. Free at least 5 GB before downloading the voice model.")
            progress("Downloading the 2.3 GB voice model for first use. This can take several minutes…")
            cached = snapshot_download(**kwargs, max_workers=2, force_download=True)
        elif shutil.disk_usage(ROOT).free < 1024**3:
            raise RuntimeError("Less than 1 GB free. Free some space before generating and saving audio.")
        progress("Loading VoiceDesign into Apple Silicon memory…")
        model = load_model(cached)
        method = getattr(model, "generate_voice_design", None)
        expected = {"text", "instruct", "language", "temperature", "top_k", "top_p",
                    "repetition_penalty", "max_tokens", "stream", "verbose"}
        if method is None or not expected <= set(inspect.signature(method).parameters):
            raise RuntimeError("Installed MLX-Audio does not expose the verified VoiceDesign interface. Re-run launch.sh.")
        if model.config.tts_model_type != "voice_design":
            raise RuntimeError("The loaded model is not a VoiceDesign model.")
        self.model = model
        return time.perf_counter() - started

    def generate(self, request, seed):
        import mlx.core as mx
        import numpy as np
        if self.model is None:
            raise RuntimeError("Load the VoiceDesign model before generating.")
        mx.random.seed(seed)
        arrays, sample_rate, token_count = [], None, 0
        try:
            for result in self.model.generate_voice_design(
                    text=request.script, instruct=request.description, language="English",
                    **request.settings, stream=False, verbose=False):
                mx.eval(result.audio)
                if sample_rate is not None and result.sample_rate != sample_rate:
                    raise RuntimeError("Model changed sample rate within an audition.")
                sample_rate = int(result.sample_rate)
                arrays.append(np.asarray(result.audio, dtype=np.float32))
                token_count += int(result.token_count)
            if not arrays:
                raise RuntimeError("VoiceDesign returned no audio. Try another seed or description.")
            pcm, warning = encode_pcm(np.concatenate(arrays), token_count, request.max_tokens)
            versions = {name: importlib.metadata.version(name) for name in
                        ("mlx-audio", "mlx", "transformers", "numpy", "huggingface-hub")}
            versions["python"] = platform.python_version()
            versions["macos"] = platform.mac_ver()[0]
            return pcm, sample_rate, {"warning": warning, "runtime_versions": versions,
                                      "token_count": token_count,
                                      "peak_memory_gb": round(mx.get_peak_memory() / 1e9, 3)}
        finally:
            mx.clear_cache()


class CloneEngine:
    def __init__(self, release_other=None):
        self.model = None
        self.release_other = release_other

    def unload(self):
        if self.model is None:
            return
        self.model = None
        gc.collect()
        try:
            import mlx.core as mx
            mx.clear_cache()
        except ImportError:
            pass

    def load(self, progress):
        if self.model is not None:
            return 0
        if self.release_other:
            self.release_other()
        started = time.perf_counter()
        if platform.system() != "Darwin" or platform.machine() != "arm64":
            raise RuntimeError("Voice Lock needs native Apple Silicon Python on macOS. Start it outside Rosetta.")
        import mlx.core as mx
        if not mx.metal.is_available():
            raise RuntimeError("Apple Metal is unavailable. Run Voice Lab in a normal local Mac terminal.")
        from huggingface_hub import snapshot_download
        from huggingface_hub.errors import LocalEntryNotFoundError
        from mlx_audio.tts.utils import load_model
        mx.set_cache_limit(128 * 1024**2)
        make_reference_clip(APPROVED_WAV, REFERENCE_WAV)
        kwargs = {"repo_id": CLONE_MODEL, "revision": CLONE_REVISION,
                  "allow_patterns": ["*.json", "*.safetensors", "*.txt"], "token": False}
        try:
            cached = Path(snapshot_download(**kwargs, local_files_only=True))
            complete = all(is_resident_file(cached / file) for file in
                           ("model.safetensors", "speech_tokenizer/model.safetensors",
                            "config.json", "vocab.json", "merges.txt", "tokenizer_config.json",
                            "speech_tokenizer/config.json"))
        except LocalEntryNotFoundError:
            complete = False
        if not complete:
            free = shutil.disk_usage(ROOT).free / 1024**3
            if free < 4:
                raise RuntimeError(f"Only {free:.1f} GB free. Free at least 4 GB before downloading Voice Lock.")
            progress("Downloading the 1.7 GB Voice Lock model for first use. This can take several minutes…")
            cached = snapshot_download(**kwargs, max_workers=2, force_download=True)
        elif shutil.disk_usage(ROOT).free < 1024**3:
            raise RuntimeError("Less than 1 GB free. Free some space before generating and saving audio.")
        progress("Loading the Candidate 6 voice-cloning model into Apple Silicon memory…")
        model = load_model(cached)
        method = getattr(model, "generate", None)
        expected = {"text", "ref_audio", "ref_text", "lang_code", "temperature",
                    "top_k", "top_p", "repetition_penalty", "max_tokens", "stream", "verbose"}
        if method is None or not expected <= set(inspect.signature(method).parameters):
            raise RuntimeError("Installed MLX-Audio does not expose the verified Voice Lock interface. Re-run launch.sh.")
        if model.config.tts_model_type != "base":
            raise RuntimeError("The loaded Voice Lock model is not a Qwen3-TTS Base model.")
        if model.speech_tokenizer is None or not model.speech_tokenizer.has_encoder:
            raise RuntimeError("The Voice Lock model is missing its reference-audio encoder.")
        self.model = model
        return time.perf_counter() - started

    def generate(self, request, test, seed):
        import mlx.core as mx
        import numpy as np
        if self.model is None:
            raise RuntimeError("Load the Voice Lock model before generating.")
        mx.random.seed(seed)
        arrays, sample_rate, token_count = [], None, 0
        try:
            for result in self.model.generate(
                    text=test["text"], ref_audio=str(REFERENCE_WAV), ref_text=REFERENCE_TEXT,
                    lang_code="English", **request.settings, split_pattern=None,
                    stream=False, verbose=False):
                mx.eval(result.audio)
                if sample_rate is not None and result.sample_rate != sample_rate:
                    raise RuntimeError("Model changed sample rate within a Voice Lock line.")
                sample_rate = int(result.sample_rate)
                arrays.append(np.asarray(result.audio, dtype=np.float32))
                token_count += int(result.token_count)
            if not arrays:
                raise RuntimeError("Voice Lock returned no audio. Try another seed.")
            pcm, warning = encode_pcm(np.concatenate(arrays), token_count,
                                      request.settings["max_tokens"])
            versions = {name: importlib.metadata.version(name) for name in
                        ("mlx-audio", "mlx", "transformers", "numpy", "huggingface-hub")}
            versions["python"] = platform.python_version()
            versions["macos"] = platform.mac_ver()[0]
            return pcm, sample_rate, {"warning": warning, "runtime_versions": versions,
                                      "token_count": token_count,
                                      "peak_memory_gb": round(mx.get_peak_memory() / 1e9, 3)}
        finally:
            mx.clear_cache()
