import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./identity";
import { statusValidator } from "./schema";
import { canTransition, dateTodayUTC, overlaps, validateDateRange } from "../lib/policy";

async function insertEvent(ctx: MutationCtx, requestId: Id<"requests">, recipientId: Id<"users">, eventType: string, now: number) {
  const eventId = await ctx.db.insert("automationEvents", {
    requestId, recipientId, eventType, eventKey: `${eventType}:${requestId}:${now}`,
    status: "pending", attempts: 0, createdAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.automations.dispatch, { eventId });
}

export const createRequest = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.archived) throw new Error("Tool is no longer listed.");
    if (tool.ownerId === user._id) throw new Error("You cannot borrow your own tool.");
    validateDateRange(args.startDate, args.endDate, dateTodayUTC());
    const existing = await ctx.db.query("requests").withIndex("by_tool", (q) => q.eq("toolId", args.toolId)).collect();
    if (existing.some((r) => r.status === "approved" && overlaps(r.startDate, r.endDate, args.startDate, args.endDate))) {
      throw new Error("This tool is reserved for the selected dates.");
    }
    if (existing.some((r) => r.status === "pending" && r.borrowerId === user._id && overlaps(r.startDate, r.endDate, args.startDate, args.endDate))) {
      throw new Error("You already have a pending request for these dates.");
    }
    const now = Date.now();
    const id = await ctx.db.insert("requests", {
      toolId: args.toolId, borrowerId: user._id, startDate: args.startDate,
      endDate: args.endDate, status: "pending", createdAt: now, updatedAt: now,
    });
    await insertEvent(ctx, id, tool.ownerId, "request_created", now);
    return id;
  },
});

export const changeStatus = mutation({
  args: { requestId: v.id("requests"), nextStatus: statusValidator },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found.");
    const tool = await ctx.db.get(request.toolId);
    if (!tool) throw new Error("Listing not found.");
    const actor = tool.ownerId === user._id ? "lender" : request.borrowerId === user._id ? "borrower" : null;
    if (!actor || !canTransition(request.status, args.nextStatus, actor)) throw new Error("This status change is not permitted.");
    if (args.nextStatus === "approved") {
      if (request.startDate < dateTodayUTC()) throw new Error("Expired date range. Ask for a new request.");
      const siblings = await ctx.db.query("requests").withIndex("by_tool", (q) => q.eq("toolId", request.toolId)).collect();
      if (siblings.some((r) => r._id !== args.requestId && r.status === "approved" && overlaps(r.startDate, r.endDate, request.startDate, request.endDate))) {
        throw new Error("Overlapping loan already approved.");
      }
    }
    const now = Date.now();
    await ctx.db.patch(args.requestId, { status: args.nextStatus, updatedAt: now });
    await insertEvent(ctx, args.requestId, actor === "lender" ? request.borrowerId : tool.ownerId, `request_${args.nextStatus}`, now);
  },
});

async function enrich(ctx: QueryCtx, request: Doc<"requests">) {
  const tool = await ctx.db.get(request.toolId);
  const owner = tool ? await ctx.db.get(tool.ownerId) : null;
  const borrower = await ctx.db.get(request.borrowerId);
  const events = await ctx.db.query("automationEvents").withIndex("by_request", (q) => q.eq("requestId", request._id)).collect();
  return {
    ...request, toolName: tool?.name ?? "Removed listing", category: tool?.category ?? "Other",
    ownerName: owner?.displayName ?? "Neighbor", borrowerName: borrower?.displayName ?? "Neighbor",
    automation: events.sort((a, b) => b.createdAt - a.createdAt).slice(0, 3).map((e) => ({
      eventType: e.eventType, status: e.status, sentAt: e.sentAt, createdAt: e.createdAt,
    })),
  };
}

export const myRequests = query({
  args: {}, handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db.query("requests").withIndex("by_borrower", (q) => q.eq("borrowerId", user._id)).collect();
    return await Promise.all(rows.map((r) => enrich(ctx, r)));
  },
});
export const incomingRequests = query({
  args: {}, handler: async (ctx) => {
    const user = await requireUser(ctx);
    const tools = await ctx.db.query("tools").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    const list = (await Promise.all(tools.map((t) => ctx.db.query("requests").withIndex("by_tool", (q) => q.eq("toolId", t._id)).collect()))).flat();
    return await Promise.all(list.map((r) => enrich(ctx, r)));
  },
});
export const allLoans = query({
  args: {}, handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.role !== "admin") throw new Error("Administrator access required.");
    const rows = await ctx.db.query("requests").take(200);
    return await Promise.all(rows.map((r) => enrich(ctx, r)));
  },
});
