/**
 * Messaging tunables. The polling intervals live here (and only here) so a
 * real-time service (Pusher, Ably, Supabase Realtime) can replace polling
 * later without touching the UI.
 */

/** Hard limit enforced server-side on every send. */
export const MESSAGE_MAX_CHARS = 2000

/** Page size for thread history (GET .../messages). */
export const MESSAGES_PER_PAGE = 30

/** Rate limit: sends per user per minute. */
export const MESSAGES_PER_MINUTE = 30

/** Open thread: poll for messages newer than the newest one rendered. */
export const MESSAGE_POLL_MS = 4000

/** Conversation list: refresh while the Messages tab is open. */
export const CONVERSATION_POLL_MS = 15000

/** Unread badge (messages): refresh anywhere in the app. */
export const MESSAGES_UNREAD_POLL_MS = 30000

/** User search: minimum query length and max results. */
export const SEARCH_MIN_CHARS = 2
export const SEARCH_MAX_RESULTS = 10

/** Messages group into one bubble cluster when sent within this window. */
export const MESSAGE_GROUP_WINDOW_MS = 3 * 60 * 1000
