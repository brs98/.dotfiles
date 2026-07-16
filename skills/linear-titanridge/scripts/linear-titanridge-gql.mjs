#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { runCli } from "../../linear-graphql/scripts/linear-gql-core.mjs";
import { lockedProfile } from "./linear-titanridge-profile.mjs";

export async function main(options = {}) {
  return runCli({ ...options, lockedProfile, forceEnvelope: true });
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = await main();
}
