import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { dateTodayUTC, reminderKey } from "../lib/policy";
import { signPayload } from "./crypto";

export const eventPayload = internalQuery({
  args: { eventId: v.id("automationEvents") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event || event.status === "sent") return null;
    const request = await ctx.db.get(event.requestId);
    if (!request) return null;
    const tool = await ctx.db.get(request.toolId);
    const recipient = await ctx.db.get(event.recipientId);
    return {
      eventId: event._id, eventType: event.eventType, requestId: request._id,
      toolName: tool?.name ?? "Tool", recipientLabel: recipient?.displayName ?? "Neighbor",
      requestStatus: request.status, occurredAt: event.createdAt,
    };
  },
});

export const setDelivery = internalMutation({
  args: { eventId: v.id("automationEvents"), success: v.boolean(), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event || event.status === "sent") return { attempts: event?.attempts ?? 0, completed: true };
    const attempts = event.attempts + 1;
    await ctx.db.patch(args.eventId, {
      attempts, status: args.success ? "sent" : attempts >= 5 ? "failed" : "pending",
      ...(args.success ? { sentAt: Date.now(), lastError: undefined } : { lastError: (args.error || "Delivery failed").slice(0, 160) }),
    });
    return { attempts, completed: args.success || attempts >= 5 };
  },
});

export const dispatch = internalAction({
  args: { eventId: v.id("automationEvents") },
  handler: async (ctx, args): Promise<void> => {
    const payload = await ctx.runQuery(internal.automations.eventPayload, args);
    if (!payload) return;
    const url = process.env.N8N_WEBHOOK_URL;
    const secret = process.env.N8N_WEBHOOK_SECRET;
    let error: string | undefined;
    if (!url || !secret) {
      error = "Automation environment is not configured";
    } else {
      try {
        const body = JSON.stringify(payload);
        const timestamp = String(Date.now());
        const signature = await signPayload(secret, timestamp, body);
        const response = await fetch(url, {
          method: "POST", headers: {
            "Content-Type": "application/json",
            "x-lendloop-timestamp": timestamp,
            "x-lendloop-signature": `sha256=${signature}`,
          }, body, signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) error = `n8n returned HTTP ${response.status}`;
      } catch (e) {
        // Do not persist URLs, request bodies, or secrets in error logs.
        error = e instanceof Error ? e.name : "Network failure";
      }
    }
    const result = await ctx.runMutation(internal.automations.setDelivery, {
      eventId: args.eventId, success: !error, ...(error ? {error} : {}),
    });
    if (error && !result.completed) {
      const backoff = Math.min(60_000 * 2 ** (result.attempts - 1), 15 * 60_000);
      await ctx.scheduler.runAfter(backoff, internal.automations.dispatch, args);
    }
  },
});

export const overdue = internalQuery({
  args: {},
  handler: async (ctx) => {
    const today = dateTodayUTC();
    const loans = await ctx.db.query("requests")
      .withIndex("by_status_end", (q) => q.eq("status", "approved").lt("endDate", today)).take(150);
    const results = await Promise.all(loans.map(async (loan) => {
      const key = reminderKey(loan._id, today);
      const already = await ctx.db.query("automationEvents").withIndex("by_event_key", (q) => q.eq("eventKey", key)).unique();
      if (already) return null;
      const tool = await ctx.db.get(loan.toolId);
      const borrower = await ctx.db.get(loan.borrowerId);
      return { requestId: loan._id, reminderKey: key, toolName: tool?.name ?? "Tool",
        recipientLabel: borrower?.displayName ?? "Neighbor", dueDate: loan.endDate };
    }));
    return results.filter((r) => r !== null);
  },
});

export const recordReminder = internalMutation({
  args: { requestId: v.id("requests"), reminderKey: v.string() },
  handler: async (ctx, args) => {
    const loan = await ctx.db.get(args.requestId);
    if (!loan) throw new Error("Loan not found.");
    const key = reminderKey(args.requestId, dateTodayUTC());
    if (args.reminderKey !== key) throw new Error("Invalid reminder key.");
    const existing = await ctx.db.query("automationEvents").withIndex("by_event_key", (q) => q.eq("eventKey", key)).unique();
    if (existing) return { recorded: true, duplicate: true };
    if (loan.status !== "approved" || loan.endDate >= dateTodayUTC()) throw new Error("Loan is no longer overdue.");
    const now = Date.now();
    await ctx.db.insert("automationEvents", {
      requestId: args.requestId, recipientId: loan.borrowerId,
      eventKey: key, eventType: "overdue_reminder", status: "sent", attempts: 1,
      sentAt: now, createdAt: now,
    });
    return { recorded: true, duplicate: false };
  },
});
