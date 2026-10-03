// CRE entry point: the compiled module may only export parameterless functions (javy), so the
// workflow lives in workflow.ts.
import { Runner } from "@chainlink/cre-sdk";
import { type Config, configSchema, initWorkflow } from "./workflow";

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}
