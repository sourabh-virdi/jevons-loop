---
id: datanode-heartbeat
family: hdfs_datanode
intents: hdfs_datanode
---

# Datanode heartbeat loss

Synthetic runbook for the incident demo. No production host is named.

## Symptoms
Logs mention hdfs datanode and this failure pattern.

## Next steps
1. Confirm the host is reachable.
2. Check disk space on the data volume.
3. Decommission only after replication is healthy.

Do not run rm -rf or other destructive commands unless a person has confirmed the blast radius.
