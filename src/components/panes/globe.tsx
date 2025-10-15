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
  Rectangle,
} from "cesium";
import * as Cesium from "cesium";
import { Clock, Scene, Camera, CesiumComponentRef } from "resium";
import { FunctionComponent, useState, useRef, useEffect, useMemo } from "react";
import { Viewer, Entity } from "resium";
import { findClosestEphemeraItem } from "utils/map";
import * as satellite from "satellite.js";
import { useStateClock } from "store/hooks/useStateClock";
import { useStateHover } from "store/hooks/useStateHover";
import { useStateToggle } from "store/hooks/useStateToggle";
import { hhmmssFromAppSeconds } from "utils/dateTime";
import { useDateEphemera, useDateEarthPhotography, useLiveTle } from "api/useDateSpecificData";
import {
  getCurrentAndAdjacentPhotos,
  calculateRectangleBounds,
  isValidRectangle,
} from "utils/photoRectangles";
import GlobeMapToggle from "./globeMapToggle";
import IconButton from "../common/iconButton";
import { faPlus, faMinus } from "@fortawesome/free-solid-svg-icons";

// Set Cesium Ion access token
Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;

const Globe: FunctionComponent = () => {
  const { isRunning, startStopTimestamp, appSecondsAtStartStop, selectedDate } = useStateClock();
  const { hoverSeconds } = useStateHover();
  const { showEarthPhotos, showTimelapsePhotos } = useStateToggle();
  const selectedDateValue = selectedDate || "";
  const { data: ephemeraItems = [], isLoading } = useDateEphemera(selectedDateValue);
  const { data: liveTle } = useLiveTle(selectedDateValue);
  const { data: earthPhotographyItems = [] } = useDateEarthPhotography(selectedDateValue);

  const [isHovering, setIsHovering] = useState(false);

  const { startTime, julianDate, appSeconds } = useMemo(() => {
    // Use hover seconds if available, otherwise use the current clock time
    let appSec: number;

    if (hoverSeconds !== null) {
      appSec = hoverSeconds;
    } else if (isRunning) {
      appSec = appSecondsAtStartStop + (Date.now() - new Date(startStopTimestamp).getTime()) / 1000;
    } else {
      appSec = appSecondsAtStartStop;
    }

    const st = new Date(`${selectedDate}T${hhmmssFromAppSeconds(appSec)}Z`);
    const jd = JulianDate.fromDate(st);
    return { startTime: st, julianDate: jd, appSeconds: appSec };
  }, [isRunning, selectedDate, startStopTimestamp, appSecondsAtStartStop, hoverSeconds]);

  const [tle, setTle] = useState<string[]>();

  // Reset TLE data when date changes to prevent stale data issues
  useEffect(() => {
    setTle(undefined);
  }, [selectedDate]);

  const [cesiumReady, setCesiumReady] = useState(false);

  // Cleanup refs for proper memory management
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const originalZoomInRef = useRef<Function | null>(null);
  const originalZoomOutRef = useRef<Function | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const ephemeraSource = useMemo(() => {
    if (selectedDate && liveTle && selectedDate === today) {
      return [liveTle];
    }
    return ephemeraItems;
  }, [ephemeraItems, liveTle, selectedDate, today]);

  useEffect(() => {
    if (!ephemeraSource || ephemeraSource.length === 0 || !selectedDate) return;

    // Use a stable reference time for finding ephemera (start of selected date)
    const referenceTime = new Date(`${selectedDate}T00:00:00Z`);
    const ephemeris = findClosestEphemeraItem(referenceTime, ephemeraSource);
    setTle([ephemeris.tle_line1, ephemeris.tle_line2]);
  }, [selectedDate, ephemeraSource]);

  // poll for cesium to be ready
  useEffect(() => {
    if (!tle || tle.length === 0) return;

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    intervalRef.current = setInterval(() => {
      if (viewerRef.current?.cesiumElement?.scene && issEntityRef.current?.cesiumElement) {
        setCesiumReady(true);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }, 100);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [tle]);

  const computeSampledPositions = useMemo(() => {
    // Ensure we have TLE data and it's for the current selected date
    if (!tle || tle.length === 0 || !selectedDate) {
      return null;
    }

    // Additional safety check: ensure ephemera is loaded for the current date
    if ((isLoading && (!ephemeraSource || ephemeraSource.length === 0)) || !ephemeraSource) {
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

      // Check if positionAndVelocity and its position property are valid
      if (positionAndVelocity && positionAndVelocity.position) {
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
      }

      time = JulianDate.addSeconds(time, stepSeconds, new JulianDate());
    }

    return positions;
  }, [tle, startTime, selectedDate, isLoading, ephemeraSource]);

  const sampledPositionProperty = computeSampledPositions;

  // Derive current photo and adjacent photos based on time
  const { currentPhotoWithCorners, prevPhoto, nextPhoto } = useMemo(
    () =>
      getCurrentAndAdjacentPhotos(
        appSeconds,
        earthPhotographyItems,
        showEarthPhotos,
        showTimelapsePhotos
      ),
    [appSeconds, earthPhotographyItems, showEarthPhotos, showTimelapsePhotos]
  );

  // Memoize terrain provider to prevent creating new promises on each render
  const terrainProvider = useMemo(() => createWorldTerrainAsync(), []);
  const contextOptions = useMemo(() => ({ webgl: { alpha: true } }), []);

  const issEntityRef = useRef<CesiumComponentRef<Cesium.Entity>>(null);
  const viewerRef = useRef(null);

  // Detect touch device
  const isTouchDevice = useMemo(() => "ontouchstart" in window, []);

  // Handle zoom in
  const handleZoomIn = () => {
    if (viewerRef.current?.cesiumElement?.scene) {
      const camera = viewerRef.current.cesiumElement.scene.camera;
      const defaultAmount = camera.defaultZoomAmount;
      camera.zoomIn(defaultAmount * 30);
    }
  };

  // Handle zoom out
  const handleZoomOut = () => {
    if (viewerRef.current?.cesiumElement?.scene) {
      const camera = viewerRef.current.cesiumElement.scene.camera;
      const defaultAmount = camera.defaultZoomAmount;
      camera.zoomOut(defaultAmount * 30);
    }
  };

  // Component cleanup effect
  useEffect(() => {
    return () => {
      // Cleanup any remaining intervals
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Reset Cesium readiness state
      setCesiumReady(false);

      // Clear TLE data
      setTle(undefined);
    };
  }, []);

  useEffect(() => {
    if (!viewerRef.current?.cesiumElement?.scene || !issEntityRef.current?.cesiumElement) return;

    // set globe lighting
    viewerRef.current.cesiumElement.scene.globe.enableLighting = true;
    viewerRef.current.cesiumElement.scene.skyAtmosphere.show = false;

    const viewer = viewerRef.current.cesiumElement;
    const camera = viewer.scene.camera;
    const controller = viewer.scene.screenSpaceCameraController;

    // Slow down the mouse wheel zoom speed
    if (controller) {
      // Set minimum and maximum zoom distances
      controller.minimumZoomDistance = 100000; // Minimum distance in meters
      controller.maximumZoomDistance = 25000000; // Maximum distance in meters

      // Store original functions for cleanup
      if (!originalZoomInRef.current) {
        originalZoomInRef.current = camera.zoomIn.bind(camera);
      }
      if (!originalZoomOutRef.current) {
        originalZoomOutRef.current = camera.zoomOut.bind(camera);
      }

      // Override the default zoom behavior
      camera.zoomIn = function (amount?: number) {
        return originalZoomInRef.current?.call(this, amount ? amount * 0.2 : undefined);
      };

      camera.zoomOut = function (amount?: number) {
        return originalZoomOutRef.current?.call(this, amount ? amount * 0.2 : undefined);
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

    // Cleanup function to restore original camera functions
    return () => {
      if (camera && originalZoomInRef.current) {
        camera.zoomIn = originalZoomInRef.current;
        originalZoomInRef.current = null;
      }
      if (camera && originalZoomOutRef.current) {
        camera.zoomOut = originalZoomOutRef.current;
        originalZoomOutRef.current = null;
      }
    };
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
    <div
      className={styles.globeContainer}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {(isHovering || isTouchDevice) && (
        <div className={styles.zoomControls}>
          <IconButton
            icon={faPlus}
            onClick={handleZoomIn}
            tooltipContent="Zoom In"
            tooltipPlace="right"
          />
          <IconButton
            icon={faMinus}
            onClick={handleZoomOut}
            tooltipContent="Zoom Out"
            tooltipPlace="right"
          />
        </div>
      )}
      <GlobeMapToggle isVisible={isHovering} />
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
        contextOptions={contextOptions}
      >
        <Scene backgroundColor={Color.TRANSPARENT}>
          <Camera />
        </Scene>
        <Entity
          tracked={true}
          ref={issEntityRef}
          name="ISS"
          position={sampledPositionProperty}
          point={{ pixelSize: 10, color: Color.RED }}
          path={{
            material: Color.YELLOW,
            width: 2,
            leadTime: 3600,
            trailTime: 3600,
            resolution: 60,
          }}
        />
        {/* Current photo with corners - yellow outline */}
        {/* Previous and next photos - grey outlines */}
        {[prevPhoto, nextPhoto]
          .filter((photo): photo is PhotoItemEarth => {
            if (!photo || !photo.corners) return false;
            const bounds = calculateRectangleBounds(photo.corners);
            return bounds !== null && isValidRectangle(bounds);
          })
          .map((photo) => {
            const bounds = calculateRectangleBounds(photo.corners!)!;
            return (
              <Entity
                key={photo.nasaId}
                name={`Photo ${photo.nasaId}`}
                rectangle={{
                  coordinates: Rectangle.fromDegrees(
                    bounds.west,
                    bounds.south,
                    bounds.east,
                    bounds.north
                  ),
                  fill: false,
                  outline: true,
                  outlineColor: Color.GREY,
                  outlineWidth: 1,
                }}
              />
            );
          })}
        {/* Current photo with corners - yellow outline */}
        {currentPhotoWithCorners &&
          currentPhotoWithCorners.corners &&
          (() => {
            const bounds = calculateRectangleBounds(currentPhotoWithCorners.corners);
            if (!bounds || !isValidRectangle(bounds)) return null;

            return (
              <Entity
                name="Current Photo Footprint"
                rectangle={{
                  coordinates: Rectangle.fromDegrees(
                    bounds.west,
                    bounds.south,
                    bounds.east,
                    bounds.north
                  ),
                  fill: false,
                  outline: true,
                  outlineColor: Color.YELLOW,
                  outlineWidth: 1,
                }}
              />
            );
          })()}
        <Clock
          startTime={startJd}
          currentTime={julianDate}
          stopTime={endJd}
          clockRange={ClockRange.LOOP_STOP}
          multiplier={1}
          shouldAnimate={isRunning && hoverSeconds === null}
        />
      </Viewer>
    </div>
  );
};

export default Globe;
