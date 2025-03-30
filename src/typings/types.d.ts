type DataAvailability = {
  date: string;
  comm: boolean;
  vvComm: boolean;
  youtube: boolean;
  eva: boolean;
  blog: boolean;
  activitySummary: boolean;
  earthPhotography: boolean;
};

type CommItem = {
  utteranceTime: string;
  filename: string;
  start: string;
  end: string;
  language: string;
  text: string;
  textOriginalLang: string;
};

type EarthPhotographyItem = {
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
  transcriptItems: CommItem[];
  earthPhotographyItems: EarthPhotographyItem[];
  ephemeraItems: EphemeraItem[];
  evaDetails: EvaDetail[];
  dataAvailability: DataAvailability;
  youtubeLiveRecordings: YoutubeLiveRecording[];
  crewArrDep: CrewArrDepItem[];
  expeditionInfo: ExpeditionInfo[];
  flights: Flight[];
  activitySummary: ActivitySummary;
  blogArticles: BlogArticle[];
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

type FlightCrewMember = {
  name: string;
  position: string;
  nationality: string;
};

type Flight = {
  number: string;
  iss_flight: string;
  mission_name: string;
  mission_name_url: string;
  mission_patch_url: string;
  vehicle_name: string;
  launch_date: string;
  time_docked: string;
  crew_photo_url: string;
  notes: string;
  mission_duration: string;
  spacecraft: string;
  spacecraft_type: string;
  manufacturer: string;
  crew_launching: FlightCrewMember[];
  crew_landing: FlightCrewMember[];
  launch_mass: string;
  landing_mass: string;
  launch_date_utc: string;
  rocket: string;
  launch_site: string;
  recovered_by: string;
  landing_date_utc: string;
  landing_site: string;
  docking_port: string;
  docking_date_utc: string;
  undocking_date_utc: string;
  time_docked_detail: string;
  infobox_image_url: string;
};

type ActivitySummaryGeneral = {
  name: string;
  description: string;
};

type ActivitySummaryTasklist = {
  name: string;
};

type ActivitySummaryGround = {
  name: string;
};

type ActivitySummary = {
  general?: ActivitySummaryGeneral[];
  tasklist?: ActivitySummaryTasklist[];
  ground?: ActivitySummaryGround[];
};

type BlogArticle = {
  title: string;
  paragraphs: string[];
  image_caption?: string;
  image_filename?: string;
};

type Telemetry = {
  velocity: number;
  altitude: number;
  lat: number;
  lng: number;
};
