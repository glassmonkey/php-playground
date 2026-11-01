#!/usr/bin/env python3
"""Format and install a matching generated PHP JavaScript/Wasm pair."""

import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory


ROOT = Path(__file__).resolve().parents[1]


def install(version: str, output: Path, root: Path = ROOT) -> None:
    if not re.fullmatch(r"\d+\.\d+", version):
        raise ValueError(f"Invalid PHP version: {version}")

    js_name = f"php-{version}.js"
    wasm_name = f"php-{version}.wasm"
    js = output / js_name
    wasm = output / wasm_name
    subprocess.run(
        [
            str(root / "node_modules/.bin/prettier"),
            "--config",
            str(root / ".prettierrc.json"),
            "--write",
            str(js),
        ],
        cwd=root,
        check=True,
    )

    js_text = js.read_text()
    size = re.search(r"export const dependenciesTotalSize\s*=\s*(\d+);", js_text)
    filename = re.search(
        rf"export const dependencyFilename\s*=\s*['\"]{re.escape(wasm_name)}\?([0-9a-f]{{32}})['\"]",
        js_text,
    )
    wasm_bytes = wasm.read_bytes()
    if size is None or int(size.group(1)) != len(wasm_bytes):
        raise ValueError(f"{js_name} does not match {wasm_name} size")
    if filename is None or filename.group(1) != hashlib.md5(wasm_bytes).hexdigest():
        raise ValueError(f"{js_name} does not match {wasm_name} checksum")

    targets = [root / "src/wasm-assets" / js_name, root / "assets" / wasm_name]
    with TemporaryDirectory(dir=root) as temp:
        staging = Path(temp)
        staged = [staging / js_name, staging / wasm_name]
        backups = [staging / f"old-{js_name}", staging / f"old-{wasm_name}"]
        for source, stage in zip((js, wasm), staged):
            shutil.copy2(source, stage)
            stage.chmod(0o644)
        existed = [target.exists() for target in targets]
        for target, backup, was_present in zip(targets, backups, existed):
            if was_present:
                shutil.copy2(target, backup)
        installed = 0
        try:
            for stage, target in zip(staged, targets):
                os.replace(stage, target)
                installed += 1
        except BaseException:
            for target, backup, was_present in zip(targets[:installed], backups, existed):
                if was_present:
                    os.replace(backup, target)
                else:
                    target.unlink()
            raise

    print(f"Installed {js_name} and {wasm_name} from one generated pair")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: install-wasm-assets.py VERSION OUTPUT_DIR")
    install(sys.argv[1], Path(sys.argv[2]))
