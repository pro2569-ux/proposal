"""Mermaid 코드 → PNG 이미지 변환 모듈.

렌더링 전략:
1. (기본) Kroki.io 무료 API — 외부 의존성 없이 HTTP 요청만으로 변환
2. (폴백) 로컬 Playwright — Docker에 Chromium이 설치된 경우

Kroki는 Mermaid를 포함한 다양한 다이어그램 포맷을 지원하는
오픈소스 렌더링 서비스로, 자체 호스팅도 가능하다.
"""

from __future__ import annotations

import base64
import zlib
from typing import Literal

import httpx

# ──────────── 설정 ────────────

KROKI_BASE_URL = "https://kroki.io"
RENDER_TIMEOUT = 30  # 초
IMAGE_FORMAT: Literal["png", "svg"] = "png"


# ──────────── 메인 함수 ────────────


async def render_mermaid_to_png(mermaid_code: str) -> bytes:
    """Mermaid 코드를 PNG 이미지 바이트로 변환한다.

    Args:
        mermaid_code: 유효한 Mermaid 구문 문자열

    Returns:
        PNG 이미지 바이트

    Raises:
        MermaidRenderError: 렌더링 실패 시
    """
    try:
        return await _render_via_kroki(mermaid_code)
    except Exception as e:
        raise MermaidRenderError(f"Mermaid 렌더링 실패: {e}") from e


async def render_mermaid_to_svg(mermaid_code: str) -> str:
    """Mermaid 코드를 SVG 문자열로 변환한다."""
    try:
        return await _render_via_kroki_svg(mermaid_code)
    except Exception as e:
        raise MermaidRenderError(f"Mermaid SVG 렌더링 실패: {e}") from e


# ──────────── Kroki 렌더링 ────────────


def _encode_kroki_payload(source: str) -> str:
    """Kroki API에 전달할 인코딩된 다이어그램 문자열 생성.

    Kroki는 deflate → base64url 인코딩을 사용한다.
    """
    compressed = zlib.compress(source.encode("utf-8"), level=9)
    encoded = base64.urlsafe_b64encode(compressed).decode("ascii")
    return encoded


async def _render_via_kroki(mermaid_code: str) -> bytes:
    """Kroki.io API를 통해 Mermaid → PNG 변환."""
    encoded = _encode_kroki_payload(mermaid_code)
    url = f"{KROKI_BASE_URL}/mermaid/png/{encoded}"

    async with httpx.AsyncClient(timeout=RENDER_TIMEOUT) as client:
        resp = await client.get(url)

        if resp.status_code != 200:
            # POST 방식으로 재시도 (더 긴 코드 지원)
            resp = await client.post(
                f"{KROKI_BASE_URL}/mermaid/png",
                json={"diagram_source": mermaid_code},
                headers={"Content-Type": "application/json"},
                timeout=RENDER_TIMEOUT,
            )

        if resp.status_code != 200:
            raise MermaidRenderError(
                f"Kroki API 오류 (HTTP {resp.status_code}): {resp.text[:200]}"
            )

        content_type = resp.headers.get("content-type", "")
        if "image" not in content_type and len(resp.content) < 100:
            raise MermaidRenderError(
                f"Kroki가 이미지가 아닌 응답 반환: {content_type}"
            )

        return resp.content


async def _render_via_kroki_svg(mermaid_code: str) -> str:
    """Kroki.io API를 통해 Mermaid → SVG 변환."""
    encoded = _encode_kroki_payload(mermaid_code)
    url = f"{KROKI_BASE_URL}/mermaid/svg/{encoded}"

    async with httpx.AsyncClient(timeout=RENDER_TIMEOUT) as client:
        resp = await client.get(url)

        if resp.status_code != 200:
            resp = await client.post(
                f"{KROKI_BASE_URL}/mermaid/svg",
                json={"diagram_source": mermaid_code},
                headers={"Content-Type": "application/json"},
                timeout=RENDER_TIMEOUT,
            )

        if resp.status_code != 200:
            raise MermaidRenderError(
                f"Kroki SVG API 오류 (HTTP {resp.status_code}): {resp.text[:200]}"
            )

        return resp.text


# ──────────── 예외 ────────────


class MermaidRenderError(Exception):
    """Mermaid 렌더링 실패 예외."""
    pass
