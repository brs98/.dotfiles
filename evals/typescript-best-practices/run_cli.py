#!/usr/bin/env python3
"""Run both prepared arms in fresh Codex CLI sessions with identical settings."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent


def run_pair(root, model, effort, timeout):
    manifest = json.loads((root / "manifest.json").read_text())
    if any(arm["status"] != "prepared" for arm in manifest["arms"].values()):
        raise ValueError("Both arms must be fresh and prepared; use a new run directory")
    metadata_path = root / "cli-execution.json"
    if metadata_path.exists():
        raise ValueError("This pair already has a CLI attempt; create a new pair")
    version = subprocess.run(["codex", "--version"], check=True, capture_output=True, text=True).stdout.strip()
    common = [
        "codex", "exec", "--ignore-user-config", "--ephemeral", "--json",
        "--model", model, "--sandbox", "workspace-write",
        "-c", 'approval_policy="never"', "-c", f'model_reasoning_effort="{effort}"',
        "-c", "project_doc_max_bytes=0",
        "-c", "sandbox_workspace_write.exclude_slash_tmp=true",
        "-c", "sandbox_workspace_write.exclude_tmpdir_env_var=true",
        "--enable", "skip_host_skill_discovery", "--disable", "plugins", "--disable", "multi_agent",
    ]
    metadata = {"model": model, "reasoningEffort": effort, "cliVersion": version,
                "timeoutSecondsPerArm": timeout, "commonArguments": common,
                "notes": "Fresh processes, concurrent execution, no user config or automatic host skills. Read isolation remains instructional.",
                "arms": {}}
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n")

    def mark(arm, event, response=None):
        command = [sys.executable, str(HERE / "run.py"), "mark", "--run-root", str(root),
                   "--arm", arm, "--event", event, "--agent", f"codex-exec-{arm}"]
        if response is not None:
            command.extend(["--response", str(response)])
        subprocess.run(command, check=True, capture_output=True, text=True)

    def participant(arm):
        logs = root / "cli-logs"
        logs.mkdir(exist_ok=True)
        response = logs / f"{arm}.response.md"
        command = [*common, "-C", manifest["arms"][arm]["workspace"],
                   "--output-last-message", str(response), "-"]
        mark(arm, "start")
        timed_out = False
        try:
            with (logs / f"{arm}.jsonl").open("w") as stdout, (logs / f"{arm}.stderr").open("w") as stderr:
                result = subprocess.run(command, input=(root / "prompts" / f"{arm}.md").read_text(),
                                        text=True, stdout=stdout, stderr=stderr, timeout=timeout)
                exit_code = result.returncode
        except subprocess.TimeoutExpired:
            timed_out = True
            exit_code = None
        events = []
        for line in (logs / f"{arm}.jsonl").read_text().splitlines():
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass
        completions = [event for event in events if event.get("type") == "turn.completed"]
        status = "complete" if exit_code == 0 and completions and response.is_file() else "failed"
        mark(arm, status, response if response.is_file() else None)
        return arm, {"status": status, "exitCode": exit_code, "timedOut": timed_out,
                     "usage": [event.get("usage") for event in completions],
                     "threadIds": [event.get("thread_id") for event in events if event.get("type") == "thread.started"]}

    with ThreadPoolExecutor(max_workers=2) as pool:
        for arm, result in pool.map(participant, ["A", "B"]):
            metadata["arms"][arm] = result
            metadata_path.write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-root", type=Path, required=True)
    parser.add_argument("--model", required=True, help="Pin the same available model for both arms")
    parser.add_argument("--effort", choices=["low", "medium", "high", "xhigh"], default="high")
    parser.add_argument("--timeout", type=int, default=900, help="Equal wall-clock limit in seconds per arm")
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    run_pair(args.run_root.resolve(), args.model, args.effort, args.timeout)
