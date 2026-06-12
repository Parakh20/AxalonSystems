"""Supabase Storage client for /track file uploads.

The HF Spaces container disk is ephemeral — anything written locally vanishes on
restart. When SUPABASE_URL + SUPABASE_SERVICE_KEY are set, track files live in a
Supabase Storage bucket instead; without them we fall back to local disk so dev
and CI keep working with zero configuration.
"""
from __future__ import annotations

import os
from typing import BinaryIO, Iterator

import requests

DEFAULT_BUCKET = "track-files"
_CHUNK = 1024 * 1024
_TIMEOUT = 60  # seconds — STL uploads can be tens of MB


class SupabaseStorage:
    """Minimal REST client for one Supabase Storage bucket (service-role auth)."""

    def __init__(self, url: str, service_key: str, bucket: str = DEFAULT_BUCKET):
        self.url = url.rstrip("/")
        self.bucket = bucket
        self._auth = {"Authorization": f"Bearer {service_key}"}

    def _object_url(self, name: str) -> str:
        return f"{self.url}/storage/v1/object/{self.bucket}/{name}"

    def upload(self, name: str, fileobj: BinaryIO, content_type: str) -> None:
        """Store an object; raises RuntimeError on any non-2xx response."""
        resp = requests.post(
            self._object_url(name),
            headers={
                **self._auth,
                "Content-Type": content_type or "application/octet-stream",
                # idempotent re-upload of the same stored_name
                "x-upsert": "true",
            },
            data=fileobj,
            timeout=_TIMEOUT,
        )
        if resp.status_code >= 300:
            raise RuntimeError(
                f"Supabase Storage upload failed ({resp.status_code}): {resp.text[:200]}"
            )

    def download(self, name: str) -> Iterator[bytes] | None:
        """Yield object content in chunks, or None when the object is missing."""
        resp = requests.get(
            self._object_url(name), headers=self._auth, stream=True, timeout=_TIMEOUT
        )
        if resp.status_code != 200:
            return None
        return resp.iter_content(chunk_size=_CHUNK)

    def delete(self, name: str) -> None:
        """Remove an object; missing objects are not an error."""
        resp = requests.delete(self._object_url(name), headers=self._auth, timeout=_TIMEOUT)
        if resp.status_code >= 300 and resp.status_code != 404:
            raise RuntimeError(
                f"Supabase Storage delete failed ({resp.status_code}): {resp.text[:200]}"
            )


def get_track_store() -> SupabaseStorage | None:
    """Build the store from env, or None to use local-disk fallback."""
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not key:
        return None
    bucket = os.environ.get("AXALON_TRACK_BUCKET", DEFAULT_BUCKET).strip() or DEFAULT_BUCKET
    return SupabaseStorage(url=url, service_key=key, bucket=bucket)
