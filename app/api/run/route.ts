import { z } from "zod";
import { getDomain } from "@/domains/registry";
import { runRequest } from "@/graph/run";
import { log } from "@/lib/logger";
import { createDbSink, type TraceSink } from "@/observability/trace";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  query: z.string().min(1).max(8000),
  domainId: z.enum(["support", "incident"]),
  mode: z.enum(["baseline", "hybrid", "jev-only"]),
});

export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid run request" }, { status: 400 });
  }
  getDomain(parsed.data.domainId);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const sink: TraceSink = createDbSink({
        decision: (event) => send("decision", event),
        step: (event) => send("step", event),
        token: (text) => send("token", { text }),
        final: (payload) => send("final", payload),
        error: (message) => send("error", { message }),
      });
      try {
        const result = await runRequest({ ...parsed.data, sink });
        log("info", "run complete", { requestId: result.requestId, domainId: result.domainId, outcome: result.outcome });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Run failed";
        send("error", { message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
