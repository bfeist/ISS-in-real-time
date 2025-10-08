# Visual Data Flow: Infinite Loop Detection

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     PromptSynthesizer                           │
│                                                                 │
│  synthesize_prompt()                                            │
│    │                                                            │
│    ├─> Build prompt                                            │
│    │                                                            │
│    └─> ollama.generate(prompt, on_event=callback) ─────────┐   │
└─────────────────────────────────────────────────────────────│───┘
                                                              │
                                                              │
┌─────────────────────────────────────────────────────────────┼───┐
│                       OllamaClient                          │   │
│                                                             ▼   │
│  generate()                                                     │
│    │                                                            │
│    ├─> Build payload                                           │
│    │                                                            │
│    └─> _execute(payload, on_event) ─────────────────────┐      │
│                                                          │      │
│  _execute()                                              │      │
│    │                                                     │      │
│    ├─> POST to Ollama API (streaming)                   │      │
│    │                                                     │      │
│    ├─> Create InfiniteLoopDetector ─────────────┐       │      │
│    │                                             │       │      │
│    └─> For each streamed line:                  │       │      │
│          │                                       │       │      │
│          ├─> Parse JSON event                   │       │      │
│          │                                       │       │      │
│          ├─> detector.check_token(token) ───────┤       │      │
│          │     │                                 │       │      │
│          │     └─> Returns termination_reason?  │       │      │
│          │           │                           │       │      │
│          │           ├─> YES: Close response ─┐ │       │      │
│          │           │         Break loop      │ │       │      │
│          │           │         Set metrics     │ │       │      │
│          │           │                         │ │       │      │
│          │           └─> NO: Continue          │ │       │      │
│          │                                     │ │       │      │
│          ├─> Call on_event(event) ─────────────┼─┼───────┼──────┤
│          │                                     │ │       │      │
│          └─> Append to text_parts              │ │       │      │
│                                                 │ │       │      │
│  Return GenerationResult                        │ │       │      │
│    ├─> text: "".join(text_parts)               │ │       │      │
│    ├─> metrics.was_terminated                  │ │       │      │
│    ├─> metrics.termination_reason              │ │       │      │
│    └─> raw_events (with termination event)     │ │       │      │
└─────────────────────────────────────────────────┼─┼───────┼──────┘
                                                  │ │       │
                                                  │ │       │
┌─────────────────────────────────────────────────┼─┼───────┼──────┐
│              InfiniteLoopDetector               │ │       │      │
│                                                 │ │       │      │
│  start()                                        │ │       │      │
│    ├─> start_time = now()                      │ │       │      │
│    ├─> last_token_time = now()                 │ │       │      │
│    └─> recent_tokens.clear()                   │ │       │      │
│                                                 │ │       │      │
│  check_token(token) <───────────────────────────┘ │       │      │
│    │                                              │       │      │
│    ├─> Check 1: Max Duration                     │       │      │
│    │    elapsed = now - start_time               │       │      │
│    │    if elapsed > max_duration:               │       │      │
│    │       return "Max duration exceeded"        │       │      │
│    │                                              │       │      │
│    ├─> Check 2: Stall Detection                  │       │      │
│    │    time_since_last = now - last_token_time  │       │      │
│    │    if time_since_last > stall_timeout:      │       │      │
│    │       return "Stalled"                       │       │      │
│    │                                              │       │      │
│    ├─> Check 3: Repetition Detection             │       │      │
│    │    recent_tokens.append(token)              │       │      │
│    │    if len(recent_tokens) >= window * 0.8:   │       │      │
│    │       rate = calculate_repetition_rate()    │       │      │
│    │       if rate >= threshold:                 │       │      │
│    │          return "Repetition loop"           │       │      │
│    │                                              │       │      │
│    └─> Update state:                             │       │      │
│        ├─> last_token_time = now                 │       │      │
│        ├─> total_tokens += 1                     │       │      │
│        └─> return None (continue)                │       │      │
│                                                   │       │      │
│  _calculate_repetition_rate()                    │       │      │
│    unique = len(set(recent_tokens))              │       │      │
│    total = len(recent_tokens)                    │       │      │
│    return 1.0 - (unique / total)                 │       │      │
└──────────────────────────────────────────────────┼───────┼──────┘
                                                   │       │
                                                   │       │
┌──────────────────────────────────────────────────┼───────┼──────┐
│                 Event Callback                   │       │      │
│                                                  │       │      │
│  on_event(event) <───────────────────────────────┘       │      │
│    │                                                     │      │
│    ├─> if event.get("terminated"):                      │      │
│    │      print(f"Terminated: {event['reason']}")       │      │
│    │                                                     │      │
│    ├─> elif event.get("response"):                      │      │
│    │      print(".", end="")  # Progress indicator      │      │
│    │                                                     │      │
│    └─> elif event.get("done"):                          │      │
│           print("Complete!")                             │      │
└──────────────────────────────────────────────────────────┼──────┘
                                                          │
                                                          │
┌──────────────────────────────────────────────────────────┼──────┐
│              Back to PromptSynthesizer                   │      │
│                                                          │      │
│  result = ollama.generate(...) <────────────────────────┘      │
│    │                                                            │
│    ├─> if result.metrics.was_terminated:                       │
│    │      print(f"⚠️  Terminated: {reason}")                    │
│    │                                                            │
│    ├─> text = result.text (may be partial)                     │
│    │                                                            │
│    └─> Save metadata:                                          │
│          ├─> prompt.txt                                        │
│          ├─> prompt_meta.json (includes termination info)      │
│          └─> prompt_raw.jsonl (includes termination event)     │
└─────────────────────────────────────────────────────────────────┘
```

## Token Flow During Normal Generation

```
Time →

Token 1: "The"
  ├─> detector.check_token("The")
  ├─> Check duration: 0.1s < 300s ✓
  ├─> Check stall: 0.1s < 30s ✓
  ├─> Check repetition: not enough data ✓
  └─> Continue ✓

Token 2: "ISS"
  ├─> detector.check_token("ISS")
  ├─> Check duration: 0.2s < 300s ✓
  ├─> Check stall: 0.1s < 30s ✓
  ├─> Check repetition: not enough data ✓
  └─> Continue ✓

Token 3: "crew"
  ├─> detector.check_token("crew")
  ├─> Check duration: 0.3s < 300s ✓
  ├─> Check stall: 0.1s < 30s ✓
  ├─> Check repetition: not enough data ✓
  └─> Continue ✓

... (more tokens) ...

Token N: "done"
  ├─> detector.check_token("done")
  ├─> All checks pass ✓
  └─> Generation complete ✓
```

## Token Flow During Infinite Loop (Stall)

```
Time →

Token 1-50: Normal generation (0-5s)
  └─> All checks pass ✓

[30 seconds pass with no new tokens]

Next token attempt:
  ├─> detector.check_token(token)
  ├─> Check duration: 35s < 300s ✓
  ├─> Check stall: 35s > 30s ✗
  │     ↓
  │   Return "Generation stalled for 35.0s without output"
  │     ↓
  ├─> response.close()
  ├─> raw_events.append({"terminated": true, ...})
  ├─> metrics.was_terminated = True
  └─> Return partial result
```

## Token Flow During Repetition Loop

```
Time →

Token 1-40: Normal generation
  ├─> recent_tokens = ["ISS", "crew", "Soyuz", ...]
  ├─> Unique tokens: 35/40 = 87% unique
  └─> Continue ✓

Token 41-60: Start repeating
  ├─> recent_tokens = ["repeat", "repeat", "repeat", ...]
  ├─> Unique tokens: 8/50 = 16% unique
  ├─> Repetition rate: 84%
  ├─> 84% > 80% threshold ✗
  │     ↓
  │   Return "Detected repetition loop (84.0% repetition rate)"
  │     ↓
  ├─> response.close()
  ├─> raw_events.append({"terminated": true, ...})
  ├─> metrics.was_terminated = True
  └─> Return partial result
```

## Detection State Machine

```
                    ┌──────────────┐
                    │   STARTED    │
                    │              │
                    │ - start_time │
                    │ - last_token │
                    │ - tokens = []│
                    └──────┬───────┘
                           │
                           │ check_token()
                           ▼
         ┌─────────────────────────────────┐
         │   Check All Conditions          │
         │                                 │
         │  1. Duration > max?    ────┐    │
         │  2. Stall > timeout?   ────┤    │
         │  3. Repetition > rate? ────┤    │
         └─────────────────────────────┼───┘
                                       │
                  ┌────────────────────┴────────────────────┐
                  │                                         │
                  │ ANY condition true?                     │
                  │                                         │
           YES ◄──┤                                         ├──► NO
                  │                                         │
                  │                                         │
                  ▼                                         ▼
         ┌────────────────┐                      ┌─────────────────┐
         │  TERMINATED    │                      │   MONITORING    │
         │                │                      │                 │
         │ - Close stream │                      │ - Update state  │
         │ - Log event    │                      │ - Add token     │
         │ - Set metrics  │                      │ - Continue      │
         │ - Return       │                      └────────┬────────┘
         └────────────────┘                               │
                                                          │
                                                          │ next token
                                                          │
                                                          ▼
                                        ┌─────────────────────────────┐
                                        │   Check All Conditions      │
                                        │   (loop continues)          │
                                        └─────────────────────────────┘
```

## Configuration Impact

```
                Aggressive                     Balanced                    Permissive
                    │                              │                            │
                    │                              │                            │
    stall_timeout: 15s ◄───────────────── 30s ────────────────────► 60s
                    │                              │                            │
                    │                              │                            │
    max_duration: 120s ◄───────────────── 300s ───────────────────► 600s
                    │                              │                            │
                    │                              │                            │
    repetition:   0.7 ◄────────────────── 0.8 ────────────────────► 0.9
                    │                              │                            │
                    │                              │                            │
         More False Positives           Good Balance          Fewer False Positives
         Less False Negatives                                 More False Negatives
         Quick Detection                                      Patient Detection
         Production Ready                                     Research/Dev
```
