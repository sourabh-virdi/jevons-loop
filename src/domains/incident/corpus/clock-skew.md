---
id: clock-skew
family: compute
intents: compute
---

# Clock skew

Synthetic runbook for the incident demo. No production host is named.

## Symptoms
Logs mention compute and this failure pattern.

## Next steps
1. Compare NTP offset.
2. Step the clock only with confirmation.
3. Restart time-sensitive jobs after the offset is small.

Do not run rm -rf or other destructive commands unless a person has confirmed the blast radius.
