import { v } from "convex/values";
import type { DataModelFromSchemaDefinition, GenericQueryCtx } from "convex/server";
import schema from "./schema";
import { mutation, query } from "./_generated/server";

export const ensureProfile = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in is required.");
    const existing = await ctx.db.query("users").withIndex("by_clerk", (q) => q.eq("clerkId", identity.subject)).unique();
    if (existing) return existing._id;
    const adminClerkId = process.env.ADMIN_CLERK_ID;
    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      displayName: (identity.name || identity.nickname || "Neighbor").slice(0, 60),
      role: adminClerkId && identity.subject === adminClerkId ? "admin" : "user",
      trustedLender: false,
      createdAt: Date.now(),
    });
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db.query("users").withIndex("by_clerk", (q) => q.eq("clerkId", identity.subject)).unique();
    if (!user) return null;
    return { _id: user._id, displayName: user.displayName, role: user.role, trustedLender: user.trustedLender };
  },
});

type AuthCtx = Pick<GenericQueryCtx<DataModelFromSchemaDefinition<typeof schema>>, "auth" | "db">;
export async function requireUser(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Authentication required.");
  const user = await ctx.db.query("users").withIndex("by_clerk", (q) => q.eq("clerkId", identity.subject)).unique();
  if (!user) throw new Error("Profile not initialized. Refresh the dashboard.");
  return user;
}

export const adminUsers = query({
  args: {},
  handler: async (ctx) => {
    const admin = await requireUser(ctx);
    if (admin.role !== "admin") throw new Error("Administrator access required.");
    return (await ctx.db.query("users").take(200)).map((u) => ({
      _id: u._id, displayName: u.displayName, trustedLender: u.trustedLender, role: u.role,
    }));
  },
});

export const setTrusted = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, args) => {
    const admin = await requireUser(ctx);
    if (admin.role !== "admin") throw new Error("Administrator access required.");
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found.");
    await ctx.db.patch(args.userId, { trustedLender: args.trusted });
  },
});
