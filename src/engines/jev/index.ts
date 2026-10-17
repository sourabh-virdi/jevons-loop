import { getEnv } from "@/config/env";
import { AiSdkJevClient } from "@/engines/jev/ai-sdk-client";
import { MockJevClient } from "@/engines/jev/mock-client";
import { RestJevClient } from "@/engines/jev/rest-client";
import type { JevClient } from "@/engines/types";

export function createJevClient(transport = getEnv().JEV_TRANSPORT): JevClient {
  if (transport === "mock") return new MockJevClient();
  if (transport === "ai-sdk") return new AiSdkJevClient();
  return new RestJevClient();
}
