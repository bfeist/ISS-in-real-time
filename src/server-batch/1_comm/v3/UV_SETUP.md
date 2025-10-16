# UV Configuration for ISS Communication Pipeline v3

This directory uses [UV](https://docs.astral.sh/uv/) for fast, reliable Python dependency management.

## Prerequisites

Install UV if you haven't already:

```bash
# On Windows (PowerShell)
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# On macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## Quick Start

### 1. Create a Virtual Environment

```bash
cd src/server-batch/1_comm/v3
uv venv
```

### 2. Activate the Virtual Environment

**Windows (PowerShell):**

```powershell
.venv\Scripts\Activate.ps1
```

**Windows (CMD):**

```cmd
.venv\Scripts\activate.bat
```

**Windows (Git Bash):**

```bash
source .venv/Scripts/activate
```

**macOS/Linux:**

```bash
source .venv/bin/activate
```

### 3. Install Dependencies

**For CUDA/GPU Support (Recommended):**

```bash
# Use the provided installation script
./install_cuda.sh
```

**Or manually:**

```bash
# Install base dependencies without torch
uv pip install -e . --no-deps

# Install PyTorch with CUDA 12.1 support
uv pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121

# Install remaining dependencies
uv pip install -e .
```

**For CPU-Only (Not Recommended for Production):**

```bash
# Install production dependencies only
uv pip install -e .

# Or install with development dependencies
uv pip install -e ".[dev]"
```

## GPU Support (CUDA)

For GPU acceleration with CUDA:

**Your System**: You have an RTX 4090 with CUDA 13.0 support, which is compatible with PyTorch CUDA 12.1 builds.

**Installation Options:**

1. **Easy way** - Use the provided script:

   ```bash
   ./install_cuda.sh
   ```

2. **Manual way** - Follow the steps in section 3 above.

**Verify CUDA is working:**

```bash
python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}'); print(f'GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"N/A\"}')"
```

Expected output:

```
CUDA: True
GPU: NVIDIA GeForce RTX 4090
```

## Environment Variables

Create a `.env` file in the project root (or at the repository root) with the following variables:

```bash
# Required paths
RAW_FOLDER=/path/to/raw/data
RAW_AUDIO_FOLDER=/path/to/raw/audio

# Optional: Whisper model configuration
WHISPER_MODEL_TYPE=large-v3
WHISPER_DEVICE=cuda              # or 'cpu' for CPU-only
WHISPER_COMPUTE_TYPE=float16     # or 'int8' for lower memory
WHISPER_BATCH_SIZE=16
WHISPER_CHUNK_LENGTH=30

# Optional: Alignment and Diarization
WHISPER_ALIGN_DEVICE=cuda
WHISPER_DIARIZATION_DEVICE=cuda
WHISPER_DIARIZATION_MIN_SPEAKERS=1
WHISPER_DIARIZATION_MAX_SPEAKERS=10

# Required for diarization (get from https://huggingface.co/settings/tokens)
HF_TOKEN=your_huggingface_token_here

# Optional: Prompt context
PROMPT_CONTEXT_ROOT=/path/to/prompt/context
```

## Running Stage 2 Transcription

Once dependencies are installed and environment is configured:

```bash
# Process all available jobs
python stage2_transcribe.py

# Process specific zip file
python stage2_transcribe.py --zip some_archive.zip

# Process with date filters
python stage2_transcribe.py --date 2024-01-15

# Process date range
python stage2_transcribe.py --start-date 2024-01-01 --end-date 2024-01-31

# Enable debug logging
python stage2_transcribe.py --debug

# Force reprocessing
python stage2_transcribe.py --force

# Display transcription results
python stage2_transcribe.py --see-transcriptions
```

## Package Versions

Latest compatible versions (installed with CUDA support):

| Package       | Version     | Purpose                                           |
| ------------- | ----------- | ------------------------------------------------- |
| whisperx      | 3.7.4       | Speech recognition with word-level timestamps     |
| torch         | 2.5.1+cu121 | Deep learning framework with CUDA 12.1 support    |
| torchaudio    | 2.5.1+cu121 | Audio processing for PyTorch                      |
| python-dotenv | 1.1.1       | Environment variable management                   |
| rich          | 14.2.0      | Terminal formatting and progress bars             |
| numpy         | 2.0.2       | Numerical computing (compatible with Python 3.10) |

**Notes:**

- PyTorch version is compatible with whisperx 3.7.4 requirements
- NumPy 2.x is used (2.3+ requires Python 3.11+, we're using 2.0.2 for Python 3.10 compatibility)
- CUDA 12.1 build is compatible with your CUDA 13.0 driver (backwards compatible)
- Your RTX 4090 will provide ~70x realtime transcription speed with large-v3 model

## Development Tools

The configuration includes development tools:

- **pytest**: Testing framework
- **pytest-cov**: Code coverage reporting
- **black**: Code formatting
- **ruff**: Fast Python linter
- **mypy**: Static type checking

Run tests:

```bash
pytest
```

Format code:

```bash
black .
```

Lint code:

```bash
ruff check .
```

Type check:

```bash
mypy .
```

## Updating Dependencies

To update dependencies to their latest compatible versions:

```bash
uv pip install --upgrade -e ".[dev]"
```

## Troubleshooting

### CUDA/GPU Issues

If you get CUDA errors, verify:

1. CUDA toolkit version matches PyTorch requirements
2. NVIDIA drivers are up to date
3. Set `WHISPER_DEVICE=cpu` in `.env` to use CPU instead

### Memory Issues

If you run out of GPU memory:

1. Reduce `WHISPER_BATCH_SIZE` (e.g., to 4 or 8)
2. Use `WHISPER_COMPUTE_TYPE=int8` for lower precision
3. Use a smaller model: `WHISPER_MODEL_TYPE=medium` or `base`

### Diarization Issues

If speaker diarization fails:

1. Verify you have a valid Hugging Face token in `HF_TOKEN`
2. Accept terms at https://huggingface.co/pyannote/speaker-diarization-3.1
3. Accept terms at https://huggingface.co/pyannote/segmentation-3.0

## Additional Resources

- [UV Documentation](https://docs.astral.sh/uv/)
- [WhisperX GitHub](https://github.com/m-bain/whisperX)
- [PyTorch Installation Guide](https://pytorch.org/get-started/locally/)
- [Hugging Face Tokens](https://huggingface.co/settings/tokens)
