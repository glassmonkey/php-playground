#!/usr/bin/env python3
"""Run one predeclared Buildx command and persist terminal evidence safely."""

from __future__ import annotations

import argparse
import datetime as dt
import glob
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
from typing import Any


def utc_now() -> str:
	return dt.datetime.now(dt.timezone.utc).isoformat(timespec="microseconds").replace(
		"+00:00", "Z"
	)


def atomic_json(path: Path, value: dict[str, Any]) -> None:
	path.parent.mkdir(parents=True, exist_ok=True)
	tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
	with tmp.open("w", encoding="utf-8") as output:
		json.dump(value, output, ensure_ascii=False, indent=2)
		output.write("\n")
		output.flush()
		os.fsync(output.fileno())
	os.replace(tmp, path)


def sha256_file(path: Path) -> str:
	digest = hashlib.sha256()
	with path.open("rb") as source:
		for chunk in iter(lambda: source.read(1024 * 1024), b""):
			digest.update(chunk)
	return digest.hexdigest()


BASE_IMAGE_REFERENCE_RE = re.compile(r"^[^@\s]+@sha256:[0-9a-f]{64}$")
BASE_IMAGE_BUILD_ARG_RE = re.compile(r"^BASE_IMAGE=(.+)$")


def validate_base_image_pin(argv: list[str], expected: str) -> dict[str, str]:
	"""Require the frozen base reference to match the Buildx BASE_IMAGE arg."""
	if not BASE_IMAGE_REFERENCE_RE.fullmatch(expected):
		raise ValueError(
			"expected_base_image must be <image>@sha256:<64 lowercase hex characters>"
		)
	actual_values: list[str] = []
	index = 0
	while index < len(argv):
		argument = argv[index]
		if argument == "--build-arg":
			if index + 1 >= len(argv):
				raise ValueError("--build-arg requires a value")
			value = argv[index + 1]
			index += 2
		elif argument.startswith("--build-arg="):
			value = argument.split("=", 1)[1]
			index += 1
		else:
			index += 1
			continue
		match = BASE_IMAGE_BUILD_ARG_RE.fullmatch(value)
		if match:
			actual_values.append(match.group(1))
	if len(actual_values) != 1:
		raise ValueError(f"expected exactly one BASE_IMAGE build arg, found {len(actual_values)}")
	actual = actual_values[0]
	if not BASE_IMAGE_REFERENCE_RE.fullmatch(actual):
		raise ValueError("BASE_IMAGE must be <image>@sha256:<64 lowercase hex characters>")
	if actual != expected:
		raise ValueError(f"BASE_IMAGE {actual!r} does not match frozen base {expected!r}")
	return {"expected_base_image": expected, "actual_base_image": actual, "status": "passed"}


def preflight_copy_sources(dockerfile: Path, context: Path) -> dict[str, Any]:
	dockerfile = dockerfile.resolve(strict=True)
	context = context.resolve(strict=True)
	if not dockerfile.is_file() or not context.is_dir():
		raise ValueError("preflight Dockerfile must be a file and context must be a directory")
	lines: list[str] = []
	continued = ""
	for line in dockerfile.read_text(encoding="utf-8").splitlines():
		stripped = line.strip()
		if not continued and (not stripped or stripped.startswith("#")):
			continue
		continued += stripped[:-1] + " " if stripped.endswith("\\") else stripped
		if stripped.endswith("\\"):
			continue
		lines.append(continued)
		continued = ""
	if continued:
		lines.append(continued)

	checks: list[dict[str, Any]] = []
	for instruction in lines:
		match = re.match(r"(?i)^COPY\s+(.+)$", instruction)
		if not match:
			continue
		payload = match.group(1).strip()
		if payload.startswith("["):
			parts = json.loads(payload)
			if not isinstance(parts, list) or len(parts) < 2:
				raise ValueError(f"invalid JSON COPY instruction: {instruction}")
			if not all(isinstance(part, str) for part in parts):
				raise ValueError(f"non-string JSON COPY path: {instruction}")
			parts = parts
		else:
			parts = shlex.split(payload)
		flags: list[str] = []
		while parts and parts[0].startswith("--"):
			flags.append(parts.pop(0))
		if any(flag == "--from" or flag.startswith("--from=") for flag in flags):
			continue
		if len(parts) < 2:
			raise ValueError(f"COPY has no source and destination: {instruction}")
		for source in parts[:-1]:
			if "$" in source:
				checks.append({"source": source, "status": "skipped-variable", "instruction": instruction})
				continue
			candidate = (context / source.lstrip("/"))
			if "*" in source or "?" in source or "[" in source:
				matches = sorted(Path(item) for item in glob.glob(str(candidate), recursive=True))
			else:
				matches = [candidate] if candidate.exists() else []
			valid = [item for item in matches if item.resolve(strict=False).is_relative_to(context)]
			if not valid:
				raise FileNotFoundError(f"Dockerfile COPY source {source!r} has no match under context {context}")
			checks.append({
				"source": source,
				"status": "found",
				"matches": [str(item.relative_to(context)) for item in valid],
				"instruction": instruction,
			})
	return {"status": "passed", "dockerfile": str(dockerfile), "context": str(context), "checks": checks}


def validate_buildx_preflight(argv: list[str], cwd: Path, preflight: dict[str, Any]) -> dict[str, Any]:
	cwd = cwd.resolve(strict=True)
	context_arg = argv[-1]
	if context_arg == "-" or "://" in context_arg:
		raise ValueError("Dockerfile COPY preflight requires a local Buildx context")
	context_arg_path = Path(context_arg)
	command_context = (cwd / context_arg_path).resolve(strict=True) if not context_arg_path.is_absolute() else context_arg_path.resolve(strict=True)
	file_arg = None
	for index, arg in enumerate(argv):
		if arg in ("--file", "-f"):
			if index + 1 >= len(argv):
				raise ValueError(f"{arg} requires a Dockerfile path")
			file_arg = argv[index + 1]
		elif arg.startswith("--file="):
			file_arg = arg.split("=", 1)[1]
	if file_arg is None:
		command_dockerfile = command_context / "Dockerfile"
	else:
		file_path = Path(file_arg)
		command_dockerfile = (cwd / file_path) if not file_path.is_absolute() else file_path
	command_dockerfile = command_dockerfile.resolve(strict=True)
	requested_context = Path(preflight["context"]).resolve(strict=True)
	requested_dockerfile = Path(preflight["dockerfile"]).resolve(strict=True)
	if command_context != requested_context:
		raise ValueError(
			f"preflight context {requested_context} does not match Buildx argv context {command_context}"
		)
	if command_dockerfile != requested_dockerfile:
		raise ValueError(
			f"preflight Dockerfile {requested_dockerfile} does not match Buildx argv Dockerfile {command_dockerfile}"
		)
	target = None
	for index, arg in enumerate(argv):
		if arg == "--target":
			if index + 1 >= len(argv):
				raise ValueError("--target requires a named Dockerfile stage")
			target = argv[index + 1]
		elif arg.startswith("--target="):
			target = arg.split("=", 1)[1]
		if target == "":
			raise ValueError("--target requires a named Dockerfile stage")
	if target:
		stage_names = {
			match.group(1)
			for line in command_dockerfile.read_text(encoding="utf-8").splitlines()
			if (match := re.match(r"^\s*FROM\b.*\s+AS\s+([^\s#]+)", line, re.IGNORECASE))
		}
		if target not in stage_names:
			raise ValueError(
				f"Buildx target {target!r} is not a named stage in {command_dockerfile}; "
				f"available stages: {', '.join(sorted(stage_names))}"
			)
	return preflight_copy_sources(command_dockerfile, command_context)


def execute(spec_path: Path) -> int:
	spec = json.loads(spec_path.read_text(encoding="utf-8"))
	argv = spec["argv"]
	if not isinstance(argv, list) or not argv or not all(isinstance(arg, str) for arg in argv):
		raise ValueError("spec argv must be a nonempty array of strings")
	root = Path(spec.get("run_dir", spec_path.parent))
	if not root.is_absolute():
		raise ValueError("spec run_dir must be absolute")
	log_path = root / spec["raw_log"]
	started_path = root / spec["started_record"]
	result_path = root / spec["results_record"]
	terminal_path = root / spec["terminal_record"]
	started = None
	launch_attempted = None
	ended = None
	exit_code = None
	spawn_error = None
	wait_error = None
	reporting_error = None
	pid = None
	preflight_data = None
	preflight_error = None
	base_image_pin = None
	base_image_pin_error = None
	if spec.get("expected_base_image") is not None:
		try:
			base_image_pin = validate_base_image_pin(argv, spec["expected_base_image"])
		except ValueError as error:
			base_image_pin_error = f"{type(error).__name__}: {error}"
	if spec.get("preflight"):
		try:
			preflight_data = validate_buildx_preflight(
				argv,
				Path(spec["cwd"]),
				spec["preflight"],
			)
		except (OSError, ValueError, json.JSONDecodeError) as error:
			preflight_error = f"{type(error).__name__}: {error}"
			preflight_data = {
				"status": "failed",
				"dockerfile": spec["preflight"].get("dockerfile"),
				"context": spec["preflight"].get("context"),
				"checks": [],
			}
	
	if preflight_error or base_image_pin_error:
		ended = utc_now()
		with log_path.open("wb") as log:
			if base_image_pin_error:
				log.write((f"base image pin preflight failed: {base_image_pin_error}\n").encode())
			if preflight_error:
				log.write((f"Dockerfile COPY preflight failed: {preflight_error}\n").encode())
			log.flush()
			os.fsync(log.fileno())
		core = terminal_result(spec, pid, started, ended, exit_code, spawn_error, wait_error, None)
		core["preflight"] = preflight_data
		core["base_image_pin"] = base_image_pin
		core["base_image_pin_error"] = base_image_pin_error
		core["preflight_error"] = preflight_error
		atomic_json(result_path, core)
	else:
		try:
			with log_path.open("wb") as log:
				if preflight_data:
					atomic_json(root / spec.get("preflight_record", "preflight.json"), preflight_data)
				launch_attempted = utc_now()
				try:
					process = subprocess.Popen(
						argv,
						cwd=spec["cwd"],
						stdout=log,
						stderr=subprocess.STDOUT,
					)
				except OSError as error:
					spawn_error = f"{type(error).__name__}: {error}"
					ended = utc_now()
					log.flush()
					os.fsync(log.fileno())
					atomic_json(
						result_path,
						terminal_result(
							spec,
							pid,
							started,
							ended,
							exit_code,
							spawn_error,
							wait_error,
							launch_attempted,
						),
					)
				else:
					pid = process.pid
					started = utc_now()
					try:
						atomic_json(
							started_path,
							{
								"kind": "direct-buildx-start",
								"run_id": spec["run_id"],
								"pid": pid,
								"started_at_utc": started,
								"argv": argv,
								"inputs_sha256": spec.get("inputs_sha256"),
								"raw_log": spec["raw_log"],
							},
						)
					except OSError as error:
						# A reporting failure must never abandon a successfully spawned build.
						reporting_error = f"start record: {type(error).__name__}: {error}"
					print(
						json.dumps(
							{
								"state": "started",
								"run_id": spec["run_id"],
								"pid": pid,
								"started_at_utc": started,
								"raw_log": str(log_path),
							}
						),
						flush=True,
					)
					try:
						exit_code = process.wait()
					except OSError as error:
						wait_error = f"{type(error).__name__}: {error}"
					finally:
						ended = utc_now()
						try:
							log.flush()
							os.fsync(log.fileno())
						except OSError as error:
							wait_error = wait_error or f"log flush: {type(error).__name__}: {error}"
						# Save child terminal status while the log is still open. Optional
						# hashing/metadata/reporting below cannot erase the exit evidence.
						core = terminal_result(
							spec,
							pid,
							started,
							ended,
							exit_code,
							spawn_error,
							wait_error,
							launch_attempted,
						)
						if preflight_data:
							core["preflight"] = preflight_data
						if reporting_error:
							core["reporting_error"] = reporting_error
						atomic_json(result_path, core)
		except OSError as error:
			if ended is None:
				ended = utc_now()
			spawn_error = spawn_error or f"{type(error).__name__}: {error}"
			core = terminal_result(
				spec,
				pid,
				started,
				ended,
				exit_code,
				spawn_error,
				wait_error,
				launch_attempted,
			)
			if preflight_data:
				core["preflight"] = preflight_data
			core["reporting_error"] = f"terminal capture: {type(error).__name__}: {error}"
			atomic_json(result_path, core)

	result = json.loads(result_path.read_text(encoding="utf-8"))
	if reporting_error:
		result["reporting_error"] = reporting_error
	if preflight_data:
		result["preflight"] = preflight_data
	if base_image_pin:
		result["base_image_pin"] = base_image_pin
	if base_image_pin_error:
		result["base_image_pin_error"] = base_image_pin_error
	if preflight_error:
		result["preflight_error"] = preflight_error
	try:
		result["raw_log_sha256"] = sha256_file(log_path)
	except OSError as error:
		result["reporting_error"] = f"raw log hash: {type(error).__name__}: {error}"
	atomic_json(result_path, result)
	atomic_json(terminal_path, result)
	print(
		json.dumps(
			{
				"state": "terminal",
				"run_id": spec["run_id"],
				"exit_code": exit_code,
				"ended_at_utc": ended,
				"status": result["status"],
				"results_record": str(result_path),
			}
		),
		flush=True,
	)
	return exit_code if exit_code is not None else 1


def terminal_result(
	spec: dict[str, Any],
	pid: int | None,
	started: str | None,
	ended: str | None,
	exit_code: int | None,
	spawn_error: str | None,
	wait_error: str | None,
	launch_attempted: str | None,
) -> dict[str, Any]:
	status = "unknown" if exit_code is None else ("succeeded" if exit_code == 0 else "failed")
	result = {
		"kind": spec.get("result_kind", "correctness-build-result"),
		"benchmark_eligible": False,
		"run_id": spec["run_id"],
		"pid": pid,
		"status": status,
		"exit_code": exit_code,
		"argv": spec["argv"],
		"cwd": spec["cwd"],
		"launch_attempted_at_utc": launch_attempted,
		"observed_start_utc": started,
		"ended_at_utc": ended,
		"raw_log": spec["raw_log"],
		"image_tag": spec.get("image_tag"),
		"image_digest": None,
		"repo_revision": spec.get("repo_revision"),
		"php_source_sha": spec.get("php_source_sha"),
		"inputs_sha256": spec.get("inputs_sha256"),
		"spawn_error": spawn_error,
		"preflight_error": None,
		"wait_or_log_error": wait_error,
	}
	result.update(spec.get("result_fields", {}))
	return result


def main() -> int:
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument("spec", type=Path, help="frozen JSON launch spec")
	args = parser.parse_args()
	return execute(args.spec)


if __name__ == "__main__":
	sys.exit(main())
