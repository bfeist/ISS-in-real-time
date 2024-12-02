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
  youtubeLiveRecordings: YouTubeLiveRecording[];
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

type EvaDetail = {
  number: string;
  mission: string;
  mission_eva_num: number;
  crew: CrewItem[];
  groundIVCrew: CrewItem[];
  start_time: string;
  end_time: string;
  duration: string;
  description: string;
};

type YoutubeVideoItem = {
  startTime: string;
  videoId: string;
  duration: number;
  title: string;
};
