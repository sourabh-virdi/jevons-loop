/**
 * ASSUMPTION: BGL and HDFS do not ship a component/severity taxonomy for this agent.
 * The mapping below is a design assumption, not a vendor label.
 * Severity buckets are ordered low to high: 0 SEV4 informational, 1 SEV3 degraded,
 * 2 SEV2 major, 3 SEV1 outage.
 * The 200-example gold set is produced by buildGoldSet() and stored at
 * fixtures/gold-200.json. Review that file before reporting external results.
 */

export const INCIDENT_COMPONENTS = [
  "compute",
  "memory",
  "network",
  "storage",
  "filesystem",
  "scheduler",
  "application",
  "hdfs_namenode",
  "hdfs_datanode",
] as const;

export type IncidentComponent = (typeof INCIDENT_COMPONENTS)[number];

export const SEVERITY_CRITERIA = [
  "SEV4 informational",
  "SEV3 degraded",
  "SEV2 major",
  "SEV1 outage",
] as const;

export interface MappedLabel {
  component: IncidentComponent;
  severity: number;
  alert: boolean;
}

export function mapLogLine(line: string): MappedLabel {
  const trimmed = line.trim();
  const lower = trimmed.toLowerCase();
  const alert = trimmed.length > 0 && !trimmed.startsWith("-");
  let component: IncidentComponent = "compute";
  if (lower.includes("namenode") || lower.includes("safemode")) component = "hdfs_namenode";
  else if (lower.includes("datanode") || lower.includes("heartbeat") && lower.includes("hdfs")) component = "hdfs_datanode";
  else if (lower.includes("blk_") || lower.includes("block")) component = "hdfs_datanode";
  else if (lower.includes("memory") || lower.includes("parity") || lower.includes("dimm") || lower.includes("ecc")) component = "memory";
  else if (lower.includes("network") || lower.includes("link flap") || lower.includes("packet")) component = "network";
  else if (lower.includes("disk") || lower.includes("scsi") || lower.includes("storage")) component = "storage";
  else if (lower.includes("filesystem") || lower.includes("read-only") || lower.includes("mount")) component = "filesystem";
  else if (lower.includes("scheduler") || lower.includes("queue")) component = "scheduler";
  else if (lower.includes("oom") || lower.includes("application")) component = "application";

  let severity = 0;
  if (!alert && !lower.includes("fatal") && !lower.includes("error")) severity = 0;
  else if (lower.includes("fatal") || lower.includes("panic") || lower.includes("outage") || lower.includes("down")) severity = 3;
  else if (lower.includes("error") || lower.includes("fail") || lower.includes("severe") || lower.includes("exception")) severity = 2;
  else if (lower.includes("warn") || lower.includes("degraded")) severity = 1;
  else if (alert) severity = 1;
  return { component, severity, alert };
}

export interface GoldIncident {
  id: string;
  text: string;
  component: IncidentComponent;
  severity: number;
  source: "bgl" | "hdfs";
}

const PATTERNS: Array<{ component: IncidentComponent; severity: number; source: "bgl" | "hdfs"; center: string }> = [
  { component: "memory", severity: 3, source: "bgl", center: "RAS KERNEL FATAL memory parity error on {node} bank {n}" },
  { component: "memory", severity: 2, source: "bgl", center: "RAS KERNEL ERROR ECC correction failed on {node} dimm {n}" },
  { component: "memory", severity: 1, source: "bgl", center: "RAS KERNEL WARNING correctable memory error on {node} count {n}" },
  { component: "compute", severity: 3, source: "bgl", center: "RAS KERNEL FATAL panic on compute node {node} cpu {n}" },
  { component: "network", severity: 2, source: "bgl", center: "RAS KERNEL ERROR link flap on {node} port {n}" },
  { component: "network", severity: 1, source: "bgl", center: "RAS KERNEL WARNING packet loss between {node} and rack {n}" },
  { component: "storage", severity: 2, source: "bgl", center: "RAS KERNEL ERROR disk media error on {node} scsi {n}" },
  { component: "filesystem", severity: 2, source: "bgl", center: "RAS KERNEL ERROR filesystem remounted read-only on {node} vol {n}" },
  { component: "scheduler", severity: 1, source: "bgl", center: "RAS APP WARNING scheduler queue backlog on {node} depth {n}" },
  { component: "application", severity: 2, source: "bgl", center: "RAS APP ERROR oom killer invoked on {node} job {n}" },
  { component: "hdfs_namenode", severity: 3, source: "hdfs", center: "FATAL namenode entered safemode on {node}; cluster down code {n}" },
  { component: "hdfs_namenode", severity: 2, source: "hdfs", center: "ERROR namenode exception while allocating block on {node} id {n}" },
  { component: "hdfs_datanode", severity: 2, source: "hdfs", center: "ERROR datanode heartbeat expired for {node} blk_{n}" },
  { component: "hdfs_datanode", severity: 2, source: "hdfs", center: "ERROR under-replicated block blk_{n} on {node}" },
  { component: "hdfs_datanode", severity: 1, source: "hdfs", center: "WARN slow block report from datanode {node} took {n}s" },
  { component: "storage", severity: 3, source: "hdfs", center: "FATAL missing block blk_{n} and no replicas on {node}" },
  { component: "network", severity: 3, source: "bgl", center: "RAS KERNEL FATAL network outage isolated {node} switch {n}" },
  { component: "filesystem", severity: 1, source: "bgl", center: "RAS KERNEL WARNING mount latency degraded on {node} fs {n}" },
  { component: "scheduler", severity: 0, source: "bgl", center: "- {node} RAS KERNEL INFO scheduler heartbeat normal {n}" },
  { component: "compute", severity: 0, source: "hdfs", center: "- {node} INFO datanode heartbeat normal window {n}" },
];

export function buildGoldSet(): GoldIncident[] {
  const examples: GoldIncident[] = [];
  for (const pattern of PATTERNS) {
    for (let variant = 0; variant < 10; variant += 1) {
      const node = `R${String(variant).padStart(2, "0")}-M1-N0-C:J12-U11`;
      const center = pattern.center.replaceAll("{node}", node).replaceAll("{n}", String(1000 + variant));
      examples.push({
        id: `gold-${pattern.component}-${pattern.severity}-${variant}-${pattern.source}`,
        text: buildWindow(center, variant),
        component: pattern.component,
        severity: pattern.severity,
        source: pattern.source,
      });
    }
  }
  return examples;
}

export function buildWindow(center: string, variant: number): string {
  const before = 15 + (variant % 10);
  const after = 10 + (variant % 15);
  const lines: string[] = [];
  for (let i = 0; i < before; i += 1) {
    lines.push(`- ${1117838000 + variant * 50 + i} 2005.06.03 R${variant}-M1-N0 RAS KERNEL INFO normal heartbeat ${i}`);
  }
  lines.push(center);
  for (let i = 0; i < after; i += 1) {
    lines.push(`- ${1117839000 + i} 2005.06.03 R${variant}-M1-N0 RAS KERNEL INFO normal heartbeat after ${i}`);
  }
  return lines.join("\n");
}

export function windowsFromLog(text: string, source: "bgl" | "hdfs"): GoldIncident[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const incidents: GoldIncident[] = [];
  lines.forEach((line, index) => {
    const mapped = mapLogLine(line);
    if (!mapped.alert && mapped.severity === 0 && index % 25 !== 0) return;
    const start = Math.max(0, index - 15);
    const end = Math.min(lines.length, index + 16);
    const window = lines.slice(start, end);
    if (window.length < 20 && lines.length >= 20) return;
    incidents.push({
      id: `${source}-line-${index}`,
      text: window.join("\n"),
      component: mapped.component,
      severity: mapped.severity,
      source,
    });
  });
  return incidents;
}
