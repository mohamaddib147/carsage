// Vitest setup — extends expect() with jest-dom matchers for all test files.

import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";

// user-event waits a macrotask between every keystroke and click by default
// (delay: 0). Typing a long value is then hundreds of event-loop turns, which
// under a loaded full run (many workers, dev servers) stretched past the 5 s
// test timeout; the timed-out test kept running into the NEXT test and typed into
// its form. Turning the delay off makes typing fast and deterministic. A test can
// still ask for a delay with userEvent.setup({ delay: 10 }).
const setup = userEvent.setup.bind(userEvent);
userEvent.setup = (options = {}) => setup({ delay: null, ...options });
