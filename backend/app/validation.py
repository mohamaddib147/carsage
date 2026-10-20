# Shared server-side input limits (CAR-23). Every request field that ends up
# in the database, an outbound API call, or an LLM prompt is validated with
# these, so an oversized or malformed value is refused with a clear 422
# before any work happens — never trusting the client-side checks alone.
#
# The numbers mirror two other layers and should be changed together with
# them: the database CHECK constraints (docs/db_migrations/) and the
# frontend (src/lib/limits.js).

from typing import Annotated
from uuid import UUID

from pydantic import Field, StringConstraints

# Free-text place names (a trip's origin / destination). Google place
# descriptions are well under this; it just stops abuse.
MAX_PLACE_CHARS = 300

# A car's make / model (also used for the spec-suggestions lookup).
MAX_MAKE_MODEL_CHARS = 60
MIN_CAR_YEAR = 1900
MAX_CAR_YEAR = 2100

# The AI Advisor: what the user types, and what we store of the reply
# (the reply includes NHTSA recall text, so it gets more room).
MAX_DESCRIPTION_CHARS = 1000
MAX_MESSAGE_TEXT_CHARS = 8000

# A manual fuel price override, LBP per liter (real prices are ~1.4e5).
MAX_FUEL_PRICE_LBP = 10_000_000

# A place name: surrounding whitespace is stripped, then it must be 1-300
# characters — so blank / whitespace-only input is refused too.
PlaceText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_PLACE_CHARS),
]

# A record id. Typing it as a UUID means a malformed id (e.g. "not-a-uuid")
# is a clean 422, instead of reaching Postgres and crashing with a 500.
RecordId = UUID

# A fuel price override: positive, bounded, and never NaN / Infinity.
FuelPriceLbp = Annotated[float, Field(gt=0, le=MAX_FUEL_PRICE_LBP, allow_inf_nan=False)]
