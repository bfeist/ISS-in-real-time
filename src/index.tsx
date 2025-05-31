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
import Home from "pages/index";
import DatePage from "pages/dateSlug";
import { getDataAvailabilities } from "utils/dateLoaders/index.ts";
import { getDatePageData } from "utils/dateLoaders/dateSlug.ts";
import LayoutTest from "pages/layout_test.tsx";
import IndexSlider from "pages/index_slider.tsx";

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<App />}>
      <Route index element={<Home />} loader={getDataAvailabilities} />
      <Route path="date/:date" element={<DatePage />} loader={getDatePageData} />
      <Route path="layout_test" element={<LayoutTest />} />
      <Route path="index_slider" element={<IndexSlider />} loader={getDataAvailabilities} />
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
