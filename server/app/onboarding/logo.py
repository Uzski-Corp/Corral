"""Sniff an uploaded workspace logo. SVG is refused: a public bucket would serve it as a page."""

PNG = b"\x89PNG\r\n\x1a\n"
JPEG = b"\xff\xd8\xff"
GIF87 = b"GIF87a"
GIF89 = b"GIF89a"

EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
}


def sniff_image(data: bytes) -> str | None:
    """Content type from magic bytes, or ``None`` when it isn't a logo we will store."""
    if data.startswith(PNG):
        return "image/png"
    if data.startswith(JPEG):
        return "image/jpeg"
    if data.startswith(GIF87) or data.startswith(GIF89):
        return "image/gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None
