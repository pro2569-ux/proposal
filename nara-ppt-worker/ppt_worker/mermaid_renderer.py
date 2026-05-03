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


def _inject_theme_variables(code: str, theme_colors: dict | None) -> str:
    """Mermaid 코드 앞에 %%{init: {themeVariables: ...}}%% 디렉티브를 주입한다.

    theme_colors는 PPT Theme에서 추출한 색 hex 문자열 dict:
      - primary: 메인 액센트 (#RRGGBB)
      - text: 본문 글자색
      - background: 다이어그램 배경
      - line: 연결선 색

    이미 init 디렉티브가 있으면 건드리지 않는다 (gantt 등이 충돌 회피).
    """
    if not theme_colors:
        return code
    trimmed = code.lstrip()
    if trimmed.startswith("%%{init"):
        return code

    primary = theme_colors.get("primary", "#1F2228")
    text = theme_colors.get("text", "#1F2228")
    bg = theme_colors.get("background", "#FFFFFF")
    line = theme_colors.get("line", primary)
    secondary = theme_colors.get("secondary", "#F4F5F7")

    vars_obj = (
        "{"
        f"'primaryColor':'{secondary}',"
        f"'primaryTextColor':'{text}',"
        f"'primaryBorderColor':'{primary}',"
        f"'lineColor':'{line}',"
        f"'secondaryColor':'{secondary}',"
        f"'tertiaryColor':'{bg}',"
        f"'background':'{bg}',"
        f"'mainBkg':'{bg}',"
        f"'nodeTextColor':'{text}',"
        f"'edgeLabelBackground':'{bg}'"
        "}"
    )
    directive = "%%{init: {'themeVariables': " + vars_obj + "}}%%"
    return f"{directive}\n{code}"


def render_mermaid_to_png(
    code: str,
    width: int = 1280,
    height: int = 720,
    background: str = "white",
    theme: str = "default",
    theme_colors: dict | None = None,
) -> bytes:
    """Mermaid 코드를 PNG 바이트로 변환한다.

    실패 시 stderr 메시지를 담은 MermaidRenderError 를 던진다.
    호출자는 이 메시지를 LLM 에게 다시 넘겨 코드 자가수정에 활용할 수 있다.
    """
    if not code or not code.strip():
        raise MermaidRenderError("Mermaid 코드가 비어있습니다.")

    code = _inject_theme_variables(code, theme_colors)

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
