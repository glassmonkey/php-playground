#!/usr/bin/env python3
"""Lightweight contract checks for the benchmark harness; never run Docker."""

import importlib.util
import io
import json
import shlex
import subprocess
import sys
import tempfile
from contextlib import redirect_stdout
from types import SimpleNamespace
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).with_name("benchmark-docker-build.py")
SPEC = importlib.util.spec_from_file_location("benchmark_docker_build", MODULE_PATH)
benchmark = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(benchmark)


class BenchmarkHarnessContractTest(unittest.TestCase):
    def test_empty_run_summary_is_failure_not_success_or_exception(self):
        for records in ([], [{"id": "prime-00", "phase": "prime", "status": "succeeded"}]):
            summary = benchmark.summarize(records)
            self.assertEqual(summary["status"], "failed")
            self.assertNotIn("median_duration_seconds", summary)

    def test_immutable_input_manifest_is_atomic_and_not_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            manifest = Path(directory) / "inputs.json"
            value = {"status": "frozen-before-build", "argv": ["docker", "buildx", "build"]}
            benchmark.write_json_atomically(manifest, value, exclusive=True)
            self.assertEqual(json.loads(manifest.read_text()), value)
            with self.assertRaisesRegex(FileExistsError, "immutable input manifest"):
                benchmark.write_json_atomically(manifest, {"status": "different"}, exclusive=True)
            self.assertEqual(json.loads(manifest.read_text()), value)

    def test_frozen_manifest_and_commands_exist_before_build_invocation(self):
        repo = MODULE_PATH.parent.parent
        revision = subprocess.run(
            ["git", "-C", str(repo), "rev-parse", "HEAD"], check=True, capture_output=True, text=True,
        ).stdout.strip()
        fake_docker = '''#!/usr/bin/env python3
import json, sys
from pathlib import Path
a = sys.argv[1:]
if a[0] == "version": print("29.6.2")
elif a[:2] == ["buildx", "version"]: print("buildx v0.30.0")
elif a[:2] == ["buildx", "inspect"]: print("Driver: docker-container\\nmax-parallelism = 1")
elif a[0] == "info": print("2 6209429504")
elif a[0] == "inspect": print(json.dumps([{"HostConfig": {"CpusetCpus":"0-1", "CpuQuota":200000, "CpuPeriod":100000, "Memory":5368709120, "MemorySwap":5368709120}}]))
elif a[:2] == ["buildx", "build"]:
    metadata = Path(a[a.index("--metadata-file") + 1])
    manifest = metadata.parent.parent / "inputs.json"
    if not manifest.is_file():
        print("inputs.json missing before build", file=sys.stderr); raise SystemExit(9)
    launch = metadata.with_name(metadata.name.replace(".metadata.json", ".launch.json"))
    if not launch.is_file():
        print("launch record missing before build", file=sys.stderr); raise SystemExit(10)
    launch_record = json.loads(launch.read_text())
    if launch_record["argv"][1:] != a:
        print("launch argv does not match build invocation", file=sys.stderr); raise SystemExit(11)
    metadata.write_text("{}")
    print("#1 [stage] RUN cached CACHED")
    print("#2 [stage] RUN compile DONE 0.1s")
else: raise SystemExit("unexpected fake Docker argv: " + repr(a))
'''
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fake_path = root / "fake-docker"
            fake_path.write_text(fake_docker)
            fake_path.chmod(0o755)
            output = root / "run"
            argv = [
                "benchmark-docker-build.py", "--repo-root", str(repo), "--repo-revision", revision,
                "--context-path", "src/wasm", "--php-source-sha", "0" * 40,
                "--emsdk-repo-sha", "1" * 40, "--php-version", "5.6", "--emsdk-version", "6.0.13",
                "--base-image-digest", "sha256:" + "a" * 64, "--platform", "linux/arm64",
                "--host", "test-host", "--host-arch", "arm64", "--cpu-allocation", "2 CPUs",
                "--memory-allocation", "VM=6209429504; builder=5368709120; step=4g",
                "--build-resource", "cpuset-cpus=0-1", "--build-resource", "memory=4g",
                "--builder-cpu-set", "0-1", "--builder-cpu-quota", "200000",
                "--builder-memory-bytes", "5368709120", "--builder", "gla96-a3c1",
                "--docker", str(fake_path), "--tag-prefix", "contract:prelaunch",
                "--build-arg", "WITH_VRZNO=yes", "--build-arg", "WITH_LIBXML=no",
                "--build-arg", "WITH_LIBPNG=no", "--build-arg", "WITH_LIBZIP=no",
                "--build-arg", "WITH_MBSTRING=yes", "--build-arg", "WITH_CLI_SAPI=no",
                "--build-arg", "WITH_OPENSSL=no", "--build-arg", "WITH_NODEFS=no",
                "--build-arg", "WITH_CURL=no", "--build-arg", "WITH_SQLITE=no",
                "--build-arg", "WITH_MYSQL=no", "--build-arg", "WITH_WS_NETWORKING_PROXY=no",
                "--build-arg", "EMSCRIPTEN_ENVIRONMENT=web", "--mode", "cold", "--samples", "1",
                "--output", str(output),
            ]
            with patch.object(sys, "argv", argv), redirect_stdout(io.StringIO()):
                self.assertEqual(benchmark.main(), 0)
            inputs = json.loads((output / "inputs.json").read_text())
            result = json.loads((output / "results.json").read_text())
            self.assertEqual(inputs["status"], "frozen-before-build")
            self.assertEqual(inputs["planned_runs"][0]["repo_revision"], revision)
            self.assertEqual(shlex.join(inputs["planned_runs"][0]["argv"]), result["runs"][0]["command"])
            self.assertEqual(inputs["planned_runs"][0]["tag"], result["runs"][0]["tag"])
            self.assertEqual(inputs["planned_runs"][0]["raw_log"], result["runs"][0]["raw_log"])
            self.assertEqual(result["inputs_manifest_sha256"], benchmark.sha256_file(output / "inputs.json"))
            launch = output / result["runs"][0]["launch_record"]
            started = output / result["runs"][0]["started_record"]
            self.assertTrue(launch.is_file())
            self.assertTrue(started.is_file())
            launch_record = json.loads(launch.read_text())
            started_record = json.loads(started.read_text())
            self.assertEqual(launch_record["argv"], inputs["planned_runs"][0]["argv"])
            self.assertEqual(launch_record["command"], result["runs"][0]["command"])
            self.assertTrue(launch_record["spawn_attempt_started_at_utc"])
            self.assertTrue(started_record["process_spawn_observed_at_utc"])
            self.assertGreater(started_record["pid"], 0)
            self.assertEqual(result["runs"][0]["launch_record_sha256"], benchmark.sha256_file(launch))
            self.assertEqual(result["runs"][0]["started_record_sha256"], benchmark.sha256_file(started))
            self.assertEqual(result["runs"][0]["cache_misses"], 1)
            self.assertTrue(result["runs"][0]["ended_at"])
            self.assertEqual(result["summary"]["variability_status"], "insufficient_samples")

    def test_repeatable_sampling_modes_enforce_protocol_counts(self):
        benchmark.validate_sampling_mode("cold", 1)
        for mode in ("warm", "php-version"):
            with self.assertRaisesRegex(ValueError, "at least three"):
                benchmark.validate_sampling_mode(mode, 2)
            benchmark.validate_sampling_mode(mode, 3)
        with self.assertRaisesRegex(ValueError, "exactly one"):
            benchmark.validate_sampling_mode("link-input-change", 3, "variant-01")
        with self.assertRaisesRegex(ValueError, "variant-id"):
            benchmark.validate_sampling_mode("link-input-change", 1)
        benchmark.validate_sampling_mode("link-input-change", 1, "variant-01")

    def test_web_build_features_are_explicit_and_match_makefile(self):
        makefile = (MODULE_PATH.parent.parent / "Makefile").read_text(encoding="utf-8")
        for key, value in benchmark.WEB_FEATURE_BUILD_ARGS.items():
            if key == "EMSCRIPTEN_ENVIRONMENT":
                self.assertIn("PLATFORM := web", makefile)
            else:
                self.assertIn(f"{key} := {value}", makefile)
                self.assertIn(f"--build-arg {key}=$({key})", makefile)
        args = [f"{key}={value}" for key, value in benchmark.WEB_FEATURE_BUILD_ARGS.items()]
        self.assertEqual(benchmark.validate_web_feature_args(args), dict(sorted(benchmark.WEB_FEATURE_BUILD_ARGS.items())))
        with self.assertRaisesRegex(ValueError, "explicit --build-arg WITH_LIBZIP=no"):
            benchmark.validate_web_feature_args([item for item in args if not item.startswith("WITH_LIBZIP=")])

    def test_php_version_schedule_primes_each_measured_transition(self):
        args = SimpleNamespace(
            mode="php-version", samples=3, php_version="8.5", php_source_sha="a" * 40,
            warmup_php_version="7.4", warmup_php_source_sha="b" * 40,
            repo_revision="c" * 40,
        )
        schedule = benchmark.build_schedule(args)
        self.assertEqual([entry["role"] for entry in schedule], ["prime", "measured"] * 3)
        for index in range(3):
            prime, target = schedule[index * 2:index * 2 + 2]
            self.assertEqual(prime["php_version"], "7.4")
            self.assertEqual(target["php_version"], "8.5")
            self.assertEqual(prime["pair_id"], target["pair_id"])
            self.assertEqual(prime["sample"], target["sample"])
        self.assertEqual(len({entry["phase"] + str(entry["sample"]) for entry in schedule}), 6)

    def test_link_input_schedule_pairs_one_variant_with_unchanged_parent(self):
        args = SimpleNamespace(
            mode="link-input-change", samples=1, php_version="7.4", php_source_sha="a" * 40,
            repo_revision="b" * 40, warmup_repo_revision="c" * 40,
            link_input_variant_id="variant-02",
        )
        prime, measured = benchmark.build_schedule(args)
        self.assertEqual(prime["role"], "prime")
        self.assertEqual(prime["repo_revision"], "c" * 40)
        self.assertEqual(measured["repo_revision"], "b" * 40)
        self.assertEqual(prime["variant_id"], measured["variant_id"])
        self.assertEqual(prime["variant_id"], "variant-02")

    def test_link_input_change_identity_pins_blob_and_patch(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            linked = root / "src/wasm/build-assets/php_wasm.c"
            linked.parent.mkdir(parents=True)
            linked.write_text("int php_wasm_entry(void) { return 0; }\n", encoding="utf-8")
            subprocess.run(["git", "-C", str(root), "init", "-q"], check=True)
            subprocess.run(["git", "-C", str(root), "config", "user.email", "test@example.invalid"], check=True)
            subprocess.run(["git", "-C", str(root), "config", "user.name", "Harness Test"], check=True)
            subprocess.run(["git", "-C", str(root), "add", "src/wasm/build-assets/php_wasm.c"], check=True)
            subprocess.run(["git", "-C", str(root), "commit", "-qm", "parent"], check=True)
            parent = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
            linked.write_text(linked.read_text(encoding="utf-8") + "/* behavior-neutral variant-01 */\n", encoding="utf-8")
            subprocess.run(["git", "-C", str(root), "add", "src/wasm/build-assets/php_wasm.c"], check=True)
            subprocess.run(["git", "-C", str(root), "commit", "-qm", "comment variant"], check=True)
            target = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
            identity = benchmark.linked_input_change_identity(
                root, parent, target, "src/wasm/build-assets/php_wasm.c", "src/wasm/build-assets",
            )
            self.assertNotEqual(identity["parent_blob_sha"], identity["target_blob_sha"])
            self.assertEqual(len(identity["change_patch_id"]), 40)
            (linked.parent / "other.txt").write_text("unexpected input change\n", encoding="utf-8")
            subprocess.run(["git", "-C", str(root), "add", "src/wasm/build-assets/other.txt"], check=True)
            subprocess.run(["git", "-C", str(root), "commit", "-qm", "unexpected extra input"], check=True)
            extra_target = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
            with self.assertRaisesRegex(ValueError, "must change only src/wasm/build-assets/php_wasm.c"):
                benchmark.linked_input_change_identity(
                    root, parent, extra_target, "src/wasm/build-assets/php_wasm.c", "src/wasm/build-assets",
                )

    def test_context_export_is_bound_to_git_revision_not_dirty_worktree(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "src/wasm/build-assets").mkdir(parents=True)
            tracked = root / "src/wasm/Dockerfile"
            tracked.write_text("FROM pinned\n", encoding="utf-8")
            (root / "src/wasm/build-assets/input.txt").write_text("baseline\n", encoding="utf-8")
            subprocess.run(["git", "-C", str(root), "init", "-q"], check=True)
            subprocess.run(["git", "-C", str(root), "config", "user.email", "test@example.invalid"], check=True)
            subprocess.run(["git", "-C", str(root), "config", "user.name", "Harness Test"], check=True)
            subprocess.run(["git", "-C", str(root), "add", "src/wasm"], check=True)
            subprocess.run(["git", "-C", str(root), "commit", "-qm", "fixture"], check=True)
            revision = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
            (root / "src/wasm/build-assets/input.txt").write_text("working tree changed\n", encoding="utf-8")
            output = root / "results"
            output.mkdir()
            exported = benchmark.export_context(root, revision, "src/wasm", output, "target")
            self.assertEqual((exported["context"] / "build-assets/input.txt").read_text(encoding="utf-8"), "baseline\n")
            self.assertEqual(len(exported["archive_sha256"]), 64)
            self.assertTrue((exported["context"] / "Dockerfile").is_file())

    def test_buildkit_cache_events_are_attributed_to_stage_lines(self):
        parsed = benchmark.parse_build_events(
            "#1 [internal] load build definition from Dockerfile\n"
            "#2 [base 1/4] RUN apt-get update CACHED\n"
            "#3 [base 2/4] RUN make all DONE 2.3s\n"
            "#4 exporting to image DONE 0.1s\n"
        )
        self.assertEqual(parsed["cache_hits"], 1)
        self.assertEqual(parsed["cache_misses"], 2)
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

    def test_failed_prime_is_retained_and_disables_median(self):
        summary = benchmark.summarize([
            {"id": "prime-switch-01", "phase": "prime-switch", "status": "failed", "duration_seconds": 7, "cache_hits": 0, "completed_steps": 2},
        ])
        self.assertEqual(summary["status"], "failed")
        self.assertEqual(summary["failed_runs"], ["prime-switch-01"])
        self.assertNotIn("median_duration_seconds", summary)

    def test_failed_build_keeps_input_identity_and_matching_raw_log(self):
        args = SimpleNamespace(
            docker="docker", builder="gla96-a3c1", platform="linux/arm64",
            dockerfile=Path("Dockerfile"), tag_prefix="bench", build_arg=[],
            build_resource=["cpuset-cpus=0-1", "memory=4g"], emsdk_version="6.0.13",
            emsdk_repo_sha="d" * 40, base_image="ubuntu", base_image_digest="sha256:" + "e" * 64,
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            context = root / "context"
            context.mkdir()
            output = root / "results"
            output.mkdir()
            fake = SimpleNamespace(stdout="#1 [compile 1/1] RUN make FAILED\n", returncode=23)
            fake_process = SimpleNamespace(stdout=io.StringIO(fake.stdout), wait=lambda: fake.returncode, pid=12345)
            with patch.object(benchmark.subprocess, "Popen", return_value=fake_process):
                record = benchmark.run_build(
                    args, context=context, repo_revision="a" * 40, context_tree_sha="b" * 40,
                    context_archive_sha="c" * 64, input_tree_sha="f" * 40, php_source_sha="e" * 40,
                    php_version="7.4", phase="measured", sample=1,
                    no_cache=True, output=output, run_id="12345678-1234-1234-1234-123456789012",
                )
            raw_log = output / record["raw_log"]
            self.assertEqual(record["status"], "failed")
            self.assertEqual(record["repo_revision"], "a" * 40)
            self.assertEqual(record["context_tree_sha"], "b" * 40)
            self.assertEqual(record["input_tree_sha"], "f" * 40)
            self.assertEqual(record["php_source_sha"], "e" * 40)
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
        self.assertEqual(summary["minimum_duration_seconds"], 8)
        self.assertEqual(summary["maximum_duration_seconds"], 10)
        self.assertEqual(summary["duration_range_seconds"], 2)
        self.assertEqual(summary["median_absolute_deviation_seconds"], 1)
        self.assertEqual(summary["variability_status"], "reported")
        self.assertEqual(summary["median_cache_misses"], 2)

    def test_warm_and_cold_policies_are_explicitly_separate(self):
        args = SimpleNamespace(
            docker="docker", builder="gla96-a3c1", platform="linux/arm64",
            dockerfile=Path("Dockerfile"), tag_prefix="bench", build_arg=[],
            build_resource=["cpuset-cpus=0-1", "memory=4g"], emsdk_version="6.0.13",
            emsdk_repo_sha="d" * 40, base_image="ubuntu", base_image_digest="sha256:" + "e" * 64,
        )
        cold_command = benchmark.build_command(args, Path("/tmp/context"), "7.4", "c" * 40, "bench:cold", True, Path("/tmp/cold.log"))
        warm_command = benchmark.build_command(args, Path("/tmp/context"), "7.4", "c" * 40, "bench:warm", False, Path("/tmp/warm.log"))
        self.assertIn("--no-cache", cold_command)
        self.assertNotIn("--no-cache", warm_command)
        self.assertEqual(cold_command[cold_command.index("--file") + 1], "/tmp/context/Dockerfile")
        self.assertIn("--build-arg", cold_command)
        self.assertIn("--resource", cold_command)
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
        self.assertEqual(cold["variability_status"], "insufficient_samples")
        self.assertEqual(warm["sample_count"], 3)


if __name__ == "__main__":
    unittest.main()
