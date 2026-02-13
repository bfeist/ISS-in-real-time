"""
Source monitors for checking external data sources for new content.

This package provides monitors that check various data sources
(Internet Archive, NASA blog, Flickr, etc.) for new ISS-related content.
"""

from .base import BaseMonitor, MonitorResult
from .internet_archive import InternetArchiveMonitor
from .nasa_blog import NASABlogMonitor
from .flickr import FlickrMonitor

from pathlib import Path
from typing import Optional, Dict, Type

# Registry of available monitors
MONITOR_REGISTRY: Dict[str, Type[BaseMonitor]] = {
    "ia_collection": InternetArchiveMonitor,
    "nasa_blog": NASABlogMonitor,
    "flickr_jsc": FlickrMonitor,
}


def get_monitor(source_id: str, cache_dir: Path) -> Optional[BaseMonitor]:
    """
    Get a monitor instance by source ID.

    Args:
        source_id: Unique identifier for the source (e.g., "ia_collection")
        cache_dir: Directory for caching monitor state

    Returns:
        Monitor instance or None if source_id is not recognized
    """
    monitor_class = MONITOR_REGISTRY.get(source_id)
    if monitor_class:
        return monitor_class(cache_dir)
    return None


def get_all_monitors(cache_dir: Path) -> list[BaseMonitor]:
    """
    Get instances of all available monitors.

    Args:
        cache_dir: Directory for caching monitor state

    Returns:
        List of all monitor instances
    """
    return [cls(cache_dir) for cls in MONITOR_REGISTRY.values()]


def list_available_sources() -> list[str]:
    """
    List all available source IDs.

    Returns:
        List of source ID strings
    """
    return list(MONITOR_REGISTRY.keys())


__all__ = [
    # Base classes
    "BaseMonitor",
    "MonitorResult",
    # Monitor implementations
    "InternetArchiveMonitor",
    "NASABlogMonitor",
    "FlickrMonitor",
    # Factory functions
    "get_monitor",
    "get_all_monitors",
    "list_available_sources",
    # Registry
    "MONITOR_REGISTRY",
]
