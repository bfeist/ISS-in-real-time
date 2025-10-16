# Diarization Setup Guide

## Issue Fixed

The error `module 'whisperx' has no attribute 'DiarizationPipeline'` has been fixed by updating the import path to `whisperx.diarize.DiarizationPipeline`.

## Remaining Setup Required

To enable speaker diarization in your transcription pipeline, you need to complete the following steps:

### 1. Get a Hugging Face Token

1. Visit https://hf.co/settings/tokens
2. Create a new access token (read access is sufficient)
3. Copy the token

### 2. Accept Model Terms

You must accept the terms for these models:

1. **Speaker Diarization Model**: https://hf.co/pyannote/speaker-diarization-3.1
   - Click "Agree and access repository"
2. **Segmentation Model**: https://hf.co/pyannote/segmentation-3.0
   - Click "Agree and access repository"

### 3. Set Environment Variable

Add your Hugging Face token to your `.env` file:

```bash
HF_TOKEN=hf_your_token_here
```

Or alternatively:

```bash
HUGGINGFACEHUB_API_TOKEN=hf_your_token_here
```

### 4. Restart the Script

After setting the token and accepting the terms, restart your transcription script:

```bash
python src/server-batch/1_comm/v3/stage2_transcribe.py
```

## What Diarization Does

Diarization identifies and labels different speakers in the audio. The transcription output will include speaker IDs (e.g., "SPEAKER_00", "SPEAKER_01") for each segment, allowing you to distinguish who said what.

## Optional: Configure Speaker Count

If you know the expected number of speakers, you can set these environment variables for better accuracy:

```bash
WHISPER_DIARIZATION_MIN_SPEAKERS=2
WHISPER_DIARIZATION_MAX_SPEAKERS=4
```

## Troubleshooting

### "NoneType object has no attribute 'to'"

This error occurs when the diarization pipeline fails to initialize. Check:

- Your HF_TOKEN is set correctly
- You've accepted the model terms on Hugging Face
- Your internet connection is working

### Diarization is slow

Diarization adds processing time. You can:

- Use a smaller batch size
- Process fewer files at once
- Use CPU instead of GPU for diarization: `WHISPER_DIARIZATION_DEVICE=cpu`

## Disabling Diarization

If you don't need speaker identification, the script will continue to work without it. The error will be caught and logged as a warning, but transcription will still complete successfully.
