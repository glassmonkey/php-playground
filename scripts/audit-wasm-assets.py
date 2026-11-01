#!/usr/bin/env python3
"""Audit generated pairs and removed callback code against the PR base."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

BASE = "ba63d9b04c321ebb1cef7e306127479392c03d77"
ROOT = Path(__file__).resolve().parents[1]


def uint(data, offset):
    value = shift = 0
    while True:
        byte = data[offset]
        offset += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, offset
        shift += 7


def string(data, offset):
    length, offset = uint(data, offset)
    return data[offset:offset + length].decode(), offset + length


def wasm_sections(data):
    assert data[:8] == b"\0asm\1\0\0\0"
    offset = 8
    sections = {}
    while offset < len(data):
        kind = data[offset]
        size, offset = uint(data, offset + 1)
        sections[kind] = data[offset:offset + size]
        offset += size
    imports = []
    chunk = sections[2]
    count, offset = uint(chunk, 0)
    for _ in range(count):
        module, offset = string(chunk, offset)
        name, offset = string(chunk, offset)
        assert chunk[offset] == 0, "Expected only function imports"
        signature, offset = uint(chunk, offset + 1)
        imports.append({"module": module, "name": name, "signature": signature})
    exports = {}
    chunk = sections[7]
    count, offset = uint(chunk, 0)
    for _ in range(count):
        name, offset = string(chunk, offset)
        kind = chunk[offset]
        index, offset = uint(chunk, offset + 1)
        exports[name] = {"kind": kind, "index": index}
    bodies = []
    chunk = sections[10]
    count, offset = uint(chunk, 0)
    for _ in range(count):
        size, offset = uint(chunk, offset)
        bodies.append(chunk[offset:offset + size])
        offset += size
    return imports, exports, bodies


def audit(version):
    js = (ROOT / f"src/wasm-assets/php-{version}.js").read_text()
    binary = (ROOT / f"assets/php-{version}.wasm").read_bytes()
    old_js = subprocess.check_output(["git", "show", f"{BASE}:src/wasm-assets/php-{version}.js"], cwd=ROOT).decode()
    old_binary = subprocess.check_output(["git", "show", f"{BASE}:assets/php-{version}.wasm"], cwd=ROOT)
    worker_base = subprocess.check_output(["git", "show", f"a36912b:src/wasm-assets/php-{version}.js"], cwd=ROOT).decode()
    assert "RuntimeName === 'WORKER'" in worker_base
    imports, exports, bodies = wasm_sections(binary)
    old_imports, old_exports, old_bodies = wasm_sections(old_binary)
    assert int(re.search(r"dependenciesTotalSize\s*=\s*(\d+)", js)[1]) == len(binary)
    assert re.search(rf"php-{re.escape(version)}\.wasm\?([a-f0-9]{{32}})", js)[1] == hashlib.md5(binary).hexdigest()
    assert re.search(r"ENVIRONMENT_IS_WORKER\s*=\s*!!globalThis.WorkerGlobalScope", js)
    assert "if (!ENVIRONMENT_IS_WORKER)" in js
    removed = {}
    for name in ("exec_callback", "del_callback"):
        assert name not in js
        assert name.encode() not in binary
        old_export = re.search(rf"Module\['_({name})'\] = wasmExports\['([^']+)'\]", old_js)
        assert old_export, f"Missing baseline export {name}"
        index = old_exports[old_export[2]]["index"]
        body = old_bodies[index - len(old_imports)]
        # Inspect the actual Code section, in addition to JS glue and Wasm tables.
        assert body not in bodies, f"Old {name} function body retained"
        removed[name] = {"base_export": old_export[2], "base_function_index": index,
                         "base_body_hex": body.hex(), "body_absent": True}
    old_stubs = set(re.findall(r"abort\('missing function: ([^']+)'\)", old_js))
    stubs = set(re.findall(r"abort\('missing function: ([^']+)'\)", js))
    assert stubs <= old_stubs - {"vrzno_exec_callback", "vrzno_del_callback"}
    assert "Asyncify.handleSleep" in old_js and "Asyncify.handleSleep" in js
    assert not re.search(r"(?:var|let|const) Asyncify\b", js)
    assert "_wasm_sapi_abort_request" not in old_js and "_wasm_sapi_abort_request" not in js
    return {"version": version, "wasm_bytes": len(binary), "wasm_md5": hashlib.md5(binary).hexdigest(),
            "wasm_sha256": hashlib.sha256(binary).hexdigest(), "js_sha256": hashlib.sha256(js.encode()).hexdigest(),
            "worker_guard": "WorkerGlobalScope; lazy file guarded by !ENVIRONMENT_IS_WORKER",
            "removed_callbacks": removed, "wasm_imports": imports, "wasm_exports": exports,
            "defined_function_count": len(bodies), "base_defined_function_count": len(old_bodies),
            "preexisting_issues": {"missing_function_stubs": sorted(stubs),
                                   "base_missing_function_stubs": sorted(old_stubs),
                                   "asyncify_handleSleep_without_definition": True,
                                   "abortPHP_target_absent_in_base_and_current": True}}


if __name__ == "__main__":
    import sys
    versions = sys.argv[1:] or json.loads((ROOT / "doc/wasm-regeneration-20261102/source-pins.json").read_text())["versions"]
    print(json.dumps({"base": BASE, "versions": [audit(v) for v in versions]}, indent=2))
