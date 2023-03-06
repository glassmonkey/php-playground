import * as React from "react";
import * as ReactDOM from "react-dom/client";
import App from "./app";

const root = ReactDOM.createRoot(document.getElementById("app")!);
root.render(
  <>
    <h1>PHP WebAssembly Demo</h1>
    <App />
  </>
);
