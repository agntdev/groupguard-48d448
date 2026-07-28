import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { addEvent, dueEvents, opaqueId, rank, roleFor, saveEvent, settings, type EventType } from "../group-data.js";
import { now } from "../clock.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { scheduleTelegramCall, type WorkerEnv } from "../toolkit/session/durable.js";

registerMainMenuItem({ label: "Schedule a post", data: "schedule:open", order: 30 });
const composer = new Composer<Ctx>();
type FlowSession = { eventType?: EventType; eventTime?: number };
function pollParts(content: string): { question: string; options: string[] } | undefined {
  const parts = content.split("|").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3 || parts.length > 13) return undefined;
  return { question: parts[0], options: parts.slice(1) };
}
async function allowed(ctx: Ctx) { return !!ctx.chat && !!ctx.from && rank[await roleFor(ctx.chat.id, ctx.from.id)] >= rank.moderator; }
const chooser = inlineKeyboard([[inlineButton("Announcement", "schedule:announcement"), inlineButton("Reminder", "schedule:reminder")], [inlineButton("Poll", "schedule:poll")], [inlineButton("Open menu", "menu:main")]]);
async function open(ctx: Ctx) { if (!await allowed(ctx)) { await ctx.reply("Only a moderator can schedule a group post."); return; } await ctx.reply("Choose the kind of post to schedule.", { reply_markup: chooser }); }
composer.command("schedule", open);
composer.callbackQuery("schedule:open", async (ctx) => { await ctx.answerCallbackQuery(); await open(ctx); });
composer.on("callback_query:data", async (ctx, next) => { const match = /^schedule:(announcement|reminder|poll)$/.exec(ctx.callbackQuery.data); if (!match) return next(); await ctx.answerCallbackQuery(); if (!await allowed(ctx)) { await ctx.editMessageText("Only a moderator can schedule a group post."); return; } (ctx.session as FlowSession).eventType = match[1] as EventType; await ctx.editMessageText("Send the delivery time as an ISO date and time, for example 2026-08-01T09:00:00Z."); });
composer.callbackQuery("schedule:deliver", async (ctx) => { await ctx.answerCallbackQuery(); if (!ctx.chat || !await allowed(ctx)) return; const due = await dueEvents(ctx.chat.id); if (!due.length) { await ctx.editMessageText("No scheduled posts are due yet."); return; } for (const event of due) { if (event.eventType === "poll") { const poll = pollParts(event.content); if (poll) await ctx.api.sendPoll(ctx.chat.id, poll.question, poll.options); } else await ctx.api.sendMessage(ctx.chat.id, event.content); event.delivered = true; await saveEvent(event); } await ctx.editMessageText("Due scheduled posts were delivered."); });
composer.on("message:text", async (ctx, next) => { const state = ctx.session as FlowSession; const text = ctx.message.text.trim(); if (!state.eventType || text.startsWith("/")) return next(); if (!await allowed(ctx)) { state.eventType = undefined; await ctx.reply("Only a moderator can schedule a group post."); return; } if (!state.eventTime) { const time = Date.parse(text); if (!Number.isFinite(time) || time <= now().getTime()) { await ctx.reply("Send a future ISO date and time, for example 2026-08-01T09:00:00Z."); return; } state.eventTime = time; await ctx.reply(state.eventType === "poll" ? "Send the question and at least two options, separated by |." : "Now send the message to post."); return; } if (!ctx.chat) return; const poll = state.eventType === "poll" ? pollParts(text) : undefined; if (state.eventType === "poll" && !poll) { await ctx.reply("Send a question and at least two options, separated by |."); return; } const event = { id: opaqueId("event"), groupId: ctx.chat.id, eventType: state.eventType, scheduledTime: state.eventTime, targetRoles: ["member", "moderator", "admin", "owner"] as ("member" | "moderator" | "admin" | "owner")[], content: text, delivered: false }; await addEvent(event); const env = (ctx as Ctx & { env?: WorkerEnv }).env; if (env?.CHAT_DO) { await scheduleTelegramCall(env, ctx.chat.id, event.scheduledTime, event.eventType === "poll" ? "sendPoll" : "sendMessage", event.eventType === "poll" && poll ? { chat_id: ctx.chat.id, question: poll.question, options: poll.options } : { chat_id: ctx.chat.id, text }); } state.eventType = undefined; state.eventTime = undefined; await ctx.reply("Scheduled post saved. It will be delivered at the time you chose.", { reply_markup: inlineKeyboard([[inlineButton("Deliver due posts", "schedule:deliver")]]) }); });
export default composer;
