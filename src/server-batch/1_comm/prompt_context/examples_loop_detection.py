"""
Example: Monitoring AI generation with infinite loop detection.

This script demonstrates how to use the loop detection in practice
with real-time monitoring and handling of terminated generations.
"""

from ollama import OllamaClient, GenerationResult
import time


def example_basic_usage():
    """Basic usage with default settings."""
    print("\n" + "=" * 60)
    print("Example 1: Basic Usage (Default Settings)")
    print("=" * 60)

    client = OllamaClient(
        enable_loop_detection=True,
        # Uses default config:
        # - stall_timeout: 30s
        # - max_duration: 300s
        # - repetition_threshold: 0.8
    )

    print("\n✓ Client created with default loop detection")
    print("  - Stall timeout: 30 seconds")
    print("  - Max duration: 5 minutes")
    print("  - Repetition threshold: 80%")


def example_with_monitoring():
    """Example with real-time event monitoring."""
    print("\n" + "=" * 60)
    print("Example 2: With Real-Time Monitoring")
    print("=" * 60)

    # Track generation progress
    progress = {
        "tokens": 0,
        "start_time": None,
        "terminated": False,
    }

    def on_event(event: dict):
        """Monitor generation events."""
        if not progress["start_time"]:
            progress["start_time"] = time.perf_counter()

        if event.get("terminated"):
            # Loop detected and terminated!
            progress["terminated"] = True
            elapsed = time.perf_counter() - progress["start_time"]

            print(f"\n\n🛑 GENERATION TERMINATED")
            print(f"   Reason: {event['reason']}")
            print(f"   Tokens generated: {event['total_tokens']}")
            print(f"   Time elapsed: {elapsed:.1f}s")

        elif event.get("response"):
            # Normal token generation
            progress["tokens"] += 1
            if progress["tokens"] % 10 == 0:
                elapsed = time.perf_counter() - progress["start_time"]
                print(f"   {progress['tokens']} tokens ({elapsed:.1f}s)", end="\r")

        elif event.get("done"):
            # Generation completed normally
            elapsed = time.perf_counter() - progress["start_time"]
            print(f"\n✓ Completed: {progress['tokens']} tokens in {elapsed:.1f}s")

    client = OllamaClient(enable_loop_detection=True)

    print("\nSimulating generation with monitoring...")
    print("(In real usage, call client.generate() with on_event callback)")
    print("\nExample callback registered:")
    print("  - Shows progress every 10 tokens")
    print("  - Alerts on termination with details")
    print("  - Reports completion statistics")


def example_conservative_config():
    """Example with conservative detection (catch loops quickly)."""
    print("\n" + "=" * 60)
    print("Example 3: Conservative Configuration")
    print("=" * 60)

    client = OllamaClient(
        enable_loop_detection=True,
        loop_detector_config={
            "stall_timeout": 15.0,  # Quick stall detection
            "max_duration": 120.0,  # 2 minute hard limit
            "repetition_window": 30,  # Small window
            "repetition_threshold": 0.7,  # Lower threshold
        },
    )

    print("\n✓ Client created with CONSERVATIVE detection")
    print("  Best for: Production, short responses, limited resources")
    print("\n  Settings:")
    print("  - Stall timeout: 15 seconds (catches stalls quickly)")
    print("  - Max duration: 2 minutes (tight time limit)")
    print("  - Repetition: 70% in 30 tokens (sensitive)")


def example_permissive_config():
    """Example with permissive detection (allow more time)."""
    print("\n" + "=" * 60)
    print("Example 4: Permissive Configuration")
    print("=" * 60)

    client = OllamaClient(
        enable_loop_detection=True,
        loop_detector_config={
            "stall_timeout": 60.0,  # Allow longer pauses
            "max_duration": 600.0,  # 10 minute limit
            "repetition_window": 100,  # Larger window
            "repetition_threshold": 0.9,  # Higher threshold
        },
    )

    print("\n✓ Client created with PERMISSIVE detection")
    print("  Best for: Complex reasoning, long-form content, research")
    print("\n  Settings:")
    print("  - Stall timeout: 60 seconds (allows 'thinking' time)")
    print("  - Max duration: 10 minutes (generous time limit)")
    print("  - Repetition: 90% in 100 tokens (very tolerant)")


def example_handling_termination():
    """Example of handling terminated generations."""
    print("\n" + "=" * 60)
    print("Example 5: Handling Terminated Generations")
    print("=" * 60)

    client = OllamaClient(enable_loop_detection=True)

    # Simulated result (in real usage, from client.generate())
    print("\nAfter calling client.generate():")
    print("\nif result.metrics.was_terminated:")
    print("    # Generation was cut short")
    print("    reason = result.metrics.termination_reason")
    print("    print(f'⚠️  Terminated: {reason}')")
    print("    ")
    print("    # Still have partial text that may be useful")
    print("    partial_text = result.text")
    print("    ")
    print("    if len(partial_text) < 50:")
    print("        # Too short, retry with different settings")
    print("        retry_with_adjusted_params()")
    print("    else:")
    print("        # Partial result may be usable")
    print("        use_partial_result(partial_text)")
    print("else:")
    print("    # Normal completion")
    print("    text = result.text")
    print("    process_result(text)")


def example_debugging():
    """Example of using detection metadata for debugging."""
    print("\n" + "=" * 60)
    print("Example 6: Debugging and Analysis")
    print("=" * 60)

    print("\nThe prompt_meta.json file includes termination details:")
    print(
        """
{
  "date": "2011-12-06",
  "model": "gpt-oss:20b",
  "elapsed_seconds": 45.3,
  "characters": 180,
  "was_terminated": true,
  "termination_reason": "Generation stalled for 35.2s without output",
  ...
}
    """
    )

    print("The prompt_raw.jsonl includes termination event:")
    print(
        """
{
  "terminated": true,
  "reason": "Generation stalled for 35.2s without output",
  "timestamp": 1234567890.123,
  "total_tokens": 67
}
    """
    )

    print("\nUse this data to:")
    print("  - Identify patterns in terminations")
    print("  - Tune detection parameters")
    print("  - Debug model behavior")
    print("  - Monitor system health")


def main():
    """Run all examples."""
    print("\n" + "█" * 60)
    print("█" + " " * 58 + "█")
    print("█" + "  INFINITE LOOP DETECTION - PRACTICAL EXAMPLES  ".center(58) + "█")
    print("█" + " " * 58 + "█")
    print("█" * 60)

    example_basic_usage()
    example_with_monitoring()
    example_conservative_config()
    example_permissive_config()
    example_handling_termination()
    example_debugging()

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(
        """
Key Takeaways:
1. Loop detection is ENABLED BY DEFAULT with sensible settings
2. Use event callbacks (on_event) for real-time monitoring
3. Choose configuration based on your use case:
   - Conservative: Production, short responses
   - Default: General purpose, balanced
   - Permissive: Long-form, complex reasoning
4. Always check result.metrics.was_terminated
5. Partial results can still be useful even when terminated
6. Termination metadata helps with debugging and tuning

Next Steps:
- Review INFINITE_LOOP_DETECTION.md for full documentation
- Run test_infinite_loop_detection.py to see detection in action
- Integrate into your workflow with appropriate config
- Monitor terminations and adjust thresholds as needed
    """
    )
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
