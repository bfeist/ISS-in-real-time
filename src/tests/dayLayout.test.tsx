import React from "react";
import { render, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DayLayout from "../components/dayLayout/dayLayout";
import { useStateClock } from "../store/hooks/useStateClock";
import { useStateDayNight } from "../store/hooks/useStateDayNight";
import { useStateSearch } from "../store/hooks/useStateSearch";
import {
  useDateDataAvailability,
  useDateEphemera,
  useDateCommTranscript,
} from "../api/useDateSpecificData";
import { useGeneralVideoIa, useGeneralVideoYt } from "../api/useGeneralData";
import { useDateCacheManagement } from "../api/useDateCacheManagement";
import { resolveLayout } from "../components/dayLayout/layouts";
import { useParams } from "react-router-dom";

vi.mock("../store/hooks/useStateClock", () => ({
  useStateClock: vi.fn(),
}));

vi.mock("../store/hooks/useStateDayNight", () => ({
  useStateDayNight: vi.fn(),
}));

vi.mock("../store/hooks/useStateSearch", () => ({
  useStateSearch: vi.fn(),
}));

vi.mock("../api/useDateSpecificData", () => ({
  useDateDataAvailability: vi.fn(),
  useDateEphemera: vi.fn(),
  useDateCommTranscript: vi.fn(),
}));

vi.mock("../api/useGeneralData", () => ({
  useGeneralVideoIa: vi.fn(),
  useGeneralVideoYt: vi.fn(),
}));

vi.mock("../api/useDateCacheManagement", () => ({
  useDateCacheManagement: vi.fn(),
}));

vi.mock("../components/dayLayout/layouts", () => ({
  resolveLayout: vi.fn(),
}));

vi.mock("../components/timelineDay/timelineDayContainer", () => ({
  default: () => <div data-testid="timeline-day" />,
}));

vi.mock("../components/panes/comm", () => ({
  default: () => <div data-testid="comm" />,
}));

vi.mock("../components/panes/articles", () => ({
  default: () => <div data-testid="articles" />,
}));

vi.mock("../components/panes/evaInfo", () => ({
  default: () => <div data-testid="eva" />,
}));

vi.mock("../components/panes/video", () => ({
  default: () => <div data-testid="video" />,
}));

vi.mock("../components/panes/photos", () => ({
  default: () => <div data-testid="photos" />,
}));

vi.mock("../components/panes/expCrewFlightWidget/expeditionsAndCrew", () => ({
  default: () => <div data-testid="expeditions" />,
}));

vi.mock("../components/panes/expCrewFlightWidget/flights", () => ({
  default: () => <div data-testid="flights" />,
}));

vi.mock("../components/panes/expCrewFlightWidget/widget", () => ({
  default: () => <div data-testid="widget" />,
}));

vi.mock("../components/dayLayout/mobileLayout", () => ({
  default: () => <div data-testid="mobile-layout" />,
}));

vi.mock("../components/dayLayout/globeOrMap", () => ({
  GlobeOrMap: () => <div data-testid="globe" />,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: vi.fn(),
  };
});

describe("DayLayout autoplay handling", () => {
  const mockedClock = vi.mocked(useStateClock);
  const mockedDayNight = vi.mocked(useStateDayNight);
  const mockedSearch = vi.mocked(useStateSearch);
  const mockedDataAvailability = vi.mocked(useDateDataAvailability);
  const mockedEphemera = vi.mocked(useDateEphemera);
  const mockedComm = vi.mocked(useDateCommTranscript);
  const mockedVideoIa = vi.mocked(useGeneralVideoIa);
  const mockedVideoYt = vi.mocked(useGeneralVideoYt);
  const mockedCache = vi.mocked(useDateCacheManagement);
  const mockedResolveLayout = vi.mocked(resolveLayout);
  const mockedUseParams = vi.mocked(useParams);

  let startClock: ReturnType<typeof vi.fn>;
  let setDayNight: ReturnType<typeof vi.fn>;
  let playMock: ReturnType<typeof vi.fn>;
  let pauseMock: ReturnType<typeof vi.fn>;
  let originalCreateElement: typeof document.createElement;
  let createElementSpy: ReturnType<typeof vi.spyOn>;
  let audioElementStub: HTMLAudioElement;

  beforeEach(() => {
    vi.clearAllMocks();
    startClock = vi.fn();
    setDayNight = vi.fn();

    mockedClock.mockReturnValue({
      startStopTimestamp: "",
      appSecondsAtStartStop: 0,
      isRunning: false,
      selectedDate: "2024-01-01",
      startClock,
      stopClock: vi.fn(),
      setTimeOnly: vi.fn(),
      setDateOnly: vi.fn(),
      setDateTime: vi.fn(),
      handleDayRollover: vi.fn(),
    });

    mockedDayNight.mockReturnValue({
      dayNight: [],
      setDayNight,
    } as unknown as ReturnType<typeof useStateDayNight>);

    mockedSearch.mockReturnValue({
      selectedCrewMember: null,
      setSelectedCrewMember: vi.fn(),
      selectedExpedition: null,
      setSelectedExpedition: vi.fn(),
      selectedNotableMoment: null,
      setSelectedNotableMoment: vi.fn(),
      clearAllSearchHighlights: vi.fn(),
    } as unknown as ReturnType<typeof useStateSearch>);

    mockedDataAvailability.mockReturnValue({ data: undefined } as unknown as ReturnType<
      typeof useDateDataAvailability
    >);
    mockedEphemera.mockReturnValue({ data: [] } as unknown as ReturnType<typeof useDateEphemera>);
    mockedComm.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useDateCommTranscript>);
    mockedVideoIa.mockReturnValue({ data: [] } as unknown as ReturnType<typeof useGeneralVideoIa>);
    mockedVideoYt.mockReturnValue({ data: [] } as unknown as ReturnType<typeof useGeneralVideoYt>);
    mockedCache.mockImplementation(() => {});

    mockedResolveLayout.mockReturnValue({
      layout: {
        left: [],
        center: [],
        right: [],
      },
    } as unknown as ReturnType<typeof resolveLayout>);

    mockedUseParams.mockReturnValue({ dateTimeSlug: "2024-01-01T12:34:56" });

    playMock = vi.fn(() => Promise.reject(new DOMException("Autoplay blocked", "NotAllowedError")));
    pauseMock = vi.fn();

    let srcValue = "";
    audioElementStub = {
      play: playMock as unknown as HTMLMediaElement["play"],
      pause: pauseMock as unknown as HTMLMediaElement["pause"],
      preload: "",
      volume: 0,
      get src() {
        return srcValue;
      },
      set src(value: string) {
        srcValue = value;
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    } as unknown as HTMLAudioElement;

    originalCreateElement = document.createElement.bind(document) as typeof document.createElement;
    createElementSpy = vi.spyOn(document, "createElement");
    createElementSpy.mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      if (typeof tagName === "string" && tagName.toLowerCase() === "audio") {
        return audioElementStub;
      }
      return originalCreateElement(tagName as never, options);
    }) as typeof document.createElement);
  });

  afterEach(() => {
    createElementSpy.mockRestore();
    cleanup();
  });

  it("keeps the clock paused when autoplay is blocked for time slugs", async () => {
    render(<DayLayout />);

    await waitFor(() => {
      expect(playMock).toHaveBeenCalled();
      expect(pauseMock).toHaveBeenCalled();
      expect(startClock).not.toHaveBeenCalled();
    });
  });

  it("starts the clock when autoplay is allowed for time slugs", async () => {
    playMock.mockResolvedValue(undefined);

    render(<DayLayout />);

    await waitFor(() => {
      expect(playMock).toHaveBeenCalled();
      expect(pauseMock).toHaveBeenCalled();
      expect(startClock).toHaveBeenCalledTimes(1);
    });
  });
});
