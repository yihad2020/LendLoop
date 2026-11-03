import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const categories = ["Power tools", "Garden", "Kitchen", "Camping", "Home", "Other"] as const;
export const conditions = ["Like new", "Good", "Fair"] as const;
export const statusValidator = v.union(
  v.literal("pending"), v.literal("approved"), v.literal("declined"),
  v.literal("cancelled"), v.literal("returned"),
);

export default defineSchema({
  users: defineTable({
    clerkId: v.string(), displayName: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
    trustedLender: v.boolean(), createdAt: v.number(),
  }).index("by_clerk", ["clerkId"]),
  tools: defineTable({
    ownerId: v.id("users"), name: v.string(), category: v.string(),
    condition: v.string(), description: v.string(), archived: v.boolean(),
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]).index("by_archived", ["archived"]),
  requests: defineTable({
    toolId: v.id("tools"), borrowerId: v.id("users"),
    startDate: v.string(), endDate: v.string(), status: statusValidator,
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_tool", ["toolId"]).index("by_borrower", ["borrowerId"])
    .index("by_status_end", ["status", "endDate"]),
  automationEvents: defineTable({
    requestId: v.id("requests"), eventType: v.string(),
    eventKey: v.string(), recipientId: v.id("users"),
    status: v.union(v.literal("pending"), v.literal("sent"), v.literal("failed")),
    attempts: v.number(), sentAt: v.optional(v.number()),
    lastError: v.optional(v.string()), createdAt: v.number(),
  }).index("by_event_key", ["eventKey"]).index("by_request", ["requestId"]),
});
