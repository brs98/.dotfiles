const [mapPath, mapRoot, configPath] = Deno.args;

if (!mapPath || !mapRoot || !configPath) {
  console.error("Usage: bakkes-rcon.js <map> <map-root> <bakkes-config>");
  Deno.exit(2);
}

const root = await Deno.realPath(mapRoot);
const map = await Deno.realPath(mapPath);
const rootPrefix = root.endsWith("/") ? root : `${root}/`;

if (!map.startsWith(rootPrefix) || !/\.(?:udk|upk)$/i.test(map)) {
  console.error("The selected map is outside the configured workshop-map folder.");
  Deno.exit(2);
}

const relativePath = map.slice(rootPrefix.length).replaceAll("\\", "/");
if (/[";\r\n]/.test(relativePath)) {
  console.error("The selected map path contains characters BakkesMod cannot safely accept.");
  Deno.exit(2);
}

const config = await Deno.readTextFile(configPath);
const passwordMatch = config.match(/^rcon_password\s+"((?:\\.|[^"\\])*)"/m);
if (!passwordMatch) {
  console.error("BakkesMod's local RCON password is not configured.");
  Deno.exit(2);
}

const password = passwordMatch[1]
  .replaceAll('\\"', '"')
  .replaceAll("\\\\", "\\");
const authCommand = `rcon_password ${JSON.stringify(password)}`;
const loadCommand = `load_workshop "C:/RLMaps/${relativePath}"`;
const deadline = Date.now() + 180_000;

function connectAndLoad() {
  return new Promise((resolve, reject) => {
    let settled = false;
    let authenticated = false;
    let loadSent = false;
    const socket = new WebSocket("ws://127.0.0.1:9002");

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectionTimeout);
      try {
        socket.close();
      } catch {
        // The socket may already be closed after a failed connection attempt.
      }
      resolve(result);
    };

    const connectionTimeout = setTimeout(() => finish("retry"), 2_000);

    socket.addEventListener("open", () => socket.send(authCommand));
    socket.addEventListener("error", () => finish("retry"));
    socket.addEventListener("close", () => finish("retry"));
    socket.addEventListener("message", (event) => {
      const message = String(event.data).trim();

      if (message === "authno") {
        reject(new Error("BakkesMod rejected the local RCON password."));
        return;
      }

      if (message === "authyes" && !authenticated) {
        authenticated = true;
        clearTimeout(connectionTimeout);
        socket.send("rcon_refresh_allowed");
        setTimeout(() => {
          if (settled) return;
          loadSent = true;
          socket.send(loadCommand);
          setTimeout(() => finish("loaded"), 1_500);
        }, 400);
        return;
      }

      if (loadSent && message === "ERR:illegal_command") {
        reject(new Error("BakkesMod rejected the workshop-map command."));
      }
    });
  });
}

while (Date.now() < deadline) {
  const result = await connectAndLoad();
  if (result === "loaded") Deno.exit(0);
  await new Promise((resolve) => setTimeout(resolve, 500));
}

console.error("Timed out waiting for Rocket League and BakkesMod to become ready.");
Deno.exit(1);
