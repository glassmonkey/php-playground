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
WEB_FEATURE_BUILD_ARGS = {
    "WITH_VRZNO": "yes",
    "WITH_LIBXML": "no",
    "WITH_LIBPNG": "no",
    "WITH_LIBZIP": "no",
    "WITH_MBSTRING": "yes",
    "WITH_CLI_SAPI": "no",
    "WITH_OPENSSL": "no",
    "WITH_NODEFS": "no",
    "WITH_CURL": "no",
    "WITH_SQLITE": "no",
    "WITH_MYSQL": "no",
    "WITH_WS_NETWORKING_PROXY": "no",
    "EMSCRIPTEN_ENVIRONMENT": "web",
}
STAGE_LINE = re.compile(r"^#(?P<step>\d+)\s+(?P<detail>.*)$")


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def parse_build_args(items: list[str]) -> dict[str, str]:
    values = {}
    for item in items:
        if "=" not in item:
            raise ValueError(f"--build-arg must be KEY=VALUE: {item}")
        key, value = item.split("=", 1)
        if key in values:
            raise ValueError(f"--build-arg {key} was provided more than once")
        values[key] = value
    return dict(sorted(values.items()))


def validate_web_feature_args(items: list[str]) -> dict[str, str]:
    values = parse_build_args(items)
    for key, expected in WEB_FEATURE_BUILD_ARGS.items():
        if values.get(key) != expected:
            raise ValueError(f"web builds require explicit --build-arg {key}={expected}")
    return values


def linked_input_change_identity(repo_root: Path, parent_revision: str, target_revision: str,
                                 linked_input_path: str, build_input_path: str) -> dict[str, str]:
    changed = subprocess.run(
        ["git", "-C", str(repo_root), "diff", "--name-only", parent_revision, target_revision, "--", build_input_path],
        capture_output=True, text=True, check=True,
    ).stdout.splitlines()
    if changed != [linked_input_path]:
        raise ValueError(f"linked-input variant must change only {linked_input_path} under {build_input_path}; found {changed}")
    patch = subprocess.run(
        ["git", "-C", str(repo_root), "diff", "--no-ext-diff", "--binary", parent_revision, target_revision, "--", linked_input_path],
        capture_output=True, text=True, check=True,
    ).stdout
    patch_id_output = subprocess.run(
        ["git", "-C", str(repo_root), "patch-id", "--stable"],
        input=patch, capture_output=True, text=True, check=True,
    ).stdout.split()
    if not patch_id_output:
        raise ValueError(f"linked-input variant has no content change in {linked_input_path}")
    parent_blob = subprocess.run(
        ["git", "-C", str(repo_root), "rev-parse", f"{parent_revision}:{linked_input_path}"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    target_blob = subprocess.run(
        ["git", "-C", str(repo_root), "rev-parse", f"{target_revision}:{linked_input_path}"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return {
        "path": linked_input_path,
        "parent_blob_sha": parent_blob,
        "target_blob_sha": target_blob,
        "change_patch_id": patch_id_output[0],
    }


def build_schedule(args) -> list[dict]:
    if args.mode == "cold":
        return [
            {"role": "measured", "phase": "measured", "sample": sample,
             "php_version": args.php_version, "php_source_sha": args.php_source_sha,
             "repo_revision": args.repo_revision, "no_cache": True}
            for sample in range(1, args.samples + 1)
        ]
    if args.mode == "warm":
        warm_revision = args.warmup_repo_revision or args.repo_revision
        schedule = [{
            "role": "prime", "phase": "prime", "sample": 0,
            "php_version": args.php_version, "php_source_sha": args.php_source_sha,
            "repo_revision": warm_revision, "no_cache": False,
        }]
        schedule.extend({
            "role": "measured", "phase": "measured", "sample": sample,
            "php_version": args.php_version, "php_source_sha": args.php_source_sha,
            "repo_revision": args.repo_revision, "no_cache": False,
        } for sample in range(1, args.samples + 1))
        return schedule
    if args.mode == "php-version":
        schedule = []
        for sample in range(1, args.samples + 1):
            schedule.extend((
                {"role": "prime", "phase": "prime-switch", "sample": sample,
                 "php_version": args.warmup_php_version, "php_source_sha": args.warmup_php_source_sha,
                 "repo_revision": args.repo_revision, "no_cache": False, "pair_id": f"switch-{sample:02d}"},
                {"role": "measured", "phase": "measured", "sample": sample,
                 "php_version": args.php_version, "php_source_sha": args.php_source_sha,
                 "repo_revision": args.repo_revision, "no_cache": False, "pair_id": f"switch-{sample:02d}"},
            ))
        return schedule
    parent = args.warmup_repo_revision
    return [
        {"role": "prime", "phase": "prime-parent", "sample": 1,
         "php_version": args.php_version, "php_source_sha": args.php_source_sha,
         "repo_revision": parent, "no_cache": False, "variant_id": args.link_input_variant_id},
        {"role": "measured", "phase": "measured", "sample": 1,
         "php_version": args.php_version, "php_source_sha": args.php_source_sha,
         "repo_revision": args.repo_revision, "no_cache": False, "variant_id": args.link_input_variant_id},
    ]


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
              phase: str, sample: int, no_cache: bool, output: Path, run_id: str,
              transition: dict | None = None, feature_build_args: dict | None = None) -> dict:
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
        "transition": transition or {},
        "feature_build_args": feature_build_args or {},
        "feature_signature_sha256": sha256_text(json.dumps(feature_build_args or {}, sort_keys=True, separators=(",", ":"))),
        **events,
    }


def summarize(records: list[dict]) -> dict:
    measured = [record for record in records if record["phase"] == "measured"]
    failed = [record for record in records if record["status"] != "succeeded"]
    if failed:
        return {"status": "failed", "reason": "one or more prime or measured builds failed", "failed_runs": [run["id"] for run in failed]}
    return {
        "status": "succeeded",
        "sample_count": len(measured),
        "median_duration_seconds": statistics.median(run["duration_seconds"] for run in measured),
        "median_cache_hits": statistics.median(run["cache_hits"] for run in measured),
        "median_completed_steps": statistics.median(run["completed_steps"] for run in measured),
    }


def validate_args(args) -> tuple[Path, str, str, str, str | None, dict | None]:
    validate_web_feature_args(args.build_arg)
    for label, value in (("--repo-revision", args.repo_revision), ("--php-source-sha", args.php_source_sha),
                         ("--emsdk-repo-sha", args.emsdk_repo_sha)):
        if not re.fullmatch(r"[0-9a-fA-F]{40,64}", value):
            raise ValueError(f"{label} must be a full Git SHA")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", args.base_image_digest):
        raise ValueError("--base-image-digest must be sha256:<64 lowercase hex characters>")
    for label, value in (("--warmup-repo-revision", args.warmup_repo_revision), ("--warmup-php-source-sha", args.warmup_php_source_sha)):
        if value and not re.fullmatch(r"[0-9a-fA-F]{40,64}", value):
            raise ValueError(f"{label} must be a full Git SHA")
    minimum_samples = 1 if args.mode in ("cold", "link-input-change") else 3
    if args.samples < minimum_samples or (args.mode == "link-input-change" and args.samples != 1):
        requirement = "exactly one sample per immutable variant" if args.mode == "link-input-change" else f"at least {minimum_samples} measured sample(s)"
        raise ValueError(f"{args.mode} mode needs {requirement}")
    if args.mode == "link-input-change" and not args.link_input_variant_id:
        raise ValueError("link-input-change mode requires --link-input-variant-id")
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
    linked_path = Path(args.linked_input_path)
    if linked_path.is_absolute() or ".." in linked_path.parts or not linked_path.parts:
        raise ValueError("--linked-input-path must be a repository-relative path without '..'")
    input_root = Path(args.input_path)
    if linked_path.parts[:len(input_root.parts)] != input_root.parts or len(linked_path.parts) == len(input_root.parts):
        raise ValueError("--linked-input-path must be a file inside --input-path")
    dockerfile = Path(args.dockerfile)
    if dockerfile.is_absolute() or ".." in dockerfile.parts:
        raise ValueError("--dockerfile must be relative to the exported context")
    context_tree_sha = subprocess.run(["git", "-C", str(repo_root), "rev-parse", f"{args.repo_revision}:{args.context_path}"],
                                      capture_output=True, text=True, check=True).stdout.strip()
    repo_dockerfile_path = f"{args.context_path.rstrip('/')}/{dockerfile.as_posix()}"
    subprocess.run(["git", "-C", str(repo_root), "cat-file", "-e", f"{args.repo_revision}:{repo_dockerfile_path}"], check=True)
    input_tree_sha = subprocess.run(["git", "-C", str(repo_root), "rev-parse", f"{args.repo_revision}:{args.input_path}"],
                                    capture_output=True, text=True, check=True).stdout.strip()
    output = Path(args.output).resolve()
    if output.exists() and any(output.iterdir()):
        raise ValueError(f"output directory is not empty; use a new per-experiment path: {output}")
    warmup_input_tree_sha = None
    linked_change = None
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
        if args.mode == "link-input-change":
            linked_change = linked_input_change_identity(
                repo_root, warmup_revision, args.repo_revision, args.linked_input_path, args.input_path,
            )
    return repo_root, context_tree_sha, input_tree_sha, str(dockerfile), warmup_input_tree_sha, linked_change


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
    parser.add_argument("--linked-input-path", default="src/wasm/build-assets/php_wasm.c",
                        help="single source file changed by each linked-input variant")
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
    parser.add_argument("--link-input-variant-id", default="",
                        help="identity for one new comment-only linked-input variant; run one variant per invocation")
    parser.add_argument("--output", required=True, help="new, dedicated result directory")
    parser.add_argument("--dry-run", action="store_true", help="validate/print plan; does not call Docker")
    return parser


def main() -> int:
    args = make_parser().parse_args()
    try:
        repo_root, context_tree_sha, input_tree_sha, dockerfile, warmup_input_tree_sha, linked_change = validate_args(args)
        feature_build_args = validate_web_feature_args(args.build_arg)
    except (ValueError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    output = Path(args.output).resolve()
    schedule = build_schedule(args)
    feature_signature = sha256_text(json.dumps(feature_build_args, sort_keys=True, separators=(",", ":")))
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
            "effective_feature_build_args": feature_build_args,
            "feature_signature_sha256": feature_signature,
            "schedule": schedule,
            "link_input_variant_id": args.link_input_variant_id or None,
            "linked_input_change": linked_change,
            "output": str(output), "docker_invoked": False,
        }, indent=2))
        return 0

    output.mkdir(parents=True, exist_ok=True)
    run_id = str(uuid.uuid4())
    records = []
    target_export = export_context(repo_root, args.repo_revision, args.context_path, output, "target")
    if not (target_export["context"] / dockerfile).is_file():
        raise RuntimeError(f"exported Dockerfile is missing under context: {target_export['context'] / dockerfile}")
    warmup_export = None
    if args.mode != "cold":
        warm_revision = args.warmup_repo_revision or args.repo_revision
        warmup_export = export_context(repo_root, warm_revision, args.context_path, output, "warmup")
        if not (warmup_export["context"] / dockerfile).is_file():
            raise RuntimeError(f"exported warmup Dockerfile is missing under context: {warmup_export['context'] / dockerfile}")
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
        successful_versions = set()
        last_successful_prime = None
        for operation in schedule:
            operation_revision = operation["repo_revision"]
            is_target = operation_revision == args.repo_revision
            exported = target_export if is_target else warmup_export
            operation_context_sha = context_tree_sha if is_target else subprocess.run(
                ["git", "-C", str(repo_root), "rev-parse", f"{operation_revision}:{args.context_path}"],
                capture_output=True, text=True, check=True,
            ).stdout.strip()
            operation_input_sha = input_tree_sha if is_target else warmup_input_tree_sha
            cache_state = {
                "successful_php_versions_built_in_this_invocation": sorted(successful_versions),
                "most_recent_successful_prime_php_version": last_successful_prime,
                "persistent_builder_cache_outside_this_invocation": "unknown; cache is not cleared",
            }
            if operation["role"] == "measured" and args.mode == "php-version":
                cache_state["classification"] = (
                    "warm-switch; both PHP versions were built in this invocation"
                    if args.php_version in successful_versions and last_successful_prime in successful_versions
                    else "prime-before-target; external target cache may preexist; not a first-visit cost claim"
                )
                cache_state["target_php_version"] = args.php_version
                cache_state["primed_php_version"] = last_successful_prime
            if operation["role"] == "measured" and args.mode == "link-input-change":
                cache_state["classification"] = "changed linked input after successful unchanged-parent prime; external cache may preexist"
                cache_state["variant_id"] = args.link_input_variant_id
                cache_state["parent_revision"] = args.warmup_repo_revision
            record = run_build(
                args, context=exported["context"], repo_revision=operation_revision,
                context_tree_sha=operation_context_sha, context_archive_sha=exported["archive_sha256"],
                input_tree_sha=operation_input_sha, php_version=operation["php_version"],
                php_source_sha=operation["php_source_sha"], phase=operation["phase"],
                sample=operation["sample"], no_cache=operation["no_cache"], output=output,
                run_id=run_id, transition={**operation, "cache_state_before": cache_state},
                feature_build_args=feature_build_args,
            )
            records.append(record)
            if operation["role"] == "prime":
                if record["status"] != "succeeded":
                    raise RuntimeError(f"excluded prime failed before its measured transition: {record['id']}")
                last_successful_prime = operation["php_version"]
            if record["status"] == "succeeded":
                successful_versions.add(operation["php_version"])
    except (subprocess.CalledProcessError, OSError, RuntimeError) as exc:
        env["setup_error"] = str(exc)

    summary = summarize(records)
    if "setup_error" in env:
        summary = {"status": "failed", "reason": "benchmark setup or warmup failed", "error": env["setup_error"]}
    result = {
        "schema_version": 2,
        "run_id": run_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "mode": args.mode,
        "feature_build_args": feature_build_args,
        "feature_signature_sha256": feature_signature,
        "schedule": schedule,
        "link_input_variant_id": args.link_input_variant_id or None,
        "linked_input_change": linked_change,
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
