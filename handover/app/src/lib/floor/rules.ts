/** Pure floor rules, shared by the server functions and covered by unit tests. */

type Role = "technician" | "supervisor";

const KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Minimal shape of a job row needed to decide who may see it. */
export type VisibilityRow = {
  status: string;
  assignee_id: string | null;
  completed_by: string | null;
};

/**
 * Supervisors see every job. Technicians see open jobs that are theirs or in
 * the crew pool, and finished jobs they were assigned or cleared themselves.
 */
export function canSeeItem(role: Role, userId: string, item: VisibilityRow): boolean {
  if (role === "supervisor") return true;
  if (item.status === "open") return item.assignee_id === userId || item.assignee_id === null;
  return item.assignee_id === userId || item.completed_by === userId;
}

export function asRole(value: string): Role {
  return value === "supervisor" ? "supervisor" : "technician";
}

/** A supervisor key like `K7M-4QX`, unbiased over a 32-symbol alphabet. */
export function makeKey(fill: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const bytes = fill(new Uint8Array(6));
  let raw = "";
  // 256 is a multiple of 32, so `% 32` introduces no modulo bias.
  for (const byte of bytes) raw += KEY_ALPHABET[byte % KEY_ALPHABET.length];
  return `${raw.slice(0, 3)}-${raw.slice(3)}`;
}

/** Constant-time string comparison for secrets such as the supervisor key. */
export function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
