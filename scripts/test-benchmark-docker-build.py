#!/usr/bin/env python3
"""Lightweight contract checks for the benchmark harness; never run Docker."""

import importlib.util
import tempfile
from types import SimpleNamespace
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).with_name("benchmark-docker-build.py")
SPEC = importlib.util.spec_from_file_location("benchmark_docker_build", MODULE_PATH)
benchmark = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(benchmark)


class BenchmarkHarnessContractTest(unittest.TestCase):
    def test_buildkit_cache_events_are_attributed_to_stage_lines(self):
        parsed = benchmark.parse_build_events(
            "#1 [internal] load build definition from Dockerfile\n"
            "#2 [base 1/4] RUN apt-get update CACHED\n"
            "#3 [base 2/4] RUN make all DONE 2.3s\n"
            "#4 exporting to image DONE 0.1s\n"
        )
        self.assertEqual(parsed["cache_hits"], 1)
        self.assertEqual(parsed["completed_steps"], 2)
        self.assertEqual(parsed["events"][0]["detail"], "[base 1/4] RUN apt-get update CACHED")

    def test_any_failed_measured_build_disables_success_median(self):
        summary = benchmark.summarize([
            {"id": "measured-01", "phase": "measured", "status": "succeeded", "duration_seconds": 10, "cache_hits": 2, "completed_steps": 4},
            {"id": "measured-02", "phase": "measured", "status": "failed", "duration_seconds": 8, "cache_hits": 1, "completed_steps": 2},
            {"id": "measured-03", "phase": "measured", "status": "succeeded", "duration_seconds": 9, "cache_hits": 2, "completed_steps": 4},
        ])
        self.assertEqual(summary["status"], "failed")
        self.assertNotIn("median_duration_seconds", summary)
        self.assertEqual(summary["failed_runs"], ["measured-02"])

    def test_failed_build_keeps_input_identity_and_matching_raw_log(self):
        args = SimpleNamespace(
            docker="docker", builder="gla96-bench-test", platform="linux/arm64",
            dockerfile=Path("/tmp/Dockerfile"), tag_prefix="bench", build_arg=[], emsdk_version="4.0.22",
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            context = root / "context"
            context.mkdir()
            output = root / "results"
            output.mkdir()
            fake = SimpleNamespace(stdout="#1 [compile 1/1] RUN make FAILED\n", returncode=23)
            with patch.object(benchmark.subprocess, "run", return_value=fake):
                record = benchmark.run_build(
                    args, context=context, source_sha="a" * 40, input_sha="b" * 40,
                    php_version="7.4", phase="measured", sample=1,
                    no_cache=True, output=output, run_id="12345678-1234-1234-1234-123456789012",
                )
            raw_log = output / record["raw_log"]
            self.assertEqual(record["status"], "failed")
            self.assertEqual(record["source_sha"], "a" * 40)
            self.assertEqual(record["input_sha"], "b" * 40)
            self.assertEqual(raw_log.read_text(encoding="utf-8"), fake.stdout)
            summary = benchmark.summarize([record])
            self.assertEqual(summary["status"], "failed")
            self.assertNotIn("median_duration_seconds", summary)

    def test_warmup_is_excluded_from_measured_median(self):
        summary = benchmark.summarize([
            {"id": "warmup-00", "phase": "warmup", "status": "succeeded", "duration_seconds": 100, "cache_hits": 0, "completed_steps": 20},
            {"id": "measured-01", "phase": "measured", "status": "succeeded", "duration_seconds": 8, "cache_hits": 4, "completed_steps": 2},
            {"id": "measured-02", "phase": "measured", "status": "succeeded", "duration_seconds": 10, "cache_hits": 3, "completed_steps": 3},
            {"id": "measured-03", "phase": "measured", "status": "succeeded", "duration_seconds": 9, "cache_hits": 4, "completed_steps": 2},
        ])
        self.assertEqual(summary["median_duration_seconds"], 9)
        self.assertEqual(summary["sample_count"], 3)

    def test_warm_and_cold_policies_are_explicitly_separate(self):
        args = SimpleNamespace(
            docker="docker", builder="gla96-bench-test", platform="linux/arm64",
            dockerfile=Path("/tmp/Dockerfile"), tag_prefix="bench", build_arg=[], emsdk_version="4.0.22",
        )
        cold_command = benchmark.build_command(args, Path("/tmp/context"), "7.4", "bench:cold", True, Path("/tmp/cold.log"))
        warm_command = benchmark.build_command(args, Path("/tmp/context"), "7.4", "bench:warm", False, Path("/tmp/warm.log"))
        self.assertIn("--no-cache", cold_command)
        self.assertNotIn("--no-cache", warm_command)
        cold = benchmark.summarize([
            {"id": "cold-01", "phase": "measured", "status": "succeeded", "duration_seconds": 20, "cache_hits": 0, "completed_steps": 8},
        ])
        warm = benchmark.summarize([
            {"id": "warmup-00", "phase": "warmup", "status": "succeeded", "duration_seconds": 20, "cache_hits": 0, "completed_steps": 8},
            {"id": "measured-01", "phase": "measured", "status": "succeeded", "duration_seconds": 5, "cache_hits": 7, "completed_steps": 1},
            {"id": "measured-02", "phase": "measured", "status": "succeeded", "duration_seconds": 4, "cache_hits": 7, "completed_steps": 1},
            {"id": "measured-03", "phase": "measured", "status": "succeeded", "duration_seconds": 6, "cache_hits": 6, "completed_steps": 2},
        ])
        self.assertEqual(cold["sample_count"], 1)
        self.assertEqual(warm["sample_count"], 3)


if __name__ == "__main__":
    unittest.main()
