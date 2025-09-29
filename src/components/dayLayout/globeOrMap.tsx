import { FunctionComponent } from "react";
import Globe from "components/panes/globe";
import Map from "components/panes/map";
import { useStateToggle } from "store/hooks/useStateToggle";

export const GlobeOrMap: FunctionComponent = () => {
  const { showGlobe } = useStateToggle();
  return <>{showGlobe ? <Globe /> : <Map />}</>;
};
