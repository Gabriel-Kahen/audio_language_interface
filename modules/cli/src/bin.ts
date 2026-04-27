import { runCli } from "./run-cli.js";

const argv = process.argv.slice(2);
const result = await runCli(argv);

process.exitCode = result.exitCode;
