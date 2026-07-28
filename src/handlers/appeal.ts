import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { addAppeal, appeal, groupsForUser, opaqueId, punish, punishment, rank, roleFor, saveAppeal, settings } from "../group-data.js";
import { now } from "../clock.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "Appeal a decision", data: "appeal:begin", order: 40 });
const composer = new Composer<Ctx>();

async function submit(ctx: Ctx) {
  if (!ctx.from || !ctx.chat) return;
  const possible = ctx.chat.type === "private" ? await groupsForUser(ctx.from.id) : [ctx.chat.id];
  const groupId = possible[0];
  if (!groupId) { await ctx.reply("There’s no recent moderation decision to review."); return; }
  const active = await punishment(groupId, ctx.from.id);
  if (!active || (!active.active && active.mutedUntil <= now().getTime())) { await ctx.reply("There’s no active moderation decision to appeal."); return; }
  const item = { id: opaqueId("appeal"), groupId, userId: ctx.from.id, status: "open" as const, createdAt: now().getTime() };
  await addAppeal(item);
  const config = await settings(groupId);
  for (const memberId of config.memberIds) {
    if (rank[await roleFor(groupId, memberId)] < rank.moderator) continue;
    try {
      await ctx.api.sendMessage(memberId, "A member requested a moderation review.", { reply_markup: inlineKeyboard([[inlineButton("Approve", `appeal:ok:${item.id}`), inlineButton("Reject", `appeal:no:${item.id}`)]]) });
    } catch { /* An admin may not have started the bot or may have blocked it. */ }
  }
  await ctx.reply("Your appeal is with the moderation team. We’ll update the decision here.");
}

composer.command("appeal", submit);
composer.callbackQuery("appeal:begin", async (ctx) => { await ctx.answerCallbackQuery(); await submit(ctx); });
composer.on("callback_query:data", async (ctx, next) => {
  const match = /^appeal:(ok|no):(.+)$/.exec(ctx.callbackQuery.data);
  if (!match || !ctx.from) return next();
  await ctx.answerCallbackQuery();
  const item = await appeal(match[2]);
  if (!item || item.status !== "open") { await ctx.editMessageText("This appeal has already been reviewed."); return; }
  if (rank[await roleFor(item.groupId, ctx.from.id)] < rank.moderator) { await ctx.editMessageText("Only moderators can review appeals."); return; }
  item.status = match[1] === "ok" ? "approved" : "rejected";
  await saveAppeal(item);
  if (item.status === "approved") {
    const active = await punishment(item.groupId, item.userId);
    if (active) { active.active = false; active.mutedUntil = now().getTime(); }
    if (active) await punish(active);
    try { await ctx.api.restrictChatMember(item.groupId, item.userId, { can_send_messages: true, can_send_audios: true, can_send_documents: true, can_send_photos: true, can_send_videos: true, can_send_video_notes: true, can_send_voice_notes: true, can_send_polls: true, can_send_other_messages: true, can_add_web_page_previews: true, can_change_info: false, can_invite_users: true, can_pin_messages: false, can_manage_topics: false }); } catch { /* Member may have left. */ }
  }
  try { await ctx.api.sendMessage(item.userId, item.status === "approved" ? "Your appeal was approved. Your restriction has been removed." : "Your appeal was reviewed and the moderation decision remains in place."); } catch { /* Consent can be withdrawn at any time. */ }
  await ctx.editMessageText(item.status === "approved" ? "Appeal approved and restriction removed." : "Appeal rejected. The restriction remains in place.");
});
export default composer;
