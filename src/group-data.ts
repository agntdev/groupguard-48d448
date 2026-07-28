import { resolveSessionStorage } from "./toolkit/index.js";
import type { StorageAdapter } from "grammy";
import { now } from "./clock.js";

export type Role = "owner" | "admin" | "moderator" | "member";
export type EventType = "announcement" | "reminder" | "poll";

export interface GroupSettings {
  groupId: number;
  bannedWords: string[];
  autoMuteDuration: number;
  onboardingRequired: boolean;
  webhookUrl?: string;
  roles: Record<string, Role>;
  memberIds: number[];
}
export interface Punishment { groupId: number; userId: number; reason: string; mutedUntil: number; active: boolean; }
export interface ModerationLog { actionType: string; userId: number; timestamp: number; reason: string; }
export interface Appeal { id: string; groupId: number; userId: number; status: "open" | "approved" | "rejected"; createdAt: number; }
export interface ScheduledEvent { id: string; groupId: number; eventType: EventType; scheduledTime: number; targetRoles: Role[]; content: string; delivered: boolean; }

// The toolkit selects Redis in production. The same adapter has an isolated
// in-memory implementation for the tokenless replay harness.
let storage: StorageAdapter<Record<string, unknown>> = resolveSessionStorage<Record<string, unknown>>(
  undefined,
  typeof process === "undefined" ? {} : process.env,
);

/** Worker startup supplies its Durable-Object adapter; Node uses Redis. */
export function configureDomainStorage(next: StorageAdapter<Record<string, unknown>>): void {
  storage = next;
}
const key = (name: string) => `groupguard:${name}`;
async function get<T>(name: string): Promise<T | undefined> { return (await storage.read(key(name))) as T | undefined; }
async function put<T>(name: string, value: T): Promise<void> { await storage.write(key(name), value as Record<string, unknown>); }

export async function settings(groupId: number): Promise<GroupSettings> {
  const existing = await get<GroupSettings>(`settings:${groupId}`);
  if (existing) return existing;
  const created: GroupSettings = { groupId, bannedWords: [], autoMuteDuration: 3600, onboardingRequired: true, roles: {}, memberIds: [] };
  await put(`settings:${groupId}`, created);
  await addGroupToIndex(groupId);
  return created;
}
export async function saveSettings(value: GroupSettings): Promise<void> { await put(`settings:${value.groupId}`, value); }
async function addGroupToIndex(groupId: number): Promise<void> {
  const groups = (await get<number[]>("groups")) ?? [];
  if (!groups.includes(groupId)) await put("groups", [...groups, groupId]);
}
export async function ensureMember(groupId: number, userId: number): Promise<GroupSettings> {
  const value = await settings(groupId);
  if (!value.memberIds.includes(userId)) { value.memberIds.push(userId); await saveSettings(value); }
  const userGroups = (await get<number[]>(`user-groups:${userId}`)) ?? [];
  if (!userGroups.includes(groupId)) await put(`user-groups:${userId}`, [...userGroups, groupId]);
  return value;
}
export async function roleFor(groupId: number, userId: number): Promise<Role> { return (await settings(groupId)).roles[String(userId)] ?? "member"; }
export const rank: Record<Role, number> = { member: 0, moderator: 1, admin: 2, owner: 3 };
export async function setRole(groupId: number, userId: number, role: Role): Promise<void> {
  const value = await ensureMember(groupId, userId); value.roles[String(userId)] = role; await saveSettings(value);
}
export async function addLog(groupId: number, item: ModerationLog): Promise<void> {
  const list = (await get<ModerationLog[]>(`logs:${groupId}`)) ?? [];
  const cutoff = now().getTime() - 365 * 24 * 60 * 60 * 1000;
  await put(`logs:${groupId}`, [...list.filter((x) => x.timestamp >= cutoff), item]);
}
export async function punish(value: Punishment): Promise<void> { await put(`punishment:${value.groupId}:${value.userId}`, value); }
export async function punishment(groupId: number, userId: number): Promise<Punishment | undefined> { return get(`punishment:${groupId}:${userId}`); }
export async function groupsForUser(userId: number): Promise<number[]> { return (await get<number[]>(`user-groups:${userId}`)) ?? []; }
export async function addAppeal(value: Appeal): Promise<void> {
  await put(`appeal:${value.id}`, value);
  const ids = (await get<string[]>(`appeals:${value.groupId}`)) ?? [];
  await put(`appeals:${value.groupId}`, [...ids, value.id]);
}
export async function appeal(id: string): Promise<Appeal | undefined> { return get(`appeal:${id}`); }
export async function saveAppeal(value: Appeal): Promise<void> { await put(`appeal:${value.id}`, value); }
export async function addEvent(value: ScheduledEvent): Promise<void> {
  await put(`event:${value.id}`, value);
  const ids = (await get<string[]>(`events:${value.groupId}`)) ?? [];
  await put(`events:${value.groupId}`, [...ids, value.id]);
}
export async function dueEvents(groupId: number): Promise<ScheduledEvent[]> {
  const ids = (await get<string[]>(`events:${groupId}`)) ?? [];
  const all = await Promise.all(ids.map((id) => get<ScheduledEvent>(`event:${id}`)));
  return all.filter((x): x is ScheduledEvent => !!x && !x.delivered && x.scheduledTime <= now().getTime());
}
export async function saveEvent(value: ScheduledEvent): Promise<void> { await put(`event:${value.id}`, value); }
export function opaqueId(prefix: string): string { return `${prefix}_${now().getTime().toString(36)}_${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`; }
