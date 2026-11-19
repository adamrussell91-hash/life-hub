"""Speakers from a 16 kHz mono WAV with sherpa-onnx (pyannote segmentation 3.0 + titanet small).
usage: diarize.py audio.wav COUNT [--models DIR] [--threshold 0.5]
Prints JSON [{"start": s, "end": s, "speaker": "S1"}, ...] (seconds) to stdout. Nothing else is printed."""
import argparse, json, os, sys
import soundfile as sf
import sherpa_onnx

ap = argparse.ArgumentParser()
ap.add_argument("audio")
ap.add_argument("count", type=int)
ap.add_argument("--models", default=os.path.expanduser("~/Tools/meeting-transcriber/models"))
ap.add_argument("--threshold", type=float, default=0.5)
a = ap.parse_args()

samples, sr = sf.read(a.audio, dtype="float32")
if sr != 16000:
    sys.exit("expected a 16 kHz WAV")
if samples.ndim > 1:
    samples = samples.mean(axis=1)

cfg = sherpa_onnx.OfflineSpeakerDiarizationConfig(
    segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
        pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(
            model=f"{a.models}/sherpa-onnx-pyannote-segmentation-3-0/model.onnx")),
    embedding=sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=f"{a.models}/nemo_en_titanet_small.onnx"),
    clustering=sherpa_onnx.FastClusteringConfig(num_clusters=max(1, a.count), threshold=a.threshold),
    min_duration_on=0.3, min_duration_off=0.5)
sd = sherpa_onnx.OfflineSpeakerDiarization(cfg)
segs = [{"start": round(r.start, 3), "end": round(r.end, 3), "speaker": f"S{r.speaker + 1}"}
        for r in sd.process(samples).sort_by_start_time()]
json.dump(segs, sys.stdout)
