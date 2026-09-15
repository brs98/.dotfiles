import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

let client;
let transport;
try {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const { token, command, name, arguments: args } = JSON.parse(input);
  transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('./node_modules/@shortcut/mcp/dist/index.js', import.meta.url))],
    env: { PATH: process.env.PATH ?? '', SHORTCUT_API_TOKEN: token },
    stderr: 'ignore',
  });
  client = new Client({ name: 'shortcut-workspace-skill', version: '1.0.0' });
  await client.connect(transport);
  const tools = [];
  let cursor;
  do {
    const page = await client.listTools(cursor ? { cursor } : {});
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  let result;
  if (command === 'list-tools') {
    result = tools.map(({ name, description, annotations }) => ({ name, description, annotations }));
  } else {
    const tool = tools.find(tool => tool.name === name);
    if (!tool) throw new Error('Unknown tool');
    if (command === 'describe-tool') result = tool;
    else if (command === 'call-tool') {
      result = await client.callTool({ name, arguments: args }, undefined, { timeout: 60000 });
      if (result.isError) {
        result = { isError: true, message: 'Shortcut tool failed; details suppressed. Check arguments and access. Do not retry writes without checking their outcome.' };
        process.exitCode = 1;
      }
    } else throw new Error('Unknown command');
  }
  process.stdout.write(JSON.stringify(result).split(token).join('[REDACTED]'));
} catch {
  process.stderr.write('Shortcut MCP invocation failed; diagnostic details suppressed.\n');
  process.exitCode = 1;
} finally {
  if (client) await client.close().catch(() => {});
  if (transport) await transport.close().catch(() => {});
}
