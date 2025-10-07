import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MegaYearOverlay from "../components/timelineYears/subcomponents/megaYearOverlay";
import { useStateToggle } from "../store/hooks/useStateToggle";
import { useStateHover } from "../store/hooks/useStateHover";
import { useStateClock } from "../store/hooks/useStateClock";

vi.mock("../store/hooks/useStateToggle", () => ({
  useStateToggle: vi.fn(),
}));

vi.mock("../store/hooks/useStateHover", () => ({
  useStateHover: vi.fn(),
}));

vi.mock("../store/hooks/useStateClock", () => ({
  useStateClock: vi.fn(),
}));

vi.mock("../components/timelineYears/dateTooltip/dateTooltip", () => ({
  default: () => <div data-testid="tooltip" />,
}));

const mockedToggle = vi.mocked(useStateToggle);
const mockedHover = vi.mocked(useStateHover);
const mockedClock = vi.mocked(useStateClock);

let toggleState: ReturnType<typeof useStateToggle>;
let hoverState: ReturnType<typeof useStateHover>;
let clockState: ReturnType<typeof useStateClock>;
let getContextSpy: ReturnType<typeof vi.spyOn>;

describe("MegaYearOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toggleState = {
      commMute: false,
      setCommMute: vi.fn(),
      videoMute: false,
      setVideoMute: vi.fn(),
      showGlobe: false,
      setShowGlobe: vi.fn(),
      showTimelineYears: true,
      setShowTimelineYears: vi.fn(),
      hoveringYearsLabels: false,
      setHoveringYearsLabels: vi.fn(),
      showEarthPhotos: false,
      setShowEarthPhotos: vi.fn(),
      showMissionPhotos: false,
      setShowMissionPhotos: vi.fn(),
      showTimelapsePhotos: false,
      setShowTimelapsePhotos: vi.fn(),
    };

    hoverState = {
      hoverSeconds: null,
      setHoverSeconds: vi.fn(),
      hoveredDate: null,
      setHoveredDate: vi.fn(),
    };

    clockState = {
      startStopTimestamp: "",
      appSecondsAtStartStop: 0,
      isRunning: false,
      selectedDate: null,
      startClock: vi.fn(),
      stopClock: vi.fn(),
      setClock: vi.fn(),
      setSelectedDate: vi.fn(),
      handleDayRollover: vi.fn(),
    };

    mockedToggle.mockReturnValue(toggleState);
    mockedHover.mockReturnValue(hoverState);
    mockedClock.mockReturnValue(clockState);

    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      setTransform: vi.fn(),
      lineWidth: 1,
      strokeStyle: "",
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    getContextSpy.mockRestore();
  });

  it("renders nothing when timeline years hidden", () => {
    toggleState.showTimelineYears = false;

    const { container } = render(
      <MegaYearOverlay
        year={2024}
        yearIndex={0}
        position={{ left: 0, top: 0, width: 300 }}
        highlights={new Map()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it("closes timeline years when clicking a date", () => {
    const highlights = new Map([["2024-01-01", { fill: "#fff" }]]);

    const { getByRole } = render(
      <MegaYearOverlay
        year={2024}
        yearIndex={0}
        position={{ left: 0, top: 0, width: 300 }}
        highlights={highlights}
      />
    );

    fireEvent.click(getByRole("grid"));

    expect(toggleState.setShowTimelineYears).toHaveBeenCalledWith(false);
    expect(clockState.setSelectedDate).toHaveBeenCalled();
    expect(clockState.setClock).not.toHaveBeenCalled();
  });
});
