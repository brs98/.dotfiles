import { DefaultResourceLoader, getAgentDir, SettingsManager, type ToolDefinition } from "@earendil-works/pi-coding-agent";

import { createReviewCheckTool } from "./review-tools.mts";

export function createReviewerAgentTooling(cwd: string): {
  tools: string[];
  customTools: ToolDefinition[];
  disableExtensions: true;
} {
  return {
    tools: ["review_check"],
    customTools: [createReviewCheckTool(cwd)],
    disableExtensions: true,
  };
}

export function createReviewerResourceLoader(options: {
  cwd: string;
  agentDir?: string;
  settingsManager?: SettingsManager;
}): DefaultResourceLoader {
  const agentDir = options.agentDir ?? getAgentDir();
  return new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir,
    settingsManager: options.settingsManager ?? SettingsManager.create(options.cwd, agentDir),
    noExtensions: true,
  });
}
