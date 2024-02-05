import React from 'react';
import { HiMoon, HiSun } from "react-icons/hi";
import { switchAnatomy } from "@chakra-ui/anatomy";
import { createMultiStyleConfigHelpers } from "@chakra-ui/react";
import ReactDOMServer from "react-dom/server";

function extendSwitchTheme() {
  const {
    definePartsStyle,
    defineMultiStyleConfig
  } = createMultiStyleConfigHelpers(switchAnatomy.keys);

  const darkModeIcon = ReactDOMServer.renderToString(<HiMoon />);

  const lightModeIcon = ReactDOMServer.renderToString(<HiSun />);

  const template = 'data:image/svg+xml;utf8,$';

  const colormodeSwitcher = definePartsStyle({
    track: {
      background: "#f1bf5a", // yellow
      _dark: {
        background: "#51555E", // grey
      }
    },
    thumb: {
      bg: "transparent",
      backgroundImage: template.replaceAll("$", lightModeIcon),
      _dark: {
        backgroundImage: template.replaceAll("$", darkModeIcon)
      },
      backgroundRepeat: "no-repeat",
      marginTop: "8.5%",
      marginLeft: "9.5%",
      color: "white"
    }
  });

  return defineMultiStyleConfig({ variants: { colormodeSwitcher } });
}

export const switchTheme = extendSwitchTheme();
