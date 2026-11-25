import {
  CircleCheck,
  ClipboardList,
  LayoutDashboard,
  NotebookPen,
  RefreshCw,
  ScrollText,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { UserButton, RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import {
  ackNote,
  addNote,
  claimItem,
  createItem,
  deleteItem,
  deleteNote,
  editNote,
  getWorkspace,
  joinFloor,
  renameFloor,
  rotateKey,
  setItemStatus,
  setRole,
  updateItem,
} from "@/lib/floor/api";
import type { Note, Profile, Result, Role, WorkItem, Workspace } from "@/lib/floor/types";
import {
  Boot,
  Button,
  Diff,
  Field,
  FormError,
  Mark,
  Select,
  Sheet,
  TextArea,
  TextInput,
  ago,
  cx,
  messageOf,
  roleLabel,
  stamp,
} from "@/components/floor/ui";

type Joined = Extract<Workspace, { joined: true }>;
type View = "dash" | "list" | "notes" | "done" | "trail" | "crew";
type Act = (fn: () => Promise<Result>) => Promise<string | null>;

const NAV: Array<{ id: View; label: string; icon: LucideIcon; supervisor?: boolean }> = [
  { id: "dash", label: "Dash", icon: LayoutDashboard },
  { id: "list", label: "List", icon: ClipboardList },
  { id: "notes", label: "Notes", icon: NotebookPen },
  { id: "done", label: "Done", icon: CircleCheck },
  { id: "trail", label: "Trail", icon: ScrollText, supervisor: true },
  { id: "crew", label: "Crew", icon: Users, supervisor: true },
];

export function FloorApp() {
  const user = useCurrentUser();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    getWorkspace()
      .then((next) => {
        if (!live) return;
        setWs(next);
        setError(null);
      })
      .catch((caught) => {
        if (live) setError(messageOf(caught));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [user?.id]);

  async function reload() {
    setRefreshing(true);
    try {
      const next = await getWorkspace();
      setWs(next);
      setError(null);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setRefreshing(false);
    }
  }

  async function act(fn: () => Promise<Result>): Promise<string | null> {
    try {
      const result = await fn();
      if (!result.ok) return result.error;
      const next = await getWorkspace();
      setWs(next);
      setError(null);
      return null;
    } catch (caught) {
      return messageOf(caught);
    }
  }

  if (loading && !ws) return <Boot />;
  if (error === "Unauthorized") return <RedirectToSignIn />;
  if (!ws) {
    return (
      <main className="grid min-h-screen place-items-center px-6">
        <Sheet className="max-w-md">
          <h1 className="font-display text-3xl">The book didn't open</h1>
          <p className="mt-2 text-muted">{error ?? "Try again in a moment."}</p>
          <Button className="mt-4" onClick={() => void reload()}>
            Try again
          </Button>
        </Sheet>
      </main>
    );
  }
  if (!ws.joined) {
    return <Onboard gate={ws} defaultName={user?.displayName ?? ""} act={act} />;
  }
  return <Shell ws={ws} act={act} refreshing={refreshing} onRefresh={() => void reload()} />;
}

function Onboard({
  gate,
  defaultName,
  act,
}: {
  gate: Extract<Workspace, { joined: false }>;
  defaultName: string;
  act: Act;
}) {
  const [name, setName] = useState(defaultName);
  const [role, setRole] = useState<Role>(gate.supervisorExists ? "technician" : "supervisor");
  const [floorName, setFloorName] = useState(gate.floorName ?? "");
  const [supervisorKey, setSupervisorKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const message = await act(() =>
      joinFloor({
        data: {
          displayName: name,
          role,
          floorName,
          supervisorKey,
        },
      }),
    );
    if (message) {
      setError(message);
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <Mark />
        <p className="font-display text-2xl">Linebook</p>
      </div>
      <h1 className="font-display text-4xl">Who are you on the floor?</h1>
      <p className="mt-2 text-muted">
        {gate.floorName
          ? `${gate.floorName} is already open. Pick the role you actually work.`
          : "This is a new floor book. The first supervisor names it and keeps the key."}
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="Name the crew should see">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <RoleChoice
            title="Technician"
            body="Your jobs, the crew pool, and notes everyone can read."
            pressed={role === "technician"}
            onClick={() => setRole("technician")}
          />
          <RoleChoice
            title="Supervisor"
            body="The full list, handover review, and the paper trail."
            pressed={role === "supervisor"}
            onClick={() => setRole("supervisor")}
          />
        </div>
        {role === "supervisor" && !gate.supervisorExists ? (
          <Field label="Floor name" hint="You can change this later. Leave it blank to keep Main floor.">
            <TextInput
              value={floorName}
              onChange={(event) => setFloorName(event.target.value)}
              placeholder="Main floor"
            />
          </Field>
        ) : null}
        {role === "supervisor" && gate.supervisorExists ? (
          <Field label="Supervisor key" hint="A supervisor can read this on the Crew page.">
            <TextInput
              value={supervisorKey}
              onChange={(event) => setSupervisorKey(event.target.value.toUpperCase())}
              autoCapitalize="characters"
              placeholder="ABC-234"
              required
            />
          </Field>
        ) : null}
        {role === "technician" ? (
          <p className="text-sm text-muted">
            Technicians don't need a key. A supervisor can promote you later.
          </p>
        ) : null}
        <FormError message={error} />
        <Button type="submit" pending={pending} className="w-full">
          Join the floor
        </Button>
      </form>
    </main>
  );
}

function RoleChoice({
  title,
  body,
  pressed,
  onClick,
}: {
  title: string;
  body: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        "min-h-28 rounded-2xl p-4 text-left shadow-sheet",
        pressed ? "bg-ink text-paper" : "bg-sheet text-ink",
      )}
    >
      <span className="block font-display text-2xl">{title}</span>
      <span className={cx("mt-1 block text-sm", pressed ? "opacity-80" : "text-muted")}>{body}</span>
    </button>
  );
}

function Shell({
  ws,
  act,
  refreshing,
  onRefresh,
}: {
  ws: Joined;
  act: Act;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [view, setView] = useState<View>("dash");
  const [compose, setCompose] = useState(false);
  const nav = NAV.filter((item) => !item.supervisor || ws.profile.role === "supervisor");
  const waiting = ws.notes.filter((note) => !note.acknowledgedAt).length;

  useEffect(() => {
    if (ws.profile.role === "technician" && (view === "trail" || view === "crew")) {
      setView("dash");
    }
  }, [view, ws.profile.role]);

  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-sheet md:flex">
        <div className="flex items-center gap-3 px-4 py-5">
          <Mark />
          <div className="min-w-0">
            <p className="font-display text-xl leading-none">Linebook</p>
            <p className="mt-1 truncate text-sm text-muted">{ws.floorName}</p>
          </div>
        </div>
        <nav aria-label="Floor" className="flex flex-1 flex-col gap-1 px-3">
          {nav.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={view === item.id}
              badge={item.id === "notes" && ws.profile.role === "supervisor" ? waiting : 0}
              onClick={() => setView(item.id)}
            />
          ))}
        </nav>
        <div className="identity-slot border-t border-line px-4 py-4">
          <p className="truncate text-sm font-semibold">{ws.profile.displayName}</p>
          <p className="mb-2 text-sm text-muted">{roleLabel(ws.profile.role)}</p>
          <UserButton />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 md:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <Mark />
            <div className="min-w-0">
              <p className="font-display text-lg leading-none">Linebook</p>
              <p className="truncate text-sm text-muted">{ws.floorName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Refresh the floor"
              className="grid size-11 place-items-center rounded-full bg-sheet shadow-sheet"
            >
              <RefreshCw className={cx("size-4", refreshing && "animate-spin")} />
            </button>
            <div className="identity-slot max-w-full">
              <UserButton />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-4xl px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-16">
          <div className="mb-5 hidden items-center justify-end gap-3 md:flex">
            <RolePill role={ws.profile.role} />
            <Button kind="ghost" onClick={onRefresh} disabled={refreshing} aria-label="Refresh the floor">
              <RefreshCw className={cx("size-4", refreshing && "animate-spin")} />
              Refresh
            </Button>
          </div>
          {view === "dash" ? (
            <Dash ws={ws} act={act} onOpenList={() => { setCompose(true); setView("list"); }} onOpen={setView} />
          ) : null}
          {view === "list" ? (
            <ListView ws={ws} act={act} compose={compose} setCompose={setCompose} />
          ) : null}
          {view === "notes" ? <NotesView ws={ws} act={act} /> : null}
          {view === "done" ? <DoneView ws={ws} act={act} /> : null}
          {view === "trail" && ws.profile.role === "supervisor" ? <TrailView ws={ws} /> : null}
          {view === "crew" && ws.profile.role === "supervisor" ? <CrewView ws={ws} act={act} /> : null}
        </main>

        <nav aria-label="Floor" className="dock fixed inset-x-0 bottom-0 z-20 border-t border-line bg-sheet md:hidden">
          <div className={cx("grid", nav.length > 4 ? "grid-cols-6" : "grid-cols-4")}>
            {nav.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => setView(item.id)}
                  className={cx(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold",
                    active ? "text-copper-deep" : "text-muted",
                  )}
                >
                  <Icon className="size-5" />
                  {item.label}
                  {item.id === "notes" && waiting > 0 && ws.profile.role === "supervisor" ? (
                    <span className="sr-only">{waiting} notes waiting</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

function NavButton({
  item,
  active,
  badge,
  onClick,
}: {
  item: (typeof NAV)[number];
  active: boolean;
  badge: number;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cx(
        "flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold",
        active ? "bg-paper text-copper-deep" : "text-ink hover:bg-paper",
      )}
    >
      <Icon className="size-5 shrink-0" />
      <span className="flex-1">{item.label}</span>
      {badge > 0 ? (
        <span className="inline-flex min-w-6 justify-center rounded-full bg-copper px-1.5 text-xs font-semibold text-on-copper tabular-nums">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function RolePill({ role }: { role: Role }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-sheet px-3 py-1 text-sm font-semibold shadow-sheet">
      <span className="size-2 rounded-full bg-copper" />
      {roleLabel(role)}
    </span>
  );
}

function PageHead({ kicker, title, lede }: { kicker: string; title: string; lede: string }) {
  return (
    <header className="mb-6">
      <p className="text-sm font-semibold tracking-wide text-copper-deep uppercase">{kicker}</p>
      <h1 className="mt-1 font-display text-3xl text-ink md:text-4xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-muted">{lede}</p>
    </header>
  );
}

function Dash({
  ws,
  act,
  onOpenList,
  onOpen,
}: {
  ws: Joined;
  act: Act;
  onOpenList: () => void;
  onOpen: (view: View) => void;
}) {
  const open = ws.items.filter((item) => item.status === "open");
  const mine = open.filter((item) => item.assigneeId === ws.profile.userId);
  const pool = open.filter((item) => !item.assigneeId);
  const done = ws.items.filter((item) => item.status === "done");
  const waiting = ws.notes.filter((note) => !note.acknowledgedAt);
  const supervisor = ws.profile.role === "supervisor";

  return (
    <div className="space-y-6">
      <PageHead
        kicker={ws.floorName}
        title={supervisor ? "The floor today" : "Your shift"}
        lede={
          supervisor
            ? "Outstanding work, notes the crew left, and the latest edits."
            : "Jobs with your name on them, anything still in the pool, and notes from the crew."
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={supervisor ? "Outstanding" : "Yours"} value={supervisor ? open.length : mine.length} />
        <Stat label={supervisor ? "Notes waiting" : "Crew pool"} value={supervisor ? waiting.length : pool.length} />
        <Stat label="Cleared" value={done.length} />
        <Stat label="On the book" value={ws.crew.length} />
      </div>

      {supervisor && open.length === 0 && ws.notes.length === 0 ? (
        <Sheet>
          <h2 className="font-display text-2xl">Start the book</h2>
          <ol className="mt-3 space-y-2 text-sm">
            <li>1. Add the jobs that are still outstanding, and who should take them.</li>
            <li>2. Open Crew and keep the supervisor key for anyone else who supervises.</li>
            <li>3. Technicians sign in, join without a key, and write handover notes you can acknowledge.</li>
          </ol>
          <Button className="mt-4" onClick={onOpenList}>
            Add the first job
          </Button>
        </Sheet>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-2xl">{supervisor ? "Handover waiting" : "Latest notes"}</h2>
          <button type="button" className="min-h-11 text-sm font-semibold text-copper-deep" onClick={() => onOpen("notes")}>
            All notes
          </button>
        </div>
        {(supervisor ? waiting : ws.notes).slice(0, 3).length === 0 ? (
          <Empty
            title="No notes yet"
            body={
              supervisor
                ? "When a technician writes a handover, it shows up here until you acknowledge it."
                : "Leave a note for the next shift. Supervisors and the rest of the crew can read it."
            }
          />
        ) : (
          (supervisor ? waiting : ws.notes).slice(0, 3).map((note) => (
            <NoteCard key={note.id} note={note} ws={ws} act={act} />
          ))
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-2xl">{supervisor ? "Still outstanding" : "Your open jobs"}</h2>
          <button type="button" className="min-h-11 text-sm font-semibold text-copper-deep" onClick={() => onOpen("list")}>
            Full list
          </button>
        </div>
        {(supervisor ? open : mine).slice(0, 4).length === 0 ? (
          <Empty
            title={supervisor ? "The list is clear" : "Nothing assigned to you"}
            body={
              supervisor
                ? "Add a job when something still needs doing."
                : "Check the crew pool on the list, or wait for a supervisor to assign you."
            }
          />
        ) : (
          (supervisor ? open : mine).slice(0, 4).map((item) => (
            <JobCard key={item.id} item={item} ws={ws} act={act} notes={ws.notes} />
          ))
        )}
        {supervisor ? (
          <Button kind="ghost" onClick={onOpenList}>
            Add to the list
          </Button>
        ) : null}
      </section>

      {supervisor ? (
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-display text-2xl">Paper trail</h2>
            <button type="button" className="min-h-11 text-sm font-semibold text-copper-deep" onClick={() => onOpen("trail")}>
              Full trail
            </button>
          </div>
          {ws.audit.slice(0, 4).length === 0 ? (
            <Empty title="Nothing has moved" body="Edits to the list, notes, and crew are kept here." />
          ) : (
            ws.audit.slice(0, 4).map((event) => <TrailRow key={event.id} event={event} />)
          )}
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-sheet p-4 shadow-sheet">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl tabular-nums">{value}</p>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <Sheet>
      <h3 className="font-display text-xl">{title}</h3>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </Sheet>
  );
}

function ListView({
  ws,
  act,
  compose,
  setCompose,
}: {
  ws: Joined;
  act: Act;
  compose: boolean;
  setCompose: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const supervisor = ws.profile.role === "supervisor";
  const open = ws.items.filter((item) => item.status === "open");
  const q = query.trim().toLowerCase();
  const filtered = open.filter((item) => {
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      item.detail.toLowerCase().includes(q) ||
      (item.assigneeName ?? "crew pool").toLowerCase().includes(q)
    );
  });
  const mine = filtered.filter((item) => item.assigneeId === ws.profile.userId);
  const pool = filtered.filter((item) => !item.assigneeId);
  const others = filtered.filter((item) => item.assigneeId && item.assigneeId !== ws.profile.userId);

  return (
    <div className="space-y-6">
      <PageHead
        kicker="Outstanding"
        title="The list"
        lede={
          supervisor
            ? "Add what still needs doing, assign it, and write the note the technician should read. Every edit is kept on the trail."
            : "These are your jobs and anything still in the crew pool. Clear a job when it is actually done."
        }
      />
      <TextInput
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Find a job"
        aria-label="Find a job"
      />
      {supervisor ? (
        compose ? (
          <JobComposer ws={ws} act={act} onClose={() => setCompose(false)} />
        ) : (
          <Button onClick={() => setCompose(true)}>Add to the list</Button>
        )
      ) : null}
      {filtered.length === 0 ? (
        <Empty
          title={q ? "Nothing matches" : "Nothing outstanding"}
          body={
            q
              ? "Try a different word, or clear the search."
              : supervisor
                ? "The list is clear. Add a job when the floor still owes something."
                : "You have no open jobs, and the pool is empty."
          }
        />
      ) : (
        <div className="space-y-8">
          <JobGroup title="Yours" items={mine} ws={ws} act={act} />
          <JobGroup title="Crew pool" items={pool} ws={ws} act={act} />
          {supervisor ? <JobGroup title="Assigned" items={others} ws={ws} act={act} /> : null}
        </div>
      )}
    </div>
  );
}

function JobGroup({
  title,
  items,
  ws,
  act,
}: {
  title: string;
  items: WorkItem[];
  ws: Joined;
  act: Act;
}) {
  if (!items.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl">
        {title}
        <span className="ml-2 text-base text-muted tabular-nums">{items.length}</span>
      </h2>
      {items.map((item) => (
        <JobCard key={item.id} item={item} ws={ws} act={act} notes={ws.notes} />
      ))}
    </section>
  );
}

function JobComposer({ ws, act, onClose }: { ws: Joined; act: Act; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const message = await act(() =>
      createItem({ data: { title, detail, assigneeId: assigneeId || null } }),
    );
    setError(message);
    setPending(false);
    if (!message) {
      setTitle("");
      setDetail("");
      setAssigneeId("");
      onClose();
    }
  }

  return (
    <Sheet>
      <form onSubmit={onSubmit} className="space-y-4">
        <h2 className="font-display text-2xl">Add a job</h2>
        <Field label="What needs doing">
          <TextInput value={title} onChange={(event) => setTitle(event.target.value)} required />
        </Field>
        <Field label="Assignment note" hint="What the technician should know before they start.">
          <TextArea value={detail} onChange={(event) => setDetail(event.target.value)} />
        </Field>
        <Field label="Assign to">
          <Select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
            <option value="">Crew pool — anyone can claim it</option>
            {ws.crew.map((person) => (
              <option key={person.userId} value={person.userId}>
                {person.displayName} · {roleLabel(person.role)}
              </option>
            ))}
          </Select>
        </Field>
        <FormError message={error} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" pending={pending}>
            Add to the list
          </Button>
          <Button kind="quiet" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function JobCard({
  item,
  ws,
  act,
  notes,
}: {
  item: WorkItem;
  ws: Joined;
  act: Act;
  notes: Note[];
}) {
  const [mode, setMode] = useState<"edit" | "note" | "remove" | null>(null);
  const [title, setTitle] = useState(item.title);
  const [detail, setDetail] = useState(item.detail);
  const [assigneeId, setAssigneeId] = useState(item.assigneeId ?? "");
  const [noteBody, setNoteBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const supervisor = ws.profile.role === "supervisor";
  const related = notes.filter((note) => note.itemId === item.id).slice(0, 2);

  async function run(fn: () => Promise<Result>, after?: () => void) {
    setPending(true);
    const message = await act(fn);
    setError(message);
    setPending(false);
    if (!message) after?.();
  }

  return (
    <Sheet>
      <div className="flex gap-3">
        <button
          type="button"
          aria-label={item.status === "done" ? `Reopen ${item.title}` : `Clear ${item.title}`}
          disabled={pending}
          onClick={() =>
            void run(() =>
              setItemStatus({
                data: { id: item.id, status: item.status === "done" ? "open" : "done" },
              }),
            )
          }
          className="grid size-11 shrink-0 place-items-center rounded-full border border-line bg-paper"
        >
          {item.status === "done" ? (
            <CircleCheck className="size-5 text-pine" />
          ) : (
            <span className="size-3 rounded-full border-2 border-copper" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-display text-xl leading-snug">{item.title}</h3>
            <span className="rounded-full bg-paper px-2.5 py-1 text-xs font-semibold text-muted">
              {item.assigneeName ?? "Crew pool"}
            </span>
          </div>
          {item.detail ? (
            <p className="mt-2 border-l-2 border-copper pl-3 text-sm whitespace-pre-wrap">{item.detail}</p>
          ) : null}
          <p className="mt-2 text-sm text-muted">
            Added by {item.createdByName} · {ago(item.createdAt)}
            {item.completedByName ? ` · Cleared by ${item.completedByName}` : ""}
          </p>
          {related.length ? (
            <ul className="mt-3 space-y-2 border-t border-line pt-3">
              {related.map((note) => (
                <li key={note.id} className="text-sm">
                  <span className="font-semibold">{note.authorName}</span>
                  <span className="text-muted"> · {ago(note.createdAt)}</span>
                  <p className="whitespace-pre-wrap">{note.body}</p>
                </li>
              ))}
            </ul>
          ) : null}
          {mode === "edit" && supervisor ? (
            <form
              className="mt-3 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void run(
                  () => updateItem({ data: { id: item.id, title, detail, assigneeId: assigneeId || null } }),
                  () => setMode(null),
                );
              }}
            >
              <Field label="Title">
                <TextInput value={title} onChange={(event) => setTitle(event.target.value)} required />
              </Field>
              <Field label="Assignment note">
                <TextArea value={detail} onChange={(event) => setDetail(event.target.value)} />
              </Field>
              <Field label="Assign to">
                <Select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                  <option value="">Crew pool</option>
                  {ws.crew.map((person) => (
                    <option key={person.userId} value={person.userId}>
                      {person.displayName}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" pending={pending}>
                  Save edit
                </Button>
                <Button kind="quiet" onClick={() => setMode(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}
          {mode === "note" ? (
            <form
              className="mt-3 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void run(
                  () => addNote({ data: { body: noteBody, itemId: item.id } }),
                  () => {
                    setNoteBody("");
                    setMode(null);
                  },
                );
              }}
            >
              <Field label="Note for the crew">
                <TextArea value={noteBody} onChange={(event) => setNoteBody(event.target.value)} required />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" pending={pending}>
                  Save note
                </Button>
                <Button kind="quiet" onClick={() => setMode(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}
          {mode === "remove" ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm">Remove this job from the list? The paper trail keeps the record.</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  kind="danger"
                  pending={pending}
                  onClick={() => void run(() => deleteItem({ data: { id: item.id } }))}
                >
                  Remove job
                </Button>
                <Button kind="quiet" onClick={() => setMode(null)}>
                  Keep it
                </Button>
              </div>
            </div>
          ) : null}
          <FormError message={error} />
          {mode === null ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {!item.assigneeId && item.status === "open" ? (
                <Button kind="ghost" pending={pending} onClick={() => void run(() => claimItem({ data: { id: item.id } }))}>
                  Claim
                </Button>
              ) : null}
              <Button kind="quiet" onClick={() => setMode("note")}>
                Add a note
              </Button>
              {supervisor ? (
                <Button
                  kind="quiet"
                  onClick={() => {
                    setTitle(item.title);
                    setDetail(item.detail);
                    setAssigneeId(item.assigneeId ?? "");
                    setMode("edit");
                  }}
                >
                  Edit
                </Button>
              ) : null}
              {supervisor ? (
                <Button kind="danger" onClick={() => setMode("remove")}>
                  Remove
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}

function NotesView({ ws, act }: { ws: Joined; act: Act }) {
  const [waitingOnly, setWaitingOnly] = useState(false);
  const supervisor = ws.profile.role === "supervisor";
  const notes = ws.notes.filter((note) => (waitingOnly ? !note.acknowledgedAt : true));

  return (
    <div className="space-y-6">
      <PageHead
        kicker="Handover"
        title="Notes"
        lede="Technicians and supervisors write here. Everyone on the floor can read them. Supervisors acknowledge what they have checked."
      />
      <NoteComposer ws={ws} act={act} />
      {supervisor ? (
        <button
          type="button"
          aria-pressed={waitingOnly}
          onClick={() => setWaitingOnly((value) => !value)}
          className={cx(
            "min-h-11 rounded-full px-4 text-sm font-semibold",
            waitingOnly ? "bg-ink text-paper" : "bg-sheet text-ink shadow-sheet",
          )}
        >
          {waitingOnly ? "Showing notes still waiting" : "Show only notes waiting"}
        </button>
      ) : null}
      {notes.length === 0 ? (
        <Empty
          title={waitingOnly ? "Nothing waiting" : "No notes yet"}
          body={
            waitingOnly
              ? "Every current note has been acknowledged."
              : "Write what the next shift needs to know, or attach a note to a job."
          }
        />
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} ws={ws} act={act} />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteComposer({ ws, act }: { ws: Joined; act: Act }) {
  const [body, setBody] = useState("");
  const [itemId, setItemId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const open = ws.items.filter((item) => item.status === "open");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const message = await act(() =>
      addNote({ data: { body, itemId: itemId ? Number(itemId) : null } }),
    );
    setError(message);
    setPending(false);
    if (!message) {
      setBody("");
      setItemId("");
    }
  }

  return (
    <Sheet>
      <form onSubmit={onSubmit} className="space-y-4">
        <h2 className="font-display text-2xl">Leave a note</h2>
        <Field label="What should the crew know?">
          <TextArea value={body} onChange={(event) => setBody(event.target.value)} required />
        </Field>
        <Field label="About a job" hint="Optional. Leave it as a handover if it is about the shift.">
          <Select value={itemId} onChange={(event) => setItemId(event.target.value)}>
            <option value="">Handover — the whole shift</option>
            {open.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </Select>
        </Field>
        <FormError message={error} />
        <Button type="submit" pending={pending}>
          Post note
        </Button>
      </form>
    </Sheet>
  );
}

function NoteCard({ note, ws, act }: { note: Note; ws: Joined; act: Act }) {
  const [mode, setMode] = useState<"edit" | "remove" | null>(null);
  const [body, setBody] = useState(note.body);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const mine = note.authorId === ws.profile.userId;
  const supervisor = ws.profile.role === "supervisor";
  const edited = new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 2000;

  async function run(fn: () => Promise<Result>, after?: () => void) {
    setPending(true);
    const message = await act(fn);
    setError(message);
    setPending(false);
    if (!message) after?.();
  }

  return (
    <Sheet>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">
          {note.authorName}
          <span className="font-normal text-muted"> · {roleLabel(note.authorRole)}</span>
        </p>
        <p className="text-sm text-muted">{stamp(note.createdAt)}</p>
      </div>
      <p className="mt-1 text-sm font-semibold text-copper-deep">
        {note.kind === "handover" ? "Handover" : note.itemTitle ? `On “${note.itemTitle}”` : "On a job"}
        {edited ? " · edited" : ""}
      </p>
      {mode === "edit" ? (
        <form
          className="mt-3 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => editNote({ data: { id: note.id, body } }), () => setMode(null));
          }}
        >
          <TextArea value={body} onChange={(event) => setBody(event.target.value)} required />
          <p className="text-sm text-muted">Editing clears a supervisor's acknowledgement so they can check it again.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" pending={pending}>
              Save note
            </Button>
            <Button kind="quiet" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-3 whitespace-pre-wrap">{note.body}</p>
      )}
      <div className="mt-3">
        {note.acknowledgedAt ? (
          <p className="text-sm font-semibold text-pine">
            Seen by {note.acknowledgedByName ?? "a supervisor"} · {ago(note.acknowledgedAt)}
          </p>
        ) : supervisor ? (
          <Button kind="ghost" pending={pending} onClick={() => void run(() => ackNote({ data: { id: note.id } }))}>
            Acknowledge
          </Button>
        ) : (
          <p className="text-sm text-muted">Waiting on a supervisor</p>
        )}
      </div>
      {mode === "remove" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button kind="danger" pending={pending} onClick={() => void run(() => deleteNote({ data: { id: note.id } }))}>
            Remove note
          </Button>
          <Button kind="quiet" onClick={() => setMode(null)}>
            Keep it
          </Button>
        </div>
      ) : null}
      <FormError message={error} />
      {mode === null ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {mine ? (
            <Button kind="quiet" onClick={() => { setBody(note.body); setMode("edit"); }}>
              Edit
            </Button>
          ) : null}
          {mine || supervisor ? (
            <Button kind="danger" onClick={() => setMode("remove")}>
              Remove
            </Button>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}

function DoneView({ ws, act }: { ws: Joined; act: Act }) {
  const done = ws.items.filter((item) => item.status === "done");
  return (
    <div className="space-y-6">
      <PageHead
        kicker="Cleared"
        title="Done"
        lede={
          ws.profile.role === "supervisor"
            ? "Jobs taken off the outstanding list. Reopen one if it was cleared too soon."
            : "Jobs you cleared, or that were assigned to you and finished."
        }
      />
      {done.length === 0 ? (
        <Empty title="Nothing cleared yet" body="When a job is marked done, it leaves the outstanding list and lands here." />
      ) : (
        <div className="space-y-3">
          {done.map((item) => (
            <JobCard key={item.id} item={item} ws={ws} act={act} notes={ws.notes} />
          ))}
        </div>
      )}
    </div>
  );
}

function TrailView({ ws }: { ws: Joined }) {
  const [filter, setFilter] = useState<"All" | "List" | "Notes" | "Crew">("All");
  const events = ws.audit.filter((event) => filter === "All" || bucket(event.entityType) === filter);
  return (
    <div className="space-y-6">
      <PageHead
        kicker="Supervisor"
        title="Paper trail"
        lede="Every edit to the list, a note, or the crew is kept here with who did it and what changed."
      />
      <div className="flex flex-wrap gap-2">
        {(["All", "List", "Notes", "Crew"] as const).map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={filter === name}
            onClick={() => setFilter(name)}
            className={cx(
              "min-h-11 rounded-full px-4 text-sm font-semibold",
              filter === name ? "bg-ink text-paper" : "bg-sheet text-ink shadow-sheet",
            )}
          >
            {name}
          </button>
        ))}
      </div>
      {events.length === 0 ? (
        <Empty title="The trail is empty" body="Add or edit a job and the change will show up here." />
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <TrailRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function bucket(entityType: string): "List" | "Notes" | "Crew" {
  if (entityType === "item") return "List";
  if (entityType === "note") return "Notes";
  return "Crew";
}

function TrailRow({ event }: { event: Joined["audit"][number] }) {
  return (
    <Sheet>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-copper-deep">{bucket(event.entityType)}</p>
        <p className="text-sm text-muted">{stamp(event.createdAt)}</p>
      </div>
      <p className="mt-1">
        <span className="font-semibold">{event.actorName}</span>
        <span> · {event.summary}</span>
      </p>
      <Diff before={event.before} after={event.after} />
    </Sheet>
  );
}

function CrewView({ ws, act }: { ws: Joined; act: Act }) {
  const [floorName, setFloorName] = useState(ws.floorName);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(fn: () => Promise<Result>) {
    setPending(true);
    const message = await act(fn);
    setError(message);
    setPending(false);
    return message;
  }

  return (
    <div className="space-y-6">
      <PageHead
        kicker="Supervisor"
        title="Crew"
        lede="Promote another supervisor only if you trust them with the list and the trail. Technicians never see the key."
      />
      <Sheet>
        <h2 className="font-display text-2xl">Supervisor key</h2>
        <p className="mt-2 text-sm text-muted">
          Someone who already has an account enters this when they join as a supervisor.
        </p>
        <p className="mt-4 font-display text-3xl tracking-wide">{ws.supervisorKey ?? "—"}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            kind="ghost"
            onClick={() => {
              if (!ws.supervisorKey) return;
              void navigator.clipboard.writeText(ws.supervisorKey).then(
                () => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                },
                () => setCopied(false),
              );
            }}
          >
            {copied ? "Copied" : "Copy key"}
          </Button>
          {confirmRotate ? (
            <Button
              kind="danger"
              pending={pending}
              onClick={() =>
                void run(() => rotateKey()).then((message) => {
                  if (!message) setConfirmRotate(false);
                })
              }
            >
              Confirm rotate
            </Button>
          ) : (
            <Button kind="quiet" onClick={() => setConfirmRotate(true)}>
              Rotate key
            </Button>
          )}
        </div>
      </Sheet>
      <Sheet>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => renameFloor({ data: { floorName } }));
          }}
        >
          <Field label="Floor name">
            <TextInput value={floorName} onChange={(event) => setFloorName(event.target.value)} required />
          </Field>
          <Button type="submit" pending={pending}>
            Rename floor
          </Button>
        </form>
      </Sheet>
      <div className="space-y-3">
        {ws.crew.map((person) => (
          <CrewRow key={person.userId} person={person} self={person.userId === ws.profile.userId} act={act} />
        ))}
      </div>
      <FormError message={error} />
    </div>
  );
}

function CrewRow({ person, self, act }: { person: Profile; self: boolean; act: Act }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const next: Role = person.role === "supervisor" ? "technician" : "supervisor";

  return (
    <Sheet>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {person.displayName}
            {self ? <span className="font-normal text-muted"> · You</span> : null}
          </p>
          <p className="text-sm text-muted">
            {roleLabel(person.role)}
            {person.email
              ? person.email.includes("@")
                ? ` · ${person.email}`
                : ` · @${person.email}`
              : ""}
          </p>
        </div>
        <Button
          kind="ghost"
          pending={pending}
          onClick={() => {
            setPending(true);
            void act(() => setRole({ data: { userId: person.userId, role: next } })).then((message) => {
              setError(message);
              setPending(false);
            });
          }}
        >
          {next === "supervisor" ? "Make supervisor" : "Make technician"}
        </Button>
      </div>
      <FormError message={error} />
    </Sheet>
  );
}
