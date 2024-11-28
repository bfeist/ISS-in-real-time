import { FunctionComponent, useRef, useEffect } from "react";
import { findClosestEphemeraItem } from "utils/map";
import { getLatLngObj } from "tle.js";
import "ol/ol.css";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import Feature from "ol/Feature";
import { Point } from "ol/geom";
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

const MapComponent: FunctionComponent<{
  viewDate: string;
  ephemeraItems: EphemeraItem[];
}> = ({ viewDate, ephemeraItems }) => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const olMapRef = useRef<Map | null>(null);

  useEffect(() => {
    const labelLayer = new TileLayer({
      source: new XYZ({
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      }),
    });
    labelLayer.setOpacity(0.7);

    olMapRef.current = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({
          source: new XYZ({
            url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          }),
        }),
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
    });

    return () => {
      olMapRef.current.setTarget(undefined);
    };
  }, []);

  /**
   * Add a marker to the map for the current ISS position
   */
  useEffect(() => {
    if (!mapRef.current || !olMapRef.current) return;

    let vectorLayer: VectorLayer; // Declare outside for cleanup

    if (ephemeraItems && viewDate) {
      const ephemeris = findClosestEphemeraItem(new Date(viewDate), ephemeraItems);
      if (ephemeris) {
        const tle = `${ephemeris.tle_line1}
        ${ephemeris.tle_line2}`;
        const { lat, lng } = getLatLngObj(tle, new Date(viewDate).getTime());

        const xFeature = new Feature({
          geometry: new Point(fromLonLat([lng, lat])),
        });

        xFeature.setStyle(
          new Style({
            text: new Text({
              text: "X",
              font: "bold 16px sans-serif",
              fill: new Fill({ color: "red" }),
              stroke: new Stroke({ color: "white", width: 1 }),
            }),
          })
        );

        vectorLayer = new VectorLayer({
          source: new VectorSource({
            features: [xFeature],
          }),
        });

        olMapRef.current.addLayer(vectorLayer);
      }
    }

    return () => {
      if (vectorLayer && olMapRef.current) {
        olMapRef.current.removeLayer(vectorLayer);
      }
    };
  }, [ephemeraItems, viewDate]);

  /**
   * Add a terminator layer to the map
   */
  useEffect(() => {
    if (!viewDate || !olMapRef.current) return;
    // Add terminator layer
    const terminator = new Terminator({ time: new Date(viewDate), resolution: 2 });
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
  }, [viewDate]);

  return <div ref={mapRef} style={{ width: "100%", height: "100%" }}></div>;
};

export default MapComponent;
