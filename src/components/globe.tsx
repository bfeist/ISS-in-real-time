import styles from "./globe.module.css";
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
import { FunctionComponent, useState, useRef, useEffect, useMemo } from "react";
import { Viewer, Entity } from "resium";
import { findClosestEphemeraItem } from "utils/map";
import * as satellite from "satellite.js";
import { useStateClock } from "store/hooks/useStateClock";
import { useStateSelectedDate } from "store/hooks/useStateSelectedDate";
import { hhmmssFromAppSeconds } from "utils/time";
import { useDateEphemera } from "api/useDateSpecificData";

// Set Cesium Ion access token
Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;

const Globe: FunctionComponent = () => {
  const { isRunning, startStopTimestamp, appSecondsAtStartStop } = useStateClock();
  const { selectedDate } = useStateSelectedDate();
  const { data: ephemeraItems = [], isLoading } = useDateEphemera(selectedDate || "");

  const startStopDate = new Date(startStopTimestamp);
  const appSeconds = appSecondsAtStartStop + (Date.now() - startStopDate.getTime()) / 1000;

  const startTime = useMemo(
    () => new Date(`${selectedDate}T${hhmmssFromAppSeconds(appSeconds)}Z`),
    [selectedDate, appSeconds]
  );
  const julianDate = JulianDate.fromDate(startTime);

  const [tle, setTle] = useState<string[]>();

  const [cesiumReady, setCesiumReady] = useState(false);
  useEffect(() => {
    if (!ephemeraItems || ephemeraItems.length === 0) return;

    // Use a stable reference time for finding ephemera (start of selected date)
    const referenceTime = new Date(`${selectedDate}T00:00:00Z`);
    const ephemeris = findClosestEphemeraItem(referenceTime, ephemeraItems);
    setTle([ephemeris.tle_line1, ephemeris.tle_line2]);
  }, [selectedDate, ephemeraItems]);

  // poll for cesium to be ready
  useEffect(() => {
    if (!tle || tle.length === 0) return;

    const interval = setInterval(() => {
      if (viewerRef.current?.cesiumElement?.scene && issEntityRef.current?.cesiumElement) {
        setCesiumReady(true);
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [tle]);

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
    const controller = viewer.scene.screenSpaceCameraController;

    // Slow down the mouse wheel zoom speed
    if (controller) {
      // Set minimum and maximum zoom distances
      controller.minimumZoomDistance = 100000; // Minimum distance in meters
      controller.maximumZoomDistance = 25000000; // Maximum distance in meters

      // Override the default zoom behavior
      const originalZoomIn = camera.zoomIn;
      const originalZoomOut = camera.zoomOut;

      camera.zoomIn = function (amount?: number) {
        return originalZoomIn.call(this, amount ? amount * 0.2 : undefined);
      };

      camera.zoomOut = function (amount?: number) {
        return originalZoomOut.call(this, amount ? amount * 0.2 : undefined);
      };
    }

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

  const startOfDay = new Date(startTime);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
  const startJd = JulianDate.fromDate(startOfDay);
  const endJd = JulianDate.fromDate(endOfDay);

  if (isLoading) {
    return <div className={styles.globeContainer}>Loading globe...</div>;
  }

  return (
    <div className={styles.globeContainer}>
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
        skyBox={false}
        // contextOptions={{ webgl: { alpha: true } }}
      >
        <Scene ref={sceneRef} backgroundColor={Color.TRANSPARENT}>
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
          shouldAnimate={isRunning}
        />
      </Viewer>
    </div>
  );
};

export default Globe;
