import styles from "./globeCesium.module.css";
import {
  Cartesian3,
  Math as CesiumMath,
  JulianDate,
  Color,
  Credit,
  SampledPositionProperty,
  ClockRange,
  Rectangle,
  EllipsoidTerrainProvider,
  ImageryLayer,
  TileMapServiceImageryProvider,
  WebMercatorTilingScheme,
} from "cesium";
import * as Cesium from "cesium";
import { Clock, Scene, Camera, CesiumComponentRef } from "resium";
import { FunctionComponent, useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Viewer, Entity } from "resium";
import { findClosestEphemeraItem } from "utils/map";
import * as satellite from "satellite.js";
import { useStateClock } from "store/hooks/useStateClock";
import { useStateHover } from "store/hooks/useStateHover";
import { useStateToggle } from "store/hooks/useStateToggle";
import { hhmmssFromAppSeconds } from "utils/dateTime";
import { useDateEphemera, useDateEarthPhotography, useLiveTle } from "api/useDateSpecificData";
import { useGeneralCloudsAvailable } from "api/useGeneralData";
import {
  getCurrentAndAdjacentPhotos,
  calculateRectangleBounds,
  isValidRectangle,
} from "utils/photoRectangles";
import GlobeMapToggle from "./globeMapToggle";
import IconButton from "../common/iconButton";
import { faPlus, faMinus, faCloud } from "@fortawesome/free-solid-svg-icons";

// Clear default Cesium ion token to prevent implicit asset requests
Cesium.Ion.defaultAccessToken = "";

const localTilesUrl =
  import.meta.env.VITE_GLOBE_TILES_URL ?? "https://data.issinrealtime.org/tiles/world_2004_tiles";

const GlobeCesium: FunctionComponent = () => {
  const { isRunning, startStopTimestamp, appSecondsAtStartStop, selectedDate } = useStateClock();
  const { hoverSeconds } = useStateHover();
  const { showEarthPhotos, showTimelapsePhotos, setShowCloudsOverlay, showCloudsOverlay } =
    useStateToggle();
  const selectedDateValue = selectedDate || "";
  const { data: ephemeraItems = [], isLoading } = useDateEphemera(selectedDateValue);
  const { data: liveTle } = useLiveTle(selectedDateValue);
  const { data: earthPhotographyItems = [] } = useDateEarthPhotography(selectedDateValue);
  const { data: cloudsAvailable = [] } = useGeneralCloudsAvailable();

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
  const originalZoomInRef = useRef<((amount?: number) => void) | null>(null);
  const originalZoomOutRef = useRef<((amount?: number) => void) | null>(null);

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

  // Memoize terrain provider to avoid implicit Cesium ion calls
  const terrainProvider = useMemo(() => new EllipsoidTerrainProvider(), []);
  const contextOptions = useMemo(() => ({ webgl: { alpha: true } }), []);
  const [imageryProvider, setImageryProvider] = useState<Cesium.ImageryProvider>();
  const [cloudImageryProvider, setCloudImageryProvider] = useState<Cesium.ImageryProvider>();

  useEffect(() => {
    let isCanceled = false;

    TileMapServiceImageryProvider.fromUrl(localTilesUrl, {
      credit: new Credit("NASA Blue Marble Next Generation (August 2004)"),
      fileExtension: "png",
      tilingScheme: new WebMercatorTilingScheme(),
      maximumLevel: 8,
    })
      .then((provider) => {
        if (!isCanceled) {
          setImageryProvider(provider);
        }
      })
      .catch((error) => {
        if (!isCanceled) {
          console.error("Failed to load tile imagery", error);
        }
      });

    return () => {
      isCanceled = true;
    };
  }, []);

  useEffect(() => {
    const imageryDate = selectedDate || today;
    let isCanceled = false;

    // Check if clouds are available for the selected date
    // Find the object with the matching date and check if it has available layers
    const dateEntry = cloudsAvailable.find((item) => item[imageryDate]);
    const availableLayers = dateEntry ? dateEntry[imageryDate] : [];

    // Check if the cloud layer we want is available for this date
    const isCloudAvailable = availableLayers && availableLayers.length > 0;

    if (!isCloudAvailable) {
      if (!isCanceled) {
        setCloudImageryProvider(undefined);
      }
      return () => {
        isCanceled = true;
      };
    }

    try {
      // Use the first available layer (or you could prioritize specific layers)
      const layerToUse = availableLayers[0];

      // Construct the proper GIBS WMTS URL for Web Mercator projection
      const provider = new Cesium.WebMapTileServiceImageryProvider({
        url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi?TIME=${imageryDate}`,
        layer: layerToUse,
        style: "default",
        format: "image/png",
        tileMatrixSetID: "GoogleMapsCompatible_Level9",
        tilingScheme: new Cesium.WebMercatorTilingScheme(),
        maximumLevel: 9,
        credit: new Credit("Imagery courtesy NASA GIBS"),
      });

      if (!isCanceled) {
        setCloudImageryProvider(provider);
      }
    } catch (error) {
      console.error("Failed to initialize GIBS cloud layer", error);
      if (!isCanceled) {
        setCloudImageryProvider(undefined);
      }
    }

    return () => {
      isCanceled = true;
    };
  }, [selectedDate, today, cloudsAvailable]);

  const issEntityRef = useRef<CesiumComponentRef<Cesium.Entity>>(null);
  const viewerRef = useRef<CesiumComponentRef<Cesium.Viewer> | null>(null);
  const [viewerInstance, setViewerInstance] = useState<Cesium.Viewer>();

  const handleViewerRef = useCallback((ref: CesiumComponentRef<Cesium.Viewer> | null) => {
    viewerRef.current = ref;
    setViewerInstance(ref?.cesiumElement);
  }, []);

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
    // Wait for Cesium to be fully initialized
    if (
      !cesiumReady ||
      !viewerRef.current?.cesiumElement?.scene ||
      !issEntityRef.current?.cesiumElement
    )
      return;

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

  // Establish and maintain tracking
  useEffect(() => {
    if (!cesiumReady || !viewerRef.current?.cesiumElement || !issEntityRef.current?.cesiumElement)
      return;

    const viewer = viewerRef.current.cesiumElement;
    const entity = issEntityRef.current.cesiumElement;

    // Verify entity has a valid position property and can be evaluated
    if (!entity.position) {
      return;
    }

    // Try to get the position at the current time to verify it's valid
    try {
      const position = entity.position.getValue(viewer.clock.currentTime);
      if (!position) {
        // Position not available yet, wait for next update
        return;
      }
    } catch (e) {
      // Position evaluation failed, wait for next update
      return;
    }

    // Only set tracked entity if it's not already tracked
    // This ensures tracking is established and maintained
    if (viewer.trackedEntity !== entity) {
      viewer.trackedEntity = entity;
    }
  }, [cesiumReady, julianDate, sampledPositionProperty]);

  useEffect(() => {
    // Wait for Cesium to be fully initialized
    if (!cesiumReady || !viewerInstance) return;

    const layers = viewerInstance.imageryLayers;
    layers.removeAll();

    const addedLayers: ImageryLayer[] = [];

    // Add base map (NASA Blue Marble)
    if (imageryProvider) {
      addedLayers.push(layers.addImageryProvider(imageryProvider));
    }

    // Add cloud overlay only if showCloudsOverlay is enabled
    if (cloudImageryProvider && showCloudsOverlay) {
      const cloudLayer = layers.addImageryProvider(cloudImageryProvider);
      cloudLayer.alpha = 1.0;
      // Make black pixels transparent to show underlying layers
      cloudLayer.colorToAlpha = new Cesium.Color(0, 0, 0, 1);
      cloudLayer.colorToAlphaThreshold = 0.1;
      addedLayers.push(cloudLayer);
    }

    return () => {
      addedLayers.forEach((layer) => {
        if (!layers.isDestroyed()) {
          layers.remove(layer, false);
        }
      });
    };
  }, [cesiumReady, cloudImageryProvider, viewerInstance, imageryProvider, showCloudsOverlay]);

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
        <>
          <div className={styles.zoomControls}>
            <IconButton
              className={styles.globeButton}
              icon={faPlus}
              onClick={handleZoomIn}
              tooltipContent="Zoom In"
              tooltipPlace="right"
            />
            <IconButton
              className={styles.globeButton}
              icon={faMinus}
              onClick={handleZoomOut}
              tooltipContent="Zoom Out"
              tooltipPlace="right"
            />
          </div>
          <div className={styles.globeAttribution}>
            <a href="https://www.earthdata.nasa.gov/" target="_blank" rel="noopener noreferrer">
              Cloudcover: NASA GIBS
            </a>
            <a
              href="https://visibleearth.nasa.gov/collection/1484/blue-marble"
              target="_blank"
              rel="noopener noreferrer"
            >
              NASA Blue Marble Next Generation
            </a>
          </div>

          <div className={styles.toggleButtons}>
            <GlobeMapToggle isVisible={isHovering} />
            <IconButton
              className={styles.globeButton}
              icon={faCloud}
              onClick={() => setShowCloudsOverlay(!showCloudsOverlay)}
              style={{
                opacity: showCloudsOverlay ? 1 : 0.5,
              }}
              tooltipContent="Toggle Today's Cloud Cover"
              tooltipPlace="right"
            />
          </div>
        </>
      )}

      <Viewer
        baseLayer={false}
        style={{ width: "100%", height: "100%" }}
        ref={handleViewerRef}
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

export default GlobeCesium;
