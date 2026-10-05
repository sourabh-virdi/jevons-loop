---
id: network-loss
family: network
intents: network
---

# Packet loss

Synthetic runbook for the incident demo. No production host is named.

## Symptoms
Logs mention network and this failure pattern.

## Next steps
1. Compare loss to the baseline.
2. Inspect the rack switch.
3. Fail over only with an owner present.

Do not run rm -rf or other destructive commands unless a person has confirmed the blast radius.
