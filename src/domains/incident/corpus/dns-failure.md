---
id: dns-failure
family: network
intents: network
---

# DNS failure

Synthetic runbook for the incident demo. No production host is named.

## Symptoms
Logs mention network and this failure pattern.

## Next steps
1. Check resolver health.
2. Do not edit production zone files without confirmation.
3. Fail over to the secondary resolver if it is healthy.

Do not run rm -rf or other destructive commands unless a person has confirmed the blast radius.
