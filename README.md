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
