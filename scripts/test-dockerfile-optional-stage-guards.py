#!/usr/bin/env python3
"""Check Dockerfile contracts for optional library build stages without Docker."""

from pathlib import Path
import re


DOCKERFILE = Path(__file__).resolve().parents[1] / "src/wasm/Dockerfile"
OPTIONAL_STAGES = {
    "emscripten-libzip": "WITH_LIBZIP",
    "emscripten-libxml": "WITH_LIBXML",
    "emscripten-sqlite3": "WITH_SQLITE",
    "emscripten-libpng": "WITH_LIBPNG",
    "emscripten-openssl": "WITH_OPENSSL",
}
HEAVY_COMMANDS = re.compile(
    r"\b(?:curl|wget|git clone|autogen\.sh|emconfigure|emcmake|emmake)\b"
)


def instructions(text: str) -> list[str]:
    result: list[str] = []
    lines = text.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        if not re.match(r"^[A-Z]+\s", line):
            index += 1
            continue
        parts = [line]
        while parts[-1].rstrip().endswith("\\") and index + 1 < len(lines):
            parts[-1] = parts[-1].rstrip()[:-1]
            index += 1
            # Dockerfile comments between continued lines are not RUN commands.
            if lines[index].lstrip().startswith("#"):
                continue
            parts.append(lines[index])
        result.append(" ".join(part.strip() for part in parts))
        index += 1
    return result


def stage_blocks(text: str) -> dict[str, str]:
    matches = list(re.finditer(r"^FROM\s+\S+\s+AS\s+(\S+)\s*$", text, re.M))
    blocks: dict[str, str] = {}
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        blocks[match.group(1)] = text[match.end() : end]
    return blocks


def main() -> None:
    text = DOCKERFILE.read_text()
    stages = stage_blocks(text)
    php_stage = stages["emscripten-php"]
    php_instructions = instructions(php_stage)

    for stage_name, arg in OPTIONAL_STAGES.items():
        stage = stages[stage_name]
        stage_instructions = instructions(stage)
        assert f"ARG {arg}=no" in stage, f"{stage_name} must default {arg} to no"

        heavy_runs = [
            instruction
            for instruction in stage_instructions
            if instruction.startswith("RUN ") and HEAVY_COMMANDS.search(instruction)
        ]
        assert heavy_runs, f"{stage_name} has no recognized build commands to guard"
        guard = f'if [ "${arg}" = "yes" ]; then'
        for instruction in heavy_runs:
            assert guard in instruction, f"unguarded heavy command in {stage_name}: {instruction}"

        assert f"mkdir -p /root/lib" in stage or "copy-lib.sh lib-libz" in stage, (
            f"{stage_name} must leave the downstream /root/lib COPY source available when disabled"
        )
        assert any(
            instruction.startswith("COPY ")
            and f"--from={stage_name} /root/lib " in instruction
            for instruction in php_instructions
        ), f"final PHP stage must retain its existing {stage_name} output path"
        assert any(
            instruction.startswith("RUN ") and guard in instruction
            for instruction in php_instructions
        ), f"final PHP consumer must remain gated by {arg}"
        print(f"OK {stage_name}: heavy commands gated by {arg}; output path and PHP consumer retained")


if __name__ == "__main__":
    main()
