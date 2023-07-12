import { internalMutation, mutation, query } from "./_generated/server"

const MAX_MEMBER_AGE = 10 * 1000;
const MAX_CURSOR_AGE = 60 * 1000;
const BUFFER_HISTORY = 16;

export const join = mutation(async ({auth, db}) => {
    const identity = await auth.getUserIdentity();
    if (!identity) {
        throw new Error("Not authenticated");
    }
    const row = await db.query("members")
        .withIndex("by_user", q => q.eq("user", identity.subject))
        .first();
    if (row === null) {
        await db.insert("members", {user: identity.subject, name: identity.name ?? "🤷", lastUpdate: Date.now()});
    } else {
        await db.patch(row._id, {lastUpdate: Date.now()});
    }
})

export const leave = mutation(async ({auth, db}) => {
    const identity = await auth.getUserIdentity();
    if (!identity) {
        throw new Error("Not authenticated");
    }
    const row = await db
        .query("members")
        .withIndex("by_user", q => q.eq("user", identity.subject))
        .first();
    if (row !== null) {
        await db.delete(row._id);
    }
})

export const me = query(async ({auth}) => {
    const identity = await auth.getUserIdentity();
    return identity?.subject;
});

export const otherMembers = query(async ({auth, db}) => {
    const identity = await auth.getUserIdentity();
    if (!identity) {
        throw new Error("Not authenticated");
    }
    const rows = await db
        .query("members")
        .filter(q => q.and(
            q.neq(q.field("user"), identity.subject),
            q.gte(q.field("lastUpdate"), Date.now() - MAX_MEMBER_AGE)),
        )
        .collect();
    return rows.map(row => {
        return { user: row.user, name: row.name };
    });
});

export const pushCursor = mutation(async ({auth, db}, { cursorBuffer }: any) => {
    const identity = await auth.getUserIdentity();
    if (!identity) {
        throw new Error("Not authenticated");
    }
    if (cursorBuffer !== null) {
        const prevRecord = await db
            .query("cursors")
            .withIndex("by_user_start_ts", q => q.eq("user", identity.subject))
            .order("desc")
            .first();
        if (prevRecord && prevRecord.startTs >= cursorBuffer.startTs) {
            throw new Error(`Time did not move forward: ${prevRecord.startTs} >= ${cursorBuffer.startTs}}`);
        }
        const row = {
            user: identity.subject,
            startTs: cursorBuffer.startTs,
            x: cursorBuffer.x,
            y: cursorBuffer.y,
            t: cursorBuffer.t,
        };
        await db.insert("cursors", row);
    }
    const memberRow = await db.query("members")
        .withIndex("by_user", q => q.eq("user", identity.subject))
        .first();
    if (!memberRow) {
        throw new Error(`Missing member row for ${identity.subject}`);
    }
    await db.patch(memberRow._id, {lastUpdate: Date.now()});
})

export const listCursors = query(async ({auth, db}, { user }: any) => {
    const identity = await auth.getUserIdentity();
    if (!identity) {
        throw new Error("Not authenticated");
    }
    const row = await db.query("members")
        .withIndex("by_user", q => q.eq("user", user))
        .first();
    if (!row) {
        throw new Error(`No member row for ${user}`);
    }
    const buffers = await db
        .query("cursors")
        .withIndex("by_user_start_ts", q => q.eq("user", user))
        .order("desc")
        .take(BUFFER_HISTORY);
    buffers.reverse();
    return { buffers, name: row.name };
});

export const cleanup = internalMutation(async ({db}) => {
    for await (const member of db.query("members")) {
        const rows = await db.query("cursors")
            .withIndex("by_user_start_ts", q => q.eq("user", member.user).lt("startTs", Date.now() - MAX_CURSOR_AGE))
            .collect();
        for (const row of rows) {
            await db.delete(row._id);
        }
    }
})