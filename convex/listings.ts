import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./identity";
import { categories, conditions } from "./schema";
import { dateTodayUTC, mayManageListing } from "../lib/policy";

const listingFields = {
  name: v.string(), category: v.string(), condition: v.string(), description: v.string(),
};
function validateListing(args: {name: string; category: string; condition: string; description: string}) {
  if (args.name.trim().length < 3 || args.name.trim().length > 80) throw new Error("Name must be 3–80 characters.");
  if (!categories.includes(args.category as (typeof categories)[number])) throw new Error("Unsupported category.");
  if (!conditions.includes(args.condition as (typeof conditions)[number])) throw new Error("Unsupported condition.");
  if (args.description.trim().length < 10 || args.description.trim().length > 600) throw new Error("Description must be 10–600 characters.");
}

export const publicAvailable = query({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db.query("tools").withIndex("by_archived", (q) => q.eq("archived", false)).take(100);
    const today = dateTodayUTC();
    const results = await Promise.all(tools.map(async (tool) => {
      const loans = await ctx.db.query("requests").withIndex("by_tool", (q) => q.eq("toolId", tool._id)).collect();
      const reserved = loans.some((r) => r.status === "approved" && r.endDate >= today);
      // Deliberately does not return owner identity, exact dates, or descriptions.
      return reserved ? null : { _id: tool._id, name: tool.name, category: tool.category };
    }));
    return results.filter((x) => x !== null);
  },
});

export const catalog = query({
  args: { category: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const tools = await ctx.db.query("tools").withIndex("by_archived", (q) => q.eq("archived", false)).take(200);
    const today = dateTodayUTC();
    return await Promise.all(tools.filter((t) => !args.category || t.category === args.category).map(async (tool) => {
      const owner = await ctx.db.get(tool.ownerId);
      const loans = await ctx.db.query("requests").withIndex("by_tool", (q) => q.eq("toolId", tool._id)).collect();
      return {
        ...tool, ownerName: owner?.displayName ?? "Neighbor", trustedLender: owner?.trustedLender ?? false,
        availability: loans.some((r) => r.status === "approved" && r.endDate >= today) ? "Reserved" : "Available",
      };
    }));
  },
});

export const myListings = query({
  args: {}, handler: async (ctx) => {
    const user = await requireUser(ctx);
    return await ctx.db.query("tools").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
  },
});

export const create = mutation({
  args: listingFields,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    validateListing(args);
    const now = Date.now();
    return ctx.db.insert("tools", {
      ownerId: user._id, name: args.name.trim(), category: args.category,
      condition: args.condition, description: args.description.trim(),
      archived: false, createdAt: now, updatedAt: now,
    });
  },
});

export const update = mutation({
  args: { toolId: v.id("tools"), ...listingFields },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.archived || !mayManageListing(user.role, user._id, tool.ownerId)) throw new Error("Listing not found or access denied.");
    // Even admins cannot silently alter another lender's listing: admins remove only.
    if (tool.ownerId !== user._id) throw new Error("Only the owner may edit this listing.");
    validateListing(args);
    await ctx.db.patch(args.toolId, {
      name: args.name.trim(), category: args.category, condition: args.condition,
      description: args.description.trim(), updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, {toolId}) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool || tool.archived || !mayManageListing(user.role, user._id, tool.ownerId)) throw new Error("Listing not found or access denied.");
    const requests = await ctx.db.query("requests").withIndex("by_tool", (q) => q.eq("toolId", toolId)).collect();
    if (requests.some((r) => r.status === "approved")) throw new Error("You cannot remove a listing with an active loan.");
    await ctx.db.patch(toolId, { archived: true, updatedAt: Date.now() });
    // Preserve history, but close outstanding requests without sending misleading approvals.
    for (const request of requests.filter((r) => r.status === "pending")) {
      await ctx.db.patch(request._id, { status: "cancelled", updatedAt: Date.now() });
    }
  },
});
