import * as React from "react";
import { PHP, startPHP } from "./php-wasm";
import { ReactElement, useEffect, useState } from "react";
import Select from "react-select";
import { Spinner, Flex, Box, Spacer } from "@chakra-ui/react";
import { php as lnagPhp } from "@codemirror/lang-php";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { useSandpack } from "@codesandbox/sandpack-react";
import { useSearchParams } from "react-router-dom";

import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor
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
  "8.2"
] as const;

function asVersion(s: string|null): Version | null {
  const r = versions.filter((v) => v == s).pop();
  if (!r) {
    return null;
  }
  return r;
}

type Version = (typeof versions)[number];

const options = versions.map((v) => ({
  value: v,
  label: v
}));

type Option = (typeof options)[number];

async function initPHP(v: Version) {
  // todo handling when load failed
  const PHPLoaderModule = await import(`./php-${v}.js`);
  return startPHP(PHPLoaderModule, "WEB", {});
}

async function runPHP(php: PHP, code: string) {
  const output = php.run({
    code: code
  });
  return new TextDecoder().decode(output.body);
}

function PhpPreview(params: { php: PHP, setCode: (string) => void }) {
  const { sandpack } = useSandpack();
  const { files, activeFile } = sandpack;
  const code = files[activeFile].code;

  const [result, setResult] = useState("");
  useEffect(
    function() {
      (async function() {
        const info = await runPHP(params.php, code);
        setResult(info);
        params.setCode(code);
      })();
    },
    [params.php, code]
  );

  return <iframe srcDoc={result} height="100%" width="100%" />;
}

function EditorLayout(params: { Editor: ReactElement, Preview: ReactElement }) {
  return (
    <Flex direction="column" padding="3" bg="gray.800" height="100%">
      <Flex
        justify="space-between"
        direction={{ base: "column", lg: "row"}}
        align="center"
        gap="8px"
        height="75vh"
      >
        <Box
          as={SandpackLayout}
          flexDirection={{ base: "column", lg: "row" }}
          height={{ base: "50%", lg: "100%"}}
          width="100%"
        >
          <Box
            as="span"
            flex="1"
            height="100%"
            maxWidth={{ base: "100%" }}
            position="relative"
            className="group"
          >
            {params.Editor}
          </Box>
        </Box>
        <Box
          width="100%"
          height={{ base: "50%", lg: "100%"}}
          style={{
          backgroundColor: "white"
        }}>
          {params.Preview}
        </Box>
      </Flex>
    </Flex>);
}

function Editor(params: { initCode: string, php: PHP, setCode: (string) => void }) {
  return (<SandpackProvider
    template="react"
    files={{ "/app.php": params.initCode }}
    options={{
      activeFile: "/app.php", // used to be activePath
      visibleFiles: ["/app.php"] // used to be openPaths
    }}
  >
    <EditorLayout
      Editor={
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
              language: lnagPhp()
            }
          ]}
        />
      }
      Preview={
        <PhpPreview php={params.php} setCode={params.setCode} />
      }
    />
  </SandpackProvider>);
}

export default function() {
  const defaultOption = options[options.length - 1]
  const [code, setCode] = useState<string>('<?php phpinfo();')
  const [php, setPHP] = useState<PHP | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedVersion, selectVersion] = useState<Option>(
    defaultOption
  )

  function updateVersion(v: Option) {
    // null means loading.
    setPHP(null);
    selectVersion(v);
    setSearchParams({
      'v': v.value
    })
  }

  useEffect(
    function() {
      const version = asVersion(searchParams.get('v')) ?? selectedVersion.value
      const versionIndex = versions.findIndex((v) => v == version)
      updateVersion(options[versionIndex]);

      (async function() {
        setPHP(await initPHP(version));
      })();
    },
    [selectedVersion, searchParams]
  );

  if (php == null) {
    return <Spinner />;
  }

  return (
    <main style={{ margin: "16px" }}>
      <Flex marginTop="8px" marginBottom="8px">
        <Box width="32px" height="32px" margin-left="16px">
          <a
            href="https://github.com/glassmonkey/php-playground"
            target="_blank"
          >
            <img src="octocat.png" />
          </a>
        </Box>
        <Spacer />
        <label
          style={{
            marginTop: "auto",
            marginBottom: "auto"
          }}
        >
          PHP's Version({}):
        </label>
        <Select
          styles={{
            option: (baseStyles, state) => ({
              ...baseStyles,
              color: "black"
            })
          }}
          options={options}
          defaultValue={selectedVersion}
          onChange={(option) => {
            updateVersion(option ?? defaultOption);
          }}
        />
      </Flex>
      <Editor initCode={code} php={php} setCode={setCode} />
    </main>
  );
}
