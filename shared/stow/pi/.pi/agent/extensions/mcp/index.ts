import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createClientRegistry } from "./clients.js";
import { registerMcpCommand } from "./commands.js";
import { registerMcpTools } from "./tools.js";

export default function mcp(pi: ExtensionAPI) {
  const registry = createClientRegistry();
  registerMcpCommand(pi, registry);
  registerMcpTools(pi, registry);
  pi.on("session_shutdown", () => registry.shutdownAll());
}
