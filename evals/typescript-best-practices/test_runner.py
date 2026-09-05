"""Orchestration checks; the stub grader deliberately does not test TypeScript."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


class RunnerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="ts-eval-runner-test-")
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.harness = root / "harness"
        self.harness.mkdir()
        here = Path(__file__).resolve().parent
        shutil.copy2(here / "run.py", self.harness / "run.py")
        shutil.copy2(here / "run_cli.py", self.harness / "run_cli.py")
        shutil.copy2(here / "task.md", self.harness / "task.md")
        shutil.copytree(here / "fixture", self.harness / "fixture")
        (self.harness / "grade.mjs").write_text(
            "if (process.env.EVAL_TEST_FAIL_ARM && process.argv[2].endsWith(process.env.EVAL_TEST_FAIL_ARM + '.submission')) process.exit(2);\n"
            'console.log(JSON.stringify({summary: {passed: 1, total: 1}, checks: []}));\n')
        self.compiler = root / "typescript"
        (self.compiler / "lib").mkdir(parents=True)
        (self.compiler / "bin").mkdir()
        (self.compiler / "lib/typescript.js").write_text("// Stub; orchestration test only\n")
        (self.compiler / "bin/tsc").write_text("")
        (self.compiler / "package.json").write_text('{"version":"test-stub"}')
        self.skill = root / "skill"
        self.skill.mkdir()
        (self.skill / "SKILL.md").write_text("Test reference\n")
        self.run_root = root / "pair"
        self.call("prepare", "--typescript", str(self.compiler), "--skill", str(self.skill), "--seed", "17")

    def call(self, *args, success=True, env=None):
        result = subprocess.run([sys.executable, str(self.harness / "run.py"), args[0],
                                 "--run-root", str(self.run_root), *args[1:]], text=True, capture_output=True, env=env)
        if success:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout)
        return result

    def test_paired_starters_match_and_reference_policy_differs(self):
        manifest = json.loads((self.run_root / "manifest.json").read_text())
        self.assertEqual({a["condition"] for a in manifest["arms"].values()}, {"with-skill", "without-skill"})
        for relative in ["src/client.ts", "TASK.md", "AGENTS.md", "package.json", "tsconfig.json"]:
            self.assertEqual((self.run_root / "agents/A" / relative).read_bytes(),
                             (self.run_root / "agents/B" / relative).read_bytes())
        for arm, data in manifest["arms"].items():
            prompt = (self.run_root / "prompts" / f"{arm}.md").read_text()
            self.assertEqual("No reference skill is provided" in prompt, data["condition"] == "without-skill")

    def test_frozen_input_tampering_stops_run(self):
        (self.run_root / "evaluation/task.md").write_text("Changed after preparation")
        result = self.call("mark", "--arm", "A", "--event", "start", success=False)
        self.assertIn("Frozen evaluation inputs changed", result.stderr)

    def test_compiler_tampering_stops_run(self):
        (self.compiler / "lib/typescript.js").write_text("Changed compiler")
        result = self.call("mark", "--arm", "A", "--event", "start", success=False)
        self.assertIn("Frozen compiler installation changed", result.stderr)

    def test_completed_snapshot_survives_worktree_edits_and_infrastructure_retry(self):
        for arm in ["A", "B"]:
            self.call("mark", "--arm", arm, "--event", "start")
            self.call("mark", "--arm", arm, "--event", "complete")
        (self.run_root / "agents/A/src/client.ts").write_text("Changed after completion")
        self.assertNotEqual((self.run_root / "results/A.submission/src/client.ts").read_text(),
                            "Changed after completion")
        self.call("grade", success=False, env={**os.environ, "EVAL_TEST_FAIL_ARM": "B"})
        self.assertFalse((self.run_root / "results/A.json").exists())
        self.assertFalse((self.run_root / "results/B.json").exists())
        self.call("grade")

    def test_completed_snapshot_tampering_is_rejected(self):
        for arm in ["A", "B"]:
            self.call("mark", "--arm", arm, "--event", "start")
            self.call("mark", "--arm", arm, "--event", "complete")
        (self.run_root / "results/A.submission/src/client.ts").write_text("Tampered submission")
        result = self.call("grade", success=False)
        self.assertIn("Completed submission changed", result.stderr)

    def test_cli_uses_identical_settings_and_records_failed_arm(self):
        binaries = Path(self.temp.name) / "bin"
        binaries.mkdir()
        codex = binaries / "codex"
        codex.write_text("""#!/usr/bin/env python3
import json, pathlib, sys
args = sys.argv[1:]
if args == ['--version']:
    print('codex-test-stub')
    sys.exit(0)
workspace = pathlib.Path(args[args.index('-C') + 1])
(workspace / 'cli-arguments.json').write_text(json.dumps(args))
prompt = sys.stdin.read()
(workspace / 'received-prompt.md').write_text(prompt)
if workspace.name == 'B':
    print(json.dumps({'type': 'turn.failed', 'error': 'simulated infrastructure error'}))
    sys.exit(1)
pathlib.Path(args[args.index('--output-last-message') + 1]).write_text('Completed stub task')
print(json.dumps({'type': 'thread.started', 'thread_id': 'test-thread'}))
print(json.dumps({'type': 'turn.completed', 'usage': {'input_tokens': 10, 'output_tokens': 2}}))
""")
        codex.chmod(0o755)
        result = subprocess.run([sys.executable, str(self.harness / "run_cli.py"),
                                 "--run-root", str(self.run_root), "--model", "test-model", "--effort", "high"],
                                text=True, capture_output=True, env={**os.environ, "PATH": str(binaries) + os.pathsep + os.environ["PATH"]})
        self.assertEqual(result.returncode, 0, result.stderr)
        execution = json.loads((self.run_root / "cli-execution.json").read_text())
        self.assertEqual(execution["arms"]["A"]["status"], "complete")
        self.assertEqual(execution["arms"]["B"]["status"], "failed")
        self.assertEqual(execution["arms"]["A"]["usage"], [{"input_tokens": 10, "output_tokens": 2}])
        invocations = []
        for arm in ["A", "B"]:
            args = json.loads((self.run_root / "agents" / arm / "cli-arguments.json").read_text())
            invocations.append(args[:args.index('-C')])
            self.assertEqual((self.run_root / "agents" / arm / "received-prompt.md").read_text(),
                             (self.run_root / "prompts" / f"{arm}.md").read_text())
        self.assertEqual(*invocations)
        self.call("grade")

    def test_no_retries_or_early_grading_and_failed_submission_is_retained(self):
        self.call("grade", success=False)
        for arm in ["A", "B"]:
            self.call("mark", "--arm", arm, "--event", "start")
        self.call("mark", "--arm", "A", "--event", "start", success=False)
        (self.run_root / "agents/A/src/extra.ts").write_text("export const added = 1;\n")
        self.call("mark", "--arm", "A", "--event", "complete")
        self.call("mark", "--arm", "B", "--event", "failed")
        self.call("grade")
        summary = json.loads((self.run_root / "results/comparison.json").read_text())
        self.assertEqual(summary["arms"]["B"]["status"], "failed")
        self.assertTrue((self.run_root / "results/A.submission/src/extra.ts").is_file())
        self.call("grade", success=False)


if __name__ == "__main__":
    unittest.main()
