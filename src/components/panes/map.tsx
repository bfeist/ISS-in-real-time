import { FunctionComponent, useRef, useEffect, useState, useMemo } from "react";
import { findClosestEphemeraItem, updateOrbitLine } from "utils/map";
import { getLatLngObj } from "tle.js";
import "ol/ol.css";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import Feature from "ol/Feature";
import { Point, LineString, Polygon } from "ol/geom";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Style, Text, Fill, Stroke } from "ol/style";
import { fromLonLat } from "ol/proj";
import XYZ from "ol/source/XYZ";
import Graticule from "ol/layer/Graticule";
import { Vector as VectorLayerOL } from "ol/layer";
import VectorSourceOL from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import Terminator from "utils/terminator";
import { containsCoordinate } from "ol/extent";
import { createXYZ } from "ol/tilegrid";
import { hhmmssFromAppSeconds } from "utils/dateTime";
import {
  getCurrentAndAdjacentPhotos,
  calculateRectangleBounds,
  isValidRectangle,
} from "utils/photoRectangles";
import ClockInterval from "./clockInterval";
import styles from "./map.module.css";
import { useStateClock } from "store/hooks/useStateClock";
import { useStateHover } from "store/hooks/useStateHover";
import { useStateToggle } from "store/hooks/useStateToggle";
import { useDateEphemera, useDateEarthPhotography, useLiveTle } from "api/useDateSpecificData";
import { useGeneralCloudsAvailable } from "api/useGeneralData";
import GlobeMapToggle from "./globeMapToggle";
import IconButton from "../common/iconButton";
import { faPlus, faMinus, faCloud } from "@fortawesome/free-solid-svg-icons";

const MapComponent: FunctionComponent = () => {
  const { selectedDate } = useStateClock();
  const { hoverSeconds } = useStateHover();
  const { showEarthPhotos, showTimelapsePhotos, setShowCloudsOverlay, showCloudsOverlay } =
    useStateToggle();
  const selectedDateValue = selectedDate || "";
  const { data: ephemeraItems = [], isLoading } = useDateEphemera(selectedDateValue);
  const { data: liveTle } = useLiveTle(selectedDateValue);
  const { data: earthPhotographyItems = [] } = useDateEarthPhotography(selectedDateValue);
  const { data: cloudsAvailable = [] } = useGeneralCloudsAvailable();

  const [clockAppSeconds, setClockAppSeconds] = useState(0);
  const [isHovering, setIsHovering] = useState(false);

  // Use hover seconds if available, otherwise use clock seconds
  const appSeconds = hoverSeconds !== null ? hoverSeconds : clockAppSeconds;

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

  const mapRef = useRef<HTMLDivElement | null>(null);
  const olMapRef = useRef<Map | null>(null);
  const viewRef = useRef<View | null>(null);

  const markerLayerRef = useRef<VectorLayer | null>(null);
  const markerFeatureRef = useRef<Feature | null>(null);
  const orbitLayerRef = useRef<VectorLayer | null>(null);
  const photoRectanglesLayerRef = useRef<VectorLayer | null>(null);
  const cloudLayerRef = useRef<TileLayer | null>(null);

  // Detect touch device
  const isTouchDevice = useMemo(() => "ontouchstart" in window, []);

  // Handle zoom in
  const handleZoomIn = () => {
    if (viewRef.current) {
      const view = viewRef.current;
      const currentZoom = view.getZoom();
      if (currentZoom !== undefined) {
        view.animate({ zoom: currentZoom + 1, duration: 250 });
      }
    }
  };

  // Handle zoom out
  const handleZoomOut = () => {
    if (viewRef.current) {
      const view = viewRef.current;
      const currentZoom = view.getZoom();
      if (currentZoom !== undefined) {
        view.animate({ zoom: currentZoom - 1, duration: 250 });
      }
    }
  };

  useEffect(() => {
    const labelLayer = new TileLayer({
      source: new XYZ({
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      }),
    });
    labelLayer.setOpacity(0.7);

    // Initialize cloud layer (will be configured later based on date)
    cloudLayerRef.current = new TileLayer({
      visible: false, // Initially hidden
      opacity: 1.0,
    });

    olMapRef.current = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({
          source: new XYZ({
            url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          }),
        }),
        cloudLayerRef.current, // Add cloud layer between base map and labels
        labelLayer,
        new Graticule({
          strokeStyle: new Stroke({
            color: "rgba(255,255255,0.5)",
            width: 1,
            lineDash: [0.5, 4],
          }),
          showLabels: true,
          wrapX: false,
        }),
      ],
      view: new View({
        center: [200, 0], // Keep the default center
        zoom: 2,
      }),
      controls: [], // Remove default controls including zoom buttons
    });

    viewRef.current = olMapRef.current.getView();

    // Initialize marker layer once
    markerLayerRef.current = new VectorLayer({
      source: new VectorSource(),
    });
    olMapRef.current.addLayer(markerLayerRef.current);

    // Initialize marker feature
    markerFeatureRef.current = new Feature({
      geometry: new Point(fromLonLat([0, 0])), // Initial position
    });

    markerFeatureRef.current.setStyle(
      new Style({
        text: new Text({
          text: "X",
          font: "bold 16px sans-serif",
          fill: new Fill({ color: "red" }),
          stroke: new Stroke({ color: "white", width: 1 }),
        }),
      })
    );

    markerLayerRef.current.getSource().addFeature(markerFeatureRef.current);

    // Initialize orbit layer
    orbitLayerRef.current = new VectorLayer({
      source: new VectorSource(),
      style: new Style({
        stroke: new Stroke({
          color: "red",
          width: 2,
        }),
      }),
    });
    olMapRef.current.addLayer(orbitLayerRef.current);

    // Initialize photo rectangles layer
    photoRectanglesLayerRef.current = new VectorLayer({
      source: new VectorSource(),
    });
    olMapRef.current.addLayer(photoRectanglesLayerRef.current);

    return () => {
      olMapRef.current.setTarget(undefined);
      if (markerLayerRef.current && olMapRef.current) {
        olMapRef.current.removeLayer(markerLayerRef.current);
      }
      if (orbitLayerRef.current && olMapRef.current) {
        olMapRef.current.removeLayer(orbitLayerRef.current);
      }
      if (photoRectanglesLayerRef.current && olMapRef.current) {
        olMapRef.current.removeLayer(photoRectanglesLayerRef.current);
      }
    };
  }, []);

  /**
   * Update the marker position and re-center the map if the marker is out of view
   */
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const ephemeraSource = useMemo(() => {
    if (selectedDate && liveTle && selectedDate === today) {
      return [liveTle];
    }
    return ephemeraItems;
  }, [ephemeraItems, liveTle, selectedDate, today]);

  useEffect(() => {
    if (!olMapRef.current || !ephemeraSource || ephemeraSource.length === 0 || !selectedDate)
      return;

    const ephemeris = findClosestEphemeraItem(
      new Date(`${selectedDate}T${hhmmssFromAppSeconds(appSeconds)}Z`),
      ephemeraSource
    );
    if (ephemeris) {
      const tle = `${ephemeris.tle_line1}
        ${ephemeris.tle_line2}`;
      const { lat, lng } = getLatLngObj(
        tle,
        new Date(`${selectedDate}T${hhmmssFromAppSeconds(appSeconds)}Z`).getTime()
      );

      if (markerFeatureRef.current) {
        // Update marker position directly for better performance
        (markerFeatureRef.current.getGeometry() as Point).setCoordinates(fromLonLat([lng, lat]));

        // Check if the marker is within the current view
        const view = viewRef.current;
        const markerCoord = fromLonLat([lng, lat]);
        if (view) {
          const extent = view.calculateExtent(olMapRef.current.getSize());
          if (!containsCoordinate(extent, markerCoord)) {
            view.animate({ center: markerCoord, duration: 10 });
          }
        }
      }
    }
  }, [ephemeraSource, selectedDate, appSeconds]);

  /**
   * Add a terminator layer to the map
   */
  useEffect(() => {
    if (!selectedDate || !olMapRef.current) return;

    // Use the current app seconds (including hover) for the terminator
    const currentTime = new Date(`${selectedDate}T${hhmmssFromAppSeconds(appSeconds)}Z`);
    const terminator = new Terminator({ time: currentTime, resolution: 2 });
    const terminatorGeoJSON = terminator.getTerminator();

    const terminatorSource = new VectorSourceOL({
      features: new GeoJSON().readFeatures(terminatorGeoJSON, {
        featureProjection: "EPSG:3857",
      }),
    });

    const terminatorLayer = new VectorLayerOL({
      source: terminatorSource,
      style: new Style({
        fill: new Fill({
          color: "rgba(0, 0, 0, 0.3)",
        }),
        stroke: new Stroke({
          color: "rgba(0, 0, 0, 0.6)",
          width: 2,
        }),
      }),
    });

    olMapRef.current.addLayer(terminatorLayer);
    return () => {
      olMapRef.current.removeLayer(terminatorLayer);
    };
  }, [selectedDate, appSeconds]);

  /**
   * Update the orbit line based on the current time
   */
  useEffect(() => {
    if (!selectedDate || !olMapRef.current || !ephemeraSource || !ephemeraSource.length) return;

    const { coordinates1, coordinates2 } = updateOrbitLine(
      selectedDate,
      hhmmssFromAppSeconds(appSeconds),
      ephemeraSource
    );

    const orbitSource = orbitLayerRef.current?.getSource();
    if (orbitSource) {
      orbitSource.clear();

      if (coordinates1.length > 0) {
        const orbitFeature1 = new Feature({
          geometry: new LineString(coordinates1.map((coord) => fromLonLat(coord))),
        });
        orbitSource.addFeature(orbitFeature1);
      }

      if (coordinates2.length > 0) {
        const orbitFeature2 = new Feature({
          geometry: new LineString(coordinates2.map((coord) => fromLonLat(coord))),
        });
        orbitSource.addFeature(orbitFeature2);
      }
    }
  }, [selectedDate, ephemeraSource, appSeconds]);

  /**
   * Update cloud layer based on selected date and toggle state
   */
  useEffect(() => {
    if (!cloudLayerRef.current || !olMapRef.current) return;

    const imageryDate = selectedDate || today;

    // Check if clouds are available for the selected date
    const dateEntry = cloudsAvailable.find((item) => item[imageryDate]);
    const availableLayers = dateEntry ? dateEntry[imageryDate] : [];
    const isCloudAvailable = availableLayers && availableLayers.length > 0;

    if (!isCloudAvailable || !showCloudsOverlay) {
      // Hide cloud layer if not available or toggle is off
      cloudLayerRef.current.setVisible(false);
      return;
    }

    // Use the first available layer
    const layerToUse = availableLayers[0];

    // Create XYZ source for GIBS cloud layer
    const cloudSource = new XYZ({
      url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layerToUse}/default/${imageryDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`,
      projection: "EPSG:3857",
      tileGrid: createXYZ({
        extent: [-20037508.34, -20037508.34, 20037508.34, 20037508.34],
        maxZoom: 9,
      }),
      wrapX: true,
      attributions: "Imagery courtesy NASA GIBS",
    });

    cloudLayerRef.current.setSource(cloudSource);
    cloudLayerRef.current.setVisible(true);
  }, [selectedDate, today, cloudsAvailable, showCloudsOverlay]);

  /**
   * Update photo rectangles on the map
   */
  useEffect(() => {
    if (!olMapRef.current || !photoRectanglesLayerRef.current) return;

    const source = photoRectanglesLayerRef.current.getSource();
    if (!source) return;

    // Clear existing rectangles
    source.clear();

    // Add previous and next photo rectangles (grey)
    [prevPhoto, nextPhoto].forEach((photo) => {
      if (!photo || !photo.corners) return;

      const bounds = calculateRectangleBounds(photo.corners);
      if (!bounds || !isValidRectangle(bounds)) return;

      const { west, south, east, north } = bounds;

      // Create polygon from corners
      const coords = [
        fromLonLat([west, south]),
        fromLonLat([east, south]),
        fromLonLat([east, north]),
        fromLonLat([west, north]),
        fromLonLat([west, south]), // Close the polygon
      ];

      const rectangleFeature = new Feature({
        geometry: new Polygon([coords]),
      });

      rectangleFeature.setStyle(
        new Style({
          stroke: new Stroke({
            color: "white",
            width: 2,
          }),
          fill: new Fill({
            color: "transparent",
          }),
        })
      );

      source.addFeature(rectangleFeature);
    });

    // Add current photo rectangle (yellow)
    if (currentPhotoWithCorners && currentPhotoWithCorners.corners) {
      const bounds = calculateRectangleBounds(currentPhotoWithCorners.corners);
      if (bounds && isValidRectangle(bounds)) {
        const { west, south, east, north } = bounds;

        const coords = [
          fromLonLat([west, south]),
          fromLonLat([east, south]),
          fromLonLat([east, north]),
          fromLonLat([west, north]),
          fromLonLat([west, south]),
        ];

        const rectangleFeature = new Feature({
          geometry: new Polygon([coords]),
        });

        rectangleFeature.setStyle(
          new Style({
            stroke: new Stroke({
              color: "yellow",
              width: 2,
            }),
            fill: new Fill({
              color: "transparent",
            }),
          })
        );

        source.addFeature(rectangleFeature);
      }
    }
  }, [currentPhotoWithCorners, prevPhoto, nextPhoto]);

  if (isLoading) {
    return <div className={styles.mapContainer}>Loading map...</div>;
  }

  return (
    <div
      className={styles.mapContainer}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {(isHovering || isTouchDevice) && (
        <>
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

          <div className={styles.toggleButtons}>
            <GlobeMapToggle isVisible={isHovering} />
            <IconButton
              className={styles.cloudToggle}
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
      <ClockInterval setAppSeconds={setClockAppSeconds} />
      <div ref={mapRef} className={styles.map}></div>
    </div>
  );
};

export default MapComponent;
