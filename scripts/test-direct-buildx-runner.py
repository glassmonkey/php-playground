#!/usr/bin/env python3
"""Docker-free subprocess tests for direct-build terminal recording."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


RUNNER = Path(__file__).with_name("direct-buildx-runner.py")
SPEC = importlib.util.spec_from_file_location("direct_buildx_runner", RUNNER)
assert SPEC and SPEC.loader
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


class DirectBuildxRunnerTest(unittest.TestCase):
	def test_artifact_target_is_output_only_and_default_stage_is_explicit(self) -> None:
		dockerfile = RUNNER.parents[1] / "src/wasm/Dockerfile"
		instructions = [
			line.strip()
			for line in dockerfile.read_text(encoding="utf-8").splitlines()
			if line.strip() and not line.lstrip().startswith("#")
		]
		artifact_stage = instructions.index("FROM scratch AS php-artifacts")
		default_stage = instructions.index("FROM emscripten-php AS default")
		self.assertEqual(
			instructions[artifact_stage + 1 : default_stage],
			["COPY --from=emscripten-php /root/output/ /"],
		)
		self.assertEqual(instructions[-1], "FROM emscripten-php AS default")
		self.assertEqual(default_stage, len(instructions) - 1)

	def make_spec(self, root: Path, exit_code: int) -> Path:
		(root / "raw").mkdir(parents=True, exist_ok=True)
		spec_path = root / "raw" / "runner.spec.json"
		spec_path.write_text(
			json.dumps(
				{
					"run_id": f"exit-{exit_code}",
					"run_dir": str(root),
					"argv": [sys.executable, "-c", f"print('child-output'); raise SystemExit({exit_code})"],
					"cwd": str(root),
					"raw_log": "raw/build.log",
					"started_record": "raw/build.started.json",
					"results_record": "results.json",
					"terminal_record": "terminal-result.json",
					"inputs_sha256": "a" * 64,
					"repo_revision": "b" * 40,
					"php_source_sha": "c" * 40,
					"image_tag": "test:tag",
				},
				indent=2,
				),
			encoding="utf-8",
		)
		return spec_path

	def make_copy_preflight_case(self, root: Path, context: Path) -> tuple[Path, Path]:
		(context / "build-assets").mkdir(parents=True, exist_ok=True)
		(context / "build-assets/ncurses.patch").write_text("patch\n", encoding="utf-8")
		(context / "build-assets/phpwasm-emscripten-library.js").write_text("library\n", encoding="utf-8")
		dockerfile = root / "Dockerfile"
		dockerfile.write_text(
			"FROM scratch AS build\n"
			"COPY build-assets/ncurses.patch /root/ncurses.patch\n"
			"COPY build-assets/phpwasm-emscripten-library.js /root/library.js\n"
			"COPY --from=build /root/result.wasm /result.wasm\n",
			encoding="utf-8",
		)
		return dockerfile, context

	def test_success_exit_and_end_survive_public_launcher(self) -> None:
		with tempfile.TemporaryDirectory() as temp:
			root = Path(temp)
			result = subprocess.run(
				[sys.executable, str(RUNNER), str(self.make_spec(root, 0))],
				capture_output=True,
				text=True,
				check=False,
			)
			self.assertEqual(result.returncode, 0, result.stderr)
			receipt = json.loads((root / "results.json").read_text())
			self.assertEqual(receipt["exit_code"], 0)
			self.assertEqual(receipt["status"], "succeeded")
			self.assertIsNotNone(receipt["observed_start_utc"])
			self.assertIsNotNone(receipt["ended_at_utc"])
			self.assertEqual(receipt["raw_log_sha256"], runner.sha256_file(root / "raw/build.log"))
			self.assertIn("child-output", (root / "raw/build.log").read_text())
			self.assertEqual(json.loads((root / "terminal-result.json").read_text()), receipt)

	def test_child_failure_exit_and_end_survive_public_launcher(self) -> None:
		with tempfile.TemporaryDirectory() as temp:
			root = Path(temp)
			result = subprocess.run(
				[sys.executable, str(RUNNER), str(self.make_spec(root, 7))],
				capture_output=True,
				text=True,
				check=False,
			)
			self.assertEqual(result.returncode, 7, result.stderr)
			receipt = json.loads((root / "results.json").read_text())
			self.assertEqual(receipt["exit_code"], 7)
			self.assertEqual(receipt["status"], "failed")
			self.assertIsNotNone(receipt["ended_at_utc"])
			self.assertTrue(receipt["raw_log_sha256"])
			self.assertEqual(json.loads((root / "terminal-result.json").read_text()), receipt)

	def test_pre_spawn_error_keeps_argv_attempt_end_and_error_receipt(self) -> None:
		with tempfile.TemporaryDirectory() as temp:
			root = Path(temp)
			spec_path = self.make_spec(root, 0)
			spec = json.loads(spec_path.read_text())
			spec["argv"] = [str(root / "missing-executable"), "--version"]
			spec_path.write_text(json.dumps(spec), encoding="utf-8")
			result = subprocess.run(
				[sys.executable, str(RUNNER), str(spec_path)],
				capture_output=True,
				text=True,
				check=False,
			)
			self.assertEqual(result.returncode, 1, result.stderr)
			receipt = json.loads((root / "results.json").read_text())
			self.assertEqual(receipt["status"], "unknown")
			self.assertIsNone(receipt["exit_code"])
			self.assertEqual(receipt["argv"], spec["argv"])
			self.assertEqual(receipt["cwd"], spec["cwd"])
			self.assertIsNotNone(receipt["launch_attempted_at_utc"])
			self.assertIsNone(receipt["observed_start_utc"])
			self.assertIsNotNone(receipt["ended_at_utc"])
			self.assertIn("FileNotFoundError", receipt["spawn_error"])
			self.assertTrue(receipt["raw_log_sha256"])
			self.assertEqual(json.loads((root / "terminal-result.json").read_text()), receipt)

	def test_buildx_metadata_and_local_export_paths_outside_run_dir_reject_before_spawn(self) -> None:
		for bad_option in ("metadata", "export"):
			with self.subTest(bad_option=bad_option), tempfile.TemporaryDirectory() as temp:
				root = Path(temp)
				run_dir = root / "current-run"
				outside = root / "previous-run"
				marker = root / "child-ran.txt"
				spec_path = self.make_spec(run_dir, 0)
				spec = json.loads(spec_path.read_text())
				argv = [
					sys.executable,
					"-c",
					f"from pathlib import Path; Path({str(marker)!r}).write_text('spawned')",
				]
				if bad_option == "metadata":
					argv.extend(["--metadata-file", str(outside / "raw/build.metadata.json")])
				else:
					argv.extend(["--output", f"type=local,dest={outside / 'exported-assets'}"])
				spec["argv"] = argv
				spec_path.write_text(json.dumps(spec), encoding="utf-8")
				result = subprocess.run(
					[sys.executable, str(RUNNER), str(spec_path)],
					capture_output=True,
					text=True,
					check=False,
				)
				self.assertEqual(result.returncode, 1, result.stderr)
				self.assertFalse(marker.exists())
				receipt = json.loads((run_dir / "results.json").read_text())
				self.assertEqual(receipt["status"], "unknown")
				self.assertIsNone(receipt["exit_code"])
				self.assertIsNone(receipt["launch_attempted_at_utc"])
				self.assertIn("outside run directory", receipt["output_path_preflight_error"])
				self.assertEqual(json.loads((run_dir / "terminal-result.json").read_text()), receipt)

	def test_dockerfile_copy_preflight_rejects_repo_root_before_spawn(self) -> None:
		with tempfile.TemporaryDirectory() as temp:
			root = Path(temp)
			repo = root / "repo"
			context = repo / "src/wasm"
			dockerfile, _ = self.make_copy_preflight_case(root, context)
			run_dir = root / "wrong-root-run"
			spec_path = self.make_spec(run_dir, 0)
			spec = json.loads(spec_path.read_text())
			marker = root / "child-ran.txt"
			spec["argv"] = [
				sys.executable,
				"-c",
				f"from pathlib import Path; Path({str(marker)!r}).write_text('spawned')",
				"--file",
				str(dockerfile),
				str(repo),
			]
			spec["preflight"] = {"dockerfile": str(dockerfile), "context": str(repo)}
			spec_path.write_text(json.dumps(spec), encoding="utf-8")
			result = subprocess.run(
				[sys.executable, str(RUNNER), str(spec_path)],
				capture_output=True,
				text=True,
				check=False,
			)
			self.assertEqual(result.returncode, 1, result.stderr)
			self.assertFalse(marker.exists())
			receipt = json.loads((run_dir / "results.json").read_text())
			self.assertEqual(receipt["status"], "unknown")
			self.assertIsNone(receipt["exit_code"])
			self.assertEqual(receipt["argv"], spec["argv"])
			self.assertIsNone(receipt["observed_start_utc"])
			self.assertIsNotNone(receipt["ended_at_utc"])
			self.assertIn("build-assets/ncurses.patch", receipt["preflight_error"])
			self.assertIn(str(repo), receipt["preflight_error"])
			self.assertEqual(json.loads((run_dir / "terminal-result.json").read_text()), receipt)

	def test_dockerfile_copy_preflight_accepts_src_wasm_context(self) -> None:
		with tempfile.TemporaryDirectory() as temp:
			root = Path(temp)
			context = root / "repo/src/wasm"
			dockerfile, _ = self.make_copy_preflight_case(root, context)
			run_dir = root / "correct-root-run"
			spec_path = self.make_spec(run_dir, 0)
			spec = json.loads(spec_path.read_text())
			marker = root / "child-ran.txt"
			spec["argv"] = [
				sys.executable,
				"-c",
				f"from pathlib import Path; Path({str(marker)!r}).write_text('spawned')",
				"--target",
				"build",
				"--file",
				str(dockerfile),
				str(context),
			]
			spec["preflight"] = {"dockerfile": str(dockerfile), "context": str(context)}
			spec_path.write_text(json.dumps(spec), encoding="utf-8")
			result = subprocess.run(
				[sys.executable, str(RUNNER), str(spec_path)],
				capture_output=True,
				text=True,
				check=False,
			)
			self.assertEqual(result.returncode, 0, result.stderr)
			self.assertTrue(marker.exists())
			preflight = json.loads((run_dir / "preflight.json").read_text())
			self.assertEqual(preflight["status"], "passed")
			self.assertEqual(
				[item["source"] for item in preflight["checks"]],
				["build-assets/ncurses.patch", "build-assets/phpwasm-emscripten-library.js"],
			)

	def test_dockerfile_copy_preflight_rejects_unknown_target_before_spawn(self) -> None:
		with tempfile.TemporaryDirectory() as temp:
			root = Path(temp)
			context = root / "repo/src/wasm"
			dockerfile, _ = self.make_copy_preflight_case(root, context)
			run_dir = root / "unknown-target-run"
			spec_path = self.make_spec(run_dir, 0)
			spec = json.loads(spec_path.read_text())
			marker = root / "child-ran.txt"
			spec["argv"] = [
				sys.executable,
				"-c",
				f"from pathlib import Path; Path({str(marker)!r}).write_text('spawned')",
				"--target=php-artifactz",
				"--file",
				str(dockerfile),
				str(context),
			]
			spec["preflight"] = {"dockerfile": str(dockerfile), "context": str(context)}
			spec_path.write_text(json.dumps(spec), encoding="utf-8")
			result = subprocess.run(
				[sys.executable, str(RUNNER), str(spec_path)],
				capture_output=True,
				text=True,
				check=False,
			)
			self.assertEqual(result.returncode, 1, result.stderr)
			self.assertFalse(marker.exists())
			receipt = json.loads((run_dir / "results.json").read_text())
			self.assertEqual(receipt["status"], "unknown")
			self.assertIsNone(receipt["exit_code"])
			self.assertIn("php-artifactz", receipt["preflight_error"])
			self.assertIn("available stages: build", receipt["preflight_error"])

	def test_malformed_base_digest_is_rejected_before_spawn(self) -> None:
		with tempfile.TemporaryDirectory() as temp:
			root = Path(temp)
			run_dir = root / "bad-base-run"
			spec_path = self.make_spec(run_dir, 0)
			spec = json.loads(spec_path.read_text())
			marker = root / "child-ran.txt"
			image = "ubuntu@sha256:" + "a" * 65
			spec["argv"] = [
				sys.executable,
				"-c",
				f"from pathlib import Path; Path({str(marker)!r}).write_text('spawned')",
				"--build-arg",
				f"BASE_IMAGE={image}",
			]
			spec_path.write_text(json.dumps(spec), encoding="utf-8")
			result = subprocess.run(
				[sys.executable, str(RUNNER), str(spec_path)],
				capture_output=True,
				text=True,
				check=False,
			)
			self.assertEqual(result.returncode, 1, result.stderr)
			self.assertFalse(marker.exists())
			receipt = json.loads((run_dir / "results.json").read_text())
			self.assertEqual(receipt["status"], "unknown")
			self.assertIsNone(receipt["exit_code"])
			self.assertIsNone(receipt["observed_start_utc"])
			self.assertIn("64 lowercase hex", receipt["base_image_pin_error"])
			self.assertEqual(json.loads((run_dir / "terminal-result.json").read_text()), receipt)

	def test_base_image_must_match_the_frozen_digest_before_spawn(self) -> None:
		with tempfile.TemporaryDirectory() as temp:
			root = Path(temp)
			run_dir = root / "mismatched-base-run"
			spec_path = self.make_spec(run_dir, 0)
			spec = json.loads(spec_path.read_text())
			marker = root / "child-ran.txt"
			expected = "ubuntu@sha256:" + "a" * 64
			actual = "ubuntu@sha256:" + "b" * 64
			spec["argv"] = [
				sys.executable,
				"-c",
				f"from pathlib import Path; Path({str(marker)!r}).write_text('spawned')",
				"--build-arg",
				f"BASE_IMAGE={actual}",
			]
			spec["expected_base_image"] = expected
			spec_path.write_text(json.dumps(spec), encoding="utf-8")
			result = subprocess.run(
				[sys.executable, str(RUNNER), str(spec_path)],
				capture_output=True,
				text=True,
				check=False,
			)
			self.assertEqual(result.returncode, 1, result.stderr)
			self.assertFalse(marker.exists())
			receipt = json.loads((run_dir / "results.json").read_text())
			self.assertEqual(receipt["status"], "unknown")
			self.assertIsNone(receipt["exit_code"])
			self.assertIn("does not match frozen base", receipt["base_image_pin_error"])

	def test_optional_log_hash_reporting_error_keeps_child_terminal(self) -> None:
		with tempfile.TemporaryDirectory() as temp:
			root = Path(temp)
			spec = self.make_spec(root, 3)
			original_hash = runner.sha256_file
			try:
				runner.sha256_file = lambda _path: (_ for _ in ()).throw(OSError("injected hash failure"))
				self.assertEqual(runner.execute(spec), 3)
			finally:
				runner.sha256_file = original_hash
			receipt = json.loads((root / "results.json").read_text())
			self.assertEqual(receipt["exit_code"], 3)
			self.assertEqual(receipt["status"], "failed")
			self.assertTrue(receipt["ended_at_utc"])
			self.assertIn("reporting_error", receipt)

	def test_start_record_reporting_error_does_not_abandon_child(self) -> None:
		with tempfile.TemporaryDirectory() as temp:
			root = Path(temp)
			spec = self.make_spec(root, 0)
			original_write = runner.atomic_json
			def fail_start_record(path: Path, value: dict) -> None:
				if path.name == "build.started.json":
					raise OSError("injected start-record failure")
				original_write(path, value)
			try:
				runner.atomic_json = fail_start_record
				self.assertEqual(runner.execute(spec), 0)
			finally:
				runner.atomic_json = original_write
			receipt = json.loads((root / "results.json").read_text())
			self.assertEqual(receipt["exit_code"], 0)
			self.assertEqual(receipt["status"], "succeeded")
			self.assertIn("start record", receipt["reporting_error"])
			self.assertIn("child-output", (root / "raw/build.log").read_text())


if __name__ == "__main__":
	unittest.main(verbosity=2)
