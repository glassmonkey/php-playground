#!/usr/bin/env python3
"""Check that the normal web build always includes its PHP libraries."""

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
DOCKERFILE = ROOT / "src/wasm/Dockerfile"
MAKEFILE = ROOT / "Makefile"
WEB_LIBRARIES = {
    "emscripten-libzip": "WITH_LIBZIP",
    "emscripten-libxml": "WITH_LIBXML",
    "emscripten-sqlite3": "WITH_SQLITE",
    "emscripten-libpng": "WITH_LIBPNG",
    "emscripten-openssl": "WITH_OPENSSL",
}
OTHER_FIXED_FEATURES = ("WITH_MBSTRING", "WITH_VRZNO")
BUILD_COMMAND = re.compile(
    r"\b(?:curl|wget|git clone|autogen\.sh|emconfigure|emcmake|emmake)\b"
)


def stage_blocks(text: str) -> dict[str, str]:
    matches = list(re.finditer(r"^FROM\s+\S+\s+AS\s+(\S+)\s*$", text, re.M))
    return {
        match.group(1): text[
            match.end() : matches[index + 1].start()
            if index + 1 < len(matches)
            else len(text)
        ]
        for index, match in enumerate(matches)
    }


def main() -> None:
    dockerfile = DOCKERFILE.read_text()
    makefile = MAKEFILE.read_text()
    stages = stage_blocks(dockerfile)
    php_stage = stages["emscripten-php"]

    for stage_name, flag in WEB_LIBRARIES.items():
        stage = stages[stage_name]
        assert BUILD_COMMAND.search(stage), f"{stage_name} has no build command"
        assert flag not in dockerfile, f"{flag} still branches the web build"
        assert flag not in makefile, f"{flag} still exposed by Makefile"
        assert f"COPY --from={stage_name} /root/lib " in php_stage, (
            f"{stage_name} output is not consumed by PHP"
        )
        print(f"OK {stage_name}: fixed build and PHP input")

    for flag in OTHER_FIXED_FEATURES:
        assert f"ARG {flag}" not in dockerfile
        assert flag not in makefile
    assert " --enable-mbstring " in php_stage
    assert " --enable-vrzno" in php_stage


if __name__ == "__main__":
    main()
