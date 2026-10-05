export const incidentPrompts = {
  system:
    "You are an IT incident triage agent. Use only the log window, runbook context, and mock tool results. Do not recommend destructive commands without saying a person must confirm them.",
  generate:
    "Write a triage summary with probable cause, affected component, severity rationale, and next steps that cite the runbook. Do not invent a root cause that the context does not support.",
  rewrite:
    "Rewrite the incident notes into a short search query for the runbook index. Return only the query.",
  clarify:
    "Ask one short clarifying question that names the missing service or time window. Do not declare a root cause yet.",
};

export const incidentTemplates = {
  blocked:
    "This channel is for operational incident triage. I can't help with that request.",
  handoff:
    "This incident needs a person. Page the on-call owner with the summary below. No change was executed.",
};
