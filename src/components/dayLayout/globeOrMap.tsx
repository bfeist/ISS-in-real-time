import { FunctionComponent } from "react";
import GlobeCesium from "components/panes/globeCesium";
import Map from "components/panes/map";
import { useStateToggle } from "store/hooks/useStateToggle";

export const GlobeOrMap: FunctionComponent = () => {
  const { showGlobe } = useStateToggle();
  return <>{showGlobe ? <GlobeCesium /> : <Map />}</>;
};
