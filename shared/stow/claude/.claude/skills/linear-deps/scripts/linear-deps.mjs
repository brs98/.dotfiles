#!/usr/bin/env node
/**
 * linear-deps.mjs — Fetch Linear project issues + relations via GraphQL,
 * build a dependency graph, and output a prioritized work order.
 *
 * Usage:
 *   node linear-deps.mjs --project "My Project"
 *   node linear-deps.mjs --project "My Project" --format=json
 *   node linear-deps.mjs --team "Engineering" --state "unstarted,started"
 *
 * Requires: LINEAR_API_KEY environment variable
 *
 * One GraphQL query fetches everything. No MCP round-trips. No token waste.
 */

// --- Args + config ---------------------------------------------------------

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

const projectFilter = getArg("project");
const teamFilter = getArg("team");
const stateFilter = getArg("state"); // comma-separated state names
const formatJson = args.includes("--format=json");
const apiKey = process.env.LINEAR_API_KEY;

if (!apiKey) {
  console.error("Error: LINEAR_API_KEY environment variable is required.");
  console.error("Get one at: Linear Settings > API > Personal API keys");
  process.exit(1);
}

if (!projectFilter && !teamFilter) {
  console.error("Usage: node linear-deps.mjs --project <name|id> [--team <name>] [--state <states>] [--format=json]");
  console.error("  At least --project or --team is required.");
  process.exit(1);
}

// --- GraphQL ---------------------------------------------------------------

const LINEAR_API = "https://api.linear.app/graphql";

async function gql(query, variables = {}) {
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Linear API error ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// --- Fetch project ID if filtering by name ---------------------------------

async function resolveProjectId(nameOrId) {
  const data = await gql(`
    query($filter: ProjectFilter) {
      projects(filter: $filter, first: 50) {
        nodes {
          id
          name
          slugId
        }
      }
    }
  `, {
    filter: {
      or: [
        { name: { containsIgnoreCase: nameOrId } },
        { slugId: { eq: nameOrId } },
      ],
    },
  });

  const projects = data.projects.nodes;
  if (projects.length === 0) {
    return nameOrId;
  }
  const exact = projects.find(
    (p) => p.name.toLowerCase() === nameOrId.toLowerCase()
  );
  return exact ? exact.id : projects[0].id;
}

// --- Fetch all issues with relations in one query --------------------------

async function fetchIssues(projectId) {
  let allIssues = [];
  let hasMore = true;
  let cursor = null;

  const filter = { project: { id: { eq: projectId } } };
  if (teamFilter) {
    filter.team = { name: { containsIgnoreCase: teamFilter } };
  }

  while (hasMore) {
    const data = await gql(`
      query($filter: IssueFilter, $cursor: String) {
        issues(
          filter: $filter
          first: 100
          after: $cursor
          orderBy: updatedAt
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            identifier
            title
            priority
            estimate
            assignee { name }
            state { name type }
            relations {
              nodes {
                type
                relatedIssue {
                  id
                  identifier
                }
              }
            }
          }
        }
      }
    `, { filter, cursor });

    const page = data.issues;
    allIssues.push(...page.nodes);
    hasMore = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
  }

  return allIssues;
}

async function fetchIssuesByTeam(teamName) {
  let allIssues = [];
  let hasMore = true;
  let cursor = null;

  const teamData = await gql(`
    query($filter: TeamFilter) {
      teams(filter: $filter, first: 1) {
        nodes { id name }
      }
    }
  `, { filter: { name: { containsIgnoreCase: teamName } } });

  const team = teamData.teams.nodes[0];
  if (!team) {
    throw new Error(`Team not found: ${teamName}`);
  }

  const filter = { team: { id: { eq: team.id } } };
  if (stateFilter) {
    const stateNames = stateFilter.split(",").map((s) => s.trim());
    filter.state = { type: { in: stateNames } };
  }

  while (hasMore) {
    const data = await gql(`
      query($filter: IssueFilter, $cursor: String) {
        issues(
          filter: $filter
          first: 100
          after: $cursor
          orderBy: updatedAt
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            identifier
            title
            priority
            estimate
            assignee { name }
            state { name type }
            relations {
              nodes {
                type
                relatedIssue {
                  id
                  identifier
                }
              }
            }
          }
        }
      }
    `, { filter, cursor });

    const page = data.issues;
    allIssues.push(...page.nodes);
    hasMore = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
  }

  return allIssues;
}

// --- Build graph -----------------------------------------------------------

function buildGraph(rawIssues) {
  const issueMap = new Map();
  const blockedByGraph = new Map();
  const blocksGraph = new Map();

  for (const raw of rawIssues) {
    const issue = {
      id: raw.id,
      identifier: raw.identifier,
      title: raw.title,
      state: raw.state?.name,
      stateType: raw.state?.type,
      priority: raw.priority,
      assignee: raw.assignee?.name,
      estimate: raw.estimate,
    };
    issueMap.set(raw.id, issue);
    blockedByGraph.set(raw.id, new Set());
    blocksGraph.set(raw.id, new Set());
  }

  for (const raw of rawIssues) {
    const relations = raw.relations?.nodes || [];
    for (const rel of relations) {
      const relatedId = rel.relatedIssue?.id;
      if (!relatedId) continue;

      const type = rel.type;

      if (type === "blocks") {
        blocksGraph.get(raw.id)?.add(relatedId);
        if (blockedByGraph.has(relatedId)) {
          blockedByGraph.get(relatedId).add(raw.id);
        }
      } else if (type === "blockedBy") {
        blockedByGraph.get(raw.id)?.add(relatedId);
        if (blocksGraph.has(relatedId)) {
          blocksGraph.get(relatedId).add(raw.id);
        }
      }
    }
  }

  return { issueMap, blockedByGraph, blocksGraph };
}

// --- Topological sort (Kahn's algorithm) -----------------------------------

function topologicalSort(issueMap, blockedByGraph, blocksGraph) {
  const inDegree = new Map();
  for (const id of issueMap.keys()) {
    const blockers = blockedByGraph.get(id) || new Set();
    const relevant = [...blockers].filter((b) => issueMap.has(b));
    inDegree.set(id, relevant.length);
  }

  const sortByPriority = (a, b) => {
    const issueA = issueMap.get(a);
    const issueB = issueMap.get(b);
    const priA = issueA?.priority ?? 4;
    const priB = issueB?.priority ?? 4;
    if (priA !== priB) return priA - priB;
    const estA = issueA?.estimate ?? 999;
    const estB = issueB?.estimate ?? 999;
    return estA - estB;
  };

  const queue = [...inDegree.entries()]
    .filter(([, deg]) => deg === 0)
    .map(([id]) => id)
    .sort(sortByPriority);

  const sorted = [];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    sorted.push(current);

    const blocking = blocksGraph.get(current) || new Set();
    const newlyReady = [];
    for (const dep of blocking) {
      if (!issueMap.has(dep) || visited.has(dep)) continue;
      const newDeg = (inDegree.get(dep) || 1) - 1;
      inDegree.set(dep, newDeg);
      if (newDeg === 0) newlyReady.push(dep);
    }
    newlyReady.sort(sortByPriority);
    queue.push(...newlyReady);
    queue.sort(sortByPriority);
  }

  const cycled = [...issueMap.keys()].filter((id) => !visited.has(id));
  return { sorted, cycled };
}

// --- Output helpers --------------------------------------------------------

const COMPLETED_TYPES = new Set(["completed", "canceled"]);

function isCompleted(issue) {
  return COMPLETED_TYPES.has(issue?.stateType);
}

function isInProgress(issue) {
  return issue?.stateType === "started";
}

function priorityLabel(p) {
  return { 0: "None", 1: "Urgent", 2: "High", 3: "Normal", 4: "Low" }[p] || "?";
}

function label(issue) {
  return `${issue.identifier}: ${issue.title || "Untitled"}`;
}

// --- Main ------------------------------------------------------------------

async function main() {
  let rawIssues;
  if (projectFilter) {
    const projectId = await resolveProjectId(projectFilter);
    rawIssues = await fetchIssues(projectId);
  } else {
    rawIssues = await fetchIssuesByTeam(teamFilter);
  }

  if (stateFilter && projectFilter) {
    const allowed = new Set(stateFilter.split(",").map((s) => s.trim().toLowerCase()));
    rawIssues = rawIssues.filter(
      (i) => allowed.has(i.state?.type?.toLowerCase()) || allowed.has(i.state?.name?.toLowerCase())
    );
  }

  if (rawIssues.length === 0) {
    console.error("No issues found matching your filters.");
    process.exit(0);
  }

  const { issueMap, blockedByGraph, blocksGraph } = buildGraph(rawIssues);
  const { sorted, cycled } = topologicalSort(issueMap, blockedByGraph, blocksGraph);

  const unblockedIds = [];
  for (const [id, issue] of issueMap) {
    if (isCompleted(issue)) continue;
    const blockers = [...(blockedByGraph.get(id) || [])].filter((b) => {
      const blocker = issueMap.get(b);
      return blocker && !isCompleted(blocker);
    });
    if (blockers.length === 0) unblockedIds.push(id);
  }

  if (formatJson) {
    const result = {
      workOrder: sorted.filter((id) => !isCompleted(issueMap.get(id))).map((id, idx) => {
        const issue = issueMap.get(id);
        const blockers = [...(blockedByGraph.get(id) || [])].filter((b) => issueMap.has(b) && !isCompleted(issueMap.get(b)));
        const blocking = [...(blocksGraph.get(id) || [])].filter((b) => issueMap.has(b) && !isCompleted(issueMap.get(b)));
        return {
          order: idx + 1,
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          state: issue.state,
          stateType: issue.stateType,
          priority: issue.priority,
          priorityLabel: priorityLabel(issue.priority),
          assignee: issue.assignee,
          estimate: issue.estimate,
          blockedBy: blockers.map((b) => issueMap.get(b)?.identifier || b),
          blocks: blocking.map((b) => issueMap.get(b)?.identifier || b),
          isReady: unblockedIds.includes(id),
          isInProgress: isInProgress(issue),
        };
      }),
      inProgress: [...issueMap.values()].filter(isInProgress).map((i) => i.identifier),
      readyToWork: unblockedIds.filter((id) => !isInProgress(issueMap.get(id))).map((id) => issueMap.get(id)?.identifier || id),
      cycles: cycled.map((id) => issueMap.get(id)?.identifier || id),
      summary: {
        total: issueMap.size,
        inProgress: [...issueMap.values()].filter(isInProgress).length,
        ready: unblockedIds.filter((id) => !isInProgress(issueMap.get(id))).length,
        blocked: issueMap.size - unblockedIds.length - [...issueMap.values()].filter(isCompleted).length - cycled.length,
        completed: [...issueMap.values()].filter(isCompleted).length,
        inCycle: cycled.length,
      },
    };
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Human-readable output
  const completedCount = [...issueMap.values()].filter(isCompleted).length;
  const inProgressIds = [...issueMap.entries()]
    .filter(([, issue]) => isInProgress(issue))
    .map(([id]) => id);
  const readyCount = unblockedIds.filter((id) => !isInProgress(issueMap.get(id))).length;
  const blockedCount = issueMap.size - unblockedIds.length - completedCount - cycled.length;

  console.log("=".repeat(60));
  console.log("  LINEAR TASK DEPENDENCY ANALYSIS");
  console.log("=".repeat(60));
  console.log();
  console.log(`Total: ${issueMap.size} | In Progress: ${inProgressIds.length} | Ready: ${readyCount} | Blocked: ${blockedCount} | Done: ${completedCount}${cycled.length ? ` | Cycles: ${cycled.length}` : ""}`);
  console.log();

  if (inProgressIds.length > 0) {
    console.log("-".repeat(60));
    console.log("  IN PROGRESS");
    console.log("-".repeat(60));
    for (const id of inProgressIds) {
      const issue = issueMap.get(id);
      const pri = priorityLabel(issue.priority);
      const assignee = issue.assignee ? ` (${issue.assignee})` : "";
      const blocking = [...(blocksGraph.get(id) || [])].filter((b) => issueMap.has(b) && !isCompleted(issueMap.get(b)));
      const state = issue.state ? ` {${issue.state}}` : "";
      const blockingStr = blocking.length > 0
        ? ` [unblocks: ${blocking.map((b) => issueMap.get(b)?.identifier || b).join(", ")}]`
        : "";
      console.log(`  [${pri}] ${label(issue)}${state}${assignee}${blockingStr}`);
    }
    console.log();
  }

  console.log("-".repeat(60));
  console.log("  READY TO WORK (unblocked, not in progress)");
  console.log("-".repeat(60));
  const readyIssues = unblockedIds
    .filter((id) => !isInProgress(issueMap.get(id)))
    .sort((a, b) => {
      const priA = issueMap.get(a)?.priority ?? 4;
      const priB = issueMap.get(b)?.priority ?? 4;
      return priA - priB;
    });

  if (readyIssues.length === 0) {
    console.log("  (none)");
  } else {
    for (const id of readyIssues) {
      const issue = issueMap.get(id);
      const blocking = [...(blocksGraph.get(id) || [])].filter((b) => issueMap.has(b) && !isCompleted(issueMap.get(b)));
      const state = issue.state ? ` {${issue.state}}` : "";
      const unblockStr = blocking.length > 0
        ? ` [unblocks: ${blocking.map((b) => issueMap.get(b)?.identifier || b).join(", ")}]`
        : "";
      console.log(`  [${priorityLabel(issue.priority)}] ${label(issue)}${state}${unblockStr}`);
    }
  }
  console.log();

  console.log("-".repeat(60));
  console.log("  RECOMMENDED WORK ORDER (topological sort)");
  console.log("-".repeat(60));
  let orderNum = 0;
  for (let i = 0; i < sorted.length; i++) {
    const id = sorted[i];
    const issue = issueMap.get(id);
    if (isCompleted(issue)) continue;
    orderNum++;
    const status = issue.state ? ` {${issue.state}}` : "";
    const ready = unblockedIds.includes(id) && !isInProgress(issue) ? " >> READY" : "";
    const blockers = [...(blockedByGraph.get(id) || [])].filter((b) => issueMap.has(b) && !isCompleted(issueMap.get(b)));
    const blockerStr = blockers.length > 0
      ? `\n       blocked by: ${blockers.map((b) => issueMap.get(b)?.identifier || b).join(", ")}`
      : "";
    console.log(`  ${String(orderNum).padStart(3)}. ${label(issue)}${status}${ready}${blockerStr}`);
  }

  console.log();
  console.log("-".repeat(60));
  console.log("  DEPENDENCY GRAPH");
  console.log("-".repeat(60));

  const hasRelations = [...blocksGraph.values()].some((s) => s.size > 0);
  if (!hasRelations) {
    console.log("  (no blocking relationships found)");
  } else {
    const printed = new Set();
    const roots = [...issueMap.keys()].filter((id) => {
      const blockers = [...(blockedByGraph.get(id) || [])].filter((b) => issueMap.has(b));
      return blockers.length === 0;
    });

    function hasActiveNode(id, seen = new Set()) {
      if (seen.has(id)) return false;
      seen.add(id);
      if (!isCompleted(issueMap.get(id))) return true;
      const dependents = [...(blocksGraph.get(id) || [])].filter((b) => issueMap.has(b));
      return dependents.some((dep) => hasActiveNode(dep, seen));
    }

    function printTree(id, indent = 0, seen = new Set()) {
      if (seen.has(id)) {
        console.log(`${"  ".repeat(indent + 1)}-> ${issueMap.get(id)?.identifier || id} (circular)`);
        return;
      }
      seen.add(id);
      const prefix = "  ".repeat(indent + 1);
      const marker = indent === 0 ? "" : "-> ";
      const state = issueMap.get(id)?.state ? ` {${issueMap.get(id).state}}` : "";
      console.log(`${prefix}${marker}${label(issueMap.get(id))}${state}`);
      printed.add(id);

      const dependents = [...(blocksGraph.get(id) || [])].filter((b) => issueMap.has(b));
      for (const dep of dependents) {
        printTree(dep, indent + 1, new Set(seen));
      }
    }

    for (const root of roots) {
      if ((blocksGraph.get(root)?.size || 0) > 0 && hasActiveNode(root)) {
        printTree(root);
        console.log();
      }
    }

    if (printed.size === 0) {
      console.log("  (no active blocking relationships found)");
    }
  }

  if (cycled.length > 0) {
    console.log();
    console.log("-".repeat(60));
    console.log("  WARNING: CIRCULAR DEPENDENCIES DETECTED");
    console.log("-".repeat(60));
    for (const id of cycled) {
      console.log(`  ${label(issueMap.get(id))}`);
    }
  }

  console.log();
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
