// Helpers for the Dashboard's DIY fix-rate stat (mentor feedback, no Jira task):
// the percentage of DIY advisor suggestions the user gave feedback on that they
// marked as fixed, and the most recently confirmed fix. Pure functions, easy to
// test; the page (pages/DashboardPage.jsx) wires them to Supabase.
//
// The percentage is deliberately computed only among suggestions with feedback
// (marked_fixed is not null) — diluting it with every DIY reply nobody responded
// to would make the number meaningless (and a lot of unanswered replies would
// drag it toward 0% for no real reason).

/**
 * @param {{ marked_fixed: boolean | null }[]} diyMessages - 'ai' rows with recommendation = 'diy'.
 * @returns {number | null} the percentage (0-100, rounded) marked fixed among
 *   those with feedback, or null when nobody has given feedback yet.
 */
export function diyFixRate(diyMessages) {
  const answered = diyMessages.filter((message) => message.marked_fixed !== null);
  if (answered.length === 0) return null;
  const fixed = answered.filter((message) => message.marked_fixed === true).length;
  return Math.round((fixed / answered.length) * 100);
}

/**
 * The most recently marked-fixed DIY suggestion, by created_at.
 * @param {{ marked_fixed: boolean | null, created_at: string }[]} diyMessages
 * @returns {object | null} null when none have been marked fixed yet.
 */
export function latestFixedMessage(diyMessages) {
  const fixed = diyMessages.filter((message) => message.marked_fixed === true);
  if (fixed.length === 0) return null;
  return fixed.reduce((latest, message) =>
    message.created_at > latest.created_at ? message : latest,
  );
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;
const UNITS = [
  ["year", YEAR],
  ["month", MONTH],
  ["day", DAY],
  ["hour", HOUR],
  ["minute", MINUTE],
];

/**
 * A rough "how long ago" from an ISO timestamp: "3 days ago", "just now".
 * A future timestamp (clock skew) is also "just now" rather than negative.
 * @param {string} isoTimestamp
 * @param {Date} [now]
 * @returns {string}
 */
export function timeAgo(isoTimestamp, now = new Date()) {
  const seconds = Math.max(0, Math.floor((now - new Date(isoTimestamp)) / 1000));
  for (const [name, secondsPerUnit] of UNITS) {
    const value = Math.floor(seconds / secondsPerUnit);
    if (value >= 1) return `${value} ${name}${value > 1 ? "s" : ""} ago`;
  }
  return "just now";
}
