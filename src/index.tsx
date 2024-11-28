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
import { getDatePageData, getAvailableDates } from "utils/dataLoaders";

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/" element={<App />}>
        <Route index element={<Home />} loader={getAvailableDates} />
        <Route path="date/:date" element={<DatePage />} loader={getDatePageData} />
      </Route>
    </>
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
