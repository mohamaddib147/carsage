// AI Advisor screen (core feature) — chat-style interface for describing
// a car issue and getting a DIY-vs-mechanic recommendation (CAR-20).
// Loads all of the logged-in user's cars and, with more than one, shows
// a selector (same pattern as Trip Planner's CAR-37 fix) so the right
// car's context is sent — picking the wrong car silently here would be
// the same class of bug CAR-37 fixed.
// Conversation persistence (CAR-21): on mount, loads the user's most
// recent advisor_conversations row (if any) and its advisor_messages,
// hydrating the transcript so returning to this screen picks up where
// you left off. The backend creates a new conversation on the first
// message (returning its id) and every later message in the same page
// session passes that id back to append to it. Reading history is done
// directly against Supabase (RLS-protected, same pattern as the
// Dashboard's car list) rather than via a backend endpoint, since it's
// a plain read already scoped to the caller.
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
    if (!user) return;

    let cancelled = false;

    async function loadHistory() {
      setLoadingHistory(true);
      const { data: conversation } = await supabase
        .from("advisor_conversations")
        .select("id")
        .eq("user_id", user.id)
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
        .select("sender, message_text, recommendation")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      setMessages(
        (rows ?? []).map((row) =>
          row.sender === "user"
            ? { id: nextMessageId.current++, role: "user", text: row.message_text }
            : {
                id: nextMessageId.current++,
                role: "assistant",
                recommendation: row.recommendation,
                guidance: row.message_text,
              },
        ),
      );
      setLoadingHistory(false);
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [user]);

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
          role: "assistant",
          recommendation: result.recommendation,
          guidance: result.guidance,
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

  if (loadingCars || loadingHistory) {
    return <PageShell title="AI Advisor" description="Loading your car..." />;
  }

  if (cars.length === 0) {
    return (
      <PageShell
        title="AI Advisor"
        description="Add a car before describing an issue — guidance is tailored to your vehicle."
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

      {messages.length === 0 && (
        <div className="advisor-welcome">
          <p>
            Describe any noise, warning light, or issue in plain language —
            we&apos;ll tell you whether it&apos;s safe to check yourself or
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
          placeholder="Describe your car issue..."
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
        AI-generated guidance — not a substitute for a professional
        inspection.
      </p>
    </div>
  );
}

export default AIAdvisorPage;
