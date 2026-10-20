// One shared sentence shown beside every camera-scan button (registration
// card, fuel pump, odometer): all three send the photo to Google's Gemini
// API (app/services/llm_client.py), and CarSage only has a free-tier
// GEMINI_API_KEY, not a paid plan.
//
// Sourced from Gemini's own API Additional Terms of Service
// (ai.google.dev/gemini-api/terms, "Unpaid Services" -> "How Google Uses
// Your Data", confirmed live): on the free tier, Google may use submitted
// content to provide/improve/develop its services, and human reviewers
// may read it — a protection the Terms explicitly do NOT extend to Paid
// Services. This notice exists so that claim is disclosed at the point
// a photo is actually taken, not just buried in the Privacy Policy.
export const GEMINI_PRIVACY_NOTICE =
  "This photo is sent to Google's Gemini API to read it, then discarded; it's never saved by CarSage. " +
  "On Google's free tier (which this app uses), Google may use submitted content to improve its services " +
  "and human reviewers may read it.";
