import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { rank, roleFor, saveSettings, setRole, settings } from "../group-data.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "Group settings", data: "setup:open", order: 10 });
const composer = new Composer<Ctx>();
type FlowSession = { flow?: "words" | "duration" | "webhook" };
const menu = inlineKeyboard([
  [inlineButton("Blocked words", "setup:words"), inlineButton("Mute length", "setup:duration")],
  [inlineButton("Onboarding", "setup:onboarding"), inlineButton("Logging webhook", "setup:webhook")],
  [inlineButton("Open menu", "menu:main")],
]);
async function isAdmin(ctx: Ctx): Promise<boolean> {
  if (!ctx.chat || !ctx.from) return false;
  const config = await settings(ctx.chat.id);
  if (Object.keys(config.roles).length === 0) { await setRole(ctx.chat.id, ctx.from.id, "owner"); return true; }
  return rank[await roleFor(ctx.chat.id, ctx.from.id)] >= rank.admin;
}
async function open(ctx: Ctx) {
  if (!await isAdmin(ctx)) { await ctx.reply("Only a group admin can change these settings."); return; }
  await ctx.reply("Choose what you’d like to configure.", { reply_markup: menu });
}
composer.command("setup", open);
composer.callbackQuery("setup:open", async (ctx) => { await ctx.answerCallbackQuery(); await open(ctx); });
composer.callbackQuery("setup:words", async (ctx) => { await ctx.answerCallbackQuery(); if (!await isAdmin(ctx)) return; (ctx.session as FlowSession).flow = "words"; await ctx.editMessageText("Send blocked words separated by commas. Send ‘clear’ to remove them."); });
composer.callbackQuery("setup:duration", async (ctx) => { await ctx.answerCallbackQuery(); if (!await isAdmin(ctx)) return; (ctx.session as FlowSession).flow = "duration"; await ctx.editMessageText("Send the auto-mute length in minutes, from 1 to 43,200."); });
composer.callbackQuery("setup:onboarding", async (ctx) => { await ctx.answerCallbackQuery(); if (!await isAdmin(ctx) || !ctx.chat) return; const config = await settings(ctx.chat.id); config.onboardingRequired = !config.onboardingRequired; await saveSettings(config); await ctx.editMessageText(config.onboardingRequired ? "New members must approve the rules before posting." : "New members can post without approving the rules.", { reply_markup: menu }); });
composer.callbackQuery("setup:webhook", async (ctx) => { await ctx.answerCallbackQuery(); if (!await isAdmin(ctx)) return; (ctx.session as FlowSession).flow = "webhook"; await ctx.editMessageText("Send the HTTPS address for moderation logs, or send ‘clear’ to remove it."); });
composer.on("message:text", async (ctx, next) => {
  const state = ctx.session as FlowSession;
  if (!state.flow || !ctx.chat || !ctx.message.text || ctx.message.text.startsWith("/")) return next();
  if (!await isAdmin(ctx)) { state.flow = undefined; await ctx.reply("Only a group admin can change these settings."); return; }
  const config = await settings(ctx.chat.id); const input = ctx.message.text.trim();
  if (state.flow === "words") { config.bannedWords = input.toLowerCase() === "clear" ? [] : [...new Set(input.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean))]; await saveSettings(config); state.flow = undefined; await ctx.reply(config.bannedWords.length ? "Blocked words saved." : "Blocked words cleared."); return; }
  if (state.flow === "duration") { const minutes = Number(input); if (!Number.isInteger(minutes) || minutes < 1 || minutes > 43200) { await ctx.reply("Send a whole number of minutes from 1 to 43,200."); return; } config.autoMuteDuration = minutes * 60; await saveSettings(config); state.flow = undefined; await ctx.reply("Auto-mute length saved."); return; }
  if (state.flow === "webhook") { if (input.toLowerCase() === "clear") { delete config.webhookUrl; await saveSettings(config); state.flow = undefined; await ctx.reply("Logging webhook removed."); return; } try { const url = new URL(input); if (url.protocol !== "https:") throw new Error(); config.webhookUrl = url.toString(); await saveSettings(config); state.flow = undefined; await ctx.reply("Logging webhook saved."); } catch { await ctx.reply("Send a valid HTTPS address, or send ‘clear’."); } }
});
// Promotion is reply-based: it never asks an owner to provide a stranger’s ID.
composer.command("promote", async (ctx) => { if (!ctx.chat || !ctx.from) return; if (!await isAdmin(ctx)) { await ctx.reply("Only an owner or admin can assign roles."); return; } const target = ctx.message?.reply_to_message?.from; if (!target) { await ctx.reply("Reply to a member’s message with /promote to make them a moderator."); return; } if (rank[await roleFor(ctx.chat.id, ctx.from.id)] < rank.admin) return; await setRole(ctx.chat.id, target.id, "moderator"); await ctx.reply("That member is now a moderator."); });
composer.command("demote", async (ctx) => { if (!ctx.chat || !ctx.from) return; if (!await isAdmin(ctx)) { await ctx.reply("Only an owner or admin can change roles."); return; } const target = ctx.message?.reply_to_message?.from; if (!target) { await ctx.reply("Reply to a moderator’s message with /demote."); return; } if (target.id === ctx.from.id || (await roleFor(ctx.chat.id, target.id)) === "owner") { await ctx.reply("Owners can’t be demoted here."); return; } await setRole(ctx.chat.id, target.id, "member"); await ctx.reply("That member is now a regular member."); });
export default composer;
