import React from "react";
import { createRoot } from "react-dom/client";
import "styles/global.css";
import {
  createBrowserRouter,
  RouterProvider,
  createRoutesFromElements,
  Route,
} from "react-router-dom";
import App from "./App.tsx";
import Home from "pages/index.tsx";
import DatePage from "pages/dateSlug";
import LayoutTest from "pages/layout_test.tsx";
import IndexOld from "pages/index_old.tsx";

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<App />}>
      <Route index element={<Home />} />
      <Route path=":dateTimeSlug" element={<Home />} />
      <Route path="date/:date" element={<DatePage />} />
      <Route
        path="layout_test"
        element={<LayoutTest selectedDate="2020-01-01" setSelectedDate={() => {}} />}
      />
      <Route path="index_old" element={<IndexOld />} />
    </Route>
  )
);

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container not found");
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
