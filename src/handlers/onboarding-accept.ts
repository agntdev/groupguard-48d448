import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { ensureMember, settings } from "../group-data.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();

composer.callbackQuery("onboarding:accept", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.from || !ctx.chat) return;
  const groupId = ctx.chat.id;
  await ensureMember(groupId, ctx.from.id);
  const config = await settings(groupId);
  // The bot can only restore permissions it previously restricted. In private
  // chats this is intentionally skipped.
  if (ctx.chat.type !== "private" && config.onboardingRequired) {
    await ctx.api.restrictChatMember(groupId, ctx.from.id, {
      can_send_messages: true, can_send_audios: true, can_send_documents: true,
      can_send_photos: true, can_send_videos: true, can_send_video_notes: true,
      can_send_voice_notes: true, can_send_polls: true, can_send_other_messages: true,
      can_add_web_page_previews: true, can_change_info: false, can_invite_users: true,
      can_pin_messages: false, can_manage_topics: false,
    });
  }
  await ctx.editMessageText("Rules approved. You can participate now.", { reply_markup: inlineKeyboard([[inlineButton("Open menu", "menu:main")]]) });
});

composer.on("message:new_chat_members", async (ctx) => {
  if (!ctx.chat || ctx.chat.type === "private") return;
  const config = await settings(ctx.chat.id);
  for (const member of ctx.message.new_chat_members) {
    if (member.is_bot) continue;
    await ensureMember(ctx.chat.id, member.id);
    if (config.onboardingRequired) {
      await ctx.api.restrictChatMember(ctx.chat.id, member.id, {
        can_send_messages: false, can_send_audios: false, can_send_documents: false,
        can_send_photos: false, can_send_videos: false, can_send_video_notes: false,
        can_send_voice_notes: false, can_send_polls: false, can_send_other_messages: false,
        can_add_web_page_previews: false, can_change_info: false, can_invite_users: false,
        can_pin_messages: false, can_manage_topics: false,
      });
      await ctx.reply("Welcome. Review the group rules, then approve them to join the conversation.", { reply_markup: inlineKeyboard([[inlineButton("Approve rules", "onboarding:accept")]]) });
    }
  }
});

export default composer;
