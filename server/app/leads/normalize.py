"""Normalisation shared by import, manual edits and dedupe. Mirrors the client's rules.

``norm_domain`` and ``EMAIL_RE``/``DOMAIN_RE`` are the same as ``lib/leads/import.ts`` so a
row the client previews as valid (or duplicate) is judged the same way here.
"""

import re

from app.leads.vocab import Size

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
DOMAIN_RE = re.compile(r"^(https?://)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(/.*)?$", re.IGNORECASE)
_SPACES = re.compile(r"\s+")
_NUMBER = re.compile(r"\d[\d,.]*\s*[kK]?")


def norm_domain(value: str) -> str:
    """``https://www.Kilima.co.ke/about`` -> ``kilima.co.ke`` (protocol, www and path dropped)."""
    v = value.lower()
    while True:  # repeat until stable so the key is idempotent (``"x.io /"``, ``www.www.``)
        prev = v
        v = v.strip()
        v = re.sub(r"^https?://", "", v)
        v = re.sub(r"^www\.", "", v)
        v = re.sub(r"[/?#].*$", "", v)
        if v == prev:
            return v


def norm_email(value: str) -> str:
    return value.strip().lower()


def name_key(value: str) -> str:
    """Case- and whitespace-insensitive company name, used to sort and to match by name."""
    return _SPACES.sub(" ", value).strip().casefold()[:255]


def is_email(value: str) -> bool:
    return bool(EMAIL_RE.match(value))


def is_domain(value: str) -> bool:
    return bool(DOMAIN_RE.match(value))


def _count(token: str) -> int:
    token = token.strip().replace(",", "").replace(" ", "")
    multiplier = 1_000 if token[-1] in "kK" else 1
    number = token.rstrip("kK")
    return int(float(number) * multiplier)


def norm_size(value: str) -> Size | None:
    """Map "51-200", "201 to 1,000" (any dash), "1000+", "5k", "12 employees" onto the four buckets.

    A range goes by its upper end; an unparseable value is ``None`` (kept out of the
    size column rather than guessed).
    """
    try:
        numbers = [_count(m) for m in _NUMBER.findall(value)]
    except ValueError:  # "1.2.3"
        return None
    if not numbers:
        return None
    top = max(numbers)
    if "+" in value and len(numbers) == 1:
        top = numbers[0] + 1
    if top <= 50:
        return "1-50"
    if top <= 200:
        return "51-200"
    if top <= 1_000:
        return "201-1000"
    return "1000+"


def full_name(first: str | None, last: str | None) -> str | None:
    joined = " ".join(p for p in (first, last) if p)
    return joined or None


def split_name(name: str) -> tuple[str, str | None]:
    """``"Wanjiru Mwangi"`` -> ``("Wanjiru", "Mwangi")``; one word is a first name."""
    parts = name.strip().split(maxsplit=1)
    return parts[0], (parts[1] if len(parts) > 1 else None)


def csv_safe(value: str) -> str:
    """Neutralise spreadsheet formula injection in exported cells (OWASP CSV injection)."""
    if value and value[0] in "=+-@\t\r":
        return "'" + value
    return value
