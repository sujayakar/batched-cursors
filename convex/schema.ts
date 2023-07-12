import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    cursors: defineTable({
        user: v.string(),

        startTs: v.number(),
        x: v.bytes(),
        y: v.bytes(),
        t: v.bytes(),
    }).index("by_user_start_ts", ["user", "startTs"]),

    members: defineTable({
        user: v.string(),
        lastUpdate: v.number(),
    }).index("by_user", ["user"]),
})