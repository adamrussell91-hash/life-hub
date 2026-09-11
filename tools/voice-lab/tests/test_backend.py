from pathlib import Path
import stat
import struct
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import backend
import lab


class AudioTests(unittest.TestCase):
    def test_resident_file_rejects_icloud_placeholder(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.safetensors"
            path.write_bytes(b"weights")
            self.assertTrue(backend.is_resident_file(path))

            placeholder = types.SimpleNamespace(
                st_mode=stat.S_IFREG,
                st_flags=backend.DATALESS_FLAG,
            )
            with patch.object(Path, "stat", return_value=placeholder):
                self.assertFalse(backend.is_resident_file(path))

    def test_float_audio_becomes_little_endian_pcm_without_wrapping(self):
        pcm, warning = backend.encode_pcm([-2., -1., 0., 1., 2.], 5, 8)
        self.assertEqual(struct.unpack("<5h", pcm), (-32767, -32767, 0, 32767, 32767))
        self.assertIsNone(warning)

    def test_empty_nan_and_multichannel_audio_rejected(self):
        for samples in ([], [float("nan")], [float("inf")], [[1, 2], [3, 4]]):
            with self.subTest(samples=samples), self.assertRaises(ValueError):
                backend.encode_pcm(samples, 2, 10)

    def test_token_exhaustion_is_marked_as_possible_truncation(self):
        _, warning = backend.encode_pcm([0., .5], 128, 128)
        self.assertIn("token limit", warning)

    def test_clone_engine_passes_candidate_six_audio_and_exact_transcript(self):
        fake_core = types.ModuleType("mlx.core")
        fake_core.random = types.SimpleNamespace(seed=lambda value: None)
        fake_core.eval = lambda value: None
        fake_core.clear_cache = lambda: None
        fake_core.get_peak_memory = lambda: 123
        fake_mlx = types.ModuleType("mlx")
        fake_mlx.core = fake_core
        model = FakeCloneModel()
        engine = backend.CloneEngine()
        engine.model = model
        request = backend.VoiceLockRequest.parse({"test_ids": ["reaction"], "seed": 12})
        with patch.dict(sys.modules, {"mlx": fake_mlx, "mlx.core": fake_core}):
            pcm, sample_rate, metadata = engine.generate(request, request.tests[0], 12)
        self.assertTrue(pcm)
        self.assertEqual(sample_rate, 24000)
        self.assertEqual(model.kwargs["ref_audio"], str(backend.REFERENCE_WAV))
        self.assertEqual(model.kwargs["ref_text"], backend.REFERENCE_TEXT)
        self.assertEqual(model.kwargs["lang_code"], "English")
        self.assertEqual(model.kwargs["text"], request.tests[0]["text"])
        self.assertEqual(metadata["token_count"], 4)

    def test_clone_engine_accepts_locked_life_hub_request(self):
        fake_core = types.ModuleType("mlx.core")
        fake_core.random = types.SimpleNamespace(seed=lambda value: None)
        fake_core.eval = lambda value: None
        fake_core.clear_cache = lambda: None
        fake_core.get_peak_memory = lambda: 123
        fake_mlx = types.ModuleType("mlx")
        fake_mlx.core = fake_core
        engine = backend.CloneEngine()
        engine.model = FakeCloneModel()
        request = lab.LifeHubVoiceRequest.parse({
            "session_id": "workout-1",
            "cues": [{"id": "start", "text": "Bro, start the set."}],
        })
        with patch.dict(sys.modules, {"mlx": fake_mlx, "mlx.core": fake_core}):
            pcm, sample_rate, metadata = engine.generate(request, request.cues[0], request.seeds()[0])
        self.assertTrue(pcm)
        self.assertEqual(sample_rate, 24000)
        self.assertEqual(metadata["token_count"], 4)


class FakeCloneModel:
    def generate(self, **kwargs):
        self.kwargs = kwargs
        yield types.SimpleNamespace(audio=np.array([0., .25], dtype=np.float32),
                                    sample_rate=24000, token_count=4)


if __name__ == "__main__":
    unittest.main()
