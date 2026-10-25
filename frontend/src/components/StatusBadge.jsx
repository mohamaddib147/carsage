// A maintenance status badge (CAR-81): the status word AND an icon, in a fixed red, amber or green that no car theme changes. The
// status is never carried by colour alone: Overdue has a warning triangle, Due soon a clock, OK a check, and "Add an odometer reading"
// a gauge, each next to its own words. The same colours are used by the AI Advisor's DIY / mechanic chips (see the --status-*
// tokens in index.css). Used by the Dashboard's maintenance list and the Maintenance page.

import { STATUS, STATUS_LABELS } from "../lib/maintenance.js";
import { CircleCheck, Clock, Gauge, TriangleAlert } from "./iconsMore.jsx";

const STATUS_ICONS = {
  [STATUS.OVERDUE]: TriangleAlert,
  [STATUS.DUE_SOON]: Clock,
  [STATUS.OK]: CircleCheck,
  [STATUS.NEEDS_READING]: Gauge,
};

/**
 * @param {{ status: string }} props - one of the STATUS values from lib/maintenance.js ("overdue", "due_soon", "needs_reading", "ok").
 * @returns {JSX.Element}
 */
function StatusBadge({ status }) {
  const StatusIcon = STATUS_ICONS[status];
  return (
    <span className={`maintenance-badge maintenance-badge--${status}`}>
      {StatusIcon && <StatusIcon size={12} />}
      {STATUS_LABELS[status]}
    </span>
  );
}

export default StatusBadge;
