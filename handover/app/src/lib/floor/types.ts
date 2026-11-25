export type Role = "technician" | "supervisor";

export type Profile = {
  userId: string;
  displayName: string;
  email: string | null;
  role: Role;
  createdAt: string;
};

export type WorkItem = {
  id: number;
  title: string;
  detail: string;
  status: "open" | "done";
  assigneeId: string | null;
  assigneeName: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  completedBy: string | null;
  completedByName: string | null;
};

export type NoteKind = "handover" | "item";

export type Note = {
  id: number;
  itemId: number | null;
  itemTitle: string | null;
  kind: NoteKind;
  body: string;
  authorId: string;
  authorName: string;
  authorRole: Role;
  createdAt: string;
  updatedAt: string;
  acknowledgedBy: string | null;
  acknowledgedByName: string | null;
  acknowledgedAt: string | null;
};

export type AuditEvent = {
  id: number;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  before: Record<string, string> | null;
  after: Record<string, string> | null;
  createdAt: string;
};

export type Workspace =
  | {
      joined: false;
      supervisorExists: boolean;
      floorName: string | null;
    }
  | {
      joined: true;
      profile: Profile;
      floorName: string;
      supervisorKey: string | null;
      crew: Profile[];
      items: WorkItem[];
      notes: Note[];
      audit: AuditEvent[];
    };

export type Result = { ok: true } | { ok: false; error: string };
