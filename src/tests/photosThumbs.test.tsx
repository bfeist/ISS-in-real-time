import { render, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import PhotosThumbs from "../components/panes/photosThumbs";

const basePhoto: PhotoItemEarth = {
  nasaId: "photo-1",
  dateTaken: "2025-01-01T00:01:40",
  smallUrl: "photos/photo-1-small.jpg",
  medUrl: "photos/photo-1-med.jpg",
  largeUrl: "photos/photo-1-large.jpg",
  type: "photos_earth",
};

const createBaseProps = () => {
  const getImageUrl = vi.fn(() => "https://example.com/image.jpg");
  const onThumbnailClick = vi.fn();
  const onAutoScrollToggle = vi.fn();
  const onDisableAutoScroll = vi.fn();
  const setClickedPhotoFilename = vi.fn();
  const setLastAppSeconds = vi.fn();

  const props: Omit<ComponentProps<typeof PhotosThumbs>, "photoItemsCombined"> = {
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

  return {
    props,
    mocks: {
      getImageUrl,
      onThumbnailClick,
      onAutoScrollToggle,
      onDisableAutoScroll,
      setClickedPhotoFilename,
      setLastAppSeconds,
    },
  };
};

describe("PhotosThumbs", () => {
  it("handles photo dataset becoming empty without throwing", async () => {
    const { props: baseProps, mocks } = createBaseProps();

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

    expect(mocks.onThumbnailClick).not.toHaveBeenCalled();
    expect(mocks.onAutoScrollToggle).not.toHaveBeenCalled();
    expect(mocks.onDisableAutoScroll).not.toHaveBeenCalled();
    expect(mocks.setClickedPhotoFilename).not.toHaveBeenCalled();
    expect(mocks.setLastAppSeconds).toHaveBeenCalledWith(100);
  });

  it("renders photos lacking time metadata without crashing", async () => {
    const { props: baseProps } = createBaseProps();
    const photoWithoutTime: PhotoItemEarth = {
      ...basePhoto,
      nasaId: "photo-missing-time",
      dateTaken: "2025-01-02",
    };

    const { container } = render(
      <PhotosThumbs
        {...baseProps}
        appSeconds={150}
        mostRecentImage={photoWithoutTime}
        photoItemsCombined={[photoWithoutTime]}
      />
    );

    await waitFor(() => {
      expect(container.querySelectorAll("[data-index]").length).toBeGreaterThan(0);
    });
  });
});
