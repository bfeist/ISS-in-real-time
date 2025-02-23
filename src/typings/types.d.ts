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
  availableDates: AvailableDate[];
  youtubeLiveRecordings: YoutubeLiveRecording[];
  crewArrDep: CrewArrDepItem[];
  expeditionInfo: ExpeditionInfo[];
  nationalityFlags: NationalityFlags;
};

type GetCesiumPageDataResponse = {
  ephemeraItems: EphemeraItem[];
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
  expeditionBlurb: string;
  patchUrl: string;
};

type NationalityFlags = {
  [key: string]: string;
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
  publishedAt: string;
  startTime: string;
  videoId: string;
  duration: number;
  title: string;
};

type YoutubeManualStartTime = {
  date: string;
  videoId: string;
  youtubeTime: string;
  youtubeTimeIsoTimestamp: string;
};

type Telemetry = {
  velocity: number;
  altitude: number;
  lat: number;
  lng: number;
};
