# Communication Transcript V3 Pipeline Plan

## Objectives

- Produce chronologically accurate ISS communication transcripts while preserving full context for downstream web presentation.
- Fix CT→UTC rollover defects observed in v1 outputs and the sentence fragmentation issues introduced in v2.
- Re-run historical archives efficiently without reprocessing audio more than once per stage.

## Current Pain Points

- **v1**: Segment-first approach, WhisperX invoked per utterance; CT timestamp conversion failed to roll over at midnight, causing misordered output from ~2015-05 onward.
- **v2**: Whole-file transcription reused to slice utterances, but sentence boundaries are sometimes unnatural and translated utterances can mismatch audio spans because segmentation reuses legacy WebRTC VAD heuristics.

## V3 High-Level Workflow

```
ZIP archive → Stage 1 (Extract & Normalize) → Stage 2 (Transcribe + Align + Diarize) → Stage 3 (Utterance builder)
```

Each stage should be resumable and cache its artifact outputs so the pipeline can be restarted without recomputing upstream work.

### Stage 1 – Extract & Normalize Audio

**Input**: IA zip (Space-to-Ground or Air/Downlink-Ground).  
**Output (per WAV inside the zip)**:

- Mono M4A (AAC-LC in MP4 container with faststart) stored in `1_comm_raw_m4a/<YYYY>/<MM>/<DD>/` using the original IA basename.

**Key notes**:

- Unzip each archive into a temporary working directory (following the `CURRENT_IA_ZIP_WAVS_WORKING/<date>_wavs` pattern documented in `6_transcribe_using_corpus.py` for reference), then transcode and copy results into the Stage 1 output tree so transient WAVs never co-mingle with the persisted M4A cache.
- Unzip and transcode using a CPU/IO-bound worker pool so the GPU can remain dedicated to downstream transcription.
- Convert audio to mono 32 kHz AAC-LC once (wrapped in an M4A container) at a high constant bitrate (e.g., 160–192 kbps) to avoid bloating storage while remaining perceptually lossless for downstream segmenting. Retain original filenames to preserve linkage back to IA sources.
- Store outputs under `1_comm_raw_m4a/<YYYY>/<MM>/<DD>/`. IA zips almost always map 1:1 with a date, and the preserved basenames prevent collisions when multiple zips share that day.
- Remux with `-movflags +faststart` so the `moov` atom is written at the head of each file, enabling HTTP range-based playback without generating per-utterance clips during extraction.
- Normalize filenames with the regex-driven rules enumerated in `6_transcribe_using_corpus.py` (e.g., the `parse_wav_filename` pattern set) so Stage 1 emits consistently structured basenames before transcoding; we will re-implement those patterns in v3 rather than importing the existing script, preserving downstream timestamp extraction even when IA zips include legacy naming variants.
- When a zip fails (invalid archive, undecodable WAV, regex mismatch, etc.), append a record to a pipe-delimited CSV log (e.g., `stage1_bad_zips.csv`) with fields `zip_iso_date|zip_filename|error_message|logged_at_iso`. This keeps a lightweight audit trail for retries without depending on a database.
- Emit `_stage1_extract.<zip-stem>.in-progress` markers at start and `_stage1_extract.<zip-stem>.done` markers when every WAV in the archive is extracted. Stage 2 only runs when the `.done` marker is present and no `.in-progress` marker exists.

#### Stage 1 Prototype Notes

- Initial extractor lives in `src/server-batch/1_comm/v3/stage1_extract.py`; invoke it with the same arguments supported by `6_transcribe_using_corpus.py`.
- Stage 1 looks for zips in the same IA source directories as v2. Use `python stage1_extract.py --date 2015-01-02` for quick smoke tests; that zip exercises the parser well and keeps runtime reasonable.
- Marker files live directly inside `1_comm_raw_m4a/<YYYY>/<MM>/<DD>/` next to the converted audio, using the `<zip-stem>` suffix for disambiguation when multiple zips feed the same day.
- Conversion runs concurrently via `STAGE1_MAX_WORKERS` (defaults to a handful of CPU threads). Adjust `STAGE1_AAC_BITRATE` (defaults to `160k`) if tighter encoding budgets are acceptable.

### Stage 2 – Transcribe, Align, Diarize

**Input**: Stage 1 M4A artifacts.  
**Output (per M4A inside the zip)**:

- WhisperX JSON bundle containing:
  - Full decoded segments (`segments[]`) in source language.
  - Translation segments (if non-English) kept separate from source segments.
  - Alignment segments with word-level timestamps (`segments[].words[]`).
  - Diarization turns (`diarization[].{speaker,start,end}`) mapped to the same timeline.
  - Metadata for downstream stages (speaker/channel descriptor, CT start time, UTC conversion, audio duration, prompt context used).

**Key notes**:

- Fix CT→UTC conversion: treat source timestamps as Central Time (America/Chicago), convert via `pendulum`/`zoneinfo`, and allow day rollover before serializing ISO Z timestamps.
- Replace the logging database dependency with file-based markers: write a `_stage2_transcribe.in-progress` file while processing a zip, emit `_stage2_transcribe.done` once all channels succeed. Downstream stages look for the done marker.
- Keep Stage 2 GPU-bound work efficient by batching via WhisperX with configurable `batch_size` and `chunk_length`. Profile `large-v3` and confirm GPU memory budgets. With extraction decoupled, the GPU should stay saturated while CPU workers prep the next batch of audio assets.
- After transcription (and translation when needed) completes on GPU, immediately hand off alignment to CPU (or reduced-precision GPU if profiling justifies it) while the GPU fetches the next M4A. Reuse the loaded audio tensor to avoid extra I/O.
- Run the WhisperX diarization pipeline inside Stage 2 while audio is resident; diarization can share the alignment outputs so we avoid a second WhisperX invocation.
- Persist artifacts in `2_comm_raw_transcripts_raw/<YYYY>/<MM>/<DD>/<zip_basename>/`, storing a consolidated JSON per audio file that includes transcription, alignment, and diarization payloads.

### Stage 3 – Transcript → Utterances

**Input**: Stage 2 transcription/alignment/diarization JSON and Stage 1 M4A audio.
**Output**: Per-utterance AAC clips (web bitrate) and JSON payloads with aligned text/metadata.

Steps:

1. Load the Stage 2 JSON bundle, build a unified word timeline using `segments[].words[]` for the source language, and overlay diarization turns. Audio durations come from M4A metadata (AAC-LC track).
2. Derive pause-aware intervals:

- Rely on WhisperX word-level timestamps (already VAD-filtered) to infer gaps. Proposed rules, inspired by v1 tolerances: break an utterance when the gap between consecutive words is ≥ 1.0 s, or ≥ 0.6 s when the preceding word ends with sentence punctuation (`.?!`). Hard-cap utterance duration at 60 s—if exceeded, force a split at the nearest punctuation boundary or the midpoint between words.
- Apply gentle pre-roll/post-roll padding (default 0.15 s) while clamping to the file bounds and ensuring adjacent clips do not overlap; trim padding if it would capture the next word.
- Keep minimum utterance duration at ~0.8 s to avoid micro-fragments; merge shorter intervals back into neighbors unless this violates the max-length rule.

3. Incorporate diarization when splitting:
   - Use speaker-change boundaries from the diarization turns to force additional utterance splits when the speaker label changes inside what would otherwise be a single interval.
   - Assign each utterance a `speaker` field (e.g., `speaker1`, `speaker2`) based on diarization IDs; we expect anonymous speaker IDs because channel-level metadata does not include human names.
   - When diarization confidence is low or unavailable, fall back to gap-based segmentation only.

4. For non-English segments:
   - Translation output from WhisperX is segment-level with audio-aligned timestamps inherited from the source segment, _not_ word-level. WhisperX doesn’t expose word-level timestamps for translated text because the translation is text-only.
   - Recommended approach: chunk using source-language word timings, then for each resulting interval:
     - Collect the source words inside the interval to build `source_text`.
     - Collect translation text covering the same interval by slicing the translation segments on their timestamps (same interval boundaries as source segments).
     - Store both `source_text` and `translation_text`. If the translation text needs smoothing, run a post-processer (e.g., ensure sentences end with punctuation, collapse whitespace).

- No re-translation step is planned; translation text is inherited from WhisperX segment translations and sliced alongside the source intervals.

5. Export AAC clips for each interval using ffmpeg trim filters (`-ss/-to` with sample accuracy). Target 96 kbps CBR ADTS to align with current web expectations.
6. Emit JSON per utterance:
   ```json
   {
     "utteranceId": "2025-10-15T23-59-03Z-SG4-utc",
     "channel": "1_SG_4",
     "startUtc": "2025-10-15T23:59:03Z",
     "endUtc": "2025-10-15T23:59:15Z",
     "sourceText": "...",
     "translationText": "...",
     "language": "ru",
     "detectedLanguage": "ru",
     "speaker": "speaker1",
     "file": "2025-10-15T23-59-03Z-SG4-utc.aac",
     "sourceWords": [ {"text": "...", "start": 0.12, "end": 0.52 }, ... ]
   }
   ```
   Include offsets relative to the clip and relative to the original file for traceability.

- Write Stage 3 outputs into `3_utt_transcripts_aacs/<YYYY>/<MM>/<DD>/`, mirroring the daily layout while keeping utterance AAC and JSON pairs side-by-side.

## Translation Handling Discussion

- **WhisperX Translation Output**: Translation segments inherit timestamps from the original segments but are not word-aligned. WhisperX does not currently emit word-level timestamps for translated text.
- **Recommended Policy**:
  1. Use source-language word timings to drive clip boundaries.
  2. Map translation text to each interval by slicing translation segments on the same time bounds. This keeps translations aligned with the audio interval even if sentence boundaries shift slightly.
  3. Do **not** re-translate clips post-chunking; accept WhisperX translations to avoid redundant GPU cycles.
  4. Persist both source and translation text in the utterance JSON so future enhancements (e.g., improved MT) can operate on existing artifacts.

## Data Management & Naming

- Preserve original IA filenames in Stage 1 M4A outputs (`<basename>.m4a`) and Stage 2 JSON outputs (`<basename>.json`).
- Generate UTC-based filenames for Stage 3 clips: `<YYYY-MM-DDTHH-MM-SSZ>-<descriptor>-utc.aac`.
- All stages rely solely on marker files to advertise readiness to subsequent stages.
- Adopt date-partitioned roots ahead of the web assets stage:
  - Stage 1 → `1_comm_raw_m4a/<YYYY>/<MM>/<DD>/`
  - Stage 2 → `2_comm_raw_transcripts/<YYYY>/<MM>/<DD>/`
  - Stage 3 → `3_utt_transcripts_aacs/<YYYY>/<MM>/<DD>/`
- Use lightweight marker files to indicate lifecycle state (`_stage1_extract.*`, `_stage2_transcribe.*`, `_stage3_chunk.*`). Each stage scans the previous stage’s directory tree and only picks up folders where the required `.done` marker is present and the sibling `.in-progress` marker is absent.
- Continue using the shared tracking text files for historical parity if needed, but primary resume logic should come from the marker files (and Stage 2/3 manifests) so operators can inspect progress without querying the SQLite log.

## Performance & Reliability Considerations

- Batch unzip + convert: run in a CPU/IO worker pool while Stage 2 saturates the GPU on already-normalized M4A files.
- GPU watchdog: refresh WhisperX model when memory usage exceeds threshold (reuse v2 logic with `GPU_MEMORY_WARN_RATIO`/`GPU_MEMORY_RELOAD_RATIO`).
- Resume capability: Stages 1–3 scan for marker files and skip work unless a re-run is requested (`--force`). Stage 3 verifies each utterance JSON/AAC pair before marking its `_stage3_chunk.done` file.
- Concurrency: allow Stage 2 to operate on any folder where `_stage1_extract.done` exists and `_stage1_extract.in-progress` does not. Within Stage 2, dedicate CPU alignment/diarization workers that pull finished GPU decodes so the GPU remains busy. Stage 3 waits for `_stage2_transcribe.done`.
- Diagnostics: include per-stage logging (Rich handler) and summary stats for each zip/date group.
- Testing: create integration tests using a small fixture zip to validate CT→UTC rollover and translation chunking logic.

## Reprocessing Strategy

1. Run Stage 1 across historical archives, storing normalized M4A outputs in `1_comm_raw_m4a/<YYYY>/<MM>/<DD>/`.
2. Stage 2 consumes the Stage 1 marker inventory, emitting WhisperX transcription JSON into `2_comm_raw_transcripts_raw/<YYYY>/<MM>/<DD>/`.
3. Stage 3 iterates over Stage 2 artifacts, producing utterance clips and JSON into `3_utt_transcripts_aacs/<YYYY>/<MM>/<DD>/`.
4. Verify by comparing sample days against v1/v2 outputs (check chronology, text parity, translation coverage, speaker labeling).

## Outstanding Questions / Next Steps

1. Finalize silence threshold and maximum-duration rules (consider channel-specific overrides if needed).
2. Determine storage location and retention policy for Stage 1 M4A and Stage 2 JSON artifacts (long-term cache vs temporary workspace pruning).
3. Validate that the TalkyBot API (or other downstream consumers) can ingest the new schema without change.
4. Evaluate if alignment fallback (when alignment model missing) should revert to segment-level timestamps or re-run on CPU.

Once these decisions are finalized, we can translate this plan into code modules (`stage1_extract.py`, `stage2_transcribe.py`, `stage3_chunk.py`) and iterate.
