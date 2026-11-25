import { format, formatDistanceToNow } from "date-fns";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "Something went wrong. Try again.";
}

export function ago(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatDistanceToNow(date, { addSuffix: true });
}

export function stamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "d MMM yyyy, HH:mm");
}

export function roleLabel(role: "technician" | "supervisor"): string {
  return role === "supervisor" ? "Supervisor" : "Technician";
}

export function Boot() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="flex items-center gap-3">
        <Mark />
        <div>
          <p className="font-display text-2xl text-ink">Linebook</p>
          <p className="text-sm text-muted">Opening the floor book…</p>
        </div>
      </div>
    </main>
  );
}

export function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="size-9 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-copper" />
      <path
        d="M8 11h16M8 16h16M8 21h10"
        className="stroke-sheet"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

const control =
  "w-full min-h-11 rounded-xl border border-line bg-sheet px-3 text-base text-ink outline-none placeholder:text-muted";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(control, props.className)} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(control, "min-h-28 py-3", props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(control, props.className)} />;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-sm text-muted">{hint}</span> : null}
    </label>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm font-semibold text-copper-deep">
      {message}
    </p>
  );
}

type ButtonKind = "primary" | "ghost" | "quiet" | "danger";

export function Button({
  kind = "primary",
  pending = false,
  children,
  className,
  disabled,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: ButtonKind; pending?: boolean }) {
  const styles: Record<ButtonKind, string> = {
    primary: "bg-copper text-on-copper hover:bg-copper-deep",
    ghost: "bg-sheet text-ink shadow-sheet hover:bg-paper",
    quiet: "bg-transparent text-ink hover:bg-paper",
    danger: "bg-transparent text-copper-deep hover:bg-paper",
  };
  return (
    <button
      type={type}
      disabled={pending || disabled}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors disabled:opacity-60",
        styles[kind],
        className,
      )}
      {...rest}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

export function Sheet({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-2xl bg-sheet p-4 shadow-sheet md:p-5", className)}>
      {children}
    </section>
  );
}

export function Diff({
  before,
  after,
}: {
  before: Record<string, string> | null;
  after: Record<string, string> | null;
}) {
  const keys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]));
  const changed = keys.filter((key) => (before?.[key] ?? "") !== (after?.[key] ?? ""));
  if (!changed.length) return null;
  return (
    <dl className="mt-3 space-y-2 border-t border-line pt-3 text-sm">
      {changed.map((key) => (
        <div key={key}>
          <dt className="font-semibold text-muted">{key}</dt>
          <dd className="mt-0.5">
            <span className="text-muted line-through decoration-line">{before?.[key] || "—"}</span>
            <span className="px-1.5 text-muted">to</span>
            <span>{after?.[key] || "—"}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
