"""The CRM's fixed vocabularies, as stored in the database and spoken by the API.

The client shows labels ("Not contacted", "Catch-all", "CSV import"); the API uses these
stable snake_case codes and the client maps them (see ``LABELS`` for the mapping it uses).
Orders mirror the client's sort orders in ``lib/leads/segment.ts``.
"""

from typing import Final, Literal

ReplyStatus = Literal[
    "not_contacted",
    "contacted",
    "interested",
    "objection",
    "referral",
    "meeting_booked",
    "not_interested",
    "ooo",
    "unsubscribed",
]
EmailStatus = Literal["verified", "catch_all", "unverified", "bounced"]
Source = Literal["search", "import", "manual"]
SetBy = Literal["corral", "user"]
Size = Literal["1-50", "51-200", "201-1000", "1000+"]

REPLY_STATUSES: Final[tuple[ReplyStatus, ...]] = (
    "not_contacted",
    "contacted",
    "interested",
    "objection",
    "referral",
    "meeting_booked",
    "not_interested",
    "ooo",
    "unsubscribed",
)
EMAIL_STATUSES: Final[tuple[EmailStatus, ...]] = ("verified", "catch_all", "unverified", "bounced")
SOURCES: Final[tuple[Source, ...]] = ("search", "import", "manual")
SIZES: Final[tuple[Size, ...]] = ("1-50", "51-200", "201-1000", "1000+")

# Sort orders (client: REPLY_ORDER / EMAIL_ORDER).
REPLY_ORDER: Final[tuple[ReplyStatus, ...]] = (
    "meeting_booked",
    "interested",
    "objection",
    "referral",
    "ooo",
    "contacted",
    "not_contacted",
    "not_interested",
    "unsubscribed",
)
EMAIL_ORDER: Final[tuple[EmailStatus, ...]] = EMAIL_STATUSES

# A reply that counts as "replied recently" for the enroll dry run.
REPLIED: Final[frozenset[ReplyStatus]] = frozenset(
    {"interested", "objection", "referral", "meeting_booked", "ooo"}
)

LABELS: Final[dict[str, str]] = {
    "not_contacted": "Not contacted",
    "contacted": "Contacted",
    "interested": "Interested",
    "objection": "Objection",
    "referral": "Referral",
    "meeting_booked": "Meeting booked",
    "not_interested": "Not interested",
    "ooo": "OOO",
    "unsubscribed": "Unsubscribed",
    "verified": "Verified",
    "catch_all": "Catch-all",
    "unverified": "Unverified",
    "bounced": "Bounced",
    "search": "Corral search",
    "import": "CSV import",
    "manual": "Manual",
    "1-50": "1\u201350",
    "51-200": "51\u2013200",
    "201-1000": "201\u20131,000",
    "1000+": "1,000+",
}


def sql_in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"
