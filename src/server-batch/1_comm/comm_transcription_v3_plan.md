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
ZIP archive → Stage 1 (Extract & Normalize) → Stage 2 (Transcribe) → Stage 3 (Utterance builder) → Stage 4 (Web packaging)
```

Each stage should be resumable and cache its artifact outputs so the pipeline can be restarted without recomputing upstream work.

### Stage 1 – Extract & Normalize Audio

**Input**: IA zip (Space-to-Ground or Air/Downlink-Ground).  
**Output (per WAV inside the zip)**:

- Mono AAC (ADTS) file stored in staging (e.g., `current_ia_zip_wavs/<zip_date>/raw/`).
- Optional manifest (YAML/JSON) summarizing extracted files (channel, original duration, checksum) for Stage 2 hand-off.

**Key notes**:

- Unzip and transcode using a CPU/IO-bound worker pool so the GPU can remain dedicated to downstream transcription.
- Convert audio to mono 32 kHz AAC once at a high constant bitrate (e.g., 160–192 kbps) to avoid bloating storage while remaining perceptually lossless for downstream segmenting. Retain original filenames to preserve linkage back to IA sources.
- Store outputs under `1_comm_raw_aacs/<YYYY>/<MM>/<DD>/<zip_basename>/` so individual IA archives retain their grouping while Stage 2 can glob by date.
- Emit `_stage1_extract.in-progress` markers at start and `_stage1_extract.done` with a manifest when every WAV in the archive is extracted. Stage 2 only runs when the `.done` marker is present and no `.in-progress` marker exists.

### Stage 2 – Transcribe Only

**Input**: Stage 1 AAC artifacts.  
**Output (per AAC inside the zip)**:

- WhisperX JSON containing:
  - Full segments, word-level timestamps (`segments[].words[]`) in source language.
  - Alignment metadata (speaker/channel descriptor, CT start time, UTC conversion).
  - Translation segments (if non-English) kept separate from source segments.
- Optional manifest (YAML/JSON) summarizing file-level metadata for Stage 3.

**Key notes**:

- Fix CT→UTC conversion: treat source timestamps as Central Time (America/Chicago), convert via `pendulum`/`zoneinfo`, and allow day rollover before serializing ISO Z timestamps.
- Replace the logging database dependency with file-based markers: write a `_stage2_transcribe.in-progress` file while processing a zip, emit `_stage2_transcribe.done` plus a manifest describing emitted JSON artifacts once all channels succeed. Downstream stages consult these markers and the manifest instead of SQLite status.
- Keep Stage 2 GPU-bound work efficient by batching via WhisperX with configurable `batch_size` and `chunk_length`. Profile `large-v3` and confirm GPU memory budgets. With extraction decoupled, the GPU should stay saturated while CPU workers prep the next batch of AAC assets.
- Persist transcription artifacts in `2_comm_transcribe/<YYYY>/<MM>/<DD>/<zip_basename>/`, keeping JSON aligned with the source AAC filenames for straightforward Stage 3 lookup.

### Stage 3 – Transcript → Utterances

**Input**: Stage 2 artifacts (AAC + JSON).  
**Output**: Per-utterance AAC clips (web bitrate) and JSON payloads with aligned text/metadata.

Steps:

1. Load WhisperX JSON, build a unified word timeline using `segments[].words[]` for the source language. Audio durations come from AAC metadata.
2. Derive pause-aware intervals:

- Rely on WhisperX word-level timestamps (already VAD-filtered) to infer gaps. Proposed rules, inspired by v1 tolerances: break an utterance when the gap between consecutive words is ≥ 1.0 s, or ≥ 0.6 s when the preceding word ends with sentence punctuation (`.?!`). Hard-cap utterance duration at 60 s—if exceeded, force a split at the nearest punctuation boundary or the midpoint between words.
- Apply gentle pre-roll/post-roll padding (default 0.15 s) while clamping to the file bounds and ensuring adjacent clips do not overlap; trim padding if it would capture the next word.
- Keep minimum utterance duration at ~0.8 s to avoid micro-fragments; merge shorter intervals back into neighbors unless this violates the max-length rule.

3. For non-English segments:
   - Translation output from WhisperX is segment-level with audio-aligned timestamps inherited from the source segment, _not_ word-level. WhisperX doesn’t expose word-level timestamps for translated text because the translation is text-only.
   - Recommended approach: chunk using source-language word timings, then for each resulting interval:
     - Collect the source words inside the interval to build `source_text`.
     - Collect translation text covering the same interval by slicing the translation segments on their timestamps (same interval boundaries as source segments).
     - Store both `source_text` and `translation_text`. If the translation text needs smoothing, run a post-processer (e.g., ensure sentences end with punctuation, collapse whitespace).

- No re-translation step is planned; translation text is inherited from WhisperX segment translations and sliced alongside the source intervals.

4. Export AAC clips for each interval using ffmpeg trim filters (`-ss/-to` with sample accuracy). Target 96 kbps CBR ADTS to align with current web expectations.
5. Emit JSON per utterance:
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
     "file": "2025-10-15T23-59-03Z-SG4-utc.aac",
     "sourceWords": [ {"text": "...", "start": 0.12, "end": 0.52 }, ... ]
   }
   ```
   Include offsets relative to the clip and relative to the original file for traceability.

- Write Stage 3 outputs into `3_transcripts_aacs/<YYYY>/<MM>/<DD>/`, mirroring the daily layout expected by Stage 4 while keeping utterance AAC and JSON pairs side-by-side.

### Stage 4 – Utterances → Web Package

**Input**: Utterance AAC + JSON from Stage 3.  
**Output**: Per-day CSV (web schema), consolidated manifest, copied AAC assets.

-Recommended steps (largely satisfied by the existing `3_web_comm.py` implementation):

- Iterate by UTC date (use `startUtc`), accumulate utterances per day.
- Generate CSV columns (ISO start/end, channel, cleaned transcript/translation, clip filename, metadata fields). Optionally produce JSONL for backend ingestion.
- Copy AAC files into the day folder (`comm_transcripts_aacs/<YYYY>/<MM>/<DD>/`). Avoid duplicate copies by hard-linking or verifying existing identical files.
- Maintain summary metadata (counts, languages present, runtime) for monitoring.

`3_web_comm.py` already performs these responsibilities reliably. For V3 we only need to ensure:

- Stage 3 emits utterance JSON fields that map cleanly to the expectations in `create_daily_transcript` (e.g., `utteranceTime`, `segments`, `origLangSegments`, AAC filename parity).
- Any new per-utterance metadata we introduce is either ignored safely or added to the CSV schema intentionally.
- If Clip filenames move to UTC naming, update the script’s invalid-utterance filter or filename construction if required (currently assumes `.json` → `.aac` suffix swap).
- Consider logging or manifest output summarizing skipped invalid utterances as a lightweight QC signal when rerunning historical ranges.

## Translation Handling Discussion

- **WhisperX Translation Output**: Translation segments inherit timestamps from the original segments but are not word-aligned. WhisperX does not currently emit word-level timestamps for translated text.
- **Recommended Policy**:
  1. Use source-language word timings to drive clip boundaries.
  2. Map translation text to each interval by slicing translation segments on the same time bounds. This keeps translations aligned with the audio interval even if sentence boundaries shift slightly.
  3. Do **not** re-translate clips post-chunking; accept WhisperX translations to avoid redundant GPU cycles.
  4. Persist both source and translation text in the utterance JSON so future enhancements (e.g., improved MT) can operate on existing artifacts.

## Data Management & Naming

- Preserve original IA filenames in Stage 1 AAC outputs (`<basename>.aac`) and Stage 2 JSON outputs (`<basename>.json`).
- Generate UTC-based filenames for Stage 3 clips: `<YYYY-MM-DDTHH-MM-SSZ>-<descriptor>-utc.aac`.
- Maintain manifest files (`manifest.json`) per Stage 1 zip (and optionally per date), listing derived files and status, plus stage-specific manifests when Stage 2 and Stage 3 complete.
- Adopt date-partitioned roots ahead of the web assets stage:
  - Stage 1 → `1_comm_raw_aacs/<YYYY>/<MM>/<DD>/<zip_basename>/`
  - Stage 2 → `2_comm_transcribe/<YYYY>/<MM>/<DD>/<zip_basename>/`
  - Stage 3 → `3_transcripts_aacs/<YYYY>/<MM>/<DD>/`
    These mirror the downstream `comm_transcripts_aacs/<YYYY>/<MM>/<DD>/` layout, easing Stage 4 copy/link operations.
- Use lightweight marker files to indicate lifecycle state (`_stage1_extract.*`, `_stage2_transcribe.*`, `_stage3_chunk.*`). Each stage scans the previous stage’s directory tree and only picks up folders where the required `.done` marker is present and the sibling `.in-progress` marker is absent.
- Continue using the shared tracking text files for historical parity if needed, but primary resume logic should come from the manifest/marker files so operators can inspect progress without querying the SQLite log.

## Performance & Reliability Considerations

- Batch unzip + convert: run in a CPU/IO worker pool while Stage 2 saturates the GPU on already-normalized AAC files.
- GPU watchdog: refresh WhisperX model when memory usage exceeds threshold (reuse v2 logic with `GPU_MEMORY_WARN_RATIO`/`GPU_MEMORY_RELOAD_RATIO`).
- Resume capability: Stages 1–3 scan for manifest/marker files and skip work unless a re-run is requested (`--force`). Stage 3 verifies each utterance JSON/AAC pair before marking its `_stage3_chunk.done` file.
- Concurrency: allow Stage 2 to operate on any folder where `_stage1_extract.done` exists and `_stage1_extract.in-progress` does not; Stage 3 waits for `_stage2_transcribe.done`. Writers should create the `.in-progress` marker before work begins and remove it atomically after writing `.done`.
- Diagnostics: include per-stage logging (Rich handler) and summary stats for each zip/date group.
- Testing: create integration tests using a small fixture zip to validate CT→UTC rollover and translation chunking logic.

## Reprocessing Strategy

1. Run Stage 1 across historical archives, storing normalized AAC outputs in `1_comm_raw_aacs/<YYYY>/<MM>/<DD>/<zip_basename>/`.
2. Stage 2 consumes the Stage 1 manifest inventory, emitting WhisperX JSON (and updated manifests) into `2_comm_transcribe/<YYYY>/<MM>/<DD>/<zip_basename>/`.
3. Stage 3 iterates over Stage 2 artifacts, producing utterance clips and JSON into `3_transcripts_aacs/<YYYY>/<MM>/<DD>/`.
4. Stage 4 builds CSVs and copies audio into the existing web asset layout `comm_transcripts_aacs/<YYYY>/<MM>/<DD>/`.
5. Verify by comparing sample days against v1/v2 outputs (check chronology, text parity, translation coverage).

## Outstanding Questions / Next Steps

1. Finalize silence threshold and maximum-duration rules (consider channel-specific overrides if needed).
2. Determine storage location and retention policy for Stage 1 AAC and Stage 2 JSON artifacts (long-term cache vs temporary workspace pruning).
3. Validate that the TalkyBot API (or other downstream consumers) can ingest the new schema without change.
4. Evaluate if alignment fallback (when alignment model missing) should revert to segment-level timestamps or re-run on CPU.

Once these decisions are finalized, we can translate this plan into code modules (`stage1_extract.py`, `stage2_transcribe.py`, `stage3_chunk.py`, `stage4_package.py`) and iterate.
