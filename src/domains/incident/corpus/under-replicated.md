---
id: under-replicated
family: hdfs_datanode
intents: hdfs_datanode
---

# Under-replicated blocks

Synthetic runbook for the incident demo. No production host is named.

## Symptoms
Logs mention hdfs datanode and this failure pattern.

## Next steps
1. List the blocks.
2. Wait for replication if a node is restarting.
3. Do not delete blocks.

Do not run rm -rf or other destructive commands unless a person has confirmed the blast radius.
