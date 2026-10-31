import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BANKING_INTENTS } from "../src/domains/support/intents";
import { buildGoldSet } from "../src/domains/incident/labels";

const supportDir = resolve("src/domains/support/corpus");
const incidentDir = resolve("src/domains/incident/corpus");
mkdirSync(supportDir, { recursive: true });
mkdirSync(incidentDir, { recursive: true });

const families = ["cards", "transfers", "topups", "fees", "identity", "account"] as const;
let supportFiles = 0;
for (const family of families) {
  const intents = BANKING_INTENTS.filter((intent) => intent.family === family);
  writeFaq(supportDir, `${family}-overview`, family, intents.map((intent) => intent.id), `# ${family} overview`, [
    `This synthetic FAQ covers the ${family} family for a demo banking assistant.`,
    "It does not describe a real customer, card, or balance.",
    `Related intents: ${intents.map((intent) => intent.id).join(", ")}.`,
  ].join("\n\n"));
  supportFiles += 1;
  for (let i = 0; i < intents.length; i += 2) {
    const group = intents.slice(i, i + 2);
    const id = `${family}-${i / 2 + 1}`;
    const body = group
      .map(
        (intent) =>
          `## ${intent.id}\n${intent.description} A customer might say: "${intent.utterance}" The demo assistant should explain the in-app steps, name the relevant mock tool if account state must be read, and refuse to promise a refund or reveal another customer's data.`,
      )
      .join("\n\n");
    writeFaq(supportDir, id, family, group.map((intent) => intent.id), `# ${family} guidance ${i / 2 + 1}`, body);
    supportFiles += 1;
  }
}

const runbooks: Array<{ id: string; family: string; title: string; steps: string[] }> = [
  ["memory-parity", "memory", "Memory parity error", ["Check corrected-error counters.", "If the rate is climbing, drain the node.", "Do not power-cycle without confirmation."]],
  ["memory-ecc", "memory", "ECC correction failure", ["Identify the DIMM from the log.", "Mark the bank offline after confirmation.", "Open a hardware ticket."]],
  ["compute-panic", "compute", "Kernel panic", ["Capture the panic string.", "Keep the node out of the scheduler.", "Page on-call if users cannot start jobs."]],
  ["network-flap", "network", "Link flap", ["Confirm the port and both ends.", "Check recent optics replacements.", "Do not shut the uplink without confirmation."]],
  ["network-loss", "network", "Packet loss", ["Compare loss to the baseline.", "Inspect the rack switch.", "Fail over only with an owner present."]],
  ["disk-media", "storage", "Disk media error", ["Identify the device.", "Stop new writes to that volume.", "Replace the disk through the hardware runbook."]],
  ["fs-readonly", "filesystem", "Read-only remount", ["Check the kernel log for the remount reason.", "Do not run mkfs.", "Remount read-write only after a person confirms the volume is consistent."]],
  ["scheduler-backlog", "scheduler", "Scheduler backlog", ["Read queue depth.", "Look for a stuck reservation.", "Pause new submissions if the backlog keeps growing."]],
  ["app-oom", "application", "Application OOM", ["Find the job id.", "Capture the memory limit.", "Restart the job only after the owner agrees."]],
  ["namenode-safemode", "hdfs_namenode", "Namenode safemode", ["Check safe mode reason.", "Do not format the namenode.", "Page on-call if the cluster cannot allocate blocks."]],
  ["namenode-exception", "hdfs_namenode", "Namenode exception", ["Capture the exception class.", "Check recent deploys.", "Roll back only with confirmation."]],
  ["datanode-heartbeat", "hdfs_datanode", "Datanode heartbeat loss", ["Confirm the host is reachable.", "Check disk space on the data volume.", "Decommission only after replication is healthy."]],
  ["under-replicated", "hdfs_datanode", "Under-replicated blocks", ["List the blocks.", "Wait for replication if a node is restarting.", "Do not delete blocks."]],
  ["missing-block", "storage", "Missing block", ["Confirm replica count is zero.", "Page on-call.", "Restore from the approved backup path."]],
  ["slow-block-report", "hdfs_datanode", "Slow block report", ["Compare report time to the last hour.", "Check disk latency.", "Treat it as degraded unless clients see errors."]],
  ["mount-latency", "filesystem", "Mount latency", ["Identify the volume.", "Check the storage path.", "Move traffic only with confirmation."]],
  ["scheduler-info", "scheduler", "Informational heartbeat", ["No page is required.", "Record the heartbeat.", "Escalate only if heartbeats stop."]],
  ["clock-skew", "compute", "Clock skew", ["Compare NTP offset.", "Step the clock only with confirmation.", "Restart time-sensitive jobs after the offset is small."]],
  ["dns-failure", "network", "DNS failure", ["Check resolver health.", "Do not edit production zone files without confirmation.", "Fail over to the secondary resolver if it is healthy."]],
  ["sidecar-crash", "application", "Service mesh sidecar crash", ["Restart the sidecar.", "Confirm the app container is still serving.", "Roll the deploy back if the crash loops."]],
].map(([id, family, title, steps]) => ({
  id: String(id),
  family: String(family),
  title: String(title),
  steps: steps as string[],
}));

for (const runbook of runbooks) {
  const body = [
    `# ${runbook.title}`,
    "",
    "Synthetic runbook for the incident demo. No production host is named.",
    "",
    "## Symptoms",
    `Logs mention ${runbook.family.replaceAll("_", " ")} and this failure pattern.`,
    "",
    "## Next steps",
    ...runbook.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "Do not run rm -rf or other destructive commands unless a person has confirmed the blast radius.",
  ].join("\n");
  writeFaq(incidentDir, runbook.id, runbook.family, [runbook.family], `# ${runbook.title}`, body);
}

writeFileSync(resolve("src/domains/incident/fixtures/gold-200.json"), JSON.stringify(buildGoldSet(), null, 2));
console.log(JSON.stringify({ supportFiles, runbooks: runbooks.length, gold: buildGoldSet().length }));

function writeFaq(dir: string, id: string, family: string, intents: string[], _title: string, body: string) {
  const text = `---\nid: ${id}\nfamily: ${family}\nintents: ${intents.join(", ")}\n---\n\n${body.startsWith("#") ? body : `${_title}\n\n${body}`}\n`;
  writeFileSync(resolve(dir, `${id}.md`), text);
}
