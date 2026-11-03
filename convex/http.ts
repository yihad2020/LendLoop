import { httpRouter } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifyBearer, verifyPayload } from "./crypto";

const http = httpRouter();
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

http.route({
  path: "/automation/overdue", method: "GET",
  handler: httpAction(async (ctx, request) => {
    const token = process.env.N8N_CALLBACK_TOKEN;
    if (!token || !(await verifyBearer(token, request.headers.get("authorization")))) return json({ error: "Unauthorized" }, 401);
    const items = await ctx.runQuery(internal.automations.overdue, {});
    return json({ items });
  }),
});

http.route({
  path: "/automation/reminders", method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.N8N_WEBHOOK_SECRET;
    if (!secret) return json({ error: "Integration unavailable" }, 503);
    const raw = await request.text();
    if (raw.length > 4096 || !(await verifyPayload(secret, request.headers.get("x-lendloop-timestamp"), raw, request.headers.get("x-lendloop-signature")))) {
      return json({ error: "Invalid signature" }, 401);
    }
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body || typeof body !== "object" || !("requestId" in body) || !("reminderKey" in body)
      || typeof body.requestId !== "string" || typeof body.reminderKey !== "string") return json({ error: "Invalid input" }, 400);
    try {
      const result = await ctx.runMutation(internal.automations.recordReminder, {
        requestId: body.requestId as Id<"requests">, reminderKey: body.reminderKey,
      });
      return json(result);
    } catch {
      return json({ error: "Reminder could not be recorded" }, 409);
    }
  }),
});
export default http;
