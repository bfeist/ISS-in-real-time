# Infinite Loop Detection for AI Generation

## Overview

The system now includes comprehensive safeguards to detect and terminate AI model generation when it gets stuck in an infinite loop or stalls. This prevents wasted compute time and allows graceful recovery.

## Detection Mechanisms

### 1. **Stall Detection**

Monitors the time between output tokens. If no new output is received for a configurable timeout period, generation is terminated.

```python
stall_timeout=30.0  # Terminate if no output for 30 seconds
```

**When it triggers:**

- Model is "thinking" but not producing output
- Network issues causing delays
- Model is stuck in an internal loop

### 2. **Maximum Duration**

Sets an absolute time limit for the entire generation process.

```python
max_duration=300.0  # Terminate after 5 minutes total
```

**When it triggers:**

- Generation takes abnormally long regardless of output
- Prevents runaway processes that produce output slowly

### 3. **Repetition Detection**

Analyzes recent tokens to detect when the model is outputting repetitive content (a classic sign of infinite loops).

```python
repetition_window=50        # Check last 50 tokens
repetition_threshold=0.8    # Trigger at 80% repetition
```

**When it triggers:**

- Model outputs the same words/phrases repeatedly
- Common in infinite reasoning loops
- Calculates uniqueness ratio of recent tokens

## Configuration

### Default Configuration (Balanced)

```python
client = OllamaClient(
    enable_loop_detection=True,  # Enable by default
    loop_detector_config={
        "stall_timeout": 30.0,       # 30 seconds without output
        "max_duration": 300.0,       # 5 minutes absolute max
        "repetition_window": 50,     # Check last 50 tokens
        "repetition_threshold": 0.8, # 80% repetition triggers
    }
)
```

### Conservative (Catch loops quickly)

Best for: Short responses, production environments, resource-constrained systems

```python
loop_detector_config={
    "stall_timeout": 15.0,       # Very responsive
    "max_duration": 120.0,       # 2 minutes max
    "repetition_window": 30,     # Smaller window
    "repetition_threshold": 0.7, # Lower threshold
}
```

### Permissive (Allow more time)

Best for: Long-form content, complex reasoning, research tasks

```python
loop_detector_config={
    "stall_timeout": 60.0,       # 1 minute between outputs
    "max_duration": 600.0,       # 10 minutes max
    "repetition_window": 100,    # Larger window
    "repetition_threshold": 0.9, # Higher threshold
}
```

### Disabled (No protection)

Only use if you need to debug or have external timeout mechanisms:

```python
client = OllamaClient(
    enable_loop_detection=False
)
```

## How It Works

### 1. Initialization

When `generate()` is called, a new `InfiniteLoopDetector` instance is created and started.

### 2. Per-Token Checking

For each token received from the streaming API:

```python
for line in response.iter_lines():
    event = json.loads(line)
    if event.get("response"):
        token = event["response"]
        termination_reason = detector.check_token(token)
        if termination_reason:
            # Terminate and log
            response.close()
            break
```

### 3. Termination

When a condition is met:

- The HTTP response is closed immediately
- A termination event is added to `raw_events`
- The `GenerationMetrics` includes termination details
- The partial text generated so far is returned

### 4. Metadata

Termination information is saved in `prompt_meta.json`:

```json
{
  "was_terminated": true,
  "termination_reason": "Generation stalled for 35.2s without output",
  ...
}
```

## Monitoring in Real-Time

Use event callbacks to monitor generation progress:

```python
def on_event(event: dict):
    if event.get("terminated"):
        print(f"⚠️  Terminated: {event['reason']}")
        print(f"   Tokens generated: {event['total_tokens']}")
    elif event.get("response"):
        print(".", end="", flush=True)  # Progress indicator

result = client.generate(
    prompt="...",
    on_event=on_event
)

if result.metrics.was_terminated:
    print(f"Generation was cut short: {result.metrics.termination_reason}")
```

## Integration Example

The `PromptSynthesizer` automatically logs terminations:

```python
result = self.ollama.generate(prompt, on_event=on_event)

if result.metrics.was_terminated:
    print(f"⚠️  Generation was terminated: {result.metrics.termination_reason}")

# Continue processing with partial result
text = result.text.strip()
```

## Algorithm Details

### Repetition Rate Calculation

```python
def _calculate_repetition_rate(self) -> float:
    unique_count = len(set(self.recent_tokens))
    total_count = len(self.recent_tokens)
    repetition_rate = 1.0 - (unique_count / total_count)
    return repetition_rate
```

**Example:**

- Last 50 tokens: 10 unique → `1.0 - (10/50)` = 0.8 (80% repetition) ✗ **TRIGGER**
- Last 50 tokens: 45 unique → `1.0 - (45/50)` = 0.1 (10% repetition) ✓ OK

### Timing Logic

```python
# Start of generation
start_time = time.perf_counter()
last_token_time = start_time

# Each token
now = time.perf_counter()
elapsed = now - start_time              # Total time
time_since_last = now - last_token_time # Time since last token

# Update for next token
last_token_time = now
```

## Testing

Run the test suite to verify detection mechanisms:

```bash
cd src/server-batch/1_comm/prompt_context
python test_infinite_loop_detection.py
```

Expected output:

```
1. Stall Detection Test
   Stall detected: Generation stalled for 6.0s without output
   ✓ Passed

2. Max Duration Test
   Max duration exceeded: Generation exceeded maximum duration (3.0s)
   ✓ Passed

3. Repetition Detection Test
   Repetition detected: Detected repetition loop (80.0% repetition rate)
   ✓ Passed
```

## Best Practices

### 1. **Start with Defaults**

The default configuration works well for most use cases.

### 2. **Monitor Initially**

Use event callbacks to understand normal generation patterns before tuning.

### 3. **Tune Based on Use Case**

- **Interactive responses**: Conservative (fast detection)
- **Batch processing**: Balanced (default)
- **Research/analysis**: Permissive (allow more time)

### 4. **Log Terminations**

Always check and log `was_terminated` to identify patterns:

```python
if result.metrics.was_terminated:
    logger.warning(f"Generation terminated: {result.metrics.termination_reason}")
```

### 5. **Handle Partial Results**

Terminated generations still return partial text - handle gracefully:

```python
if result.metrics.was_terminated and len(result.text) < 50:
    # Text too short to be useful, maybe retry with different params
    retry_with_higher_temperature()
```

### 6. **Combine with Model Parameters**

Adjust model parameters to prevent loops at the source:

```python
default_options = {
    "temperature": 0.2,      # Lower = more deterministic
    "repeat_penalty": 1.1,   # Penalize repetition
    "top_p": 0.95,          # Nucleus sampling
}
```

## Troubleshooting

### False Positives: Stall Detection

**Problem:** Generation terminated during legitimate "thinking" phase.

**Solution:** Increase `stall_timeout`:

```python
stall_timeout=45.0  # Allow longer pauses
```

### False Positives: Repetition Detection

**Problem:** Legitimate repetitive content (lists, code) triggers detection.

**Solution:** Increase threshold or window size:

```python
repetition_threshold=0.9  # Only trigger on extreme repetition
repetition_window=100     # Larger sample size
```

### False Negatives: Loops Not Detected

**Problem:** Model stuck in loop but not detected.

**Solution:** Make detection more aggressive:

```python
stall_timeout=15.0
repetition_threshold=0.6
```

## Performance Impact

The detection adds minimal overhead:

- **Per-token cost:** ~0.1ms (token storage + set operations)
- **Memory:** ~50-100 tokens × token size ≈ 1-5KB
- **CPU:** Negligible (simple arithmetic and set operations)

## Future Enhancements

Potential improvements:

1. **Pattern Detection**: Detect specific loop patterns (e.g., "Let me think...")
2. **Adaptive Thresholds**: Adjust based on generation characteristics
3. **ML-based Detection**: Train a classifier on loop vs normal generation
4. **Token-level Analysis**: Analyze token IDs instead of text
5. **Graceful Retry**: Automatically retry with adjusted parameters

## Related Files

- `ollama.py` - Core implementation
- `prompt_synthesizer.py` - Integration example
- `test_infinite_loop_detection.py` - Test suite
- `config.py` - Configuration management
