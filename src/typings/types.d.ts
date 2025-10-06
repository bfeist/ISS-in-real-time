type DataAvailability = {
  date: string;
  comm: boolean;
  vvComm: boolean;
  video: boolean;
  eva: boolean;
  blog: boolean;
  actSum: boolean;
  photos?: boolean;
  earthPhotos: boolean;
  flickrPhotos: boolean;
  timeline: boolean;
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

type CommFirstItem = {
  filename: string;
  text: string;
  textOriginalLang?: string;
};

// Base properties shared by all photo types
type PhotoItemBase = {
  nasaId: string;
  dateTaken: string;
  smallUrl: string;
  medUrl: string;
  largeUrl: string;
};

// Earth photography with optional enhanced metadata
type PhotoItemEarth = PhotoItemBase & {
  type: "photos_earth";
  isTimelapse?: boolean;
  // Geographic coordinates (from MLCoord table, ~10% of photos)
  lat?: number;
  lon?: number;
  corners?: {
    ul: { lat: number; lon: number };
    ur: { lat: number; lon: number };
    ll: { lat: number; lon: number };
    lr: { lat: number; lon: number };
  };
  // Feature descriptions
  mlFeat?: string; // ML-detected features
  feat?: string; // Human-cataloged features
  caption?: string; // Human-written captions
  publicFeatures?: string; // Image detective contributions
  // Camera metadata
  focalLength?: number; // Focal length in mm
  camera?: string; // Camera identifier
};

// Flickr mission photos
type PhotoItemFlickr = PhotoItemBase & {
  type: "photos_flickr";
  sourceUrl?: string;
  description: string; // Human-written description from Flickr
};

// Discriminated union - use this type in components
type PhotoItem = PhotoItemEarth | PhotoItemFlickr;

type EphemeraItem = {
  epoch: string;
  tle_line1: string;
  tle_line2: string;
};

type SunLighting = "day" | "night" | "sunrise" | "sunset";

type DayNightObj = {
  appSeconds: number;
  daylight: SunLighting;
};

type CrewItem = {
  ev?: number;
  name: string;
  nationality: string;
};

type CrewArrDepItem = {
  name_first: string;
  name_middle: string;
  name_last: string;
  name_suffix: string;
  nationality: string;
  arrivalDate: string;
  arrivalFlight: string;
  departureDate: string;
  departureFlight: string;
  durationDays: string;
};

type CrewMember = {
  name: string;
  nationality: string;
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

type VideoYtItem = {
  publishedAt: string;
  videoId: string;
  duration: number;
  title: string;
  ytStartTime: string;
  derivedStartTime?: string;
};

type VideoIaItem = {
  date: string;
  time: string;
  filename: string;
  duration: number;
};

type FlightCrewMember = {
  name: string;
  position: string;
  nationality: string;
};

type FlightDockingEvent = {
  type: string;
  port: string;
  docking_date: string;
  undocking_date: string;
  time_docked: string;
  target: string;
};

type Flight = {
  number: string;
  iss_flight: string;
  mission_name: string;
  mission_name_url: string;
  mission_patch_url: string;
  vehicle_name: string;
  launch_date: string;
  landing_date?: string;
  time_docked: string;
  crew_photo_url: string;
  notes: string;
  duration: string;
  spacecraft: string;
  spacecraft_name: string;
  spacecraft_type: string;
  crew_launching: FlightCrewMember[];
  crew_landing: FlightCrewMember[];
  docking_events: FlightDockingEvent[];
  infobox_image_url: string;
  spacecraft_details: Record<string, string>;
};

type FlightSupply = {
  countries: string[];
  docking_date: string;
  docking_port: string;
  duration: string;
  flight_no: string;
  infobox_image_caption: string;
  infobox_image_url: string;
  is_failure: boolean;
  is_module: boolean;
  launch_date: string;
  launch_vehicle: string;
  mission: string;
  number: string;
  spacecraft: string;
  spacecraft_details: Record<string, string>;
  spacecraft_link: string;
  spacecraft_name: string;
  spacecraft_type: string;
  undocking_date: string;
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
  sourceUrl?: string;
};

type BlogArticle = {
  title: string;
  paragraphs: string[];
  image_caption?: string;
  image_filename?: string;
  source_url?: string;
};

type OrbitDaily = Record<string, number>;

type Telemetry = {
  velocity: number;
  altitude: number;
  lat: number;
  lng: number;
};

type NotableMomentItem = {
  datetime: string;
  description: string;
};

type Stats = {
  comm: {
    total_days_with_transcripts: number;
    total_days_with_vv_transcripts: number;
    total_utterances: number;
    avg_utterances_per_day: number;
    total_words: number;
    total_languages: number;
    languages: Record<string, number>;
    channels: Record<string, number>;
  };
  photos: {
    sources: {
      photos_earth: {
        total_photos: number;
        total_days_with_photos: number;
        avg_photos_per_day: number;
        max_photos_per_day: number;
        min_photos_per_day: number;
        date_range: {
          start: string;
          end: string;
        };
        coverage_percentage: number;
      };
      photos_flickr: {
        total_photos: number;
        total_days_with_photos: number;
        avg_photos_per_day: number;
        max_photos_per_day: number;
        min_photos_per_day: number;
        date_range: {
          start: string;
          end: string;
        };
        coverage_percentage: number;
      };
    };
    combined: {
      total_photos: number;
      total_days_with_photos: number;
      avg_photos_per_day: number;
      max_photos_per_day: number;
      min_photos_per_day: number;
      date_range: {
        start: string;
        end: string;
      };
      coverage_percentage: number;
    };
  };
  videos: {
    youtube: {
      total_videos: number;
      total_duration_seconds: number;
    };
    ia: {
      total_videos: number;
      total_duration_seconds: number;
    };
  };
  data_availability: {
    total_days: number;
    counts: Record<string, number>;
    avg_data_types_per_day: number;
  };
  generated_at: string;
};

type TimelineVideoItem = {
  startTimestamp: string;
  duration: number;
};

interface TimelineDayData {
  commItems: CommItem[];
  earthPhotos: PhotoItemEarth[];
  flickrPhotos: PhotoItemFlickr[];
  videoItems: TimelineVideoItem[];
  dayNight: DayNightObj[];
  crewArrDep: CrewArrDepItem[];
  selectedDate: string;
}

// Layout configuration types
type ComponentType =
  | "video"
  | "eva"
  | "eva-long"
  | "article"
  | "photo"
  | "photo-tall"
  | "comm"
  | "globe"
  | "widget"
  | "widget-tall"
  | "widget-rest"
  | "flights";

interface ComponentConfig {
  type: ComponentType;
  size?: number; // for flex sizing if needed
  styleClass?: "componentExpandable" | "componentNaturalSize"; // styling control
}

interface LayoutConfiguration {
  conditions: {
    video: boolean;
    comm: boolean;
    eva: boolean;
    article: boolean;
    photo: boolean;
  };
  layout: {
    left: ComponentConfig[];
    center: ComponentConfig[];
    right: ComponentConfig[];
  };
}
