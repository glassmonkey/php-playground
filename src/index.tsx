import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { ChakraProvider } from "@chakra-ui/react";
import App from "./app";

const root = ReactDOM.createRoot(document.getElementById("app")!);
root.render(
  <ChakraProvider>
    <h1>PHP WebAssembly Demo</h1>
    <App />
  </ChakraProvider>
);
