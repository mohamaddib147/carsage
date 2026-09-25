// AI Advisor screen (core feature) — chat-style interface for describing
// a car issue and getting a DIY-vs-mechanic recommendation (CAR-20).
// Loads all of the logged-in user's cars and, with more than one, shows
// a selector (same pattern as Trip Planner's CAR-37 fix) so the right
// car's context is sent — picking the wrong car silently here would be
// the same class of bug CAR-37 fixed.
// Conversation persistence (CAR-21): loads the selected car's most
// recent advisor_conversations row (if any) and its advisor_messages,
// hydrating the transcript so returning to this screen (or switching
// cars) picks up where you left off with that specific car — history
// is scoped by car_id, not just user_id, so switching the car selector
// re-loads that car's own thread instead of always showing whichever
// conversation happens to be most recent overall. The backend creates
// a new conversation tied to the selected car on the first message
// (returning its id) and every later message in the same page session
// passes that id back to append to it. Reading history is done
// directly against Supabase (RLS-protected, same pattern as the
// Dashboard's car list) rather than via a backend endpoint, since it's
// a plain read already scoped to the caller.
// DIY video suggestions (CAR-40): a 'diy' response may come back with a
// video_title/video_url (a backend-side YouTube search, skipped for
// 'mechanic' recommendations); when present it's shown as a thumbnail +
// title linking out to YouTube in a new tab, below the numbered steps.
// The thumbnail URL is derived from the video id in video_url (YouTube's
// predictable img.youtube.com pattern) rather than stored, since only
// video_title/video_url are persisted columns.
// Layout matches docs/stitch_carsage_landing_page/carsage_ai_advisor for
// the in-scope parts (chat bubbles, quick-start prompt chips, badge +
// numbered steps on a DIY response); its left sidebar nav, "telemetry"
// framing, acoustic/audio analysis, per-step cost-benchmark cards, and
// "logged to your service diary" messaging are out of scope (no voice/
// audio input, no cost-estimate data, no maintenance log) and are
// omitted.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PageShell from "../components/PageShell.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { apiFetch } from "../lib/apiClient.js";
import { supabase } from "../lib/supabaseClient.js";

const EXAMPLE_PROMPTS = [
  "Squeaking brakes at low speed",
  "Check engine light is on",
  "AC is blowing warm air",
  "Steering wheel vibrates at highway speed",
];

/** Splits a guidance string into short numbered steps (one per sentence). */
function guidanceSteps(guidance) {
  return guidance
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

const YOUTUBE_HOSTS = new Set(["www.youtube.com", "youtube.com", "m.youtube.com"]);

/**
 * The video id of a saved YouTube watch URL, or null if it isn't one. Only
 * https youtube.com/watch?v=<id> with a well-formed id qualifies (CAR-23):
 * the stored value is rendered as a link, so anything else — a `javascript:`
 * URL, another host, a path-tricking id — is never turned into a link. (The
 * database also only allows youtube.com/watch links; this doesn't rely on it.)
 * @param {string | null | undefined} videoUrl
 * @returns {string | null}
 */
function youtubeVideoId(videoUrl) {
  try {
    const url = new URL(videoUrl);
    if (url.protocol !== "https:" || !YOUTUBE_HOSTS.has(url.hostname)) return null;
    if (url.pathname !== "/watch") return null;
    const id = url.searchParams.get("v");
    return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * AI Advisor screen: a text-only chat where each user message is sent to
 * the backend's classifier and answered with a DIY/mechanic badge plus
 * guidance (numbered steps for DIY, plain guidance for mechanic).
 * @returns {JSX.Element}
 */
function AIAdvisorPage() {
  const { user, session } = useAuth();

  const [cars, setCars] = useState([]);
  const [loadingCars, setLoadingCars] = useState(true);
  const [selectedCarId, setSelectedCarId] = useState("");

  const [messages, setMessages] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const nextMessageId = useRef(0);
  const conversationIdRef = useRef(null);
  const transcriptEndRef = useRef(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function loadCars() {
      setLoadingCars(true);
      const { data } = await supabase
        .from("cars")
        .select("id, make, model, year")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (cancelled) return;
      const loadedCars = data ?? [];
      setCars(loadedCars);
      setSelectedCarId(loadedCars[0]?.id ?? "");
      setLoadingCars(false);
    }

    loadCars();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || !selectedCarId) return;

    let cancelled = false;

    async function loadHistory() {
      setLoadingHistory(true);
      setMessages([]);
      conversationIdRef.current = null;

      const { data: conversation } = await supabase
        .from("advisor_conversations")
        .select("id")
        .eq("user_id", user.id)
        .eq("car_id", selectedCarId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (!conversation) {
        setLoadingHistory(false);
        return;
      }

      conversationIdRef.current = conversation.id;

      const { data: rows } = await supabase
        .from("advisor_messages")
        .select("id, sender, message_text, recommendation, video_title, video_url, marked_fixed")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      setMessages(
        (rows ?? []).map((row) =>
          row.sender === "user"
            ? { id: nextMessageId.current++, role: "user", text: row.message_text }
            : {
                id: nextMessageId.current++,
                dbId: row.id,
                role: "assistant",
                recommendation: row.recommendation,
                guidance: row.message_text,
                videoTitle: row.video_title,
                videoUrl: row.video_url,
                markedFixed: row.marked_fixed,
              },
        ),
      );
      setLoadingHistory(false);
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [user, selectedCarId]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, submitting]);

  /** @param {string} text */
  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;

    setError("");
    setMessages((previous) => [
      ...previous,
      { id: nextMessageId.current++, role: "user", text: trimmed },
    ]);
    setDescription("");
    setSubmitting(true);

    try {
      const result = await apiFetch("/ai-advisor/classify", {
        method: "POST",
        accessToken: session.access_token,
        body: {
          car_id: selectedCarId,
          description: trimmed,
          conversation_id: conversationIdRef.current ?? undefined,
        },
      });
      conversationIdRef.current = result.conversation_id;
      setMessages((previous) => [
        ...previous,
        {
          id: nextMessageId.current++,
          dbId: result.message_id,
          role: "assistant",
          recommendation: result.recommendation,
          guidance: result.guidance,
          videoTitle: result.video_title,
          videoUrl: result.video_url,
          markedFixed: null,
        },
      ]);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  /** @param {import('react').FormEvent} event */
  function handleSubmit(event) {
    event.preventDefault();
    sendMessage(description);
  }

  /**
   * Records whether a DIY suggestion actually fixed the issue (optional —
   * the user isn't required to answer before continuing the conversation).
   * Updates only the `marked_fixed` column (the database grants nothing
   * broader to a signed-in user), scoped by RLS to the caller's own message.
   * @param {number} messageId - the message's local (not database) id.
   * @param {string} dbId - the message's advisor_messages row id.
   * @param {boolean} fixed
   */
  async function handleMarkFixed(messageId, dbId, fixed) {
    setMessages((previous) =>
      previous.map((message) =>
        message.id === messageId
          ? { ...message, markingFixed: true, markFixedError: "" }
          : message,
      ),
    );

    const { error: updateError } = await supabase
      .from("advisor_messages")
      .update({ marked_fixed: fixed })
      .eq("id", dbId);

    setMessages((previous) =>
      previous.map((message) =>
        message.id === messageId
          ? {
              ...message,
              markingFixed: false,
              editingFixed: false,
              markedFixed: updateError ? message.markedFixed : fixed,
              markFixedError: updateError ? "Couldn't save that, try again." : "",
            }
          : message,
      ),
    );
  }

  /** Reopens the Yes/No buttons on an already-answered "Did this fix it?" so the user can change their answer. */
  function handleEditMarkFixed(messageId) {
    setMessages((previous) =>
      previous.map((message) =>
        message.id === messageId ? { ...message, editingFixed: true } : message,
      ),
    );
  }

  if (loadingCars) {
    return <PageShell title="AI Advisor" description="Loading your car..." />;
  }

  if (cars.length === 0) {
    return (
      <PageShell
        title="AI Advisor"
        description="Add a car before describing an issue. Guidance is tailored to your vehicle."
      >
        <Link className="btn-primary" to="/cars/new">
          Add Your Car
        </Link>
      </PageShell>
    );
  }

  return (
    <div className="advisor-page">
      <div className="advisor-header">
        <div>
          <h1>AI Advisor</h1>
          <p className="advisor-header__subtitle">
            Describe a car issue to get DIY-vs-mechanic guidance.
          </p>
        </div>
        {cars.length > 1 && (
          <div className="form-field advisor-header__car-select">
            <label htmlFor="advisorCarId">Car</label>
            <select
              id="advisorCarId"
              value={selectedCarId}
              onChange={(event) => setSelectedCarId(event.target.value)}
            >
              {cars.map((car) => (
                <option key={car.id} value={car.id}>
                  {[car.year, car.make, car.model].filter(Boolean).join(" ")}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loadingHistory && (
        <p className="advisor-header__subtitle">Loading this car&apos;s conversation...</p>
      )}

      {!loadingHistory && messages.length === 0 && (
        <div className="advisor-welcome">
          <p>
            Describe any noise, warning light, or issue in plain language.
            We&apos;ll tell you whether it&apos;s safe to check yourself or
            worth a mechanic&apos;s visit.
          </p>
          <div className="advisor-examples">
            {EXAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="advisor-example-chip"
                onClick={() => sendMessage(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="advisor-transcript">
        {messages.map((message) =>
          message.role === "user" ? (
            <div
              key={message.id}
              className="advisor-bubble advisor-bubble--user"
            >
              {message.text}
            </div>
          ) : (
            <div
              key={message.id}
              className="advisor-bubble advisor-bubble--assistant"
            >
              <span
                className={`advisor-badge advisor-badge--${message.recommendation}`}
              >
                {message.recommendation === "diy"
                  ? "DIY Fixable"
                  : "See a Mechanic"}
              </span>
              {message.recommendation === "diy" ? (
                <ol className="advisor-steps">
                  {guidanceSteps(message.guidance).map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
              ) : (
                <p className="advisor-guidance-text">{message.guidance}</p>
              )}
              {youtubeVideoId(message.videoUrl) && (
                <a
                  className="advisor-video-card"
                  href={`https://www.youtube.com/watch?v=${youtubeVideoId(message.videoUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="advisor-video-card__thumbnail-wrap">
                    <img
                      className="advisor-video-card__thumbnail"
                      src={`https://img.youtube.com/vi/${youtubeVideoId(message.videoUrl)}/hqdefault.jpg`}
                      alt=""
                    />
                    <span className="advisor-video-card__play" aria-hidden="true">
                      ▶
                    </span>
                  </span>
                  <span className="advisor-video-card__body">
                    <span className="advisor-video-card__title">
                      {message.videoTitle}
                    </span>
                    <span className="advisor-video-card__cta">
                      ▶ Watch on YouTube
                    </span>
                  </span>
                </a>
              )}
              {message.recommendation === "diy" && message.dbId && (
                <div className="advisor-fix-feedback">
                  {message.markedFixed == null || message.editingFixed ? (
                    <>
                      <span className="advisor-fix-feedback__prompt">
                        Did this fix it?
                      </span>
                      <button
                        type="button"
                        className="advisor-fix-feedback__btn"
                        disabled={message.markingFixed}
                        onClick={() => handleMarkFixed(message.id, message.dbId, true)}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        className="advisor-fix-feedback__btn"
                        disabled={message.markingFixed}
                        onClick={() => handleMarkFixed(message.id, message.dbId, false)}
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <span className="advisor-fix-feedback__answered">
                      {message.markedFixed
                        ? "✓ You said this fixed it"
                        : "You said this didn't fix it"}{" "}
                      <button
                        type="button"
                        className="advisor-fix-feedback__change"
                        onClick={() => handleEditMarkFixed(message.id)}
                      >
                        Change
                      </button>
                    </span>
                  )}
                  {message.markFixedError && (
                    <p role="alert" className="auth-form__error advisor-fix-feedback__error">
                      {message.markFixedError}
                    </p>
                  )}
                </div>
              )}
            </div>
          ),
        )}
        {submitting && (
          <div className="advisor-bubble advisor-bubble--assistant advisor-bubble--loading">
            <span className="advisor-typing" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            Thinking&hellip;
          </div>
        )}
        <div ref={transcriptEndRef} />
      </div>

      {error && (
        <p role="alert" className="auth-form__error">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="advisor-input-row">
        <input
          type="text"
          placeholder="Describe your issue, e.g. grinding noise when braking"
          // Same cap as the backend (MAX_DESCRIPTION_CHARS in ai_advisor.py).
          maxLength={1000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={submitting}
        />
        <button
          className="btn-primary"
          type="submit"
          disabled={submitting || !description.trim()}
        >
          Send
        </button>
      </form>
      <p className="advisor-disclaimer">
        AI-generated guidance, not a substitute for a professional
        inspection.
      </p>
    </div>
  );
}

export default AIAdvisorPage;
