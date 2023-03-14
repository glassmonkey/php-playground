import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { ChakraProvider, Heading, Center, Text, HStack } from "@chakra-ui/react";
import App from "./app";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

const router = createBrowserRouter([
  {
    path: "*",
    element: <App />
  }
]);

const root = ReactDOM.createRoot(document.getElementById("app")!);
root.render(
  <ChakraProvider>
    <Heading as="h1" style={{ margin: "16px" }}>
      PHP Playground
    </Heading>
    <RouterProvider router={router} />
    <Center>
      <HStack spacing="16px">
        <Text as="small" size="xs">
          <a href="privacy.html" target="_blank">
            Privacy Policy
          </a>
        </Text>
        <Text as="small" size="xs">
          &copy; 2023{" "}
          <a href="https://twitter.com/glassmonekey" target="_blank">
            glassmonekey
          </a>
        </Text>
      </HStack>
    </Center>
  </ChakraProvider>
);
