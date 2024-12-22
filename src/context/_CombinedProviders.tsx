import React from "react";

import { composeProviders } from "utils/context";
import { ClockContextProvider } from "./clockContext";
import { HoverContextProvider } from "./hoverContext";

const providers = [HoverContextProvider, ClockContextProvider];

// Define the props type to include 'children'
const CombinedProviders = ({ children }: { children: React.ReactNode }): JSX.Element => {
  const Combined = composeProviders(providers) as React.ComponentType<{
    children: React.ReactNode;
  }>;
  return <Combined>{children}</Combined>;
};

export default CombinedProviders;
