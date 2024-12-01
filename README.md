# ISS in Real Time

## Description

This is a web application that replays days on the International Space Station.

### Notes

- Client-side (build time by Vite) .env reference is `import.meta.env.VALUE`

## Installation

1. To get started, clone the repository and install the dependencies:

   ```bash
   cd iss-in-real-time
   npm install
   ```

2. Then create a `.env` file by copying `.env.sample` to `.env`
   - The API keys for Server Batch processes are not required unless you're running those processes to make your own data repo instead of using https://ares-iss-in-real-time.s3.us-gov-west-1.amazonaws.com
3. Run `/scripts/make-dev-ssl-cert.sh` (used for docker deploys only)

## Usage

### Development

To start the frontend in development mode, run:

```bash
npm run dev
```

This will start the Vite development server for the frontend.

Available at `http://localhost:8000`

### Build

To build the application for production:

```bash
npm run build
```

This script builds the application. The result is put in `.local/vite/dist`.

### Deploy via Docker

- `npm run docker:preview:rebuild`
  - Builds a docker image:
    - `nginx`
      - vite is used to build the front-end (React) to static assets in `/.local/vite/dist`
      - these are copied into the nginx image at the default nginx path
- `npm run docker:preview` to start the container
- Go to `https://localhost` to hit the nginx server

## Structure

- `src/`: Contains the source code for the React frontend.
- `src/server-batch/`: Contains the source code for the data pipeline that produces the static S3 assets from downloaded public mission data from different public sources. Most developers won't need to run any of these given that they produce the data that the rest of the app expects that is currently publicly hosted at https://ares-iss-in-real-time.s3.us-gov-west-1.amazonaws.com
- `.local/vite/dist`: Destination for the built frontend files.

## Server Batch script details

### Setup

- Setup paths in `.env` to specify where downloading and processing will take place
  - `NASA_EOL_API_KEY` - Get a NASA Earth Obs API key here: https://eol.jsc.nasa.gov/SearchPhotos/PhotosDatabaseAPI/
  - `SPACETRACK_USERNAME` and `SPACETRACK_PASSWORD` - Create an account here: https://www.space-track.org/
  - `YOUTUBE_API_KEY` - Create one in the google apps console
- Note that the S3 output folder is a local folder on disk. To push this content to an S3 bucket is outside of the scope of these scripts.

### The below scripts should be executed in order.

- `1_download_IA_sg_zips.py`
  This script downloads all of the space-to-ground zip files from internet archive uploaded by John Stoll in Building 2. Current size of this batch is 750GB and takes many days to run.

- `2_process_transcribe_ia_zips.py`
  Processes the downloaded Internet Archive zip files by extracting WAV audio files, converting them to the required format, segmenting the audio using Voice Activity Detection (VAD), transcribing the segments using WhisperX, and generating JSON transcription files. It also manages tracking of processed and in-progress zip files. Takes many months to run on a RTX 4090 currently resulting in over 3M files.

- `3_make_s3_comm.py`
  Processes JSON transcript files made in step 2 and converts them into one pipe-delimited CSV file per day and places these in the 'comm' directory on S3. It also copies corresponding AAC audio files to each day's S3 folder.

- `4_make_s3_image_manifest.py`
  Generates astronaut photography image manifests for S3 storage by fetching data from the NASA EOL PhotosDatabaseAPI, and places these manifests into a nested folder structure in S3. Note that these images are served directly from the NASA EOL servers to the browser.

- `5_make_s3_ephemera.py`
  Downloads ephemera "TLE" data from space-track.org for every month available in S3's comm folder structure and organizes them into the 'ephemera' directory on S3.

- `6_make_s3_dates_available.py`
  Maintains and updates a list of available dates for which data exists in S3. This allows other scripts or services to reference which dates have associated data.

- `7_make_s3_eva_info.py`
  Scrapes wikipedia at https://en.wikipedia.org/wiki/List_of_International_Space_Station_spacewalks and generates a Extra-Vehicular Activity (EVA) related information json and stores it in the root of S3.

- `8_get_youtube_live_recordings.py`
  Retrieves recorded live stream videos from YouTube that pertain to "station", "spacewalk", or "ISS" keywords. It filters and saves relevant video information to the root of S3 as a pipe-delimited csv file.
