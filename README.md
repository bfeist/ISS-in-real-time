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
   - The API keys for Server Batch processes are not required unless you're running those processes to make your own data repo instead of using https://data.issinrealtime.org/ISSiRT_assets
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
- `src/server-batch/`: Contains the source code for the data pipeline that produces the static S3 assets from downloaded public mission data from different public sources. Most developers won't need to run any of these given that they produce the data that the rest of the app expects that is currently publicly hosted at https://data.issinrealtime.org/ISSiRT_assets
- `.local/vite/dist`: Destination for the built frontend files.

## Server Batch script details

All data is available at `data.issinrealtime.org/ISSiRT_assets`. If that website goes down for some reason, continue below.

### Setup

- Setup paths in `.env` to specify where downloading and processing will take place
  - `NASA_EOL_API_KEY` - Get a NASA Earth Obs API key here: https://eol.jsc.nasa.gov/SearchPhotos/PhotosDatabaseAPI/
  - `SPACETRACK_USERNAME` and `SPACETRACK_PASSWORD` - Create an account here: https://www.space-track.org/
  - `YOUTUBE_API_KEY` - Create one in the google apps console
  - `OPENAI_API_KEY` - Unneeded. This was for experimentation
- Note that the `# Data processing paths` section in the `.env` are all local paths. Pushing this content to an S3 bucket is outside of the scope of these scripts.

To generate all of the data this website needs, run the server_batch scripts in order. These pull from various publicly available locations into structured data that can be consumed by the ISS in Real Time website.

This is a very large amount of data and the source systems are constantly changing. Depending how far in the future you are reading this, your mileage may vary.

### Processing Order

The table below captures the current run order for `src/server-batch` scripts that build the public dataset. Script prefixes match their folder numbering. Optional steps are marked inline. Experimental content under `v3`, `ai`, or `wikigrab_v2` is intentionally excluded.

| Step | Script                                                                  | Purpose                                                                 |
| ---- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1    | src/server-batch/1_comm/1_download_individual_IA_zips.py                | Pull individual Internet Archive comm zips into `RAW_AUDIO_FOLDER`.     |
| 2    | src/server-batch/1_comm/1a_download_collection_IA_zips.py               | Fetch curated collection zips to complement individual downloads.       |
| 3    | src/server-batch/1_comm/1b_download_via_torrents.py                     | Optional torrent-based downloader for large backfills.                  |
| 4    | src/server-batch/1_comm/check_zips_against_rawfolders.py                | Verify downloaded comm zips match expected folders before processing.   |
| 5    | src/server-batch/1_comm/5_corpus_initial_prompt_ai_gen.py               | Generate daily prompt context for transcription runs.                   |
| 6    | src/server-batch/1_comm/6_transcribe_using_corpus.py                    | Transcribe Internet Archive audio to AAC + JSON using WhisperX.         |
| 7    | src/server-batch/1_comm/cleanup_existing_translations.py                | Remove stale comm transcripts so regenerated output stays clean.        |
| 8    | src/server-batch/1_comm/3_web_comm.py                                   | Package transcripts and AAC files into the web-ready `comm/` structure. |
| 9    | src/server-batch/2_articles/6b_web_activity_summaries.py                | Scrape NASA activity summaries and normalize them to JSON.              |
| 10   | src/server-batch/2_articles/6c_raw_blog_urls.py                         | Enumerate historical ISS blog URLs to seed downstream fetches.          |
| 11   | src/server-batch/2_articles/6d_raw_blog_articles.py                     | Download blog article bodies for archival processing.                   |
| 12   | src/server-batch/2_articles/6f_raw_early_status_urls.py                 | Capture early station status update URLs prior to modern blogs.         |
| 13   | src/server-batch/2_articles/6g_raw_wayback_url_patterns.py              | Build Wayback Machine patterns for legacy status content.               |
| 14   | src/server-batch/2_articles/6h_raw_wayback_status_reports.py            | Download status reports from Wayback snapshots.                         |
| 15   | src/server-batch/2_articles/6i_raw_wayback_to_blogarticles.py           | Map Wayback reports onto canonical blog article records.                |
| 16   | src/server-batch/2_articles/6j_web_consolidate_blog_articles.py         | Merge raw article sources into web-serving JSON manifests.              |
| 17   | src/server-batch/2_articles/6k_cdx_wayback_station_timelines_pre2005.py | Build pre-2005 station timeline data from Wayback CDX indexes.          |
| 18   | src/server-batch/2_articles/6l_cdx_wayback_station_timeline_post2005.py | Extend station timeline aggregation for 2005 onward.                    |
| 19   | src/server-batch/2_articles/6m_web_station_timelines_from_raw.py        | Emit unified station timeline bundles for the frontend.                 |
| 20   | src/server-batch/3_flights/5a_web_flights.py                            | Generate primary flight manifest JSON from crew transits.               |
| 21   | src/server-batch/3_flights/5c_web_flights_supply.py                     | Produce cargo and supply flight manifests.                              |
| 22   | src/server-batch/3_flights/6_web_crew_arrive_dep_from_flights.py        | Derive crew arrival and departure events from flight data.              |
| 23   | src/server-batch/3_flights/11_web_expeditions.py                        | Aggregate flight-derived crew information into expedition summaries.    |
| 24   | src/server-batch/4_photos/9_web_earth_photography.py                    | Query NASA EOL APIs and build daily Earth photography manifests.        |
| 25   | src/server-batch/4_photos/9b_make_photos_manual_web.py                  | Transform manually curated photo selections into web output.            |
| 26   | src/server-batch/4_photos/9e_get_jsc_flickr_albums.py                   | List JSC Flickr albums that contain ISS photography.                    |
| 27   | src/server-batch/4_photos/9f_get_flickr_photos_metadata.py              | Pull Flickr metadata for the album list.                                |
| 28   | src/server-batch/4_photos/9g_filter_flickr_against_existing_photos.py   | Remove Flickr photos already represented in the NASA catalog.           |
| 29   | src/server-batch/4_photos/9h_make_flickr_flight_photos_list_using_ai.py | Build flight photo manifests from curated Flickr metadata.              |
| 30   | src/server-batch/4_photos/9i_web_flickr_flight_photos.py                | Emit web-facing JSON for curated Flickr flight photos.                  |
| 31   | src/server-batch/4_photos/count_day_most_photos.py                      | Summarize daily photo volume for analytics displays.                    |
| 32   | src/server-batch/5_video/1_transcode_ia_raw_to_web.py                   | Transcode Internet Archive MP4 files to web-optimized H.264.            |
| 33   | src/server-batch/5_video/2_create_ia_videos_json.py                     | Generate manifests describing transcoded Internet Archive videos.       |
| 34   | src/server-batch/5_video/3_web_yt_api_live_recordings_json.py           | Capture YouTube livestream metadata for web playback.                   |
| 35   | src/server-batch/5_video/4_download_yt_videos.py                        | Download required YouTube recordings to local storage.                  |
| 36   | src/server-batch/5_video/5_transcribe_yt_videos.py                      | Transcribe legacy YouTube videos (original pipeline).                   |
| 37   | src/server-batch/5_video/5a_transcribe_yt_videos_v2.py                  | Current YouTube transcription workflow with improved diarization.       |
| 38   | src/server-batch/5_video/6_web_gen_start_offset_from_transcripts.py     | Compute playback offsets from transcript timing data.                   |
| 39   | src/server-batch/4_web_eva_info.py                                      | Compile EVA metadata for the public dataset.                            |
| 40   | src/server-batch/7_web_ephemera.py                                      | Assemble on-this-day content from various ephemera sources.             |
| 41   | src/server-batch/7a_web_orbit_count.py                                  | Calculate cumulative orbit counts per day.                              |
| 42   | src/server-batch/10_web_data_availability.py                            | Summarize which data products exist for each calendar day.              |
| 43   | src/server-batch/11_web_first_comm_each_day.py                          | Track the first available comm clip per day for quick links.            |
| 44   | src/server-batch/12_make_stats.py                                       | Generate aggregate statistics and sanity-check dashboards.              |
