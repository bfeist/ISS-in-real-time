import {
  Cartesian3,
  createWorldTerrainAsync,
  Ion,
  Math as CesiumMath,
  JulianDate,
  Color,
} from "cesium";
import * as Cesium from "cesium";
import { Clock } from "resium";
import { FunctionComponent, useEffect, useState } from "react";
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
  const [time, setTime] = useState(julianDate);

  useEffect(() => {
    const interval = setInterval(() => {
      setTime((prevTime) => JulianDate.addSeconds(prevTime, 1, new JulianDate()));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Calculate satellite position based on time using satellite.js
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
    const longitude = positionGd.longitude; // Already in radians
    const latitude = positionGd.latitude; // Already in radians
    const height = positionGd.height * 1000; // Convert km to meters

    console.log("Altitude:", height);

    const velocityVector = positionAndVelocity.velocity as satellite.EciVec3<number>;
    const speed =
      Math.sqrt(velocityVector.x ** 2 + velocityVector.y ** 2 + velocityVector.z ** 2) * 3600; // Convert km/s to km/h
    console.log("Velocity:", speed, "km/h");
    console.log("Position:", longitude, latitude, height);

    return Cartesian3.fromDegrees(
      CesiumMath.toDegrees(longitude),
      CesiumMath.toDegrees(latitude),
      height
    );
  };

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
        name="Satellite"
        position={calculatePosition(time)}
        point={{ pixelSize: 10, color: Color.RED }}
        label={{
          text: "Satellite",
          font: "14pt sans-serif",
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          outlineWidth: 2,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -9),
        }}
      />
      <Clock startTime={julianDate} currentTime={time} multiplier={1} shouldAnimate={true} />
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
