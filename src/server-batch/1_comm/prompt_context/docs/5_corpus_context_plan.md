# Corpus Context Prework Plan

## Objectives

- Produce high-quality daily prompt inputs (crew roster, activity briefs, mission context) before any audio transcription work begins.
- Leverage existing datasets (`crew_arr_dep.json`, activity summaries, blog articles) to avoid redundant API calls during transcription.
- Generate concise, domain-specific prompt text using a local GPT-OSS model via Ollama, optimized for an RTX 4090.
- Cache outputs per day so the transcription pipeline can reuse them repeatedly and deterministically.

## Environment & Paths

- Load environment variables from the repo root `.env` (copy `.env.template` as a starting point). Key defaults:
  - `RAW_FOLDER="F:/_repos/ISSiRT_assets/_raw/"`
  - `WEB_ASSETS_FOLDER="F:/_repos/ISSiRT_assets/ISSiRT_web_assets/"`
  - `IA_ZIP_SG_FOLDER="F:/_repos/ISSiRT_assets/_raw/InternetArchive_space_to_grounds"`
  - `IA_ZIP_AG_FOLDER="F:/_repos/ISSiRT_assets/_raw/InternetArchive_dragon_cst_to_grounds"`
- Persist _all_ prompt corpus artifacts under `${RAW_FOLDER}/prompt_context/` (create the directory tree if missing). These files are used exclusively to guide transcription quality and are not published to the website.
- For local experimentation, you can override any path via CLI flags or ad-hoc environment variables; always persist finalized outputs inside the `RAW_FOLDER` hierarchy so downstream automation finds them.

## Data Sources

- `crew_arr_dep.json`: authoritative list of crew arrivals/departures. Written by `server-batch/3_flights/6_web_crew_arrive_dep_from_flights.py` to `${WEB_ASSETS_FOLDER}/crew_arr_dep.json` (see `.env`; default `WEB_ASSETS_FOLDER="F:/_repos/ISSiRT_assets/ISSiRT_web_assets/"`). Provides stay metadata already deduplicated by the script.
- Activity summaries (`${WEB_ASSETS_FOLDER}/activity_summaries/YYYY/MM/DD/activity_summary_YYYY-MM-DD.json`) produced by `src/server-batch/2_articles/6b_web_activity_summaries.py`.
- Blog articles (`${WEB_ASSETS_FOLDER}/blog_articles/YYYY/MM/DD/articles.json`) consolidated by `src/server-batch/2_articles/6j_web_consolidate_blog_articles.py`.
- Static vocabulary files (TBD): mission control call signs, subsystem acronyms, frequently misheard terms.

## Pipeline Overview

1. **Daily Roster Extraction**
   - Port `getCrewMembersOnboardByDate` from `src/utils/onboard.ts` into Python (`get_crew_onboard_by_date.py`).
   - Input: `crew_arr_dep.json`, target UTC date, optional seconds since midnight.

- Output: `${RAW_FOLDER}/prompt_context/YYYY/MM/DD/crew_roster.json` with structure:
  - `samples`: array of at least two snapshots collected at `00:00:00Z` and `23:59:59Z` (or the last comm second of the day). Each snapshot contains `sample_time` plus the roster array with `name_full`, `nationality`, `vehicle`, `arrivalDate`, `departureDate`, `role`.
  - Optional `notes` array for mid-day handovers (e.g., `"Crew-9 undocks ~11:57Z; Crew-10 assumed command."`).
- Implementation notes:
  - Validate date format (`YYYY-MM-DD`).
  - Perform two deterministic calls to `_get_crew_onboard_by_date(dt, seconds_from_midnight)` at 0 s and 86399 s; use the combined crew list as context for that day.
  - Stable sort (e.g., by nationality then last name) to maintain deterministic prompts before serializing each sample.
  - Keep sample arrays small (<1 KB) by stripping unused fields and normalizing vehicles/roles to canonical strings so the final prompt stays comfortably below the 448-token initial prompt limit in faster-whisper.

2. **Activity & Article Harvest**
   - Load activity summary JSON; flatten categories into bullet-sized strings:
     - `payloads`, `systems`, `tasklist`, `ground` arrays.
   - Load consolidated blog articles and iterate every article body (strip HTML) rather than just the headline.
   - Chunk long posts (e.g., ~800 tokens each) and run a map-reduce style summarization pass^1 with GPT-OSS to extract:
     - Primary mission themes likely to surface on space-to-ground loops.
     - Callsigns/subsystem nouns and any “why” context to help pronunciations.
     - Urgent ground directives or anomalies called out in the blog.
   - Normalize text (dedupe whitespace, strip HTML artifacts) before prompting.

- Output: `${RAW_FOLDER}/prompt_context/YYYY/MM/DD/daily_brief.json` with keys:
  - `payload_highlights` (array of strings)
  - `systems_work`
  - `planned_activities`
  - `ground_ops`
  - `blog_headlines` (headline + permalink)
  - `blog_topics` (LLM-reduced bullet list of likely comms talking points distilled from full articles)
  - `comms_focus` (≤5 bullet predictions for what CAPCOM/crew will discuss, ordered by probability)
- Include `source_url` and `content_hash` where provided for traceability and caching.
- Cache intermediate article embeddings or chunk summaries under `${RAW_FOLDER}/prompt_context/YYYY/MM/DD/blog_cache/` to avoid re-processing large posts when prompting multiple times a day.

3. **Prompt Skeleton Assembly**
   - Combine roster + daily brief + static vocab into an intermediate structure:
     ```json
     {
       "date": "YYYY-MM-DD",
       "crew": {
         "samples": [
           {
             "sample_time": "00:00:00Z",
             "crew": [ ... ]
           },
           {
             "sample_time": "23:59:59Z",
             "crew": [ ... ]
           }
         ],
         "handover_notes": [ ... ]
       },
       "missions": { ... },
       "activities": { ... },
       "blog_topics": [ ... ],
       "comms_focus": [ ... ],
       "call_signs": [ ... ],
       "acronyms": [ ... ]
     }
     ```

- Save as `${RAW_FOLDER}/prompt_context/YYYY/MM/DD/prompt_input.json` to simplify downstream retries.

4. **GPT-OSS Prompt Synthesis (Ollama)**
   - Model: default to `gpt-oss:20b`; allow config override for smaller checkpoints.
   - Ensure Ollama daemon is running locally (`OLLAMA_API_URL` defaults to `http://localhost:11434`; override via env var if needed).
   - Request payload mirrors `4_photos/9h_make_flickr_flight_photos_list_using_ai.py`:
     ```json
     {
       "model": "gpt-oss:20b",
       "prompt": "...",
       "stream": true,
       "options": {
         "temperature": 0.2,
         "top_p": 0.95,
         "top_k": 40,
         "num_predict": -1,
         "repeat_penalty": 1.1,
         "num_ctx": 4096,
         "num_batch": 512,
         "num_gpu_layers": -1,
         "num_thread": 8,
         "use_mmap": true,
         "use_mlock": true
       }
     }
     ```
   - Instruction template:

     ```
     Generate a concise (≤250 characters) prompt to improve WhisperX transcription of ISS space-to-ground audio for DATE.
     Include active crew names, mission call signs, and key activities likely to be discussed.
     Emphasize spaceflight terminology and avoid prose.

     Crew onboard:
     - ...
     Activities:
     - ...
     Notes:
     - ...
     ```

   - Use `multiprocessing` queue with ~3 workers (see photo classifier script) so multiple days process in parallel.
   - Stream partial responses into the status display pipeline (see §7) while buffering the final text for post-processing.
   - After each prompt, write:
     - `${RAW_FOLDER}/prompt_context/YYYY/MM/DD/prompt.txt` (final prompt string, trimmed to ≤250 characters).
     - `${RAW_FOLDER}/prompt_context/YYYY/MM/DD/prompt_meta.json` (model, temperature, prompt version, elapsed seconds, token counts, retry metadata).
     - `${RAW_FOLDER}/prompt_context/YYYY/MM/DD/prompt_raw.jsonl` capturing the Ollama streamed JSON frames (`done`, `eval_count`, `eval_duration`, etc.) for reproducibility and telemetry.

5. **Scheduling & Resume**
   - New entry point: `precompute_prompt_context.py`.
   - Steps per run:
     - Load list of comm dates (e.g., from IA zips or existing transcripts).
     - Skip dates where `prompt.txt` already exists unless `--force` flag provided.
     - Queue requested dates; worker processes pop dates, build inputs, call Ollama, and persist outputs.
     - Every N prompts (e.g., 10) print progress summary (success count, elapsed time, worker throughput).
   - Handle missing data gracefully: if activity summary or articles are absent, continue with roster + static vocab.

6. **Integration with Transcription**
   - `build_initial_prompt` (used by the transcription pipeline) loads:
     - `${RAW_FOLDER}/prompt_context/YYYY/MM/DD/prompt.txt`
     - Falls back to `${RAW_FOLDER}/prompt_context/YYYY/MM/DD/prompt_input.json` (with simple fallback template) if synthesis failed.

- Feed the prompt string into faster-whisper/WhisperX via `TranscriptionOptions.initial_prompt`; keep prompts under ~200 tokens to remain below Whisper's 448-token ceiling and leave space for timestamps.^2
- If prompt not found, log warning and proceed without prompt rather than blocking transcription. For the fallback, synthesize a deterministic prompt from roster samples + top `comms_focus` bullets so Whisper still benefits from a bias phrase.
- When `condition_on_previous_text=True`, pair the initial prompt with the `00:00:00Z` roster snapshot; if a mid-day handover is detected, append a short clause (e.g., `"Expect Crew-10 after 12:05Z"`) so the decoder smoothly transitions when later segments begin.

7. **Operator Status Display (Rich + Ollama streaming)**

- Start `precompute_prompt_context.py --monitor` with a Rich `Console(screen=True)` so the CLI occupies a full-screen Windows terminal (Rich Live documentation covers alternate-screen mode and refresh behavior).^3
- Suggested layout:
  - Left column: panels per worker showing current date, active phase (roster, blogs, prompt), and a streaming buffer of partial GPT-OSS tokens.
    - If the model emits `thinking` traces (e.g., DeepSeek or gpt-oss with reasoning), fold them into a collapsible sub-panel so operators can inspect reasoning without flooding the main output.
  - Right column: aggregated `Progress` table with task counts, throughput, `TimeElapsedColumn`, and `TimeRemainingColumn` derived from recent Ollama durations.
  - Footer: scrolling log view updated via `Live.update()` for warnings/retries without corrupting the main layout.
- Subscribing to Ollama streaming (`/api/generate` with `stream=true`) yields JSON chunks containing `response` tokens plus a final frame with `eval_count`, `eval_duration`, and `total_duration`; surface those metrics as live token/speed gauges and to extrapolate ETA for remaining dates.^4
- Show retry status and GPU-friendly parameters (e.g., `num_batch`, `num_gpu_layers`) alongside each worker so operators can spot saturation or fallback to smaller checkpoints quickly.

## Edge Cases & Fallbacks

- **No Crew Data**: Emit empty roster and log; prompt should focus on mission control call signs only.
- **Multiple Handovers in One Day**: For multi-crew transitions, include both sets with time windows in the prompt text (e.g., `08:00-12:00 Crew A, after 12:00 Crew B`).
- **API Failure**: Retry Ollama call up to 3 times with exponential backoff; on repeated failure, save fallback prompt from deterministic template and move on.
- **VRAM Constraints**: Allow config to reduce `num_batch` and switch to smaller model (e.g., `gpt-oss:8b`). Record chosen model in metadata.

## Validation Checklist

- Unit-test Python port of `getCrewMembersOnboardByDate` against TypeScript original using shared fixture data.
- Snapshot-test `prompt_input.json` for a known date to ensure stable formatting.
- Dry-run prompt synthesis on a handful of dates, manually inspect prompts for length, specificity, and absence of filler prose.
- Time the pipeline end-to-end on sample month; record throughput (days/minute) and GPU utilization.

## Next Steps

1. Implement helper scripts:
   - `get_crew_onboard_by_date.py`
   - `build_daily_brief.py`
   - `synthesize_prompt.py` (Ollama client)
2. Wire them together in `precompute_prompt_context.py` with multiprocessing queue.
3. Add CLI flags (`--start-date`, `--end-date`, `--force`, `--model`).
4. Document usage in README and confirm directories exist under `${RAW_FOLDER}/prompt_context/`.
5. Integrate with transcription pipeline by updating `build_initial_prompt` to consume new outputs.

## References

1. LangChain summarization strategies (`stuff`, `map-reduce`, refinement): https://python.langchain.com/docs/use_cases/summarization
2. `initial_prompt` handling in faster-whisper `TranscriptionOptions`: https://raw.githubusercontent.com/SYSTRAN/faster-whisper/master/faster_whisper/transcribe.py
3. Rich `Live` alternate-screen displays and layout guidance: https://rich.readthedocs.io/en/stable/live.html
4. Ollama streaming API telemetry fields (`response`, `eval_count`, durations): https://github.com/ollama/ollama/blob/main/docs/api.md

## Related Docs

- Transcription pipeline plan: `2_transcription_poc_plan.md`
- Ollama usage example: `../4_photos/9h_make_flickr_flight_photos_list_using_ai.py`
