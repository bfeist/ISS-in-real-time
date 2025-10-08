"""
Test and demonstration of infinite loop detection mechanisms.

This module shows how to configure and use the InfiniteLoopDetector
to safeguard against AI model infinite loops during generation.
"""

import time
from ollama import InfiniteLoopDetector, OllamaClient


def test_stall_detection():
    """Test detection of stalled generation (no output for too long)."""
    detector = InfiniteLoopDetector(
        stall_timeout=5.0,  # 5 seconds without output = stalled
        max_duration=60.0,
    )

    detector.start()

    # Simulate normal generation
    for i in range(10):
        reason = detector.check_token(f"token_{i}")
        assert reason is None, f"Should not trigger early: {reason}"
        time.sleep(0.5)

    # Simulate a stall (no tokens for > stall_timeout)
    print("Testing stall detection...")
    time.sleep(6)

    # Next token check should detect the stall
    reason = detector.check_token("late_token")
    print(f"Stall detected: {reason}")
    assert reason is not None
    assert "stalled" in reason.lower()


def test_max_duration():
    """Test absolute timeout for generation."""
    detector = InfiniteLoopDetector(
        stall_timeout=60.0,  # Long stall timeout
        max_duration=3.0,  # But only 3 seconds total allowed
    )

    detector.start()

    # Generate tokens continuously
    print("Testing max duration...")
    for i in range(100):
        reason = detector.check_token(f"token_{i}")
        if reason:
            print(f"Max duration exceeded: {reason}")
            assert "maximum duration" in reason.lower()
            break
        time.sleep(0.05)  # Small delay between tokens
    else:
        raise AssertionError("Should have detected max duration")


def test_repetition_detection():
    """Test detection of repetitive output (infinite loop pattern)."""
    detector = InfiniteLoopDetector(
        stall_timeout=60.0,
        max_duration=60.0,
        repetition_window=20,  # Look at last 20 tokens
        repetition_threshold=0.7,  # 70% repetition triggers
    )

    detector.start()

    # Generate diverse tokens first
    print("Testing repetition detection...")
    for i in range(10):
        reason = detector.check_token(f"unique_token_{i}")
        assert reason is None

    # Now generate repetitive tokens (simulating infinite loop)
    for i in range(30):
        # Repeat the same few tokens over and over
        token = f"repeat_{i % 3}"
        reason = detector.check_token(token)
        if reason:
            print(f"Repetition detected after {i} repetitive tokens: {reason}")
            assert "repetition" in reason.lower()
            break
    else:
        raise AssertionError("Should have detected repetition")


def demonstrate_configuration():
    """Show different configuration options for OllamaClient."""

    # Conservative configuration (catch loops quickly)
    conservative_client = OllamaClient(
        enable_loop_detection=True,
        loop_detector_config={
            "stall_timeout": 15.0,  # 15s without output
            "max_duration": 120.0,  # 2 minutes max
            "repetition_window": 30,  # Check last 30 tokens
            "repetition_threshold": 0.7,  # 70% repetition
        },
    )

    # Permissive configuration (allow more time)
    permissive_client = OllamaClient(
        enable_loop_detection=True,
        loop_detector_config={
            "stall_timeout": 45.0,  # 45s without output
            "max_duration": 600.0,  # 10 minutes max
            "repetition_window": 50,  # Check last 50 tokens
            "repetition_threshold": 0.85,  # 85% repetition
        },
    )

    # Disabled (no loop detection)
    no_detection_client = OllamaClient(
        enable_loop_detection=False,
    )

    print("Configurations created successfully!")
    print(f"Conservative: stall={15.0}s, max={120.0}s")
    print(f"Permissive: stall={45.0}s, max={600.0}s")
    print(f"No detection: disabled")


def demonstrate_monitoring():
    """Show how to monitor generation in real-time."""

    def on_event(event: dict):
        """Event handler that monitors generation progress."""
        if event.get("terminated"):
            print(f"\n🛑 GENERATION TERMINATED!")
            print(f"   Reason: {event.get('reason')}")
            print(f"   Total tokens: {event.get('total_tokens')}")
        elif event.get("response"):
            # Show progress
            print(".", end="", flush=True)

    client = OllamaClient(
        enable_loop_detection=True,
        loop_detector_config={
            "stall_timeout": 20.0,
            "max_duration": 180.0,
        },
    )

    print("\nMonitoring example setup complete.")
    print("In real usage, pass 'on_event' callback to client.generate()")


if __name__ == "__main__":
    print("=" * 60)
    print("Infinite Loop Detection Tests")
    print("=" * 60)

    try:
        print("\n1. Stall Detection Test")
        print("-" * 60)
        test_stall_detection()
        print("✓ Passed\n")

        print("2. Max Duration Test")
        print("-" * 60)
        test_max_duration()
        print("✓ Passed\n")

        print("3. Repetition Detection Test")
        print("-" * 60)
        test_repetition_detection()
        print("✓ Passed\n")

        print("4. Configuration Examples")
        print("-" * 60)
        demonstrate_configuration()
        print("✓ Complete\n")

        print("5. Monitoring Example")
        print("-" * 60)
        demonstrate_monitoring()
        print("✓ Complete\n")

        print("=" * 60)
        print("All tests passed! ✓")
        print("=" * 60)

    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        raise
