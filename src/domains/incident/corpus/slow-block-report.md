---
id: slow-block-report
family: hdfs_datanode
intents: hdfs_datanode
---

# Slow block report

Synthetic runbook for the incident demo. No production host is named.

## Symptoms
Logs mention hdfs datanode and this failure pattern.

## Next steps
1. Compare report time to the last hour.
2. Check disk latency.
3. Treat it as degraded unless clients see errors.

Do not run rm -rf or other destructive commands unless a person has confirmed the blast radius.
