#!/usr/bin/env python3
"""Run an isolated, attributable Docker build benchmark and retain raw evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import shlex
import shutil
import statistics
import subprocess
import sys
import tarfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path


PHP_VERSIONS = ("5.6", "7.0", "7.1", "7.2", "7.3", "7.4", "8.0", "8.1", "8.2", "8.3", "8.4", "8.5")
STAGE_LINE = re.compile(r"^#(?P<step>\d+)\s+(?P<detail>.*)$")


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


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


def build_command(args, context: Path, php_version: str, php_source_sha: str, tag: str,
                  no_cache: bool, log_path: Path) -> list[str]:
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
        str(context / args.dockerfile),
        "--tag",
        tag,
        "--metadata-file",
        str(log_path.with_suffix(".metadata.json")),
    ]
    if no_cache:
        command.append("--no-cache")
    for resource in args.build_resource:
        command.extend(("--resource", resource))
    for item in args.build_arg:
        command.extend(("--build-arg", item))
    command.extend(("--build-arg", f"BASE_IMAGE={args.base_image}@{args.base_image_digest}"))
    command.extend(("--build-arg", f"PHP_VERSION={php_version}"))
    command.extend(("--build-arg", f"PHP_SOURCE_REF={php_source_sha}"))
    command.extend(("--build-arg", f"EMSDK_VERSION={args.emsdk_version}"))
    command.extend(("--build-arg", f"EMSDK_REPO_REF={args.emsdk_repo_sha}"))
    command.append(str(context))
    return command


def run_build(args, *, context: Path, repo_revision: str, context_tree_sha: str,
              context_archive_sha: str, input_tree_sha: str, php_version: str, php_source_sha: str,
              phase: str, sample: int, no_cache: bool, output: Path, run_id: str) -> dict:
    slug = f"{phase}-{sample:02d}"
    raw_path = output / "raw" / f"{slug}.log"
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    tag = f"{args.tag_prefix}:{run_id[:12]}-{slug}"
    command = build_command(args, context, php_version, php_source_sha, tag, no_cache, raw_path)
    started = datetime.now(timezone.utc).isoformat()
    begin = time.perf_counter()
    proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    with raw_path.open("w", encoding="utf-8") as raw_log:
        for line in proc.stdout:
            raw_log.write(line)
            raw_log.flush()
            print(line, end="", flush=True)
        return_code = proc.wait()
    elapsed = time.perf_counter() - begin
    log_text = raw_path.read_text(encoding="utf-8")
    events = parse_build_events(log_text)
    return {
        "id": slug,
        "phase": phase,
        "sample": sample,
        "status": "succeeded" if return_code == 0 else "failed",
        "exit_code": return_code,
        "started_at": started,
        "duration_seconds": round(elapsed, 3),
        "cache_policy": "disabled" if no_cache else "builder-cache",
        "php_version": php_version,
        "repo_revision": repo_revision,
        "context_tree_sha": context_tree_sha,
        "context_archive_sha256": context_archive_sha,
        "input_tree_sha": input_tree_sha,
        "php_source_sha": php_source_sha,
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


def validate_args(args) -> tuple[Path, str, str, str, str | None]:
    for label, value in (("--repo-revision", args.repo_revision), ("--php-source-sha", args.php_source_sha),
                         ("--emsdk-repo-sha", args.emsdk_repo_sha)):
        if not re.fullmatch(r"[0-9a-fA-F]{40,64}", value):
            raise ValueError(f"{label} must be a full Git SHA")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", args.base_image_digest):
        raise ValueError("--base-image-digest must be sha256:<64 lowercase hex characters>")
    for label, value in (("--warmup-repo-revision", args.warmup_repo_revision), ("--warmup-php-source-sha", args.warmup_php_source_sha)):
        if value and not re.fullmatch(r"[0-9a-fA-F]{40,64}", value):
            raise ValueError(f"{label} must be a full Git SHA")
    minimum_samples = 1 if args.mode == "cold" else 3
    if args.samples < minimum_samples:
        raise ValueError(f"{args.mode} mode needs at least {minimum_samples} measured sample(s)")
    if args.builder != "gla96-a3c1":
        raise ValueError("this assignment is restricted to the dedicated gla96-a3c1 builder")
    repo_root = Path(args.repo_root).resolve(strict=True)
    if not repo_root.is_dir():
        raise ValueError("--repo-root must be a Git checkout directory")
    for repo_revision in filter(None, (args.repo_revision, args.warmup_repo_revision)):
        resolved = subprocess.run(["git", "-C", str(repo_root), "rev-parse", "--verify", f"{repo_revision}^{{commit}}"],
                                  capture_output=True, text=True, check=True).stdout.strip()
        if resolved != repo_revision:
            raise ValueError(f"Git resolved {repo_revision} to unexpected commit {resolved}")
    for label, value in (("--context-path", args.context_path), ("--input-path", args.input_path)):
        path = Path(value)
        if path.is_absolute() or ".." in path.parts or not path.parts:
            raise ValueError(f"{label} must be a repository-relative path without '..'")
    dockerfile = Path(args.dockerfile)
    if dockerfile.is_absolute() or ".." in dockerfile.parts:
        raise ValueError("--dockerfile must be relative to the exported context")
    context_tree_sha = subprocess.run(["git", "-C", str(repo_root), "rev-parse", f"{args.repo_revision}:{args.context_path}"],
                                      capture_output=True, text=True, check=True).stdout.strip()
    input_tree_sha = subprocess.run(["git", "-C", str(repo_root), "rev-parse", f"{args.repo_revision}:{args.input_path}"],
                                    capture_output=True, text=True, check=True).stdout.strip()
    output = Path(args.output).resolve()
    if output.exists() and any(output.iterdir()):
        raise ValueError(f"output directory is not empty; use a new per-experiment path: {output}")
    warmup_input_tree_sha = None
    if args.mode == "cold":
        if args.samples < 1:
            raise ValueError("cold requires at least one sample")
    else:
        warmup_revision = args.warmup_repo_revision or args.repo_revision
        warmup_input_tree_sha = subprocess.run(["git", "-C", str(repo_root), "rev-parse", f"{warmup_revision}:{args.input_path}"],
                                               capture_output=True, text=True, check=True).stdout.strip()
        if args.mode == "php-version" and (not args.warmup_php_version or args.warmup_php_version == args.php_version):
            raise ValueError("php-version mode requires a different --warmup-php-version")
        if args.mode == "php-version" and not args.warmup_php_source_sha:
            raise ValueError("php-version mode requires the actual --warmup-php-source-sha")
        if args.mode == "link-input-change" and warmup_input_tree_sha == input_tree_sha:
            raise ValueError("link-input-change mode requires a warmup repo revision with different linked-input tree")
    return repo_root, context_tree_sha, input_tree_sha, str(dockerfile), warmup_input_tree_sha


def export_context(repo_root: Path, revision: str, context_path: str, output: Path, label: str) -> dict:
    contexts = output / "contexts"
    contexts.mkdir(parents=True, exist_ok=True)
    archive = contexts / f"{label}.tar"
    subprocess.run(["git", "-C", str(repo_root), "archive", "--format=tar", "--output", str(archive), revision, context_path], check=True)
    digest = sha256_file(archive)
    destination = contexts / label
    destination.mkdir()
    prefix = context_path.rstrip("/") + "/"
    with tarfile.open(archive, "r:") as bundle:
        for member in bundle.getmembers():
            if not member.name.startswith(prefix):
                continue
            relative = member.name[len(prefix):]
            if not relative:
                continue
            path = Path(relative)
            if path.is_absolute() or ".." in path.parts or member.issym() or member.islnk():
                raise ValueError(f"unsafe or unsupported archive member {member.name}")
            target = destination / path
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                target.parent.mkdir(parents=True, exist_ok=True)
                source = bundle.extractfile(member)
                if source is None:
                    raise ValueError(f"cannot read archive member {member.name}")
                with source, target.open("wb") as output_file:
                    shutil.copyfileobj(source, output_file)
                target.chmod(member.mode & 0o777)
            else:
                raise ValueError(f"unsupported archive member type {member.name}")
    return {"archive": archive, "archive_sha256": digest, "context": destination}


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", required=True, help="repository checkout used only to export immutable Git contexts")
    parser.add_argument("--repo-revision", required=True, help="full repository commit SHA for this build")
    parser.add_argument("--context-path", default="src/wasm", help="repository-relative Docker context directory")
    parser.add_argument("--input-path", default="src/wasm/build-assets", help="repository-relative linked/build inputs to identify")
    parser.add_argument("--dockerfile", default="Dockerfile", help="path relative to exported context")
    parser.add_argument("--php-source-sha", required=True, help="full immutable php-src Git commit SHA")
    parser.add_argument("--emsdk-repo-sha", required=True, help="full immutable emsdk manager repository commit SHA")
    parser.add_argument("--php-version", required=True, choices=PHP_VERSIONS)
    parser.add_argument("--emsdk-version", required=True)
    parser.add_argument("--base-image-digest", required=True, help="resolved base image digest, sha256:<64 hex>")
    parser.add_argument("--base-image", default="ubuntu", help="repository name for the immutable base image")
    parser.add_argument("--platform", required=True, help="build platform, e.g. linux/arm64")
    parser.add_argument("--host", default=platform.node())
    parser.add_argument("--host-arch", default=platform.machine())
    parser.add_argument("--cpu-allocation", required=True, help="reserved CPU allocation and builder limits")
    parser.add_argument("--memory-allocation", required=True, help="VM, builder, and build-step memory limits")
    parser.add_argument("--build-resource", action="append", required=True, metavar="KEY=VALUE", help="Buildx per-step resource limit; repeat for CPU and memory")
    parser.add_argument("--builder-cpu-set", required=True, help="cpuset applied to the dedicated BuildKit container")
    parser.add_argument("--builder-cpu-quota", type=int, required=True, help="BuildKit container CPU quota in microseconds")
    parser.add_argument("--builder-memory-bytes", type=int, required=True, help="BuildKit container memory cap in bytes")
    parser.add_argument("--builder", required=True, help="dedicated buildx builder name; never the shared default")
    parser.add_argument("--docker", default="docker")
    parser.add_argument("--tag-prefix", default="php-playground-build-bench")
    parser.add_argument("--build-arg", action="append", default=[], metavar="KEY=VALUE")
    parser.add_argument("--mode", choices=("cold", "warm", "php-version", "link-input-change"), required=True)
    parser.add_argument("--samples", type=int, default=1, help="measured samples (>=3 for repeatable modes)")
    parser.add_argument("--warmup-repo-revision", default="", help="prior repo SHA for warm/input-change measurements; defaults to target")
    parser.add_argument("--warmup-php-version", default="")
    parser.add_argument("--warmup-php-source-sha", default="")
    parser.add_argument("--output", required=True, help="new, dedicated result directory")
    parser.add_argument("--dry-run", action="store_true", help="validate/print plan; does not call Docker")
    return parser


def main() -> int:
    args = make_parser().parse_args()
    try:
        repo_root, context_tree_sha, input_tree_sha, dockerfile, warmup_input_tree_sha = validate_args(args)
    except (ValueError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    output = Path(args.output).resolve()
    if args.dry_run:
        print(json.dumps({
            "status": "dry-run", "mode": args.mode, "samples": args.samples,
            "repo_revision": args.repo_revision, "repo_context_tree_sha": context_tree_sha,
            "linked_input_tree_sha": input_tree_sha, "php_source_sha": args.php_source_sha,
            "emsdk_repo_sha": args.emsdk_repo_sha, "php_version": args.php_version,
            "emsdk_version": args.emsdk_version, "base_image": args.base_image,
            "base_image_digest": args.base_image_digest,
            "host": args.host, "host_arch": args.host_arch, "platform": args.platform,
            "cpu_allocation": args.cpu_allocation, "memory_allocation": args.memory_allocation,
            "build_resources": args.build_resource, "builder": args.builder,
            "builder_cpu_set": args.builder_cpu_set, "builder_cpu_quota": args.builder_cpu_quota,
            "builder_memory_bytes": args.builder_memory_bytes,
            "output": str(output), "docker_invoked": False,
        }, indent=2))
        return 0

    output.mkdir(parents=True, exist_ok=True)
    run_id = str(uuid.uuid4())
    records = []
    target_export = export_context(repo_root, args.repo_revision, args.context_path, output, "target")
    warmup_export = None
    if args.mode != "cold":
        warm_revision = args.warmup_repo_revision or args.repo_revision
        warmup_export = export_context(repo_root, warm_revision, args.context_path, output, "warmup")
    env = {
        "docker_version": None,
        "buildx_version": None,
        "host": args.host,
        "host_arch": args.host_arch,
        "platform": args.platform,
        "cpu_allocation": args.cpu_allocation,
        "memory_allocation": args.memory_allocation,
        "build_resources": args.build_resource,
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
        (output / "builder.inspect.txt").write_text(inspect.stdout, encoding="utf-8")
        docker_info = subprocess.run([args.docker, "info", "--format", "{{.NCPU}} {{.MemTotal}}"], capture_output=True, text=True, check=True).stdout.strip().split()
        env["docker_vm_cpu_count"] = int(docker_info[0])
        env["docker_vm_memory_bytes"] = int(docker_info[1])
        container_name = f"buildx_buildkit_{args.builder}0"
        limits = subprocess.run([args.docker, "inspect", container_name], capture_output=True, text=True, check=True)
        host_config = json.loads(limits.stdout)[0]["HostConfig"]
        observed_limits = {
            "cpuset_cpus": host_config.get("CpusetCpus", ""),
            "cpu_quota": host_config.get("CpuQuota", 0),
            "cpu_period": host_config.get("CpuPeriod", 0),
            "memory_bytes": host_config.get("Memory", 0),
            "memory_swap_bytes": host_config.get("MemorySwap", 0),
        }
        env["builder_container_limits"] = observed_limits
        env["builder_container_inspect_sha256"] = sha256_text(limits.stdout)
        if observed_limits["cpuset_cpus"] != args.builder_cpu_set or observed_limits["cpu_quota"] != args.builder_cpu_quota or observed_limits["memory_bytes"] != args.builder_memory_bytes:
            raise RuntimeError(f"dedicated builder limits mismatch: {observed_limits}")
        if "max-parallelism = 1" not in inspect.stdout:
            raise RuntimeError("dedicated builder must enforce one parallel BuildKit step")
        if args.mode != "cold":
            warm_version = args.warmup_php_version or args.php_version
            warm_php_sha = args.warmup_php_source_sha or args.php_source_sha
            warm_revision = args.warmup_repo_revision or args.repo_revision
            warmup = run_build(args, context=warmup_export["context"], repo_revision=warm_revision,
                               context_tree_sha=context_tree_sha if warm_revision == args.repo_revision else subprocess.run(
                                   ["git", "-C", str(repo_root), "rev-parse", f"{warm_revision}:{args.context_path}"], capture_output=True, text=True, check=True).stdout.strip(),
                               context_archive_sha=warmup_export["archive_sha256"], input_tree_sha=warmup_input_tree_sha,
                               php_version=warm_version, php_source_sha=warm_php_sha,
                               phase="warmup", sample=0, no_cache=False, output=output, run_id=run_id)
            records.append(warmup)
            if warmup["status"] != "succeeded":
                raise RuntimeError("warmup build failed; measured samples were not started")
        for sample in range(1, args.samples + 1):
            record = run_build(args, context=target_export["context"], repo_revision=args.repo_revision,
                               context_tree_sha=context_tree_sha, context_archive_sha=target_export["archive_sha256"],
                               input_tree_sha=input_tree_sha, php_version=args.php_version, php_source_sha=args.php_source_sha,
                               phase="measured", sample=sample,
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
            "repo_revision": args.repo_revision, "context_tree_sha": context_tree_sha,
            "context_archive": str(target_export["archive"].relative_to(output)),
            "context_archive_sha256": target_export["archive_sha256"],
            "linked_input_tree_sha": input_tree_sha, "php_source_sha": args.php_source_sha,
            "emsdk_repo_sha": args.emsdk_repo_sha, "php_version": args.php_version,
            "emsdk_version": args.emsdk_version, "base_image": args.base_image,
            "base_image_digest": args.base_image_digest,
            "context": str(target_export["context"]), "dockerfile": str(target_export["context"] / dockerfile),
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
