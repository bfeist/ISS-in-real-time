import {
  Cartesian3,
  createWorldTerrainAsync,
  Ion,
  Math as CesiumMath,
  JulianDate,
  Color,
  CallbackPositionProperty,
  CallbackProperty,
} from "cesium";
import * as Cesium from "cesium";
import { Clock } from "resium";
import { FunctionComponent, useState } from "react";
import { useLoaderData } from "react-router-dom";
import { Viewer, Entity, PointGraphics, EntityDescription } from "resium";
import { findClosestEphemeraItem } from "utils/map";
import * as satellite from "satellite.js";

// Set Cesium Ion access token
Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;

const CesiumPage: FunctionComponent = (): JSX.Element => {
  const startTime = new Date("2022-11-01T01:00:00Z");
  const julianDate = JulianDate.fromIso8601(new Date(startTime).toISOString());

  const ephemeraItems = useLoaderData() as EphemeraItem[];
  const [tle, _setTle] = useState<string[]>(() => {
    const ephemeris = findClosestEphemeraItem(startTime, ephemeraItems);
    return [ephemeris.tle_line1, ephemeris.tle_line2];
  });

  // Modify calculatePosition to accept currentTime:
  const calculatePosition = (currentTime: JulianDate) => {
    if (!tle || tle.length === 0) {
      return Cartesian3.ZERO;
    }
    const jsDate = JulianDate.toDate(currentTime);
    const satrec = satellite.twoline2satrec(tle[0], tle[1]);
    const positionAndVelocity = satellite.propagate(satrec, jsDate);
    const positionEci = positionAndVelocity.position as satellite.EciVec3<number>;

    if (!positionEci) {
      return Cartesian3.ZERO;
    }

    const gmst = satellite.gstime(jsDate);
    const positionGd = satellite.eciToGeodetic(positionEci, gmst);
    const longitude = positionGd.longitude;
    const latitude = positionGd.latitude;
    const height = positionGd.height * 1000; // Convert km to meters

    return Cartesian3.fromDegrees(
      CesiumMath.toDegrees(longitude),
      CesiumMath.toDegrees(latitude),
      height
    );
  };

  // Create a CallbackProperty for smooth position updates and cast it to any:
  const positionProperty = new CallbackPositionProperty((currentTime, _result) => {
    return calculatePosition(currentTime);
  }, false);

  // Create a CallbackProperty for the label's text to display velocity and height:
  const labelProperty = new CallbackProperty((currentTime, _result) => {
    if (!tle || tle.length === 0) {
      return "ISS";
    }
    const jsDate = JulianDate.toDate(currentTime);
    const satrec = satellite.twoline2satrec(tle[0], tle[1]);
    const positionAndVelocity = satellite.propagate(satrec, jsDate);
    const velocityVector = positionAndVelocity.velocity as satellite.EciVec3<number>;
    const positionEci = positionAndVelocity.position as satellite.EciVec3<number>;

    if (!velocityVector || !positionEci) {
      return "ISS";
    }

    const gmst = satellite.gstime(jsDate);
    const positionGd = satellite.eciToGeodetic(positionEci, gmst);
    const heightKm = positionGd.height; // Height in kilometers

    const speed =
      Math.sqrt(velocityVector.x ** 2 + velocityVector.y ** 2 + velocityVector.z ** 2) * 3600; // Convert km/s to km/h
    return `ISS - Velocity: ${speed.toFixed(4)} km/h - Height: ${heightKm.toFixed(4)} km`;
  }, false);

  const terrainProvider = createWorldTerrainAsync();
  const position = Cartesian3.fromDegrees(-74.0707383, 40.7117244, 100);
  const pointGraphics = { pixelSize: 10 };

  return (
    <Viewer
      full
      terrainProvider={terrainProvider}
      // timeline={false}
      // animation={false}
      // Disable individual toolbar components
      navigationHelpButton={false}
      homeButton={false}
      fullscreenButton={false}
      geocoder={false}
      baseLayerPicker={false}
      sceneModePicker={false}
      // selectionIndicator={false}
      // infoBox={false}
    >
      <Entity
        name="ISS"
        position={positionProperty}
        point={{ pixelSize: 10, color: Color.RED }}
        label={{
          text: labelProperty,
          font: "14pt sans-serif",
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          outlineWidth: 2,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -9),
        }}
      />
      <Clock startTime={julianDate} currentTime={julianDate} multiplier={1} shouldAnimate={true} />
      <Entity position={position} name="Tokyo" description="Hello, world.">
        <PointGraphics {...pointGraphics}>
          <EntityDescription>
            <h1>Hello, world.</h1>
            <p>JSX is available here!</p>
          </EntityDescription>
        </PointGraphics>
      </Entity>
    </Viewer>
  );
};

export default CesiumPage;
