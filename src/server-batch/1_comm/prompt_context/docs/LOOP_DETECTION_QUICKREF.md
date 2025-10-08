# Infinite Loop Detection - Quick Reference

## 🚀 Quick Start

```python
from ollama import OllamaClient

# Default configuration (recommended)
client = OllamaClient(enable_loop_detection=True)

result = client.generate(prompt="Your prompt here")

if result.metrics.was_terminated:
    print(f"⚠️ Terminated: {result.metrics.termination_reason}")
```

## 📊 Detection Methods

| Method                   | What It Detects                 | Default Threshold |
| ------------------------ | ------------------------------- | ----------------- |
| **Stall Detection**      | No output for too long          | 30 seconds        |
| **Max Duration**         | Generation takes too long total | 5 minutes         |
| **Repetition Detection** | Repeated output patterns        | 80% in 50 tokens  |

## ⚙️ Configuration Presets

### Conservative (Catch loops quickly)

```python
loop_detector_config={
    "stall_timeout": 15.0,
    "max_duration": 120.0,
    "repetition_window": 30,
    "repetition_threshold": 0.7,
}
```

### Balanced (Default - recommended)

```python
loop_detector_config={
    "stall_timeout": 30.0,
    "max_duration": 300.0,
    "repetition_window": 50,
    "repetition_threshold": 0.8,
}
```

### Permissive (Allow more time)

```python
loop_detector_config={
    "stall_timeout": 60.0,
    "max_duration": 600.0,
    "repetition_window": 100,
    "repetition_threshold": 0.9,
}
```

## 📡 Real-Time Monitoring

```python
def on_event(event: dict):
    if event.get("terminated"):
        print(f"🛑 {event['reason']}")
    elif event.get("response"):
        print(".", end="", flush=True)

result = client.generate(prompt="...", on_event=on_event)
```

## 🔍 Checking Results

```python
result = client.generate(prompt="...")

# Check if terminated
if result.metrics.was_terminated:
    reason = result.metrics.termination_reason
    # Handle termination

# Partial text is still available
text = result.text
```

## 📝 Metadata

Termination info saved in `prompt_meta.json`:

```json
{
  "was_terminated": true,
  "termination_reason": "Generation stalled for 35.2s",
  ...
}
```

## 🎯 Use Cases

| Use Case            | Recommended Config |
| ------------------- | ------------------ |
| Interactive chatbot | Conservative       |
| Batch processing    | Balanced (default) |
| Code generation     | Balanced           |
| Research/analysis   | Permissive         |
| Short responses     | Conservative       |
| Long-form content   | Permissive         |

## 🐛 Troubleshooting

### Too Many False Positives?

- Increase `stall_timeout`
- Increase `max_duration`
- Increase `repetition_threshold`

### Loops Not Being Caught?

- Decrease `stall_timeout`
- Decrease `repetition_threshold`
- Decrease `repetition_window`

## 📚 More Information

- Full documentation: `INFINITE_LOOP_DETECTION.md`
- Test suite: `test_infinite_loop_detection.py`
- Examples: `examples_loop_detection.py`

## ⚡ Performance

- **Overhead:** ~0.1ms per token
- **Memory:** ~1-5KB per generation
- **CPU:** Negligible

## 🔒 Safety First

✅ **DO:**

- Keep detection enabled in production
- Monitor terminations
- Log termination reasons
- Handle partial results gracefully

❌ **DON'T:**

- Disable without good reason
- Ignore termination metadata
- Assume terminated = failed
