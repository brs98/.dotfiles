import {
  extractMeta,
  runWorkflowScript,
  WorkflowScriptError,
  type AgentInvocation,
  type AgentRunner,
  type JournalRecord,
  type WorkflowJournal,
  type WorkflowProgress,
} from "./host.js";

const META = "export const meta = { name: 'test', description: 'test workflow' }\n";

function makeRunner(
  handler: (invocation: AgentInvocation) => string | Promise<string>,
  costPerCall = 0,
): {
  runner: AgentRunner;
  calls: AgentInvocation[];
} {
  const calls: AgentInvocation[] = [];
  const runner: AgentRunner = async (invocation) => {
    calls.push(invocation);
    return {
      output: await handler(invocation),
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: costPerCall, turns: 1 },
    };
  };
  return { runner, calls };
}

const echoRunner = () => makeRunner((invocation) => `r(${invocation.prompt})`);

function mapJournal(): WorkflowJournal & { store: Map<string, JournalRecord> } {
  const store = new Map<string, JournalRecord>();
  return {
    store,
    get: (key) => store.get(key),
    put: (key, record) => {
      store.set(key, record);
    },
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("extractMeta", () => {
  it("parses name, description, and phases", () => {
    const source =
      "export const meta = {\n" +
      "  name: 'demo',\n" +
      "  description: 'has } braces { in strings',\n" +
      "  phases: [{ title: 'Scan', detail: 'grep { stuff }' }],\n" +
      "}\n" +
      "return 1\n";
    const { meta, body } = extractMeta(source);
    expect(meta.name).toBe("demo");
    expect(meta.description).toBe("has } braces { in strings");
    expect(meta.phases).toEqual([{ title: "Scan", detail: "grep { stuff }" }]);
    expect(body).toContain("const meta =");
    expect(body).not.toContain("export const meta");
  });

  it("rejects scripts without meta", () => {
    expect(() => extractMeta("return 1")).toThrow(WorkflowScriptError);
  });

  it("rejects additional exports", () => {
    expect(() => extractMeta(`${META}export function helper() {}\n`)).toThrow(/other export/);
  });

  it("rejects template interpolation in meta", () => {
    expect(() => extractMeta("export const meta = { name: `a${1}`, description: 'd' }\n")).toThrow(
      /pure literal/,
    );
  });

  it("rejects meta without a description", () => {
    expect(() => extractMeta("export const meta = { name: 'x' }\n")).toThrow(/description/);
  });
});

describe("runWorkflowScript", () => {
  it("runs agents via parallel and returns the script result", async () => {
    const { runner, calls } = echoRunner();
    const script =
      "export const meta = { name: 't', description: 'd', phases: [{ title: 'P1' }] }\n" +
      "phase('P1')\n" +
      "log('starting')\n" +
      "const results = await parallel([\n" +
      "  () => agent('task one', { label: 'a1' }),\n" +
      "  () => agent('task two', { label: 'a2' }),\n" +
      "])\n" +
      "return results\n";

    const { meta, result, progress } = await runWorkflowScript({ script, runner });

    expect(meta.name).toBe("t");
    expect(result).toEqual(["r(task one)", "r(task two)"]);
    expect(calls).toHaveLength(2);
    expect(progress.phases).toEqual(["P1"]);
    expect(progress.logs).toEqual(["starting"]);
    expect(progress.agents.map((a) => a.status)).toEqual(["done", "done"]);
    expect(progress.agents.map((a) => a.phase)).toEqual(["P1", "P1"]);
  });

  it("exposes args to the script", async () => {
    const { runner } = echoRunner();
    const script = `${META}return args.n * 2\n`;
    const { result } = await runWorkflowScript({ script, runner, args: { n: 21 } });
    expect(result).toBe(42);
  });

  it("resolves failed parallel thunks to null", async () => {
    const { runner } = makeRunner((invocation) => {
      if (invocation.prompt.includes("boom")) throw new Error("boom");
      return "ok";
    });
    const script = `${META}return await parallel([() => agent('boom'), () => agent('fine')])\n`;
    const { result, progress } = await runWorkflowScript({ script, runner });
    expect(result).toEqual([null, "ok"]);
    const failed = progress.agents.find((a) => a.status === "error");
    expect(failed?.error).toContain("boom");
  });

  it("propagates a direct agent failure as a workflow failure", async () => {
    const { runner } = makeRunner(() => {
      throw new Error("subagent exploded");
    });
    const script = `${META}return await agent('task')\n`;
    await expect(runWorkflowScript({ script, runner })).rejects.toThrow("subagent exploded");
  });

  it("chains pipeline stages per item with (prev, item, index)", async () => {
    const { runner } = echoRunner();
    const script =
      `${META}return await pipeline([1, 2],\n` +
      "  (item) => agent('s1:' + item),\n" +
      "  (prev, item, index) => agent('s2:' + prev + ':' + item + ':' + index),\n" +
      ")\n";
    const { result } = await runWorkflowScript({ script, runner });
    expect(result).toEqual(["r(s2:r(s1:1):1:0)", "r(s2:r(s1:2):2:1)"]);
  });

  it("does not put a barrier between pipeline stages", async () => {
    const { runner, calls } = makeRunner(async (invocation) => {
      if (invocation.prompt === "s1:slow") await sleep(40);
      return `r(${invocation.prompt})`;
    });
    const script =
      `${META}return await pipeline(['slow', 'fast'],\n` +
      "  (item) => agent('s1:' + item),\n" +
      "  (prev, item) => agent('s2:' + item),\n" +
      ")\n";
    await runWorkflowScript({ script, runner });
    const order = calls.map((c) => c.prompt);
    expect(order.indexOf("s2:fast")).toBeLessThan(order.indexOf("s2:slow"));
  });

  it("drops a pipeline item to null when a stage throws", async () => {
    const { runner } = makeRunner((invocation) => {
      if (invocation.prompt.includes("bad")) throw new Error("nope");
      return "ok";
    });
    const script = `${META}return await pipeline(['bad', 'good'], (item) => agent('x:' + item))\n`;
    const { result } = await runWorkflowScript({ script, runner });
    expect(result).toEqual([null, "ok"]);
  });

  it("reuses journaled results instead of re-running agents", async () => {
    const journal = mapJournal();
    const script = `${META}return await agent('expensive task')\n`;

    const first = echoRunner();
    const run1 = await runWorkflowScript({ script, runner: first.runner, journal });
    expect(first.calls).toHaveLength(1);
    expect(run1.result).toBe("r(expensive task)");

    const second = echoRunner();
    const run2 = await runWorkflowScript({ script, runner: second.runner, journal });
    expect(second.calls).toHaveLength(0);
    expect(run2.result).toBe("r(expensive task)");
    expect(run2.progress.agents.map((a) => a.status)).toEqual(["cached"]);
  });

  it("gives identical repeated calls distinct journal keys", async () => {
    const journal = mapJournal();
    let counter = 0;
    const { runner, calls } = makeRunner(() => `reply-${counter++}`);
    const script =
      `${META}const a = await agent('same prompt')\n` +
      "const b = await agent('same prompt')\n" +
      "return [a, b]\n";
    const { result } = await runWorkflowScript({ script, runner, journal });
    expect(calls).toHaveLength(2);
    expect(result).toEqual(["reply-0", "reply-1"]);
    expect(journal.store.size).toBe(2);
  });

  it("validates schema output and retries once with error feedback", async () => {
    let attempt = 0;
    const { runner, calls } = makeRunner(() => {
      attempt += 1;
      return attempt === 1 ? "sorry, here you go: not json" : '{"a": 2}';
    });
    const script = `${META}return await agent('give json', { schema: { type: 'object', properties: { a: { type: 'number' } }, required: ['a'] } })\n`;
    const { result } = await runWorkflowScript({ script, runner });
    expect(result).toEqual({ a: 2 });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.prompt).toContain("previous reply was invalid");
  });

  it("accepts schema output wrapped in a code fence", async () => {
    const { runner } = makeRunner(() => '```json\n{"a": 7}\n```');
    const script = `${META}return await agent('give json', { schema: { type: 'object', properties: { a: { type: 'number' } }, required: ['a'] } })\n`;
    const { result } = await runWorkflowScript({ script, runner });
    expect(result).toEqual({ a: 7 });
  });

  it("blocks Math.random and Date.now inside scripts", async () => {
    const { runner } = echoRunner();
    await expect(
      runWorkflowScript({ script: `${META}return Math.random()\n`, runner }),
    ).rejects.toThrow(/Math\.random/);
    await expect(
      runWorkflowScript({ script: `${META}return Date.now()\n`, runner }),
    ).rejects.toThrow(/Date\.now/);
    await expect(
      runWorkflowScript({ script: `${META}return new Date()\n`, runner }),
    ).rejects.toThrow(/new Date/);
    const { result } = await runWorkflowScript({
      script: `${META}return new Date(0).toISOString()\n`,
      runner,
    });
    expect(result).toBe("1970-01-01T00:00:00.000Z");
  });

  it("reports syntax errors as WorkflowScriptError", async () => {
    const { runner } = echoRunner();
    await expect(runWorkflowScript({ script: `${META}const = broken\n`, runner })).rejects.toThrow(
      WorkflowScriptError,
    );
  });

  it("limits concurrent agents to maxConcurrency", async () => {
    let active = 0;
    let peak = 0;
    const { runner } = makeRunner(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await sleep(20);
      active -= 1;
      return "ok";
    });
    const script = `${META}return await parallel([1, 2, 3, 4, 5].map((n) => () => agent('task ' + n)))\n`;
    await runWorkflowScript({ script, runner, maxConcurrency: 2 });
    expect(peak).toBe(2);
  });

  it("exposes budget and stops spawning once maxCostUsd is spent", async () => {
    const { runner, calls } = makeRunner(() => "ok", 0.03);
    const script =
      `${META}const outputs = []\n` +
      "for (let i = 0; i < 5; i++) {\n" +
      "  if (budget.total && budget.remaining() <= 0) break\n" +
      "  outputs.push(await agent('task ' + i))\n" +
      "}\n" +
      "return { outputs, total: budget.total, spent: budget.spent() }\n";
    const { result } = await runWorkflowScript({ script, runner, maxCostUsd: 0.05 });
    const r = result as { outputs: string[]; total: number; spent: number };
    expect(calls).toHaveLength(2);
    expect(r.outputs).toEqual(["ok", "ok"]);
    expect(r.total).toBe(0.05);
    expect(r.spent).toBeCloseTo(0.06);
  });

  it("throws from agent() when the budget is exhausted mid-run", async () => {
    const { runner } = makeRunner(() => "ok", 0.03);
    const script = `${META}const a = await agent('one')\nconst b = await agent('two')\nreturn await agent('three')\n`;
    await expect(runWorkflowScript({ script, runner, maxCostUsd: 0.05 })).rejects.toThrow(
      /budget exhausted/,
    );
  });

  it("enforces the spawned-agent cap", async () => {
    const { runner, calls } = makeRunner(() => "ok");
    const script = `${META}for (let i = 0; i < 10; i++) await agent('task ' + i)\nreturn 'done'\n`;
    await expect(runWorkflowScript({ script, runner, maxAgents: 3 })).rejects.toThrow(/agent cap/);
    expect(calls).toHaveLength(3);
  });

  it("rejects oversized parallel and pipeline calls", async () => {
    const { runner } = echoRunner();
    const script = `${META}return await parallel(new Array(1025).fill(() => agent('x')))\n`;
    await expect(runWorkflowScript({ script, runner })).rejects.toThrow(/at most 1024/);
  });

  it("passes role through to the runner and into journal keys", async () => {
    const journal = mapJournal();
    const { runner, calls } = makeRunner((inv) => `r(${inv.options.role ?? "none"})`);
    const script =
      `${META}const a = await agent('same prompt', { role: 'skeptic' })\n` +
      "const b = await agent('same prompt', { role: 'optimist' })\n" +
      "return [a, b]\n";
    const { result } = await runWorkflowScript({ script, runner, journal });
    expect(result).toEqual(["r(skeptic)", "r(optimist)"]);
    expect(calls.map((c) => c.options.role)).toEqual(["skeptic", "optimist"]);
    const keys = [...journal.store.keys()];
    expect(keys[0]?.split("#")[0]).not.toBe(keys[1]?.split("#")[0]);
  });

  it("streams progress snapshots", async () => {
    const { runner } = echoRunner();
    const snapshots: WorkflowProgress[] = [];
    const script = `${META}phase('Only')\nreturn await agent('task', { label: 'worker' })\n`;
    await runWorkflowScript({ script, runner, onProgress: (p) => snapshots.push(p) });
    const statuses = snapshots.flatMap((s) => s.agents.map((a) => `${a.label}:${a.status}`));
    expect(statuses).toContain("worker:running");
    expect(statuses).toContain("worker:done");
  });
});
