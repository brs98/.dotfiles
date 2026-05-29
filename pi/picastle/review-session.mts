import { DefaultResourceLoader, getAgentDir, SettingsManager } from "@earendil-works/pi-coding-agent";

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
