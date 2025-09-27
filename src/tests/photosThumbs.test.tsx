import { render, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import PhotosThumbs from "../components/panes/photosThumbs";

const basePhoto: PhotoItem = {
  ID: "photo-1",
  dateTaken: "2025-01-01T00:01:40",
  smallUrl: "photos/photo-1-small.jpg",
  medUrl: "photos/photo-1-med.jpg",
  largeUrl: "photos/photo-1-large.jpg",
  description: "Sample photo",
  type: "photos_earth",
};

describe("PhotosThumbs", () => {
  it("handles photo dataset becoming empty without throwing", async () => {
    const getImageUrl = vi.fn(() => "https://example.com/image.jpg");
    const onThumbnailClick = vi.fn();
    const onAutoScrollToggle = vi.fn();
    const onDisableAutoScroll = vi.fn();
    const setClickedPhotoFilename = vi.fn();
    const setLastAppSeconds = vi.fn();

    const baseProps: Omit<ComponentProps<typeof PhotosThumbs>, "photoItemsCombined"> = {
      appSeconds: 100,
      mostRecentImage: basePhoto,
      clickedPhotoFilename: null,
      lastAppSeconds: null,
      isAutoScrollEnabled: false,
      getImageUrl,
      onThumbnailClick,
      onAutoScrollToggle,
      onDisableAutoScroll,
      setClickedPhotoFilename,
      setLastAppSeconds,
    };

    const { rerender, container } = render(
      <PhotosThumbs {...baseProps} photoItemsCombined={[basePhoto]} />
    );

    await waitFor(() => {
      expect(container.querySelectorAll("[data-index]").length).toBeGreaterThan(0);
    });

    rerender(<PhotosThumbs {...baseProps} photoItemsCombined={[]} />);

    await waitFor(() => {
      expect(container.querySelectorAll("[data-index]").length).toBe(0);
    });

    expect(onThumbnailClick).not.toHaveBeenCalled();
    expect(onAutoScrollToggle).not.toHaveBeenCalled();
    expect(onDisableAutoScroll).not.toHaveBeenCalled();
    expect(setClickedPhotoFilename).not.toHaveBeenCalled();
    expect(setLastAppSeconds).toHaveBeenCalledWith(100);
  });
});
