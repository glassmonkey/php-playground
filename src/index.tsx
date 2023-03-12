import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { ChakraProvider, Heading, Center, Text } from "@chakra-ui/react";
import App from "./app";

const root = ReactDOM.createRoot(document.getElementById("app")!);
root.render(
  <ChakraProvider>
    <Heading as="h1" style={{ margin: "16px" }}>
      PHP Playground
    </Heading>
    <App />
    <Center>
      <Text as="small" size="xs">
        &copy; 2023{" "}
        <a href="https://twitter.com/glassmonekey" target="_blank">
          glassmonekey
        </a>
      </Text>
    </Center>
  </ChakraProvider>
);
