import { Viewer, Entity } from "resium";
import { Cartesian3, Color } from "cesium";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import * as satellite from "satellite.js";
import { FunctionComponent } from "react";

// Replace with your Cesium Ion access token
Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;

const TLE_LINE1 = "1 25544U 98067A   23304.05236419  .00028979  00000-0  51553-3 0  9999";
const TLE_LINE2 = "2 25544  51.6457  15.5688 0000933  62.4501   1.8288 15.49909366422867";

const satrec = satellite.twoline2satrec(TLE_LINE1, TLE_LINE2);

const SatelliteOrbit: FunctionComponent = () => {
  console.log(satrec);
  return (
    <Viewer full>
      <Entity position={new Cartesian3(0, 0, 0)} point={{ pixelSize: 10, color: Color.RED }} />
    </Viewer>
  );
};

export default SatelliteOrbit;
