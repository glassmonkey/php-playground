#!/usr/bin/env python3
"""Run one predeclared Buildx command and persist terminal evidence safely."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
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
	
	try:
		with log_path.open("wb") as log:
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
		core["reporting_error"] = f"terminal capture: {type(error).__name__}: {error}"
		atomic_json(result_path, core)

	result = json.loads(result_path.read_text(encoding="utf-8"))
	if reporting_error:
		result["reporting_error"] = reporting_error
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
