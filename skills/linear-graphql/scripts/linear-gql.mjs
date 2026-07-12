#!/usr/bin/env node

import { runCli } from "./linear-gql-core.mjs";

process.exitCode = await runCli();
