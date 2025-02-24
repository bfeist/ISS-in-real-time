import {
  Cartesian3,
  createWorldTerrainAsync,
  Ion,
  Math as CesiumMath,
  JulianDate,
  Color,
  SampledPositionProperty,
  ClockRange,
} from "cesium";
import * as Cesium from "cesium";
import { Clock, Scene, Camera, CesiumComponentRef } from "resium";
import { FunctionComponent, useState, useRef, useEffect } from "react";
import { Viewer, Entity } from "resium";
import { findClosestEphemeraItem } from "utils/map";
import * as satellite from "satellite.js";
import { useClockContext } from "context/clockContext";
import { timeStrFromAppSeconds } from "utils/time";
import { globalTelemetry } from "utils/global";

// Set Cesium Ion access token
Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;

const Globe: FunctionComponent<{
  viewDate: string;
  ephemeraItems: EphemeraItem[];
}> = ({ viewDate, ephemeraItems }) => {
  const { clock } = useClockContext();

  const startStopDate = new Date(clock.startStopTimestamp);
  const appSeconds = clock.appSecondsAtStartStop + (Date.now() - startStopDate.getTime()) / 1000;

  const startTime = new Date(`${viewDate}T${timeStrFromAppSeconds(appSeconds)}Z`);
  const julianDate = JulianDate.fromDate(startTime);

  const [tle, _setTle] = useState<string[]>(() => {
    const ephemeris = findClosestEphemeraItem(startTime, ephemeraItems);
    return [ephemeris.tle_line1, ephemeris.tle_line2];
  });

  const [cesiumReady, setCesiumReady] = useState(false);

  // poll for cesium to be ready
  useEffect(() => {
    const interval = setInterval(() => {
      if (viewerRef.current?.cesiumElement?.scene && issEntityRef.current?.cesiumElement) {
        setCesiumReady(true);
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const computeSampledPositions = () => {
    if (!tle || tle.length === 0) {
      return null;
    }

    const satrec = satellite.twoline2satrec(tle[0], tle[1]);

    // Calculate start of the day (midnight)
    const startOfDay = new Date(startTime);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const startTimeJD = JulianDate.fromDate(startOfDay);

    // Calculate end of the day (next midnight)
    const endOfDay = new Date(startOfDay);
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
    const endTimeJD = JulianDate.fromDate(endOfDay);

    const positions = new SampledPositionProperty();
    const stepSeconds = 60; // 1-minute intervals

    let time = JulianDate.clone(startTimeJD, new JulianDate());
    while (JulianDate.lessThanOrEquals(time, endTimeJD)) {
      const jsDate = JulianDate.toDate(time);
      const positionAndVelocity = satellite.propagate(satrec, jsDate);
      const positionEci = positionAndVelocity.position as satellite.EciVec3<number>;

      if (positionEci) {
        const gmst = satellite.gstime(jsDate);
        const positionGd = satellite.eciToGeodetic(positionEci, gmst);
        const longitude = CesiumMath.toDegrees(positionGd.longitude);
        const latitude = CesiumMath.toDegrees(positionGd.latitude);
        const height = positionGd.height * 1000; // Convert km to meters

        const position = Cartesian3.fromDegrees(longitude, latitude, height);
        positions.addSample(time, position);
      }

      time = JulianDate.addSeconds(time, stepSeconds, new JulianDate());
    }

    return positions;
  };

  const sampledPositionProperty = computeSampledPositions();

  const terrainProvider = createWorldTerrainAsync();

  const issEntityRef = useRef<CesiumComponentRef<Cesium.Entity>>(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const viewerRef = useRef(null);

  useEffect(() => {
    if (!viewerRef.current?.cesiumElement?.scene || !issEntityRef.current?.cesiumElement) return;

    // set globe lighting
    viewerRef.current.cesiumElement.scene.globe.enableLighting = true;

    const viewer = viewerRef.current.cesiumElement;
    const camera = viewer.scene.camera;

    const setInitialView = () => {
      const entity = issEntityRef.current?.cesiumElement;
      if (!entity) return;

      // Compute the initial position of the entity
      const position = entity.position.getValue(viewer.clock.currentTime);

      if (position) {
        // Define an adjusted offset to control zoom level
        const offset = new Cesium.HeadingPitchRange(
          CesiumMath.toRadians(45), // Heading
          CesiumMath.toRadians(-89), // Pitch
          7000000 // Increased range to reduce zoom
        );

        camera.lookAt(position, offset);
      }
    };

    setInitialView();
  }, [cesiumReady]);

  // Update tick callback function to accept clock object rather than JulianDate directly
  const handleTick = (clockObj: Cesium.Clock) => {
    const currentTime: JulianDate = clockObj.currentTime;
    if (!tle || tle.length === 0) return;

    const jsDate = JulianDate.toDate(currentTime);
    const satrec = satellite.twoline2satrec(tle[0], tle[1]);
    const positionAndVelocity = satellite.propagate(satrec, jsDate);
    const velocityVector = positionAndVelocity.velocity as satellite.EciVec3<number>;
    const positionEci = positionAndVelocity.position as satellite.EciVec3<number>;
    if (!velocityVector || !positionEci) return;
    const gmst = satellite.gstime(jsDate);
    const positionGd = satellite.eciToGeodetic(positionEci, gmst);
    const altitude = positionGd.height;
    const velocity =
      Math.sqrt(velocityVector.x ** 2 + velocityVector.y ** 2 + velocityVector.z ** 2) * 3600;

    // New: compute lat and lng in degrees from positionGd
    const latitude = CesiumMath.toDegrees(positionGd.latitude);
    const longitude = CesiumMath.toDegrees(positionGd.longitude);

    // Update global telemetry with full precision values for velocity, altitude, lat, and lng
    if (globalTelemetry.velocity !== velocity) globalTelemetry.velocity = velocity;
    if (globalTelemetry.altitude !== altitude) globalTelemetry.altitude = altitude;
    if (globalTelemetry.lat !== latitude) globalTelemetry.lat = latitude;
    if (globalTelemetry.lng !== longitude) globalTelemetry.lng = longitude;
  };

  const startOfDay = new Date(startTime);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
  const startJd = JulianDate.fromDate(startOfDay);
  const endJd = JulianDate.fromDate(endOfDay);

  return (
    <Viewer
      style={{ width: "100%", height: "100%" }}
      ref={viewerRef}
      terrainProvider={terrainProvider}
      timeline={false}
      animation={false}
      navigationHelpButton={false}
      homeButton={false}
      fullscreenButton={false}
      geocoder={false}
      baseLayerPicker={false}
      sceneModePicker={false}
      selectionIndicator={false}
      infoBox={false}
    >
      <Scene ref={sceneRef}>
        <Camera ref={cameraRef} />
      </Scene>
      <Entity
        tracked={true}
        ref={issEntityRef}
        name="ISS"
        position={sampledPositionProperty}
        point={{ pixelSize: 10, color: Color.RED }}
        // label={{
        //   text: "ISS", // changed to static "ISS"
        //   font: "14pt sans-serif",
        //   style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        //   outlineWidth: 2,
        //   verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        //   pixelOffset: new Cesium.Cartesian2(0, -9),
        // }}
        path={{
          material: Color.YELLOW,
          width: 2,
          leadTime: 3600,
          trailTime: 3600,
          resolution: 60,
        }}
      />
      <Clock
        startTime={startJd}
        currentTime={julianDate}
        stopTime={endJd}
        clockRange={ClockRange.LOOP_STOP}
        multiplier={1}
        shouldAnimate={clock.isRunning}
        onTick={handleTick} // pass tick callback via Clock
      />
    </Viewer>
  );
};

export default Globe;
