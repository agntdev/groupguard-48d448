import { Composer } from "grammy";
import type { Ctx } from "../bot.js";

const composer = new Composer<Ctx>();

// Typed details need an obvious escape hatch. Domain records are never touched.
composer.command("cancel", async (ctx) => {
  const state = ctx.session as { flow?: unknown; eventType?: unknown; eventTime?: unknown };
  state.flow = undefined;
  state.eventType = undefined;
  state.eventTime = undefined;
  await ctx.reply("That draft was cancelled. Nothing was changed.");
});

export default composer;
