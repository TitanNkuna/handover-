import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { asRole, canSeeItem, makeKey, sameSecret } from "@/lib/floor/rules";
import type {
  AuditEvent,
  Note,
  NoteKind,
  Profile,
  Result,
  WorkItem,
  Workspace,
} from "@/lib/floor/types";

function fail(error: string): Result {
  return { ok: false, error };
}

function ok(): Result {
  return { ok: true };
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date(0).toISOString();
}

function num(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  return 0;
}

function parseSnap(raw: string | null): Record<string, string> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const out: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === "string") out[key] = entry;
    }
    return out;
  } catch {
    return null;
  }
}

function read<T>(schema: z.ZodType<T>, input: unknown): T | Result {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check that and try again.");
  }
  return parsed.data;
}

function isFail(value: unknown): value is Result {
  return Boolean(value && typeof value === "object" && "ok" in value && (value as Result).ok === false);
}

type ProfileRow = {
  user_id: string;
  display_name: string;
  email: string | null;
  role: string;
  created_at: unknown;
};

function toProfile(row: ProfileRow, revealEmail: boolean): Profile {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    email: revealEmail ? row.email : null,
    role: asRole(row.role),
    createdAt: iso(row.created_at),
  };
}

async function loadProfile(sql: Sql, userId: string): Promise<ProfileRow | null> {
  const rows = await sql<ProfileRow>`
    select user_id, display_name, email, role, created_at
    from profiles
    where user_id = ${userId}
  `;
  return rows[0] ?? null;
}

async function supervisorCount(sql: Sql): Promise<number> {
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from profiles where role = 'supervisor'
  `;
  return rows[0]?.n ?? 0;
}

async function displayName(sql: Sql, userId: string | null): Promise<string> {
  if (!userId) return "Crew pool";
  const rows = await sql<{ display_name: string }>`
    select display_name from profiles where user_id = ${userId}
  `;
  return rows[0]?.display_name ?? "Someone";
}

async function writeAudit(
  sql: Sql,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
  before: Record<string, string> | null,
  after: Record<string, string> | null,
) {
  await sql`
    insert into audit_events (
      actor_id, action, entity_type, entity_id, summary, before_json, after_json
    ) values (
      ${actorId},
      ${action},
      ${entityType},
      ${entityId},
      ${summary},
      ${before ? JSON.stringify(before) : null},
      ${after ? JSON.stringify(after) : null}
    )
  `;
}

type ItemRow = {
  id: number;
  title: string;
  detail: string;
  status: string;
  assignee_id: string | null;
  created_by: string;
  created_at: unknown;
  updated_at: unknown;
  completed_at: unknown | null;
  completed_by: string | null;
};

async function loadItem(sql: Sql, id: number): Promise<ItemRow | null> {
  const rows = await sql<ItemRow>`
    select id, title, detail, status, assignee_id, created_by, created_at, updated_at, completed_at, completed_by
    from work_items
    where id = ${id}
  `;
  return rows[0] ?? null;
}

async function assertAssignee(sql: Sql, assigneeId: string | null): Promise<Result | null> {
  if (!assigneeId) return null;
  const rows = await sql<{ user_id: string }>`
    select user_id from profiles where user_id = ${assigneeId}
  `;
  if (!rows.length) return fail("That person is not on this floor.");
  return null;
}

const joinSchema = z.object({
  displayName: z.string().trim().min(1, "Enter the name the crew should see.").max(80),
  role: z.enum(["technician", "supervisor"]),
  floorName: z.string().trim().max(60).default(""),
  supervisorKey: z.string().trim().max(16).default(""),
});

const itemSchema = z.object({
  title: z.string().trim().min(1, "Write what needs doing.").max(140, "Keep the job under 140 characters."),
  detail: z.string().trim().max(2000, "Keep the assignment note under 2000 characters.").default(""),
  assigneeId: z.string().trim().max(120).nullable().default(null),
});

const updateSchema = itemSchema.extend({
  id: z.number().int().positive(),
});

const idSchema = z.object({
  id: z.number().int().positive(),
});

const statusSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["open", "done"]),
});

const noteSchema = z.object({
  body: z.string().trim().min(1, "Write the note first.").max(2000, "Keep the note under 2000 characters."),
  itemId: z.number().int().positive().nullable().default(null),
});

const editNoteSchema = z.object({
  id: z.number().int().positive(),
  body: z.string().trim().min(1, "The note can't be empty.").max(2000),
});

const roleSchema = z.object({
  userId: z.string().trim().min(1).max(120),
  role: z.enum(["technician", "supervisor"]),
});

const renameSchema = z.object({
  floorName: z.string().trim().min(1, "The floor needs a name.").max(60),
});

export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Workspace> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    const floors = await sql<{ floor_name: string; supervisor_key: string }>`
      select floor_name, supervisor_key from floor_settings where id = 1
    `;
    const floor = floors[0] ?? null;
    const hasSupervisor = (await supervisorCount(sql)) > 0;

    if (!profile) {
      return {
        joined: false,
        supervisorExists: hasSupervisor,
        floorName: floor?.floor_name ?? null,
      };
    }

    const role = asRole(profile.role);
    const revealEmail = role === "supervisor";

    const crewRows = await sql<ProfileRow>`
      select user_id, display_name, email, role, created_at
      from profiles
      order by case when role = 'supervisor' then 0 else 1 end, display_name asc
    `;

    const itemRows = await sql<{
      id: number;
      title: string;
      detail: string;
      status: string;
      assignee_id: string | null;
      assignee_name: string | null;
      created_by: string;
      created_by_name: string | null;
      created_at: unknown;
      updated_at: unknown;
      completed_at: unknown | null;
      completed_by: string | null;
      completed_by_name: string | null;
    }>`
      select
        w.id, w.title, w.detail, w.status, w.assignee_id,
        a.display_name as assignee_name,
        w.created_by, c.display_name as created_by_name,
        w.created_at, w.updated_at, w.completed_at, w.completed_by,
        d.display_name as completed_by_name
      from work_items w
      left join profiles a on a.user_id = w.assignee_id
      left join profiles c on c.user_id = w.created_by
      left join profiles d on d.user_id = w.completed_by
      where
        ${role} = 'supervisor'
        or (w.status = 'open' and (w.assignee_id = ${context.userId} or w.assignee_id is null))
        or (w.status = 'done' and (w.assignee_id = ${context.userId} or w.completed_by = ${context.userId}))
      order by case when w.status = 'open' then 0 else 1 end, w.updated_at desc
      limit 300
    `;

    const noteRows = await sql<{
      id: number;
      item_id: number | null;
      item_title: string | null;
      kind: string;
      body: string;
      author_id: string;
      author_name: string | null;
      author_role: string | null;
      created_at: unknown;
      updated_at: unknown;
      acknowledged_by: string | null;
      acknowledged_by_name: string | null;
      acknowledged_at: unknown | null;
    }>`
      select
        n.id, n.item_id, i.title as item_title, n.kind, n.body,
        n.author_id, p.display_name as author_name, p.role as author_role,
        n.created_at, n.updated_at, n.acknowledged_by,
        k.display_name as acknowledged_by_name, n.acknowledged_at
      from notes n
      join profiles p on p.user_id = n.author_id
      left join work_items i on i.id = n.item_id
      left join profiles k on k.user_id = n.acknowledged_by
      where
        ${role} = 'supervisor'
        or n.item_id is null
        or n.author_id = ${context.userId}
        or (i.status = 'open' and (i.assignee_id = ${context.userId} or i.assignee_id is null))
        or (i.status = 'done' and (i.assignee_id = ${context.userId} or i.completed_by = ${context.userId}))
      order by n.created_at desc
      limit 200
    `;

    const auditRows =
      role === "supervisor"
        ? await sql<{
            id: number;
            actor_id: string;
            actor_name: string | null;
            action: string;
            entity_type: string;
            entity_id: string;
            summary: string;
            before_json: string | null;
            after_json: string | null;
            created_at: unknown;
          }>`
            select
              e.id, e.actor_id, p.display_name as actor_name, e.action, e.entity_type,
              e.entity_id, e.summary, e.before_json, e.after_json, e.created_at
            from audit_events e
            left join profiles p on p.user_id = e.actor_id
            order by e.created_at desc
            limit 200
          `
        : [];

    const items: WorkItem[] = itemRows.map((row) => ({
      id: num(row.id),
      title: row.title,
      detail: row.detail,
      status: row.status === "done" ? "done" : "open",
      assigneeId: row.assignee_id,
      assigneeName: row.assignee_name,
      createdBy: row.created_by,
      createdByName: row.created_by_name ?? "Someone",
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      completedAt: row.completed_at ? iso(row.completed_at) : null,
      completedBy: row.completed_by,
      completedByName: row.completed_by_name,
    }));

    const notes: Note[] = noteRows.map((row) => ({
      id: num(row.id),
      itemId: row.item_id === null ? null : num(row.item_id),
      itemTitle: row.item_title,
      kind: (row.kind === "item" ? "item" : "handover") as NoteKind,
      body: row.body,
      authorId: row.author_id,
      authorName: row.author_name ?? "Someone",
      authorRole: asRole(row.author_role ?? "technician"),
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      acknowledgedBy: row.acknowledged_by,
      acknowledgedByName: row.acknowledged_by_name,
      acknowledgedAt: row.acknowledged_at ? iso(row.acknowledged_at) : null,
    }));

    const audit: AuditEvent[] = auditRows.map((row) => ({
      id: num(row.id),
      actorId: row.actor_id,
      actorName: row.actor_name ?? "Someone",
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      summary: row.summary,
      before: parseSnap(row.before_json),
      after: parseSnap(row.after_json),
      createdAt: iso(row.created_at),
    }));

    return {
      joined: true,
      profile: toProfile(profile, true),
      floorName: floor?.floor_name ?? "Main floor",
      supervisorKey: role === "supervisor" ? (floor?.supervisor_key ?? null) : null,
      crew: crewRows.map((row) => toProfile(row, revealEmail)),
      items,
      notes,
      audit,
    };
  });

export const joinFloor = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<Result> => {
    const parsed = read(joinSchema, data);
    if (isFail(parsed)) return parsed;
    const sql = await getSql();
    const existing = await loadProfile(sql, context.userId);
    if (existing) return fail("You are already on this floor.");

    const authRows = await sql<{ name: string; email: string }>`
      select "name", "email" from "user" where "id" = ${context.userId}
    `;
    const authUser = authRows[0];
    if (!authUser) return fail("Sign in again, then join the floor.");

    const hasSupervisor = (await supervisorCount(sql)) > 0;
    if (parsed.role === "supervisor" && hasSupervisor) {
      const floors = await sql<{ supervisor_key: string }>`
        select supervisor_key from floor_settings where id = 1
      `;
      const expected = floors[0]?.supervisor_key ?? "";
      const given = parsed.supervisorKey.toUpperCase();
      if (!expected || !sameSecret(given, expected.toUpperCase())) {
        return fail("That supervisor key does not match. Ask a supervisor for the current key.");
      }
    }

    const floors = await sql<{ id: number }>`select id from floor_settings where id = 1`;
    if (!floors.length) {
      const name =
        parsed.role === "supervisor" && parsed.floorName ? parsed.floorName : "Main floor";
      await sql`
        insert into floor_settings (id, floor_name, supervisor_key)
        values (1, ${name}, ${makeKey()})
        on conflict (id) do nothing
      `;
    } else if (parsed.role === "supervisor" && !hasSupervisor && parsed.floorName) {
      await sql`update floor_settings set floor_name = ${parsed.floorName} where id = 1`;
    }

    const handle = authUser.email.endsWith("@linebook.test")
      ? authUser.email.slice(0, -"@linebook.test".length)
      : authUser.email;
    await sql`
      insert into profiles (user_id, display_name, email, role)
      values (${context.userId}, ${parsed.displayName}, ${handle}, ${parsed.role})
    `;
    await writeAudit(
      sql,
      context.userId,
      "joined",
      "profile",
      context.userId,
      `${parsed.displayName} joined as a ${parsed.role}.`,
      null,
      { Name: parsed.displayName, Role: parsed.role },
    );
    return ok();
  });

export const createItem = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<Result> => {
    const parsed = read(itemSchema, data);
    if (isFail(parsed)) return parsed;
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) return fail("Join the floor first.");
    if (profile.role !== "supervisor") return fail("Only a supervisor can add to the list.");
    const assigneeId = parsed.assigneeId || null;
    const bad = await assertAssignee(sql, assigneeId);
    if (bad) return bad;
    const who = assigneeId ? await displayName(sql, assigneeId) : "the crew pool";
    const inserted = await sql<{ id: number }>`
      insert into work_items (title, detail, assignee_id, created_by)
      values (${parsed.title}, ${parsed.detail}, ${assigneeId}, ${context.userId})
      returning id
    `;
    const id = num(inserted[0]?.id);
    await writeAudit(
      sql,
      context.userId,
      "item_created",
      "item",
      String(id),
      `Added "${parsed.title}" for ${who}.`,
      null,
      {
        Title: parsed.title,
        "Assignment note": parsed.detail || "—",
        Assignee: who,
      },
    );
    return ok();
  });

export const updateItem = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<Result> => {
    const parsed = read(updateSchema, data);
    if (isFail(parsed)) return parsed;
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) return fail("Join the floor first.");
    if (profile.role !== "supervisor") return fail("Only a supervisor can edit the list.");
    const item = await loadItem(sql, parsed.id);
    if (!item) return fail("That job is no longer on the list.");
    const assigneeId = parsed.assigneeId || null;
    const bad = await assertAssignee(sql, assigneeId);
    if (bad) return bad;
    const beforeWho = await displayName(sql, item.assignee_id);
    const afterWho = assigneeId ? await displayName(sql, assigneeId) : "Crew pool";
    const before = {
      Title: item.title,
      "Assignment note": item.detail || "—",
      Assignee: item.assignee_id ? beforeWho : "Crew pool",
    };
    const after = {
      Title: parsed.title,
      "Assignment note": parsed.detail || "—",
      Assignee: afterWho,
    };
    if (JSON.stringify(before) === JSON.stringify(after)) return ok();
    await sql`
      update work_items
      set title = ${parsed.title},
          detail = ${parsed.detail},
          assignee_id = ${assigneeId},
          updated_at = now()
      where id = ${parsed.id}
    `;
    const parts: string[] = [];
    if (before.Title !== after.Title) parts.push("the title");
    if (before["Assignment note"] !== after["Assignment note"]) parts.push("the assignment note");
    if (before.Assignee !== after.Assignee) parts.push("who it is assigned to");
    await writeAudit(
      sql,
      context.userId,
      "item_edited",
      "item",
      String(parsed.id),
      `Edited ${parts.join(" and ")} on "${parsed.title}".`,
      before,
      after,
    );
    return ok();
  });

export const setItemStatus = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<Result> => {
    const parsed = read(statusSchema, data);
    if (isFail(parsed)) return parsed;
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) return fail("Join the floor first.");
    const role = asRole(profile.role);
    const item = await loadItem(sql, parsed.id);
    if (!item) return fail("That job is no longer on the list.");
    if (!canSeeItem(role, context.userId, item)) {
      return fail("That job is assigned to someone else.");
    }
    if (item.status === parsed.status) return ok();
    if (parsed.status === "done") {
      await sql`
        update work_items
        set status = 'done',
            completed_at = now(),
            completed_by = ${context.userId},
            assignee_id = coalesce(assignee_id, ${context.userId}),
            updated_at = now()
        where id = ${parsed.id}
      `;
      await writeAudit(
        sql,
        context.userId,
        "item_completed",
        "item",
        String(parsed.id),
        `Cleared "${item.title}".`,
        { Status: "Outstanding" },
        { Status: "Cleared", By: profile.display_name },
      );
      return ok();
    }
    if (role !== "supervisor" && item.completed_by !== context.userId && item.assignee_id !== context.userId) {
      return fail("Only a supervisor can reopen someone else's job.");
    }
    await sql`
      update work_items
      set status = 'open',
          completed_at = null,
          completed_by = null,
          updated_at = now()
      where id = ${parsed.id}
    `;
    await writeAudit(
      sql,
      context.userId,
      "item_reopened",
      "item",
      String(parsed.id),
      `Reopened "${item.title}".`,
      { Status: "Cleared" },
      { Status: "Outstanding" },
    );
    return ok();
  });

export const claimItem = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<Result> => {
    const parsed = read(idSchema, data);
    if (isFail(parsed)) return parsed;
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) return fail("Join the floor first.");
    const item = await loadItem(sql, parsed.id);
    if (!item) return fail("That job is no longer on the list.");
    if (item.status !== "open") return fail("That job is already cleared.");
    if (item.assignee_id === context.userId) return ok();
    if (item.assignee_id) return fail("Someone else already has that job.");
    await sql`
      update work_items
      set assignee_id = ${context.userId}, updated_at = now()
      where id = ${parsed.id}
    `;
    await writeAudit(
      sql,
      context.userId,
      "item_claimed",
      "item",
      String(parsed.id),
      `${profile.display_name} claimed "${item.title}".`,
      { Assignee: "Crew pool" },
      { Assignee: profile.display_name },
    );
    return ok();
  });

export const deleteItem = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<Result> => {
    const parsed = read(idSchema, data);
    if (isFail(parsed)) return parsed;
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) return fail("Join the floor first.");
    if (profile.role !== "supervisor") return fail("Only a supervisor can remove a job.");
    const item = await loadItem(sql, parsed.id);
    if (!item) return fail("That job is no longer on the list.");
    const who = item.assignee_id ? await displayName(sql, item.assignee_id) : "Crew pool";
    await sql`delete from work_items where id = ${parsed.id}`;
    await writeAudit(
      sql,
      context.userId,
      "item_deleted",
      "item",
      String(parsed.id),
      `Removed "${item.title}" from the list.`,
      {
        Title: item.title,
        "Assignment note": item.detail || "—",
        Assignee: who,
        Status: item.status === "done" ? "Cleared" : "Outstanding",
      },
      null,
    );
    return ok();
  });

export const addNote = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<Result> => {
    const parsed = read(noteSchema, data);
    if (isFail(parsed)) return parsed;
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) return fail("Join the floor first.");
    const role = asRole(profile.role);
    let itemTitle: string | null = null;
    if (parsed.itemId) {
      const item = await loadItem(sql, parsed.itemId);
      if (!item) return fail("That job is no longer on the list.");
      if (!canSeeItem(role, context.userId, item)) {
        return fail("You can only write on jobs you can see.");
      }
      itemTitle = item.title;
    }
    const kind: NoteKind = parsed.itemId ? "item" : "handover";
    const inserted = await sql<{ id: number }>`
      insert into notes (item_id, kind, body, author_id)
      values (${parsed.itemId}, ${kind}, ${parsed.body}, ${context.userId})
      returning id
    `;
    const summary = itemTitle
      ? `${profile.display_name} wrote a note on "${itemTitle}".`
      : `${profile.display_name} left a handover note.`;
    await writeAudit(
      sql,
      context.userId,
      "note_added",
      "note",
      String(num(inserted[0]?.id)),
      summary,
      null,
      { Note: parsed.body, On: itemTitle ?? "Handover" },
    );
    return ok();
  });

export const editNote = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<Result> => {
    const parsed = read(editNoteSchema, data);
    if (isFail(parsed)) return parsed;
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) return fail("Join the floor first.");
    const rows = await sql<{
      id: number;
      body: string;
      author_id: string;
      acknowledged_at: unknown | null;
    }>`
      select id, body, author_id, acknowledged_at from notes where id = ${parsed.id}
    `;
    const note = rows[0];
    if (!note) return fail("That note is gone.");
    if (note.author_id !== context.userId) return fail("You can only edit your own notes.");
    if (note.body === parsed.body) return ok();
    const wasAcked = Boolean(note.acknowledged_at);
    await sql`
      update notes
      set body = ${parsed.body},
          updated_at = now(),
          acknowledged_by = null,
          acknowledged_at = null
      where id = ${parsed.id}
    `;
    await writeAudit(
      sql,
      context.userId,
      "note_edited",
      "note",
      String(parsed.id),
      wasAcked
        ? `${profile.display_name} edited a note. Acknowledgement was cleared.`
        : `${profile.display_name} edited a note.`,
      { Note: note.body },
      { Note: parsed.body },
    );
    return ok();
  });

export const deleteNote = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<Result> => {
    const parsed = read(idSchema, data);
    if (isFail(parsed)) return parsed;
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) return fail("Join the floor first.");
    const rows = await sql<{ id: number; body: string; author_id: string }>`
      select id, body, author_id from notes where id = ${parsed.id}
    `;
    const note = rows[0];
    if (!note) return fail("That note is gone.");
    if (note.author_id !== context.userId && profile.role !== "supervisor") {
      return fail("You can only remove your own notes.");
    }
    await sql`delete from notes where id = ${parsed.id}`;
    await writeAudit(
      sql,
      context.userId,
      "note_deleted",
      "note",
      String(parsed.id),
      `${profile.display_name} removed a note.`,
      { Note: note.body },
      null,
    );
    return ok();
  });

export const ackNote = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<Result> => {
    const parsed = read(idSchema, data);
    if (isFail(parsed)) return parsed;
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) return fail("Join the floor first.");
    if (profile.role !== "supervisor") return fail("Only a supervisor can acknowledge a note.");
    const rows = await sql<{ id: number; author_id: string; acknowledged_at: unknown | null }>`
      select id, author_id, acknowledged_at from notes where id = ${parsed.id}
    `;
    const note = rows[0];
    if (!note) return fail("That note is gone.");
    if (note.acknowledged_at) return ok();
    await sql`
      update notes
      set acknowledged_by = ${context.userId}, acknowledged_at = now()
      where id = ${parsed.id}
    `;
    const author = await displayName(sql, note.author_id);
    await writeAudit(
      sql,
      context.userId,
      "note_acked",
      "note",
      String(parsed.id),
      `${profile.display_name} acknowledged a note from ${author}.`,
      { Acknowledged: "No" },
      { Acknowledged: "Yes", By: profile.display_name },
    );
    return ok();
  });

export const setRole = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<Result> => {
    const parsed = read(roleSchema, data);
    if (isFail(parsed)) return parsed;
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) return fail("Join the floor first.");
    if (profile.role !== "supervisor") return fail("Only a supervisor can change roles.");
    const target = await loadProfile(sql, parsed.userId);
    if (!target) return fail("That person is not on this floor.");
    if (target.role === parsed.role) return ok();
    if (target.role === "supervisor" && parsed.role === "technician") {
      const count = await supervisorCount(sql);
      if (count <= 1) return fail("The floor needs at least one supervisor.");
    }
    await sql`update profiles set role = ${parsed.role} where user_id = ${parsed.userId}`;
    await writeAudit(
      sql,
      context.userId,
      "role_changed",
      "profile",
      parsed.userId,
      `${profile.display_name} changed ${target.display_name} from ${target.role} to ${parsed.role}.`,
      { Role: target.role },
      { Role: parsed.role },
    );
    return ok();
  });

export const rotateKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Result> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) return fail("Join the floor first.");
    if (profile.role !== "supervisor") return fail("Only a supervisor can rotate the key.");
    const next = makeKey();
    await sql`update floor_settings set supervisor_key = ${next} where id = 1`;
    await writeAudit(
      sql,
      context.userId,
      "key_rotated",
      "floor",
      "1",
      `${profile.display_name} rotated the supervisor key.`,
      null,
      null,
    );
    return ok();
  });

export const renameFloor = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<Result> => {
    const parsed = read(renameSchema, data);
    if (isFail(parsed)) return parsed;
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) return fail("Join the floor first.");
    if (profile.role !== "supervisor") return fail("Only a supervisor can rename the floor.");
    const floors = await sql<{ floor_name: string }>`
      select floor_name from floor_settings where id = 1
    `;
    const previous = floors[0]?.floor_name ?? "Main floor";
    if (previous === parsed.floorName) return ok();
    await sql`update floor_settings set floor_name = ${parsed.floorName} where id = 1`;
    await writeAudit(
      sql,
      context.userId,
      "floor_renamed",
      "floor",
      "1",
      `${profile.display_name} renamed the floor to "${parsed.floorName}".`,
      { Floor: previous },
      { Floor: parsed.floorName },
    );
    return ok();
  });
