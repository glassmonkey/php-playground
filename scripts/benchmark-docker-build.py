#!/usr/bin/env python3
"""Run an isolated, attributable Docker build benchmark and retain raw evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import re
import shlex
import statistics
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path


PHP_VERSIONS = ("5.6", "7.0", "7.1", "7.2", "7.3", "7.4", "8.0", "8.1", "8.2", "8.3", "8.4", "8.5")
STAGE_LINE = re.compile(r"^#(?P<step>\d+)\s+(?P<detail>.*)$")


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def parse_build_events(log: str) -> dict:
    events = []
    for line in log.splitlines():
        match = STAGE_LINE.match(line)
        if not match:
            continue
        detail = match.group("detail").strip()
        state = "cached" if re.search(r"(?:^|\s)CACHED(?:\s|$)", detail) else "done" if re.search(r"(?:^|\s)DONE(?:\s|$)", detail) else None
        if state:
            events.append({"step": int(match.group("step")), "detail": detail, "state": state})
    return {
        "events": events,
        "cache_hits": sum(event["state"] == "cached" for event in events),
        "completed_steps": sum(event["state"] == "done" for event in events),
    }


def build_command(args, context: Path, php_version: str, tag: str, no_cache: bool, log_path: Path) -> list[str]:
    command = [
        args.docker,
        "buildx",
        "build",
        "--builder",
        args.builder,
        "--progress=plain",
        "--provenance=mode=max",
        "--platform",
        args.platform,
        "--file",
        str(args.dockerfile),
        "--tag",
        tag,
        "--metadata-file",
        str(log_path.with_suffix(".metadata.json")),
    ]
    if no_cache:
        command.append("--no-cache")
    for item in args.build_arg:
        command.extend(("--build-arg", item))
    command.extend(("--build-arg", f"PHP_VERSION={php_version}"))
    command.extend(("--build-arg", f"EMSDK_VERSION={args.emsdk_version}"))
    command.append(str(context))
    return command


def run_build(args, *, context: Path, source_sha: str, input_sha: str, php_version: str,
              phase: str, sample: int, no_cache: bool, output: Path, run_id: str) -> dict:
    slug = f"{phase}-{sample:02d}"
    raw_path = output / "raw" / f"{slug}.log"
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    tag = f"{args.tag_prefix}:{run_id[:12]}-{slug}"
    command = build_command(args, context, php_version, tag, no_cache, raw_path)
    started = datetime.now(timezone.utc).isoformat()
    begin = time.perf_counter()
    proc = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=False)
    elapsed = time.perf_counter() - begin
    raw_path.write_text(proc.stdout, encoding="utf-8")
    events = parse_build_events(proc.stdout)
    return {
        "id": slug,
        "phase": phase,
        "sample": sample,
        "status": "succeeded" if proc.returncode == 0 else "failed",
        "exit_code": proc.returncode,
        "started_at": started,
        "duration_seconds": round(elapsed, 3),
        "cache_policy": "disabled" if no_cache else "builder-cache",
        "php_version": php_version,
        "source_sha": source_sha,
        "input_sha": input_sha,
        "context": str(context),
        "tag": tag,
        "command": shlex.join(command),
        "raw_log": str(raw_path.relative_to(output)),
        "metadata_file": str(raw_path.with_suffix(".metadata.json").relative_to(output)),
        **events,
    }


def summarize(records: list[dict]) -> dict:
    measured = [record for record in records if record["phase"] == "measured"]
    failed = [record for record in measured if record["status"] != "succeeded"]
    if failed:
        return {"status": "failed", "reason": "one or more measured builds failed", "failed_runs": [run["id"] for run in failed]}
    return {
        "status": "succeeded",
        "sample_count": len(measured),
        "median_duration_seconds": statistics.median(run["duration_seconds"] for run in measured),
        "median_cache_hits": statistics.median(run["cache_hits"] for run in measured),
        "median_completed_steps": statistics.median(run["completed_steps"] for run in measured),
    }


def validate_args(args) -> tuple[Path, Path, Path | None]:
    if not re.fullmatch(r"[0-9a-fA-F]{40,64}", args.source_sha):
        raise ValueError("--source-sha must be a full Git SHA (40 or 64 hex characters)")
    if not re.fullmatch(r"[0-9a-fA-F]{40,64}", args.input_sha):
        raise ValueError("--input-sha must be a full SHA-1 or SHA-256 identifying the linked inputs")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", args.base_image_digest):
        raise ValueError("--base-image-digest must be sha256:<64 lowercase hex characters>")
    for label, value in (("--warmup-source-sha", args.warmup_source_sha), ("--warmup-input-sha", args.warmup_input_sha)):
        if value and not re.fullmatch(r"[0-9a-fA-F]{40,64}", value):
            raise ValueError(f"{label} must be a full SHA-1 or SHA-256")
    minimum_samples = 1 if args.mode == "cold" else 3
    if args.samples < minimum_samples:
        raise ValueError(f"{args.mode} mode needs at least {minimum_samples} measured sample(s)")
    if not args.builder.startswith("gla96-bench-"):
        raise ValueError("builder name must use the dedicated gla96-bench- prefix")
    context = Path(args.context).resolve(strict=True)
    dockerfile = Path(args.dockerfile)
    if not dockerfile.is_absolute():
        dockerfile = (context / dockerfile).resolve(strict=True)
    else:
        dockerfile = dockerfile.resolve(strict=True)
    if not context.is_dir() or not dockerfile.is_file():
        raise ValueError("context must be a directory and Dockerfile must be an existing file")
    output = Path(args.output).resolve()
    if output.exists() and any(output.iterdir()):
        raise ValueError(f"output directory is not empty; use a new per-experiment path: {output}")
    warmup_context = None
    if args.mode == "cold":
        if args.samples < 1:
            raise ValueError("cold requires at least one sample")
    else:
        warmup_context = Path(args.warmup_context or args.context).resolve(strict=True)
        if not warmup_context.is_dir():
            raise ValueError("warmup context must be a directory")
        if args.mode == "php-version" and args.warmup_php_version == args.php_version:
            raise ValueError("php-version mode requires a different --warmup-php-version")
        if args.mode == "link-input-change" and args.warmup_input_sha == args.input_sha:
            raise ValueError("link-input-change mode requires different --warmup-input-sha")
        if args.mode == "link-input-change" and not args.warmup_input_sha:
            raise ValueError("link-input-change mode requires --warmup-input-sha")
    return context, dockerfile, warmup_context


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--context", required=True, help="immutable source tree build context")
    parser.add_argument("--dockerfile", default="Dockerfile", help="path relative to context or absolute")
    parser.add_argument("--source-sha", required=True, help="full Git SHA for the source tree")
    parser.add_argument("--input-sha", required=True, help="full SHA for the build/link inputs being tracked")
    parser.add_argument("--php-version", required=True, choices=PHP_VERSIONS)
    parser.add_argument("--emsdk-version", required=True)
    parser.add_argument("--base-image-digest", required=True, help="resolved base image digest, sha256:<64 hex>")
    parser.add_argument("--platform", required=True, help="build platform, e.g. linux/arm64")
    parser.add_argument("--host", default=platform.node())
    parser.add_argument("--host-arch", default=platform.machine())
    parser.add_argument("--cpu-allocation", required=True, help="reserved CPU allocation and builder limits")
    parser.add_argument("--builder", required=True, help="dedicated buildx builder name; never the shared default")
    parser.add_argument("--docker", default="docker")
    parser.add_argument("--tag-prefix", default="php-playground-build-bench")
    parser.add_argument("--build-arg", action="append", default=[], metavar="KEY=VALUE")
    parser.add_argument("--mode", choices=("cold", "warm", "php-version", "link-input-change"), required=True)
    parser.add_argument("--samples", type=int, default=1, help="measured samples (>=3 for repeatable modes)")
    parser.add_argument("--warmup-context", help="prior immutable context for warm/input-change measurements")
    parser.add_argument("--warmup-php-version", default="")
    parser.add_argument("--warmup-source-sha", default="")
    parser.add_argument("--warmup-input-sha", default="")
    parser.add_argument("--output", required=True, help="new, dedicated result directory")
    parser.add_argument("--dry-run", action="store_true", help="validate/print plan; does not call Docker")
    return parser


def main() -> int:
    args = make_parser().parse_args()
    try:
        context, dockerfile, warmup_context = validate_args(args)
    except (ValueError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    output = Path(args.output).resolve()
    if args.dry_run:
        print(json.dumps({
            "status": "dry-run", "mode": args.mode, "samples": args.samples,
            "context": str(context), "dockerfile": str(dockerfile), "warmup_context": str(warmup_context) if warmup_context else None,
            "source_sha": args.source_sha, "input_sha": args.input_sha, "php_version": args.php_version,
            "emsdk_version": args.emsdk_version, "base_image_digest": args.base_image_digest,
            "host": args.host, "host_arch": args.host_arch, "platform": args.platform,
            "cpu_allocation": args.cpu_allocation, "builder": args.builder,
            "output": str(output), "docker_invoked": False,
        }, indent=2))
        return 0

    output.mkdir(parents=True, exist_ok=True)
    run_id = str(uuid.uuid4())
    records = []
    env = {
        "docker_version": None,
        "buildx_version": None,
        "host": args.host,
        "host_arch": args.host_arch,
        "platform": args.platform,
        "cpu_allocation": args.cpu_allocation,
        "builder": args.builder,
        "emsdk_version": args.emsdk_version,
        "base_image_digest": args.base_image_digest,
    }
    try:
        for key, command in (("docker_version", [args.docker, "version", "--format", "{{.Client.Version}}"]),
                             ("buildx_version", [args.docker, "buildx", "version"])):
            result = subprocess.run(command, capture_output=True, text=True, check=True)
            env[key] = result.stdout.strip()
        inspect = subprocess.run([args.docker, "buildx", "inspect", args.builder], capture_output=True, text=True, check=True)
        env["builder_inspect_sha256"] = sha256_text(inspect.stdout)
        if args.mode != "cold":
            warm_version = args.warmup_php_version or args.php_version
            warm_sha = args.warmup_source_sha or args.source_sha
            warm_input_sha = args.warmup_input_sha or args.input_sha
            warmup = run_build(args, context=warmup_context, source_sha=warm_sha, input_sha=warm_input_sha,
                               php_version=warm_version, phase="warmup", sample=0, no_cache=False, output=output, run_id=run_id)
            records.append(warmup)
            if warmup["status"] != "succeeded":
                raise RuntimeError("warmup build failed; measured samples were not started")
        for sample in range(1, args.samples + 1):
            record = run_build(args, context=context, source_sha=args.source_sha, input_sha=args.input_sha,
                               php_version=args.php_version, phase="measured", sample=sample,
                               no_cache=args.mode == "cold", output=output, run_id=run_id)
            records.append(record)
    except (subprocess.CalledProcessError, OSError, RuntimeError) as exc:
        env["setup_error"] = str(exc)

    summary = summarize(records)
    if "setup_error" in env:
        summary = {"status": "failed", "reason": "benchmark setup or warmup failed", "error": env["setup_error"]}
    result = {
        "schema_version": 1,
        "run_id": run_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "mode": args.mode,
        "inputs": {
            "source_sha": args.source_sha, "input_sha": args.input_sha,
            "php_version": args.php_version, "emsdk_version": args.emsdk_version,
            "base_image_digest": args.base_image_digest, "context": str(context), "dockerfile": str(dockerfile),
        },
        "environment": env,
        "runs": records,
        "summary": summary,
        "raw_log_manifest_sha256": sha256_text("\n".join(run["raw_log"] for run in records)),
    }
    (output / "results.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"results": str(output / "results.json"), "summary": summary}, indent=2))
    if "setup_error" in env or summary["status"] != "succeeded":
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
