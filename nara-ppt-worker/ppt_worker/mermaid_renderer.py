"""Mermaid 코드 → PNG 렌더링.

@mermaid-js/mermaid-cli (mmdc) 를 subprocess 로 호출한다.
한글 라벨은 시스템 폰트(나눔고딕)로 그려지므로 깨지지 않는다.
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

PUPPETEER_CONFIG = Path(__file__).parent / "puppeteer-config.json"
RENDER_TIMEOUT_SEC = 30


class MermaidRenderError(Exception):
    """Mermaid 렌더링 실패."""


def render_mermaid_to_png(
    code: str,
    width: int = 1280,
    height: int = 720,
    background: str = "white",
    theme: str = "default",
) -> bytes:
    """Mermaid 코드를 PNG 바이트로 변환한다.

    실패 시 stderr 메시지를 담은 MermaidRenderError 를 던진다.
    호출자는 이 메시지를 LLM 에게 다시 넘겨 코드 자가수정에 활용할 수 있다.
    """
    if not code or not code.strip():
        raise MermaidRenderError("Mermaid 코드가 비어있습니다.")

    mmdc = shutil.which("mmdc")
    if not mmdc:
        raise MermaidRenderError(
            "mmdc(@mermaid-js/mermaid-cli)가 설치되지 않았습니다."
        )

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        in_path = tmp_dir / "diagram.mmd"
        out_path = tmp_dir / "diagram.png"
        in_path.write_text(code, encoding="utf-8")

        cmd = [
            mmdc,
            "-i", str(in_path),
            "-o", str(out_path),
            "-w", str(width),
            "-H", str(height),
            "-b", background,
            "-t", theme,
            "-s", "2",  # 2x scale → 더 선명한 PNG
        ]
        if PUPPETEER_CONFIG.exists():
            cmd += ["-p", str(PUPPETEER_CONFIG)]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=RENDER_TIMEOUT_SEC,
            )
        except subprocess.TimeoutExpired as e:
            raise MermaidRenderError(
                f"Mermaid 렌더링 타임아웃({RENDER_TIMEOUT_SEC}s)"
            ) from e
        except FileNotFoundError as e:
            raise MermaidRenderError(f"mmdc 실행 실패: {e}") from e

        if result.returncode != 0:
            stderr = (result.stderr or result.stdout or "").strip()
            raise MermaidRenderError(
                f"Mermaid 문법 오류 또는 렌더링 실패:\n{stderr[:1000]}"
            )

        if not out_path.exists():
            raise MermaidRenderError("Mermaid 출력 파일이 생성되지 않았습니다.")

        return out_path.read_bytes()
