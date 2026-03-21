"""나라장터 제안서 PPT 생성기.

슬라이드 디자인 규칙:
- 기본 폰트: 나눔고딕 (Bold/Regular)
- 제목: 24pt Bold, 본문: 12pt Regular
- 메인 컬러: #2B579A, 포인트: #217346
- 슬라이드: 와이드스크린 16:9
"""

from __future__ import annotations

import io
import re
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import httpx
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

# ──────────────────────────── 디자인 상수 ────────────────────────────

FONT_REGULAR = "나눔고딕"
FONT_BOLD = "나눔고딕 Bold"

TITLE_SIZE = Pt(24)
BODY_SIZE = Pt(12)
CAPTION_SIZE = Pt(10)
PAGE_NUM_SIZE = Pt(9)

COLOR_PRIMARY = RGBColor(0x2B, 0x57, 0x9A)   # #2B579A 메인 남색
COLOR_ACCENT = RGBColor(0x21, 0x73, 0x46)     # #217346 포인트 녹색
COLOR_WHITE = RGBColor(0xFF, 0xFF, 0xFF)
COLOR_BLACK = RGBColor(0x1A, 0x1A, 0x1A)
COLOR_GRAY = RGBColor(0x66, 0x66, 0x66)
COLOR_LIGHT_GRAY = RGBColor(0xF2, 0xF2, 0xF2)
COLOR_DIVIDER = RGBColor(0xD9, 0xD9, 0xD9)

SLIDE_WIDTH = Emu(12192000)   # 16:9 와이드스크린
SLIDE_HEIGHT = Emu(6858000)

# 공통 마진
MARGIN_LEFT = Inches(0.7)
MARGIN_RIGHT = Inches(0.7)
CONTENT_WIDTH = Inches(8.9)   # 10.33 - 0.7*2
HEADER_TOP = Inches(0.4)
BODY_TOP = Inches(1.5)
BODY_HEIGHT = Inches(5.0)
FOOTER_TOP = Inches(6.85)


# ──────────────────────────── 데이터 모델 ────────────────────────────

@dataclass
class CoverSection:
    """표지 슬라이드 데이터."""
    type: Literal["cover"] = "cover"
    subtitle: str = ""  # 부제목 (예: "기술 제안서")


@dataclass
class TocItem:
    """목차 항목."""
    number: str     # "01", "02" ...
    title: str
    page: int = 0


@dataclass
class TocSection:
    """목차 슬라이드 데이터."""
    type: Literal["toc"] = "toc"
    items: list[TocItem] = field(default_factory=list)


@dataclass
class ContentSection:
    """본문 슬라이드 데이터."""
    type: Literal["content"] = "content"
    title: str = ""
    body: list[str] = field(default_factory=list)
    image_path: str | None = None          # 이미지 파일 경로
    image_position: Literal["right", "bottom", "full"] = "right"


@dataclass
class ScheduleItem:
    """일정 항목."""
    phase: str        # 단계명
    task: str         # 세부 작업
    duration: str     # "2주", "1개월" 등
    months: list[int] = field(default_factory=list)  # 해당 월 (1~12)


@dataclass
class ScheduleSection:
    """일정 슬라이드 데이터."""
    type: Literal["schedule"] = "schedule"
    title: str = "추진 일정"
    total_months: int = 6
    items: list[ScheduleItem] = field(default_factory=list)


@dataclass
class TeamMember:
    """투입 인력."""
    role: str           # 역할 (PM, PL, 개발자 등)
    name: str
    career_years: int   # 경력 연수
    certification: str = ""  # 자격증
    tasks: str = ""     # 담당 업무


@dataclass
class TeamSection:
    """인력 구성 슬라이드 데이터."""
    type: Literal["team"] = "team"
    title: str = "투입 인력 구성"
    members: list[TeamMember] = field(default_factory=list)


SectionType = CoverSection | TocSection | ContentSection | ScheduleSection | TeamSection


@dataclass
class ProposalData:
    """제안서 전체 데이터."""
    title: str                  # 사업명
    company: str                # 업체명
    bid_org: str = ""           # 발주기관
    date: str = ""              # 제출일
    sections: list[SectionType] = field(default_factory=list)


# ──────────────────────────── 생성기 클래스 ────────────────────────────

class ProposalPPTGenerator:
    """나라장터 제안서 PPT를 생성한다."""

    def __init__(self, template_path: str | Path | None = None):
        if template_path:
            path = Path(template_path)
            if not path.exists():
                raise FileNotFoundError(f"템플릿을 찾을 수 없습니다: {path}")
            self.prs = Presentation(str(path))
        else:
            self.prs = Presentation()
            self.prs.slide_width = SLIDE_WIDTH
            self.prs.slide_height = SLIDE_HEIGHT

        self._blank_layout = self.prs.slide_layouts[6]  # 빈 레이아웃
        self._page_number = 0

    # ──────────── public API ────────────

    def generate(self, proposal_data: ProposalData) -> bytes:
        """제안서 데이터를 받아 PPT 바이트를 반환한다."""
        self._page_number = 0

        for section in proposal_data.sections:
            match section.type:
                case "cover":
                    self._add_cover(proposal_data, section)
                case "toc":
                    self._add_toc(section)
                case "content":
                    self._add_content(section)
                case "schedule":
                    self._add_schedule(section)
                case "team":
                    self._add_team(section)

        buf = io.BytesIO()
        self.prs.save(buf)
        return buf.getvalue()

    # ──────────── 공통 헬퍼 ────────────

    def _new_slide(self, show_page_number: bool = True):
        """빈 슬라이드를 추가하고 반환한다."""
        slide = self.prs.slides.add_slide(self._blank_layout)
        self._page_number += 1
        if show_page_number and self._page_number > 1:
            self._add_page_number(slide)
        return slide

    @staticmethod
    def _set_font(
        run,
        size=BODY_SIZE,
        bold: bool = False,
        color=COLOR_BLACK,
        font_name: str | None = None,
    ):
        """텍스트 런에 나눔고딕 폰트를 설정한다."""
        run.font.name = font_name or (FONT_BOLD if bold else FONT_REGULAR)
        run.font.size = size
        run.font.bold = bold
        run.font.color.rgb = color

    @staticmethod
    def _add_textbox(slide, left, top, width, height, text: str, **font_kwargs):
        """텍스트박스를 추가하고 런을 반환한다."""
        txBox = slide.shapes.add_textbox(left, top, width, height)
        tf = txBox.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = text
        ProposalPPTGenerator._set_font(run, **font_kwargs)
        return txBox, tf, p, run

    def _add_slide_header(self, slide, title: str):
        """슬라이드 상단 제목 + 구분선을 추가한다."""
        # 제목
        self._add_textbox(
            slide, MARGIN_LEFT, HEADER_TOP, CONTENT_WIDTH, Inches(0.6),
            title, size=TITLE_SIZE, bold=True, color=COLOR_PRIMARY,
        )
        # 구분선
        line = slide.shapes.add_shape(
            MSO_SHAPE.RECTANGLE,
            MARGIN_LEFT, Inches(1.15), CONTENT_WIDTH, Pt(2),
        )
        line.fill.solid()
        line.fill.fore_color.rgb = COLOR_PRIMARY
        line.line.fill.background()

    def _add_page_number(self, slide):
        """우측 하단 페이지 번호."""
        _, _, _, run = self._add_textbox(
            slide,
            Inches(9.0), FOOTER_TOP, Inches(1.0), Inches(0.3),
            str(self._page_number - 1),  # 표지 제외
            size=PAGE_NUM_SIZE, color=COLOR_GRAY,
        )
        run.font.name = FONT_REGULAR

    def _add_footer_line(self, slide):
        """하단 구분선."""
        line = slide.shapes.add_shape(
            MSO_SHAPE.RECTANGLE,
            MARGIN_LEFT, Inches(6.75), CONTENT_WIDTH, Pt(1),
        )
        line.fill.solid()
        line.fill.fore_color.rgb = COLOR_DIVIDER
        line.line.fill.background()

    # ──────────── 표지 (Cover) ────────────

    def _add_cover(self, data: ProposalData, section: CoverSection):
        slide = self._new_slide(show_page_number=False)

        # 배경: 메인 컬러
        bg = slide.background.fill
        bg.solid()
        bg.fore_color.rgb = COLOR_PRIMARY

        # 좌측 포인트 바
        bar = slide.shapes.add_shape(
            MSO_SHAPE.RECTANGLE,
            Inches(0.6), Inches(1.8), Inches(0.08), Inches(2.8),
        )
        bar.fill.solid()
        bar.fill.fore_color.rgb = COLOR_ACCENT
        bar.line.fill.background()

        # 부제목 (예: "기술 제안서")
        if section.subtitle:
            self._add_textbox(
                slide, Inches(1.0), Inches(1.9), Inches(8.0), Inches(0.5),
                section.subtitle,
                size=Pt(14), color=COLOR_WHITE,
            )

        # 사업명 (제목)
        self._add_textbox(
            slide, Inches(1.0), Inches(2.5), Inches(8.0), Inches(1.5),
            data.title,
            size=Pt(32), bold=True, color=COLOR_WHITE,
        )

        # 발주기관 · 제출일
        meta_lines = []
        if data.bid_org:
            meta_lines.append(f"발주기관  |  {data.bid_org}")
        if data.date:
            meta_lines.append(f"제 출 일  |  {data.date}")
        if meta_lines:
            self._add_textbox(
                slide, Inches(1.0), Inches(4.3), Inches(8.0), Inches(0.8),
                "\n".join(meta_lines),
                size=Pt(11), color=COLOR_WHITE,
            )

        # 업체명 (하단)
        _, tf, p, run = self._add_textbox(
            slide, Inches(1.0), Inches(5.8), Inches(8.0), Inches(0.5),
            data.company,
            size=Pt(18), bold=True, color=COLOR_WHITE,
        )
        p.alignment = PP_ALIGN.RIGHT

    # ──────────── 목차 (TOC) ────────────

    def _add_toc(self, section: TocSection):
        slide = self._new_slide()
        self._add_slide_header(slide, "목 차")

        y = Inches(1.7)
        row_height = Inches(0.65)

        for item in section.items:
            # 번호 원형 배지
            circle = slide.shapes.add_shape(
                MSO_SHAPE.OVAL,
                Inches(1.0), y + Inches(0.08), Inches(0.42), Inches(0.42),
            )
            circle.fill.solid()
            circle.fill.fore_color.rgb = COLOR_PRIMARY
            circle.line.fill.background()
            tf = circle.text_frame
            tf.paragraphs[0].alignment = PP_ALIGN.CENTER
            tf.vertical_anchor = MSO_ANCHOR.MIDDLE
            run = tf.paragraphs[0].add_run()
            run.text = item.number
            self._set_font(run, size=Pt(11), bold=True, color=COLOR_WHITE)

            # 항목 제목
            self._add_textbox(
                slide, Inches(1.65), y, Inches(6.5), Inches(0.5),
                item.title,
                size=Pt(14), bold=True, color=COLOR_BLACK,
            )

            # 페이지 번호 (있는 경우)
            if item.page:
                _, _, p, _ = self._add_textbox(
                    slide, Inches(8.5), y, Inches(1.0), Inches(0.5),
                    str(item.page),
                    size=Pt(12), color=COLOR_GRAY,
                )
                p.alignment = PP_ALIGN.RIGHT

            # 구분 점선
            if item != section.items[-1]:
                dotline = slide.shapes.add_shape(
                    MSO_SHAPE.RECTANGLE,
                    Inches(1.0), y + Inches(0.58), Inches(8.5), Pt(0.5),
                )
                dotline.fill.solid()
                dotline.fill.fore_color.rgb = COLOR_DIVIDER
                dotline.line.fill.background()

            y += row_height

        self._add_footer_line(slide)

    # ──────────── 이미지 다운로드 ────────────

    @staticmethod
    def _resolve_image(image_path: str | None) -> str | None:
        """이미지 경로를 실제 사용 가능한 로컬 경로로 반환한다.

        - 로컬 파일이면 그대로 반환
        - URL이면 다운로드하여 임시 파일 경로 반환
        - 실패하면 None
        """
        if not image_path:
            return None

        # 로컬 파일
        if not image_path.startswith(("http://", "https://")):
            return image_path if Path(image_path).exists() else None

        # URL → 다운로드
        try:
            resp = httpx.get(image_path, timeout=30, follow_redirects=True)
            resp.raise_for_status()

            ct = resp.headers.get("content-type", "")
            ext = ".png" if "png" in ct else ".jpg"
            tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
            tmp.write(resp.content)
            tmp.close()
            return tmp.name
        except Exception as e:
            print(f"[PPT] 이미지 다운로드 실패: {e}")
            return None

    # ──────────── 마크다운 파싱 ────────────

    @staticmethod
    def _add_rich_text(paragraph, text: str, base_size=BODY_SIZE, base_color=COLOR_BLACK):
        """**bold** 마크다운을 파싱하여 런을 분리 추가한다."""
        parts = re.split(r'(\*\*.*?\*\*)', text)
        for part in parts:
            if not part:
                continue
            run = paragraph.add_run()
            if part.startswith('**') and part.endswith('**'):
                run.text = part[2:-2]
                ProposalPPTGenerator._set_font(run, size=base_size, bold=True, color=base_color)
            else:
                run.text = part
                ProposalPPTGenerator._set_font(run, size=base_size, color=base_color)

    # ──────────── 본문 (Content) ────────────

    def _add_content(self, section: ContentSection):
        slide = self._new_slide()
        self._add_slide_header(slide, section.title)

        resolved_image = self._resolve_image(section.image_path)

        if resolved_image and section.image_position == "right":
            self._add_content_with_image_right(slide, section, resolved_image)
        elif resolved_image and section.image_position == "bottom":
            self._add_content_with_image_bottom(slide, section, resolved_image)
        elif resolved_image and section.image_position == "full":
            self._add_content_image_full(slide, resolved_image)
        else:
            self._add_content_text_only(slide, section)

        self._add_footer_line(slide)

    def _add_content_text_only(self, slide, section: ContentSection):
        """텍스트만 있는 본문 슬라이드."""
        txBox = slide.shapes.add_textbox(
            MARGIN_LEFT, BODY_TOP, CONTENT_WIDTH, BODY_HEIGHT,
        )
        tf = txBox.text_frame
        tf.word_wrap = True

        for i, line in enumerate(section.body):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            p.space_after = Pt(8)
            p.line_spacing = Pt(20)

            if not line:
                continue

            # "■" 소제목
            if line.startswith("■"):
                self._add_rich_text(p, line, base_size=Pt(13), base_color=COLOR_PRIMARY)
            # "●" 강조/플레이스홀더
            elif line.startswith("●"):
                self._add_rich_text(p, line, base_size=BODY_SIZE, base_color=COLOR_ACCENT)
            # "  • " 불릿 아이템 (route.ts에서 마킹)
            elif line.startswith("  • "):
                p.level = 1
                self._add_rich_text(p, line, base_size=BODY_SIZE, base_color=COLOR_BLACK)
            # 일반 문단
            else:
                self._add_rich_text(p, f"  {line}", base_size=BODY_SIZE, base_color=COLOR_BLACK)

    def _add_content_with_image_right(self, slide, section: ContentSection, image_path: str):
        """좌측 텍스트 + 우측 이미지."""
        # 텍스트 (좌측 60%)
        txBox = slide.shapes.add_textbox(
            MARGIN_LEFT, BODY_TOP, Inches(5.0), BODY_HEIGHT,
        )
        tf = txBox.text_frame
        tf.word_wrap = True
        for i, line in enumerate(section.body):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            p.space_after = Pt(8)
            p.line_spacing = Pt(20)
            if line:
                self._add_rich_text(p, f"• {line}", base_size=BODY_SIZE, base_color=COLOR_BLACK)

        # 이미지 (우측 40%)
        slide.shapes.add_picture(
            image_path,
            Inches(6.0), BODY_TOP, Inches(3.6), Inches(3.5),
        )

    def _add_content_with_image_bottom(self, slide, section: ContentSection, image_path: str):
        """상단 텍스트 + 하단 이미지."""
        txBox = slide.shapes.add_textbox(
            MARGIN_LEFT, BODY_TOP, CONTENT_WIDTH, Inches(2.2),
        )
        tf = txBox.text_frame
        tf.word_wrap = True
        for i, line in enumerate(section.body):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            p.space_after = Pt(6)
            if line:
                self._add_rich_text(p, f"• {line}", base_size=BODY_SIZE, base_color=COLOR_BLACK)

        slide.shapes.add_picture(
            image_path,
            Inches(1.5), Inches(4.0), Inches(7.3), Inches(2.5),
        )

    def _add_content_image_full(self, slide, image_path: str):
        """전체 이미지 슬라이드."""
        slide.shapes.add_picture(
            image_path,
            MARGIN_LEFT, BODY_TOP, CONTENT_WIDTH, BODY_HEIGHT,
        )

    # ──────────── 추진 일정 (Schedule) ────────────

    def _add_schedule(self, section: ScheduleSection):
        slide = self._new_slide()
        self._add_slide_header(slide, section.title)

        total = section.total_months
        table_left = MARGIN_LEFT
        table_top = Inches(1.7)
        col_widths = [Inches(1.5), Inches(2.5)] + [
            Inches(4.9 / total) for _ in range(total)
        ]
        rows = len(section.items) + 1  # 헤더 + 데이터

        table_shape = slide.shapes.add_table(
            rows, 2 + total,
            table_left, table_top,
            sum(col_widths, Emu(0)), Inches(0.4 * rows),
        )
        table = table_shape.table

        # 열 너비 설정
        for i, w in enumerate(col_widths):
            table.columns[i].width = int(w)

        # 헤더 행
        headers = ["단계", "세부 작업"] + [f"{m}월" for m in range(1, total + 1)]
        for ci, text in enumerate(headers):
            cell = table.cell(0, ci)
            cell.text = ""
            cell.fill.solid()
            cell.fill.fore_color.rgb = COLOR_PRIMARY
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            p = cell.text_frame.paragraphs[0]
            p.alignment = PP_ALIGN.CENTER
            run = p.add_run()
            run.text = text
            self._set_font(run, size=Pt(10), bold=True, color=COLOR_WHITE)

        # 데이터 행
        for ri, item in enumerate(section.items, start=1):
            # 단계
            c_phase = table.cell(ri, 0)
            c_phase.text = ""
            c_phase.vertical_anchor = MSO_ANCHOR.MIDDLE
            p = c_phase.text_frame.paragraphs[0]
            p.alignment = PP_ALIGN.CENTER
            run = p.add_run()
            run.text = item.phase
            self._set_font(run, size=Pt(10), bold=True, color=COLOR_BLACK)

            # 세부 작업
            c_task = table.cell(ri, 1)
            c_task.text = ""
            c_task.vertical_anchor = MSO_ANCHOR.MIDDLE
            p = c_task.text_frame.paragraphs[0]
            run = p.add_run()
            run.text = item.task
            self._set_font(run, size=Pt(10), color=COLOR_BLACK)

            # 간트 바 (해당 월 셀에 색칠)
            for m in item.months:
                if 1 <= m <= total:
                    cell = table.cell(ri, 1 + m)
                    cell.fill.solid()
                    cell.fill.fore_color.rgb = COLOR_ACCENT

            # 짝수 행 배경 (간트 바 셀은 제외)
            if ri % 2 == 0:
                gantt_cols = {1 + m for m in item.months if 1 <= m <= total}
                for ci in range(2 + total):
                    if ci not in gantt_cols:
                        cell = table.cell(ri, ci)
                        cell.fill.solid()
                        cell.fill.fore_color.rgb = COLOR_LIGHT_GRAY

        self._add_footer_line(slide)

    # ──────────── 투입 인력 (Team) ────────────

    def _add_team(self, section: TeamSection):
        slide = self._new_slide()
        self._add_slide_header(slide, section.title)

        cols = 5
        rows = len(section.members) + 1
        col_widths = [Inches(1.2), Inches(1.2), Inches(1.0), Inches(2.0), Inches(3.5)]

        table_shape = slide.shapes.add_table(
            rows, cols,
            MARGIN_LEFT, Inches(1.7),
            sum(col_widths, Emu(0)), Inches(0.45 * rows),
        )
        table = table_shape.table

        for i, w in enumerate(col_widths):
            table.columns[i].width = int(w)

        # 헤더
        headers = ["역할", "성명", "경력", "자격/학위", "담당 업무"]
        for ci, text in enumerate(headers):
            cell = table.cell(0, ci)
            cell.text = ""
            cell.fill.solid()
            cell.fill.fore_color.rgb = COLOR_PRIMARY
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            p = cell.text_frame.paragraphs[0]
            p.alignment = PP_ALIGN.CENTER
            run = p.add_run()
            run.text = text
            self._set_font(run, size=Pt(10), bold=True, color=COLOR_WHITE)

        # 데이터
        for ri, member in enumerate(section.members, start=1):
            values = [
                member.role,
                member.name,
                f"{member.career_years}년",
                member.certification,
                member.tasks,
            ]
            for ci, val in enumerate(values):
                cell = table.cell(ri, ci)
                cell.text = ""
                cell.vertical_anchor = MSO_ANCHOR.MIDDLE
                p = cell.text_frame.paragraphs[0]
                p.alignment = PP_ALIGN.CENTER if ci < 3 else PP_ALIGN.LEFT
                run = p.add_run()
                run.text = val
                self._set_font(run, size=Pt(10), color=COLOR_BLACK)

                # 역할 열 강조
                if ci == 0:
                    self._set_font(run, size=Pt(10), bold=True, color=COLOR_PRIMARY)

            # 짝수 행 배경
            if ri % 2 == 0:
                for ci in range(cols):
                    cell = table.cell(ri, ci)
                    cell.fill.solid()
                    cell.fill.fore_color.rgb = COLOR_LIGHT_GRAY

        self._add_footer_line(slide)
