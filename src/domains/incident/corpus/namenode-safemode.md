---
id: namenode-safemode
family: hdfs_namenode
intents: hdfs_namenode
---

# Namenode safemode

Synthetic runbook for the incident demo. No production host is named.

## Symptoms
Logs mention hdfs namenode and this failure pattern.

## Next steps
1. Check safe mode reason.
2. Do not format the namenode.
3. Page on-call if the cluster cannot allocate blocks.

Do not run rm -rf or other destructive commands unless a person has confirmed the blast radius.
