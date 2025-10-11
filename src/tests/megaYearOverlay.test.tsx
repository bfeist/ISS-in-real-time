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
      fillText: vi.fn(),
      lineWidth: 1,
      strokeStyle: "",
      fillStyle: "",
      textAlign: "center",
      textBaseline: "middle",
      font: "",
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    getContextSpy.mockRestore();
    vi.useRealTimers();
  });

  it("renders nothing when timeline years hidden", () => {
    toggleState.showTimelineYears = false;

    const { container } = render(
      <MegaYearOverlay
        year={2024}
        yearIndex={0}
        position={{ left: 0, top: 0, width: 300 }}
        highlights={new Map()}
        interactionMode="mouse"
        onInteractionModeChange={vi.fn()}
        onRequestClose={vi.fn()}
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
        interactionMode="mouse"
        onInteractionModeChange={vi.fn()}
        onRequestClose={vi.fn()}
      />
    );

    const grid = getByRole("grid");
    Object.defineProperty(grid, "getBoundingClientRect", {
      value: () => ({
        left: 0,
        right: 300,
        top: 0,
        bottom: 400,
        width: 300,
        height: 400,
      }),
      configurable: true,
    });

    fireEvent.click(grid, { clientX: 10, clientY: 50 });

    expect(toggleState.setShowTimelineYears).toHaveBeenCalledWith(false);
    expect(clockState.setSelectedDate).toHaveBeenCalled();
    expect(clockState.setClock).not.toHaveBeenCalled();
  });

  it("calls onRequestClose when touch cancel occurs", () => {
    const onRequestClose = vi.fn();

    const { getByRole } = render(
      <MegaYearOverlay
        year={2024}
        yearIndex={0}
        position={{ left: 0, top: 0, width: 300 }}
        highlights={new Map()}
        interactionMode="touch"
        onInteractionModeChange={vi.fn()}
        onRequestClose={onRequestClose}
      />
    );

    const grid = getByRole("grid");
    fireEvent.touchCancel(grid);

    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it("jumps directly to the year that aligns with the extension pointer", () => {
    const onSwitchToAdjacentYear = vi.fn();
    const onInteractionModeChange = vi.fn();

    const Wrapper = () => {
      const parentRef = React.useRef<HTMLDivElement>(null);

      return (
        <div ref={parentRef} data-testid="parent" style={{ position: "relative" }}>
          {Array.from({ length: 10 }).map((_, index) => (
            <div
              key={index}
              data-year-index={index}
              style={{
                position: "absolute",
                left: `${index * 100}px`,
                top: 0,
                width: "100px",
                height: "200px",
              }}
            />
          ))}
          <MegaYearOverlay
            year={2024}
            yearIndex={5}
            position={{ left: 450, top: 0, width: 200 }}
            highlights={new Map()}
            interactionMode="touch"
            onInteractionModeChange={onInteractionModeChange}
            onSwitchToAdjacentYear={onSwitchToAdjacentYear}
            parentContainerRef={parentRef}
            onRequestClose={vi.fn()}
          />
        </div>
      );
    };

    const { getByRole, container } = render(<Wrapper />);

    const parent = container.querySelector("[data-testid='parent']") as HTMLDivElement;
    Object.defineProperty(parent, "getBoundingClientRect", {
      value: () => ({
        left: 0,
        right: 1000,
        top: 0,
        bottom: 200,
        width: 1000,
        height: 200,
      }),
      configurable: true,
    });

    parent.querySelectorAll("[data-year-index]").forEach((node, index) => {
      const element = node as HTMLElement;
      Object.defineProperty(element, "getBoundingClientRect", {
        value: () => ({
          left: index * 100,
          right: index * 100 + 100,
          top: 0,
          bottom: 200,
          width: 100,
          height: 200,
        }),
        configurable: true,
      });
    });

    const grid = getByRole("grid");
    Object.defineProperty(grid, "getBoundingClientRect", {
      value: () => ({
        left: 400,
        right: 700,
        top: 0,
        bottom: 400,
        width: 300,
        height: 400,
      }),
      configurable: true,
    });

    fireEvent.touchStart(grid, {
      touches: [
        {
          identifier: 1,
          clientX: 420,
          clientY: 50,
        },
      ],
    });

    expect(onSwitchToAdjacentYear).toHaveBeenCalledTimes(1);
    expect(onSwitchToAdjacentYear).toHaveBeenCalledWith(4);
    expect(onInteractionModeChange).toHaveBeenCalledWith("touch");
  });
});
