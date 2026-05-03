"""PPT 디자인 테마 시스템.

테마는 색/폰트/크기/여백을 하나의 dataclass로 묶어 generator에 주입된다.
- DEFAULT_THEME: 기존 공공기관 스타일 (남색/녹색, 나눔고딕, 흰배경 본문)
- XAI_THEME: xAI 다크 브루탈리즘 영감 — 표지·구분 슬라이드는 다크,
            본문은 평가위원 가독성을 위해 흰배경 유지하는 하이브리드.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor


def _rgb(hex_str: str) -> RGBColor:
    s = hex_str.lstrip("#")
    return RGBColor(int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))


@dataclass
class Theme:
    """PPT 전체에 걸친 시각적 토큰."""

    name: str = "default"

    # ── 폰트 ──
    # 한글 본문/제목용 (한글 글리프 보장 필수)
    font_regular: str = "나눔고딕"
    font_bold: str = "나눔고딕 Bold"
    # 영문 디스플레이/모노 (한글 미지원이면 자동으로 시스템 폴백 — 한글 본문엔 사용 금지)
    font_display: str = "나눔고딕 Bold"

    # ── 크기 ──
    title_size: Pt = field(default_factory=lambda: Pt(24))
    body_size: Pt = field(default_factory=lambda: Pt(12))
    caption_size: Pt = field(default_factory=lambda: Pt(10))
    page_num_size: Pt = field(default_factory=lambda: Pt(9))
    cover_title_size: Pt = field(default_factory=lambda: Pt(32))
    cover_subtitle_size: Pt = field(default_factory=lambda: Pt(14))
    cover_meta_size: Pt = field(default_factory=lambda: Pt(11))
    cover_company_size: Pt = field(default_factory=lambda: Pt(18))

    # ── 색: 기본(본문) ──
    color_text: RGBColor = field(default_factory=lambda: _rgb("#1A1A1A"))
    color_text_muted: RGBColor = field(default_factory=lambda: _rgb("#666666"))
    color_bg_body: RGBColor = field(default_factory=lambda: _rgb("#FFFFFF"))
    color_divider: RGBColor = field(default_factory=lambda: _rgb("#D9D9D9"))
    color_light_surface: RGBColor = field(default_factory=lambda: _rgb("#F2F2F2"))

    # ── 색: 액센트(헤더/구분바/표지) ──
    color_primary: RGBColor = field(default_factory=lambda: _rgb("#2B579A"))
    color_accent: RGBColor = field(default_factory=lambda: _rgb("#217346"))

    # ── 색: 액센트 배경 위 텍스트(표지·구분 슬라이드 다크 영역) ──
    color_bg_accent: RGBColor = field(default_factory=lambda: _rgb("#2B579A"))
    color_text_on_accent: RGBColor = field(default_factory=lambda: _rgb("#FFFFFF"))
    color_bar_on_accent: RGBColor = field(default_factory=lambda: _rgb("#217346"))

    # ── 표 ──
    color_table_header_bg: RGBColor = field(default_factory=lambda: _rgb("#2B579A"))
    color_table_header_text: RGBColor = field(default_factory=lambda: _rgb("#FFFFFF"))

    # ── 모서리 ──
    sharp_corners: bool = False  # True면 도형/표 꼭지점 0px 강조 (현재는 정보용)


# ─── 기본 테마: 현재 운영 중인 공공기관 스타일 ───
DEFAULT_THEME = Theme(name="default")


# ─── xAI 영감 다크 하이브리드 ───
# 평가위원 가독성을 위해 본문 슬라이드는 흰배경/검정텍스트 유지.
# 표지·목차의 액센트 배경만 xAI의 #1f2228 다크로 전환하여 브루탈한 인상을 부여.
XAI_THEME = Theme(
    name="xai",
    # 한글 본문은 Pretendard, 영문/숫자 디스플레이는 GeistMono로 의도하지만
    # python-pptx는 폰트 폴백을 지원하지 않으므로 한글이 들어가는 자리엔 한글 폰트를 강제.
    font_regular="Pretendard",
    font_bold="Pretendard SemiBold",
    font_display="GeistMono",  # 영문 라벨/페이지번호 한정
    title_size=Pt(22),
    body_size=Pt(12),
    caption_size=Pt(10),
    page_num_size=Pt(9),
    cover_title_size=Pt(40),       # xAI식 거대 디스플레이 (PPT 한계 내)
    cover_subtitle_size=Pt(12),
    cover_meta_size=Pt(10),
    cover_company_size=Pt(16),
    # 본문 라이트
    color_text=_rgb("#1F2228"),
    color_text_muted=_rgb("#6B7280"),
    color_bg_body=_rgb("#FFFFFF"),
    color_divider=_rgb("#1F2228"),  # 본문 구분선은 진하게
    color_light_surface=_rgb("#F4F5F7"),
    # 헤더/포인트는 다크 단색
    color_primary=_rgb("#1F2228"),
    color_accent=_rgb("#1F2228"),
    # 액센트 배경(표지·구분 슬라이드)은 xAI 다크
    color_bg_accent=_rgb("#1F2228"),
    color_text_on_accent=_rgb("#FFFFFF"),
    color_bar_on_accent=_rgb("#FFFFFF"),
    # 표 헤더
    color_table_header_bg=_rgb("#1F2228"),
    color_table_header_text=_rgb("#FFFFFF"),
    sharp_corners=True,
)


THEMES: dict[str, Theme] = {
    "default": DEFAULT_THEME,
    "xai": XAI_THEME,
}


def get_theme(name: str | None) -> Theme:
    """이름으로 테마를 가져온다. 'random'이면 등록된 테마 중 하나를 무작위 선택."""
    if not name:
        return DEFAULT_THEME
    if name == "random":
        import random
        return random.choice(list(THEMES.values()))
    return THEMES.get(name, DEFAULT_THEME)
