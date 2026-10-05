---
id: namenode-exception
family: hdfs_namenode
intents: hdfs_namenode
---

# Namenode exception

Synthetic runbook for the incident demo. No production host is named.

## Symptoms
Logs mention hdfs namenode and this failure pattern.

## Next steps
1. Capture the exception class.
2. Check recent deploys.
3. Roll back only with confirmation.

Do not run rm -rf or other destructive commands unless a person has confirmed the blast radius.
