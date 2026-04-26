"""나라장터 제안서 PPT 생성 워커 — FastAPI 서버."""

import io
import os
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import quote

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .generator import (
    ProposalPPTGenerator,
    ProposalData,
    CoverSection,
    TocSection,
    TocItem,
    ContentSection,
    ScheduleSection,
    ScheduleItem,
    TeamSection,
    TeamMember,
    DataTableSection,
)
from .mermaid_renderer import MermaidRenderError, render_mermaid_to_png

load_dotenv()

TEMPLATES_DIR = Path(__file__).parent / "templates"
API_TOKEN = os.getenv("WORKER_SECRET", "")

app = FastAPI(
    title="나라장터 제안서 PPT 생성 워커",
    version="1.0.0",
)

security = HTTPBearer()

PPTX_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
)


# ──────────────────────────── 인증 ────────────────────────────


def verify_token(
    credentials: Annotated[
        HTTPAuthorizationCredentials, Security(security)
    ],
) -> str:
    """Bearer 토큰을 환경변수 WORKER_SECRET 과 비교한다."""
    if not API_TOKEN:
        raise HTTPException(
            status_code=500,
            detail="서버에 WORKER_SECRET 이 설정되지 않았습니다",
        )
    if credentials.credentials != API_TOKEN:
        raise HTTPException(status_code=401, detail="인증 토큰이 올바르지 않습니다")
    return credentials.credentials


# ──────────────────────────── Pydantic 모델 ────────────────────────────


# — 섹션별 모델 —

class CoverSectionReq(BaseModel):
    type: Literal["cover"] = "cover"
    subtitle: str = ""


class TocItemReq(BaseModel):
    number: str = Field(..., examples=["01"])
    title: str
    page: int = 0


class TocSectionReq(BaseModel):
    type: Literal["toc"] = "toc"
    items: list[TocItemReq] = []


class ContentSectionReq(BaseModel):
    type: Literal["content"] = "content"
    title: str = ""
    body: list[str] = []
    image_path: str | None = None
    image_position: Literal["right", "bottom", "full"] = "right"


class ScheduleItemReq(BaseModel):
    phase: str
    task: str
    duration: str = ""
    months: list[int] = Field(default=[], examples=[[1, 2, 3]])


class ScheduleSectionReq(BaseModel):
    type: Literal["schedule"] = "schedule"
    title: str = "추진 일정"
    total_months: int = Field(default=6, ge=1, le=24)
    items: list[ScheduleItemReq] = []


class TeamMemberReq(BaseModel):
    role: str
    name: str
    career_years: int = Field(..., ge=0)
    certification: str = ""
    tasks: str = ""


class TeamSectionReq(BaseModel):
    type: Literal["team"] = "team"
    title: str = "투입 인력 구성"
    members: list[TeamMemberReq] = []


class DataTableSectionReq(BaseModel):
    type: Literal["data_table"] = "data_table"
    title: str = ""
    table_title: str | None = None
    columns: list[str] = []
    rows: list[list[str]] = []


SectionReq = Annotated[
    CoverSectionReq | TocSectionReq | ContentSectionReq | ScheduleSectionReq | TeamSectionReq | DataTableSectionReq,
    Field(discriminator="type"),
]


# — 최상위 요청 모델 —

class ProposalRequest(BaseModel):
    """제안서 PPT 생성 요청."""

    title: str = Field(..., min_length=1, examples=["차세대 통합정보시스템 구축"])
    company: str = Field(..., min_length=1, examples=["(주)테크솔루션"])
    bid_org: str = Field(default="", examples=["조달청"])
    date: str = Field(default="", examples=["2026. 03. 09."])
    template: str | None = None
    sections: list[SectionReq] = Field(..., min_length=1)


class MermaidRequest(BaseModel):
    """Mermaid 다이어그램 렌더 요청."""

    code: str = Field(..., min_length=1)
    width: int = Field(default=1280, ge=320, le=4096)
    height: int = Field(default=720, ge=180, le=4096)
    background: str = Field(default="white")
    theme: str = Field(default="default")


# ──────────────────────────── 변환 ────────────────────────────


def _to_proposal_data(req: ProposalRequest) -> ProposalData:
    """Pydantic 요청 모델 → generator 데이터 모델 변환."""
    sections: list = []
    for s in req.sections:
        match s.type:
            case "cover":
                sections.append(CoverSection(subtitle=s.subtitle))
            case "toc":
                sections.append(TocSection(
                    items=[TocItem(number=i.number, title=i.title, page=i.page) for i in s.items],
                ))
            case "content":
                sections.append(ContentSection(
                    title=s.title, body=s.body,
                    image_path=s.image_path, image_position=s.image_position,
                ))
            case "schedule":
                sections.append(ScheduleSection(
                    title=s.title, total_months=s.total_months,
                    items=[
                        ScheduleItem(phase=i.phase, task=i.task, duration=i.duration, months=i.months)
                        for i in s.items
                    ],
                ))
            case "team":
                sections.append(TeamSection(
                    title=s.title,
                    members=[
                        TeamMember(
                            role=m.role, name=m.name, career_years=m.career_years,
                            certification=m.certification, tasks=m.tasks,
                        )
                        for m in s.members
                    ],
                ))
            case "data_table":
                sections.append(DataTableSection(
                    title=s.title,
                    table_title=s.table_title or "",
                    columns=s.columns,
                    rows=s.rows,
                ))
    return ProposalData(
        title=req.title,
        company=req.company,
        bid_org=req.bid_org,
        date=req.date,
        sections=sections,
    )


# ──────────────────────────── 엔드포인트 ────────────────────────────


@app.get("/health")
async def health():
    """헬스체크."""
    return {"status": "ok"}


@app.post("/generate-ppt")
async def generate_ppt(
    req: ProposalRequest,
    _token: str = Depends(verify_token),
):
    """제안서 데이터를 받아 PPT 파일을 스트리밍 반환한다."""
    # 템플릿 확인
    template_path = None
    if req.template:
        template_path = TEMPLATES_DIR / req.template
        if not template_path.exists():
            raise HTTPException(
                status_code=400,
                detail=f"템플릿을 찾을 수 없습니다: {req.template}",
            )

    try:
        generator = ProposalPPTGenerator(template_path)
        data = _to_proposal_data(req)
        ppt_bytes = generator.generate(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PPT 생성 실패: {e}")

    # 파일명 생성 (한글 URL 인코딩)
    safe_title = req.title.replace(" ", "_")[:30]
    filename = f"{safe_title}_제안서.pptx"
    encoded_filename = quote(filename)

    return StreamingResponse(
        io.BytesIO(ppt_bytes),
        media_type=PPTX_MEDIA_TYPE,
        headers={
            "Content-Disposition": f"attachment; filename=\"proposal.pptx\"; filename*=UTF-8''{encoded_filename}",
            "Content-Length": str(len(ppt_bytes)),
        },
    )


@app.post("/render-mermaid")
async def render_mermaid(
    req: MermaidRequest,
    _token: str = Depends(verify_token),
):
    """Mermaid 코드를 PNG으로 렌더링하여 반환한다.

    문법 오류 시 400 + stderr 메시지를 응답하므로,
    호출자(Next.js)는 이 메시지를 LLM 에게 넘겨 코드를 자가수정할 수 있다.
    """
    try:
        png_bytes = render_mermaid_to_png(
            req.code,
            width=req.width,
            height=req.height,
            background=req.background,
            theme=req.theme,
        )
    except MermaidRenderError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Mermaid 렌더링 실패: {e}")

    return StreamingResponse(
        io.BytesIO(png_bytes),
        media_type="image/png",
        headers={"Content-Length": str(len(png_bytes))},
    )
