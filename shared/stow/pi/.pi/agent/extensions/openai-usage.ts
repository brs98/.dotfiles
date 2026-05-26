import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const OPENAI_CODEX_PROVIDER = "openai-codex";
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const USAGE_SETTINGS_URL = "https://chatgpt.com/codex/settings/usage";
const REQUEST_TIMEOUT_MS = 15_000;

type JsonObject = Record<string, unknown>;

type RateLimitWindow = {
  used_percent?: number;
  limit_window_seconds?: number;
  reset_after_seconds?: number;
  reset_at?: number;
};

type RateLimit = {
  allowed?: boolean;
  limit_reached?: boolean;
  primary_window?: RateLimitWindow | null;
  secondary_window?: RateLimitWindow | null;
};

type AdditionalRateLimit = {
  limit_name?: string;
  metered_feature?: string;
  rate_limit?: RateLimit | null;
};

type Credits = {
  has_credits?: boolean;
  unlimited?: boolean;
  overage_limit_reached?: boolean;
  balance?: string | number;
  approx_local_messages?: unknown;
  approx_cloud_messages?: unknown;
};

type UsagePayload = {
  plan_type?: string;
  rate_limit?: RateLimit | null;
  additional_rate_limits?: AdditionalRateLimit[] | null;
  credits?: Credits | null;
  rate_limit_reached_type?: unknown;
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asUsagePayload(value: unknown): UsagePayload {
  if (!isObject(value)) throw new Error("OpenAI usage response was not a JSON object");
  return value as UsagePayload;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "unknown";
  if (value < 1 && value > 0) return `${value.toFixed(1)}%`;
  return `${Math.round(value)}%`;
}

function formatDuration(seconds: number | undefined): string | undefined {
  if (seconds === undefined) return undefined;
  if (seconds <= 0) return "now";

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 48) return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;

  const days = Math.floor(hours / 24);
  const hourRemainder = hours % 24;
  return hourRemainder === 0 ? `${days}d` : `${days}d ${hourRemainder}h`;
}

function formatReset(window: RateLimitWindow | null | undefined): string {
  if (!window) return "reset unknown";

  const resetAfter = numberOrUndefined(window.reset_after_seconds);
  const relative = formatDuration(resetAfter);
  if (relative) return `resets in ${relative}`;

  const resetAt = numberOrUndefined(window.reset_at);
  if (resetAt) {
    const resetMs = resetAt > 10_000_000_000 ? resetAt : resetAt * 1000;
    return `resets ${new Date(resetMs).toLocaleString()}`;
  }

  return "reset unknown";
}

function formatWindow(
  label: string,
  window: RateLimitWindow | null | undefined,
): string | undefined {
  if (!window) return undefined;

  const used = numberOrUndefined(window.used_percent);
  const remaining = used === undefined ? undefined : Math.max(0, 100 - used);
  const duration = formatDuration(numberOrUndefined(window.limit_window_seconds));
  const durationText = duration ? `/${duration}` : "";

  return `- ${label}${durationText}: ${formatPercent(remaining)} remaining (${formatPercent(used)} used, ${formatReset(window)})`;
}

function formatReached(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (isObject(value) && typeof value.kind === "string") return value.kind;
  return "usage limit reached";
}

function formatCredits(credits: Credits | null | undefined): string | undefined {
  if (!credits) return undefined;
  if (credits.unlimited) return "- Credits: unlimited";

  const parts: string[] = [];
  if (credits.balance !== undefined) parts.push(`balance ${credits.balance}`);
  if (credits.has_credits === false) parts.push("no credits");
  if (credits.overage_limit_reached) parts.push("overage limit reached");

  return parts.length > 0 ? `- Credits: ${parts.join(", ")}` : undefined;
}

function limitTitle(limit: AdditionalRateLimit): string {
  return limit.limit_name || limit.metered_feature || "Additional limit";
}

function formatRateLimit(prefix: string, rateLimit: RateLimit | null | undefined): string[] {
  if (!rateLimit) return [];

  const lines = [
    formatWindow(`${prefix}primary`, rateLimit.primary_window),
    formatWindow(`${prefix}secondary`, rateLimit.secondary_window),
  ].filter((line): line is string => Boolean(line));

  if (rateLimit.limit_reached) lines.push(`- ${prefix}status: limit reached`);
  else if (rateLimit.allowed === false) lines.push(`- ${prefix}status: not allowed`);

  return lines;
}

function formatUsage(payload: UsagePayload): string {
  const lines: string[] = ["OpenAI Codex subscription usage"];

  if (payload.plan_type) lines.push(`Plan: ${payload.plan_type}`);

  const reached = formatReached(payload.rate_limit_reached_type);
  if (reached) lines.push(`Status: ${reached}`);

  const mainLimitLines = formatRateLimit("", payload.rate_limit);
  if (mainLimitLines.length > 0) {
    lines.push("", "Main limits", ...mainLimitLines);
  }

  const credits = formatCredits(payload.credits);
  if (credits) lines.push("", "Credits", credits);

  const additional = payload.additional_rate_limits ?? [];
  for (const limit of additional) {
    const limitLines = formatRateLimit("", limit.rate_limit);
    if (limitLines.length === 0) continue;
    lines.push("", limitTitle(limit), ...limitLines);
  }

  lines.push("", `For the canonical dashboard: ${USAGE_SETTINGS_URL}`);

  return lines.join("\n");
}

async function fetchUsage(token: string, accountId: string | undefined): Promise<UsagePayload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "codex-cli",
    };
    if (accountId) headers["ChatGPT-Account-Id"] = accountId;

    const response = await fetch(USAGE_URL, { headers, signal: controller.signal });
    const text = await response.text();

    if (!response.ok) {
      const detail = text.trim().slice(0, 500) || response.statusText;
      throw new Error(`OpenAI usage request failed (${response.status}): ${detail}`);
    }

    return asUsagePayload(JSON.parse(text));
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OpenAI usage request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getOpenAICodexAccountId(credential: unknown): string | undefined {
  if (!isObject(credential)) return undefined;
  const accountId = credential.accountId;
  return typeof accountId === "string" && accountId.length > 0 ? accountId : undefined;
}

export default function openaiUsage(pi: ExtensionAPI) {
  pi.registerCommand("usage", {
    description: "Show OpenAI Codex subscription usage and rate-limit windows",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();

      const token = await ctx.modelRegistry.getApiKeyForProvider(OPENAI_CODEX_PROVIDER);
      if (!token) {
        ctx.ui.notify(
          "No OpenAI Codex subscription login found. Run /login and choose ChatGPT Plus/Pro.",
          "warning",
        );
        return;
      }

      try {
        const credential = ctx.modelRegistry.authStorage.get(OPENAI_CODEX_PROVIDER);
        const payload = await fetchUsage(token, getOpenAICodexAccountId(credential));
        const content = formatUsage(payload);

        pi.sendMessage({
          customType: "openai-usage",
          content,
          display: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Failed to fetch OpenAI usage: ${message}`, "error");
      }
    },
  });
}
