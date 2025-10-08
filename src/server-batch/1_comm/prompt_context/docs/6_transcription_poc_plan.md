# Transcription-First Proof of Concept Plan

## Goals

- Cut the end-to-end runtime for each IA zip by transcribing each WAV file once, then re-using that transcript when slicing into utterances.
- Preserve the per-utterance AAC + JSON contract produced by `2_process_transcribe_ia_zips.py` so downstream consumers stay unchanged.
- Improve transcription quality by supplying domain-specific prompts and post-processing.
- Keep the workflow GPU-friendly on the local RTX 4090 (large-v3 model, FP16/INT8 compute) without blowing up VRAM or disk usage.

## Environment & Inputs

- Paths and credentials load from the root `.env` (see `.env.template`). Key defaults: `RAW_FOLDER="F:/_repos/ISSiRT_assets/_raw/"`, `WEB_ASSETS_FOLDER="F:/_repos/ISSiRT_assets/ISSiRT_web_assets/"`, `IA_ZIP_SG_FOLDER="F:/_repos/ISSiRT_assets/_raw/InternetArchive_space_to_grounds"`, and `IA_ZIP_AG_FOLDER="F:/_repos/ISSiRT_assets/_raw/InternetArchive_dragon_cst_to_grounds"`.
- Transcription workflow reads precomputed prompt context under `${RAW_FOLDER}/prompt_context/YYYY/MM/DD/` (see `2_corpus_context_plan.md`) in addition to IA zips stored in `${IA_ZIP_SG_FOLDER}` and `${IA_ZIP_AG_FOLDER}`.

## Current Pipeline Recap

- Unzip IA archive → convert each WAV to mono/32 kHz → stream through `AudioSegmenter`.
- `AudioSegmenter` performs VAD (WebRTC, 20 ms frames, `MIN_WAIT_BLOCKS=10`) and writes AAC chunks on-the-fly.
- Each AAC chunk is transcribed independently with WhisperX. Translation runs for non-English segments.
- JSON results are written beside the AAC and optionally POSTed to TalkyBot.
- Pain point: VAD-first design runs many short Whisper inferences; GPU spends more time on load/setup than decoding speech.

## Transcription-First Concept

**Contract**

- Input: single mono WAV (≈ 15–45 min) with descriptor + start time encoded in filename.
- Output: set of AAC files + JSON transcripts (same schema) whose timing and naming conventions match the current pipeline.
- Success criteria: per-utterance timestamps align (± one VAD frame), transcripts equal or better quality, runtime per WAV substantially lower.

**High-level Flow**

1. **Decode Prep**: keep existing unzip + `ensure_mono_wav`; load audio once with `whisperx.load_audio` and `AudioSegment`.
2. **Full-file Transcription**:
   - `model.transcribe(audio, batch_size=32, chunk_length=30, condition_on_previous_text=False, beam_size=2, best_of=2, temperature=0)`. Consider `compute_type="int8_float16"` if VRAM gets tight.
   - Pass an `initial_prompt` containing crew names, acronyms, and common comm phrases.
   - Store raw segments plus logprobs for debugging.
3. **Mandatory Alignment Pass**:
   - Load the WhisperX alignment model for the detected language (`whisperx.load_align_model`) and run `whisperx.align` to obtain word-level timestamps. Cache alignment artifacts so re-segmentation never repeats the step.
4. **Word-Timestamp Segmentation**:
   - Walk the aligned word stream and derive utterance boundaries by detecting gaps equivalent to the historical VAD thresholds (e.g., ≥ `MIN_WAIT_BLOCKS * FRAME_DURATION`).
   - Merge adjacent words until a gap exceeds the silence threshold, then close the interval. Extend the interval edges by the same pre/post padding the VAD introduced to avoid trimming breaths.
   - When alignment contains long non-speech spans (music/static), inject synthetic silence intervals so filenames and timing stay compatible with prior output.
5. **Utterance Reconstruction**:
   - For each derived interval:
     - Slice audio with `AudioSegment[start:end]` and export AAC (`.export(..., format="adts", codec="aac", bitrate=AAC_BITRATE)`).
     - Gather transcript text by selecting aligned words/segments whose midpoint falls inside the interval. If an interval contains no words, emit empty transcript and tag for review.
     - Form JSON payload mirroring `runTranscriptionLocally` output: include `segments`, `utteranceTime`, `model`, `descriptor`, `filename`, and optional `origLangSegments` if translation occurred.
6. **Translation Handling**:
   - If detected language ≠ English, run second `model.transcribe(..., task="translate")` once at the full-file level, then slice translated segments parallel to source-language segments.
7. **Housekeeping**:
   - Cache per-WAV transcription + alignment artifacts (JSON) to allow re-splitting with different VAD settings without another decode.
   - Clean temp directories like today.

## Detailed Implementation Steps

1. **Refactor Helpers**
   - Extract new `derive_alignment_intervals(alignment_data, silence_cfg)` that walks word timestamps, converts legacy VAD parameters into gap thresholds, and outputs interval metadata.
   - Extract `slice_audio_to_aac(audio_segment, interval, output_path)`.
   - Extract `build_initial_prompt(comm_datetime, descriptor)` to load `${RAW_FOLDER}/prompt_context/YYYY/MM/DD/prompt.txt` (with fallback to `prompt_input.json`) and append channel hints.
2. **New Controller Script**
   - Clone structure of current `process_zip_file`, but replace `AudioSegmenter` usage with:
     - call `build_initial_prompt(start_time, descriptor)` → returns prompt text fed into transcription.
     - call `transcribe_full_wav(wav_path, descriptor, start_time, prompt_text)` → returns transcription + alignment data.
   - call `derive_alignment_intervals` → returns intervals.
   - call `render_utterances(transcription_data, intervals, output_dir)`.
   - Keep tracking files, skip lists, logging, and exit handling identical.
3. **JSON Builder**
   - Ensure JSON schema matches existing `runTranscriptionLocally` output so ingest code needs no change.
   - When slicing segments, recompute `utteranceTime` as `start_time + interval.start_offset` (UTC) to preserve filenames.
4. **Performance-Sensitive Settings**
   - Preload Whisper model once per process (already done) and keep on GPU.
   - Tune `chunk_length` to keep GPU saturated (~30 s) while respecting RAM; iterate with real data.
   - Keep Whisper internal speech thresholds conservative; segmentation relies on alignment-driven silence detection, so prefer capturing marginal words and filtering later.
5. **Validation Harness**
   - Create small comparison tool that runs both pipelines on a sample WAV and diffs outputs (count of utterances, average duration, text differences, runtime).
   - Log warnings when a derived interval has zero transcript tokens or vice versa.

## Speed & Accuracy Ideas Beyond the Core Plan

- **Hot Vocabulary Boosting**: Use WhisperX `suppress_tokens` / `prefix` options or experiment with `temperature=0.2` and `log_prob_threshold=-1` to bias toward domain terms.
- **Batch Processing**: Overlap work—while GPU transcribes WAV _n_, use CPU thread to unzip WAV _n+1_ and precompute alignment-derived silence stats so slicing can start immediately.
- **INT8 Mixed Precision**: RTX 4090 handles `compute_type="int8_float16"`; expect ~15–20% speedup with negligible quality drop.
- **Diarization**: Hook WhisperX speaker diarization to tag segments (Mission Control vs Crew). Even if unused downstream, metadata helps QA.
- **Adaptive Silence Thresholds**: Collect stats on false cuts, tune the silence gap duration (derived from `MIN_WAIT_BLOCKS`) dynamically per channel (SG vs AG).
- **Post-Processing**: Normalize transcripts (capitalize call signs, fix common mis-hearings) via a small domain-specific correction dictionary.
- **Caching Converted Audio**: Store mono/32 kHz WAVs separately so re-runs skip `ensure_mono_wav` work.
- **Health Metrics**: Emit Prometheus-friendly timing logs (transcription time vs slicing time) for ongoing tuning.

## Edge Cases & Mitigations

- **Extremely Long WAV (>1 hr)**: Use WhisperX `chunk_length=30` + sliding window to keep memory bounded; stream alignment-derived intervals to disk to avoid large in-memory lists.
- **No Speech Detection**: If alignment returns zero words, mark the file as silence, emit a stub JSON record, and append a log entry for manual confirmation.
- **Mismatched Timestamps**: When alignment drifts, snap words to the nearest interval boundary but cap drift at ±1.5 s; if drift exceeds the cap, flag for manual review and optionally fall back to energy-based heuristics for that region only.
- **Translation Latency**: Cache original-language segments; reuse if translation later deemed unnecessary.

## Validation Checklist

- Unit-test `derive_alignment_intervals` against the current `AudioSegmenter` output by feeding identical WAV files and asserting interval counts/durations stay within the tolerated drift.
- Regression-test a small IA zip through both pipelines, diffing runtime, total speech duration, and sample transcripts.
- Profile GPU/CPU utilization (Nsight Systems or `torch.cuda.utilization()`) to confirm the bottleneck shifts from setup to decoding.

## Open Questions

- Do downstream consumers rely on per-word timestamps? If yes, ensure JSON preserves them.
- Should we retain the original VAD-first path behind a flag for quick rollback?
- Are we comfortable with alignment model downloads living in `whisperx_models` alongside the existing base model?

## Dependencies

- Relies on precomputed prompt context described in `2_corpus_context_plan.md` (specifically `${RAW_FOLDER}/prompt_context/YYYY/MM/DD/prompt.txt`).

## Concurrency & Pipeline Orchestration

- **Single Whisper Instance, Multiple Pipelines**: Maintain one WhisperX model resident on the RTX 4090 to avoid repeated loads, but drive it from a scheduler that alternates work between two logical pipelines (e.g., odd/even zips). Each pipeline owns its unzip/prepare/VAD-replacement steps on CPU while submitting transcription jobs to a shared GPU queue.
- **CPU/GPU Overlap**: While the GPU is transcribing WAV _n_, keep CPU workers busy deriving alignment intervals for WAV _n-1_ and preparing audio/metadata for WAV _n+1_. Use an async job queue (e.g., `concurrent.futures.ThreadPoolExecutor`) to overlap disk I/O, alignment interval generation, AAC rendering, and JSON emission.
- **Audio Prefetch**: Stage upcoming WAV files in RAM/disk cache (`CURRENT_IA_ZIP_WAVS`) and trigger alignment derivation immediately after transcription finishes so the GPU never idles waiting for CPU post-processing.
- **Translation/Lang Detection Batching**: Batch translation passes for non-English recordings by keeping a queue of segments needing `task="translate"` and run them back-to-back to minimize decoder warmup time.
- **Instrumentation**: Track per-stage timing (unzip, transcription, alignment, slicing) to confirm whether CPU remains the bottleneck; if GPU idle time still appears, consider adding a third pipeline lane or offloading AAC export to a subprocess pool.

## Next Actions

1. Implement helper utilities (`derive_alignment_intervals`, `render_utterances`, `build_initial_prompt`).
2. Build transcription-first driver script guarded by a CLI flag (`--transcription-first-poc`).
3. Benchmark on one SG zip with RTX 4090, record timing + GPU usage.
4. Iterate on silence threshold parameters and INT8 settings.
5. Compare outputs, then decide whether to replace the existing pipeline or keep both behind a config switch.
