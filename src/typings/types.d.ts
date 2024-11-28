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

type GetDatePageDataResponse = {
  transcriptItems: TranscriptItem[];
  imageItems: ImageItem[];
};
