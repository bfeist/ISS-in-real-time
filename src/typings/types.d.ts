type AvailableDate = {
  date: string;
  youtube: boolean;
  eva: boolean;
};

type TranscriptItem = {
  utteranceTime: string;
  filename: string;
  start: string;
  end: string;
  language: string;
  text: string;
  textOriginalLang: string;
};

type ImageItem = {
  ID: string;
  dateTaken: string;
  smallUrl: string;
  largeUrl: string;
};

type EphemeraItem = {
  epoch: string;
  tle_line1: string;
  tle_line2: string;
};

type GetDatePageDataResponse = {
  transcriptItems: TranscriptItem[];
  imageItems: ImageItem[];
  ephemeraItems: EphemeraItem[];
  evaDetails: EvaDetail[];
  availableDates: string[];
  youtubeLiveRecordings: YoutubeLiveRecording[];
  crewArrDep: CrewArrDepItem[];
  expeditionInfo: ExpeditionInfo[];
};

type GetCesiumPageDataResponse = {
  ephemeraItems: EphemeraItem[];
};

type TimeDef = {
  // hh:mm:ss
  startValue: string;
  // unix timestamp
  startedTimestamp: number;
  running: boolean;
};

type CrewItem = {
  ev?: number;
  name: string;
  nationality: string;
};

type CrewArrDepItem = {
  name: string;
  nationality: string;
  arrivalDate: string;
  arrivalFlight: string;
  departureDate: string;
  departureFlight: string;
  durationDays: string;
};

type ExpeditionInfo = {
  expedition: number;
  start: string;
  end: string;
  expeditionblurb: string;
  patchUrl: string;
};

type EvaDetail = {
  number: string;
  mission: string;
  missionEvaNum: number;
  crew: CrewItem[];
  groundIVCrew: CrewItem[];
  startTime: string;
  endTime: string;
  duration: string;
  description: string;
};

type YoutubeLiveRecording = {
  startTime: string;
  videoId: string;
  duration: number;
  title: string;
};
