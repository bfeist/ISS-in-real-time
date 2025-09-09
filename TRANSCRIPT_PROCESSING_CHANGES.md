# YouTube Transcript Processing Script - Modifications Summary

## Overv### 5. Processing Logic Changes

1. **Input Validation**: Script now looks for existing `derivedStartTime` in recordings to avoid reprocessing
2. **Dual Output**: Updates main recordings file + creates detailed log entry
3. **Error Handling**: Failed processing attempts are logged with failure reasons
4. **Backup Strategy**: Both files are backed up before writing new data
5. **Atomic Saves**: Files are saved after each record processing attempt, regardless of success/failure
6. **Complete Logging**: Log entries are created for all scenarios including skipped caseshe script `6_web_gen_start_offset_from_transcripts.py` has been modified to work with `youtube_live_recordings.json` instead of `youtube_manual_start_times.json` and to separate processing metadata into a dedicated log file.

## Key Changes

### 1. File Structure Changes

- **Input File**: Now reads from `youtube_live_recordings.json` (in WEB_ASSETS_FOLDER)
- **Output File**: Updates the same `youtube_live_recordings.json` with `derivedStartTime` field
- **Log File**: Creates `youtube_transcript_processing_log.json` (in RAW_FOLDER)

### 2. Data Structure Changes

#### YouTube Recordings Format

```json
[
  {
    "publishedAt": "2019-07-24T22:59:11Z",
    "videoId": "CfRULatzLZQ",
    "duration": 1560,
    "title": "SpaceX launch to the International Space Station",
    "ytStartTime": "2019-07-24T22:00:19Z",
    "derivedStartTime": "2019-07-24T21:58:19Z" // <- ADDED BY SCRIPT
  }
]
```

#### Processing Log Format

```json
[
  {
    "date": "2019-07-24",
    "videoId": "CfRULatzLZQ",
    "title": "SpaceX launch to the International Space Station",
    "source": "automated_fuzzy_matching",
    "processingDate": "2025-09-08T15:30:45Z",
    "processingStatus": "success",
    "videoTimePoint": "00:02:00",
    "realTimeAtVideoPoint": "2019-07-24T22:02:19Z",
    "calculatedVideoStartTime": "2019-07-24T21:58:19Z",
    "confidence": 0.85,
    "processingNotes": "Automated fuzzy matching found 5 consecutive matches",
    "firstMatchYoutubeText": "Houston, we have communication",
    "firstMatchCommText": "Houston, we have communication"
  }
]
```

### 3. Function Changes

#### Replaced Functions:

- `load_manual_start_times()` → `load_youtube_recordings()`
- `save_manual_start_times()` → `save_youtube_recordings()`
- `find_manual_entry_by_video_id()` → `find_recording_by_video_id()`

#### New Functions:

- `load_processing_log()` - Loads processing log entries
- `save_processing_log()` - Saves processing log entries
- `create_log_entry_from_script_result()` - Creates detailed log entries

#### Modified Functions:

- `process_youtube_transcript()` - Now returns tuple (success, log_entry)
- `main()` - Updated to handle both files and new data structures

### 4. Processing Logic Changes

1. **Input Validation**: Script now looks for existing `derivedStartTime` in recordings to avoid reprocessing
2. **Dual Output**: Updates main recordings file + creates detailed log entry
3. **Error Handling**: Failed processing attempts are logged with failure reasons
4. **Backup Strategy**: Both files are backed up before writing new data

### 5. Environment Variables

- **Added**: `RAW_FOLDER` - for storing processing log file
- **Existing**: `WEB_ASSETS_FOLDER` - for recordings file and communication transcripts

## Usage

The script maintains the same command-line interface:

```bash
python 6_web_gen_start_offset_from_transcripts.py
```

## Benefits of Changes

1. **Cleaner Data Separation**: Recording data stays minimal, processing details go to log
2. **Better Tracking**: Comprehensive logging of all processing attempts
3. **Atomic Updates**: Each successful processing immediately saves both files
4. **Improved Error Handling**: Failed attempts are logged with detailed reasons
5. **Backwards Compatibility**: Existing `youtube_live_recordings.json` structure is preserved

## File Locations

- **Input/Output**: `{WEB_ASSETS_FOLDER}/youtube_live_recordings.json`
- **Processing Log**: `{RAW_FOLDER}/youtube_transcript_processing_log.json`
- **Communication Transcripts**: `{WEB_ASSETS_FOLDER}/comm/{YYYY}/{MM}/{DD}/_transcript_{YYYY-MM-DD}.csv`
- **YouTube Transcripts**: `F:/tempF/iss_working/youtube_transcripts/*.csv`
