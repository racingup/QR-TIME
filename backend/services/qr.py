"""QR code generation utilities."""
from __future__ import annotations

import base64
import io

import qrcode


def generate_png_base64(payload: str) -> str:
    """Render `payload` as a PNG QR code and return base64-encoded bytes."""
    qr = qrcode.QRCode(
        version=None, box_size=8, border=2,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
    )
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")
