import { runCli } from "@audio-language-interface/cli";

const argv = process.argv.slice(2);
const forwardedArgv = argv[0] === "--" ? argv.slice(1) : argv;
const result = await runCli(forwardedArgv);

process.exitCode = result.exitCode;
