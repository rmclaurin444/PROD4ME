/**
 * Weekly leaderboard tuning — separate from the recommendation weights on
 * purpose: these numbers rank a week's engagement, they do not shape taste
 * vectors.
 */
export const LEADERBOARD_WEIGHTS = {
  stream: 0.2,
  like: 3,
  comment: 4,
  share: 4,
  save: 2,
  purchase: 10,
  freeClaim: 2,
} as const

export const LEADERBOARD_TOP_N = 50

/** Weeks are Monday 00:00 → Sunday 23:59 in this timezone. */
export const LEADERBOARD_TZ = 'America/New_York'
