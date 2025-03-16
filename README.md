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
