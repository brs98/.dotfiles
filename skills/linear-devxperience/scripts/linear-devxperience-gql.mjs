#!/usr/bin/env node

import { runCli } from "../../linear-graphql/scripts/linear-gql-core.mjs";

const lockedProfile = Object.freeze({
  name: "devxperience",
  organization: Object.freeze({
    id: "f877e44d-aedc-41d7-b405-8fe7fbd1d925",
    urlKey: "devxperience",
  }),
  envFile: "~/.config/linear/workspaces/devxperience.env",
  keyName: "LINEAR_API_KEY",
});

process.exitCode = await runCli({ lockedProfile, forceEnvelope: true });
