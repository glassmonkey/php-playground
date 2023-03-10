import * as React from "react";
import { PHP, startPHP } from "./php-wasm";
import { useEffect, useState, useRef } from "react";
import Select from "react-select";
import { Spinner, Flex, Box, Divider, Center } from "@chakra-ui/react";
import { php as lnagPhp } from "@codemirror/lang-php";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { useSandpack } from "@codesandbox/sandpack-react";

import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackPreview,
  Sandpack,
} from "@codesandbox/sandpack-react";

const versions = [
  "5.6",
  "7.0",
  "7.1",
  "7.2",
  "7.3",
  "7.4",
  "8.0",
  "8.1",
  "8.2",
] as const;

type Version = (typeof versions)[number];

const options = versions.map((v) => ({
  value: v,
  label: v,
}));

type Option = (typeof options)[number];

async function initPHP(v: Version) {
  // todo handling when load failed
  const PHPLoaderModule = await import(`./php-${v}.js`);
  return startPHP(PHPLoaderModule, "WEB", {});
}

async function runPHP(php: PHP, code: string) {
  const output = php.run({
    code: code,
  });
  return new TextDecoder().decode(output.body);
}

function PhpInfo(params: { php: PHP }) {
  const [result, setResult] = useState("");
  useEffect(
    function () {
      (async function () {
        const info = await runPHP(params.php, "<?php phpinfo();");
        setResult(info);
      })();
    },
    [params.php]
  );

  return <iframe srcDoc={result} height="100%" width="100%" />;
}

function PhpPreview(params: { php: PHP }) {
  const { sandpack } = useSandpack();
  const { files, activeFile } = sandpack;
  const code = files[activeFile].code;

  const [result, setResult] = useState("");
  useEffect(
    function () {
      (async function () {
        const info = await runPHP(params.php, code);
        setResult(info);
      })();
    },
    [params.php, code]
  );

  return <iframe srcDoc={result} height="100%" width="100%" />;
}

export default function () {
  const [php, setPHP] = useState<PHP | null>(null);
  const [selectedValue, setSelectedValue] = useState<Option>(
    options[options.length - 1]
  );

  useEffect(
    function () {
      (async function () {
        setPHP(await initPHP(selectedValue.value));
      })();
    },
    [selectedValue]
  );

  if (php == null) {
    return <Spinner />;
  }

  // @ts-ignore
  return (
    <main style={{ margin: "16px" }}>
      <label>PHP's Version:</label>
      <Select
        styles={{
          option: (baseStyles, state) => ({
            ...baseStyles,
            color: "black",
          }),
        }}
        options={options}
        defaultValue={selectedValue}
        onChange={(option) => {
          // null means loading.
          setPHP(null);
          setSelectedValue(option ?? options[options.length - 1]);
        }}
      />
      <SandpackProvider
        template="react"
        files={{ "/App.js": `<?php phpinfo();` }}
      >
        <Flex direction="column" padding="3" bg="gray.800" height="$100vh">
          <Flex justify="space-between" align="center" mb="2" py="1">
            <Box
              as={SandpackLayout}
              flexDirection={{ base: "column", md: "row" }}
              height="100vh"
              width="100%"
            >
              <Box
                as="span"
                flex="1"
                height="100%"
                maxWidth={{ base: "100%", md: "50%" }}
                position="relative"
                className="group"
                sx={{
                  ".cm-scroller": {
                    "&::-webkit-scrollbar": {
                      height: "8px",
                      width: "8px",
                    },
                    "&::-webkit-scrollbar-track": {
                      background: "rgba(0,0,0,0.3)",
                    },
                    "&::-webkit-scrollbar-thumb": {
                      background: "whiteAlpha.300",
                    },
                  },
                }}
              >
                <SandpackCodeEditor
                  showRunButton={false}
                  showLineNumbers
                  showTabs={false}
                  style={{ height: "100%" }}
                  extensions={[autocompletion()]}
                  extensionsKeymap={[completionKeymap]}
                  additionalLanguages={[
                    {
                      name: "php",
                      extensions: ["php"],
                      language: lnagPhp(),
                    },
                  ]}
                />
              </Box>
              <Box width="100%" maxWidth={{ base: "100%", md: "50%" }}>
                <PhpPreview php={php} />
              </Box>
            </Box>
          </Flex>
        </Flex>
      </SandpackProvider>
    </main>
  );
}
