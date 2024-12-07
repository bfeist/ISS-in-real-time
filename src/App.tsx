import { Outlet } from "react-router-dom";
import "./styles/global.css";

function App(): JSX.Element {
  return (
    <>
      {/* Add shared layout components like header, footer, etc. */}
      <Outlet />
    </>
  );
}

export default App;
