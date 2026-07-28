import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { addLog, ensureMember, punish, rank, roleFor, settings } from "../group-data.js";
import { now } from "../clock.js";

const composer = new Composer<Ctx>();
composer.on("message:text", async (ctx, next) => {
  if (!ctx.chat || !ctx.from || ctx.chat.type === "private" || ctx.message.text.startsWith("/")) return next();
  const config = await ensureMember(ctx.chat.id, ctx.from.id);
  const word = config.bannedWords.find((item) => item && ctx.message.text.toLowerCase().includes(item));
  if (!word) return next();
  const until = now().getTime() + config.autoMuteDuration * 1000;
  await ctx.api.restrictChatMember(ctx.chat.id, ctx.from.id, { can_send_messages: false, can_send_audios: false, can_send_documents: false, can_send_photos: false, can_send_videos: false, can_send_video_notes: false, can_send_voice_notes: false, can_send_polls: false, can_send_other_messages: false, can_add_web_page_previews: false, can_change_info: false, can_invite_users: false, can_pin_messages: false, can_manage_topics: false }, { until_date: Math.floor(until / 1000) });
  await punish({ groupId: ctx.chat.id, userId: ctx.from.id, reason: `Blocked word: ${word}`, mutedUntil: until, active: true });
  await addLog(ctx.chat.id, { actionType: "auto_mute", userId: ctx.from.id, timestamp: now().getTime(), reason: `Blocked word: ${word}` });
  await ctx.reply("A message broke the group rules. The member has been muted automatically.");
  for (const memberId of config.memberIds) {
    if (rank[await roleFor(ctx.chat.id, memberId)] < rank.moderator) continue;
    try { await ctx.api.sendMessage(memberId, "Moderation alert: a blocked word triggered an automatic mute."); } catch { /* Private alerts are best effort after user consent. */ }
  }
  if (config.webhookUrl) {
    try { await fetch(config.webhookUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action_type: "auto_mute", user_id: ctx.from.id, timestamp: now().toISOString(), reason: `Blocked word: ${word}` }) }); } catch { /* Logging delivery must not prevent enforcement. */ }
  }
});
export default composer;
