import {
  Cartesian3,
  createWorldTerrainAsync,
  Ion,
  Math as CesiumMath,
  JulianDate,
  Color,
  CallbackProperty,
  SampledPositionProperty,
  ClockRange,
} from "cesium";
import * as Cesium from "cesium";
import { Clock, Scene, Camera } from "resium";
import { FunctionComponent, useState, useRef } from "react";
import { useLoaderData } from "react-router-dom";
import { Viewer, Entity } from "resium";
import { findClosestEphemeraItem } from "utils/map";
import * as satellite from "satellite.js";

// Set Cesium Ion access token
Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;

const CesiumPage: FunctionComponent = (): JSX.Element => {
  const startTime = new Date("2022-11-01T01:00:00Z");
  const julianDate = JulianDate.fromDate(startTime);

  const ephemeraItems = useLoaderData() as EphemeraItem[];
  const [tle, _setTle] = useState<string[]>(() => {
    const ephemeris = findClosestEphemeraItem(startTime, ephemeraItems);
    return [ephemeris.tle_line1, ephemeris.tle_line2];
  });

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

    // Format the current date and time
    const dateTimeStr = jsDate.toISOString();

    return `ISS - ${dateTimeStr}\nVelocity: ${speed.toFixed(4)} km/h - Height: ${heightKm.toFixed(4)} km`;
  }, false);

  const computeSampledPositions = () => {
    if (!tle || tle.length === 0) {
      return null;
    }

    const satrec = satellite.twoline2satrec(tle[0], tle[1]);
    const positions = new SampledPositionProperty();
    const startTimeJD = JulianDate.addSeconds(julianDate, -3600, new JulianDate());
    const endTimeJD = JulianDate.addSeconds(julianDate, 3600, new JulianDate());
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

  const issEntityRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);

  // Update camera position to follow the ISS
  const updateCameraPosition = (currentTime: JulianDate) => {
    if (cameraRef.current && issEntityRef.current?.position) {
      const position = issEntityRef.current.position.getValue(currentTime);
      if (position) {
        cameraRef.current.flyTo({
          destination: position,
          duration: 0,
        });
      }
    }
  };

  return (
    <Viewer
      full
      terrainProvider={terrainProvider}
      trackedEntity={issEntityRef.current}
      timeline={false}
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
      <Scene ref={sceneRef}>
        <Camera ref={cameraRef} />
      </Scene>
      <Entity
        ref={issEntityRef}
        name="ISS"
        position={sampledPositionProperty}
        point={{ pixelSize: 10, color: Color.RED }}
        label={{
          text: labelProperty,
          font: "14pt sans-serif",
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          outlineWidth: 2,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -9),
        }}
        path={{
          material: Color.YELLOW,
          width: 2,
          leadTime: 3600,
          trailTime: 3600,
          resolution: 60,
        }}
      />
      <Clock
        startTime={JulianDate.addSeconds(julianDate, -3600, new JulianDate())}
        currentTime={julianDate}
        stopTime={JulianDate.addSeconds(julianDate, 3600, new JulianDate())}
        clockRange={ClockRange.LOOP_STOP}
        multiplier={1}
        shouldAnimate={true}
        onTick={(clock) => updateCameraPosition(clock.currentTime)}
      />
    </Viewer>
  );
};

export default CesiumPage;
