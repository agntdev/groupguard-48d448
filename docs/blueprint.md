# GroupGuard — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

Telegram group management bot with automated moderation, role-based admin hierarchies, onboarding flows, and event scheduling. Enforces rules through auto-mutes/bans, tracks moderation logs, and supports scheduled announcements/polls with configurable notifications.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Telegram group owners
- admins
- active group members

## Success criteria

- Moderation actions logged and enforced across all managed groups
- Onboarding flow completed by 95% of new members within 24 hours
- Scheduled events posted on-time with 100% reliability
- Admins receive actionable alerts within 5 seconds of rule violations

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu with group-specific controls
- **/setup** (command, actor: admin, command: /setup) — Configure moderation rules and admin roles
- **Approve Rules** (button, actor: user, callback: onboarding:accept) — Complete onboarding flow
  - inputs: user_id
  - outputs: member privileges
- **/schedule** (command, actor: admin, command: /schedule) — Create polls, reminders, or announcements
- **/appeal** (command, actor: user, command: /appeal) — Request review of mute/ban action

## Flows

### Auto-moderation
_Trigger:_ message:contains_banned_content

1. Detect rule violation
2. Apply auto-mute
3. Post in-group notification
4. Log to moderation history
5. Send admin digest

_Data touched:_ moderation_rules, user_punishments

### Onboarding
_Trigger:_ user:joins_group

1. Send welcome message
2. Display rules with approval button
3. Restrict privileges until acceptance
4. Log onboarding completion

_Data touched:_ user_status, group_settings

### Admin Appeals
_Trigger:_ /appeal

1. Log appeal request
2. Notify admins via PM
3. Track appeal status
4. Allow admin review actions

_Data touched:_ appeals, user_punishments

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **GroupSettings** _(retention: persistent)_ — Persistent group configuration including moderation rules and onboarding preferences
  - fields: group_id, banned_words, auto_mute_duration, onboarding_required
- **ModerationLog** _(retention: persistent)_ — Record of all automated and manual moderation actions
  - fields: action_type, user_id, timestamp, reason
- **ScheduledEvent** _(retention: persistent)_ — Polls, reminders, and announcements with timing metadata
  - fields: event_type, scheduled_time, target_roles

## Integrations

- **Telegram** (required) — Bot API messaging and group management
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- /setup command for rule configuration
- Admin role assignment via /promote and /demote commands
- Webhook URL configuration for external logging

## Notifications

- In-group moderation action announcements
- Admin digest summaries
- Private message alerts for critical events
- Webhook payload delivery

## Permissions & privacy

- User IDs stored for moderation tracking
- Moderation logs retained for 1 year
- Onboarding status tracked for access control

## Edge cases

- Conflicting admin commands
- Expired auto-mutes
- Appeal requests during active bans
- Multiple simultaneous rule violations

## Required tests

- End-to-end test of auto-mute to appeal resolution flow
- Scheduled event delivery accuracy test
- Role hierarchy privilege escalation test

## Assumptions

- Single bot instance manages multiple groups
- Default admin hierarchy of Owner > Admin > Moderator
- Auto-mute is default moderation action
