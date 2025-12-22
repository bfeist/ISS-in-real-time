"""
Entry point for running the incremental update system as a module.

Usage:
    uv run python -m incremental [command] [options]
"""

from .cli import main

if __name__ == "__main__":
    main()
