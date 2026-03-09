"""PPT 생성 테스트 스크립트."""
from ppt_worker.generator import (
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
)

data = ProposalData(
    title="차세대 통합정보시스템 구축",
    company="(주)테크솔루션",
    bid_org="조달청",
    date="2026. 03. 09.",
    sections=[
        CoverSection(subtitle="기술 제안서"),
        TocSection(items=[
            TocItem(number="01", title="사업 이해 및 추진 전략", page=3),
            TocItem(number="02", title="기술 아키텍처", page=8),
            TocItem(number="03", title="추진 일정", page=15),
            TocItem(number="04", title="투입 인력 구성", page=18),
            TocItem(number="05", title="유사 수행 실적", page=22),
        ]),
        ContentSection(
            title="1. 사업 이해 및 추진 전략",
            body=[
                "■ 사업 개요",
                "본 사업은 노후화된 기존 시스템을 차세대 클라우드 기반으로 전환하는 프로젝트입니다.",
                "●  핵심 추진 방향",
                "마이크로서비스 아키텍처(MSA) 기반 설계",
                "컨테이너 오케스트레이션(K8s) 도입",
                "CI/CD 파이프라인 자동화",
                "Zero Trust 보안 모델 적용",
            ],
        ),
        ContentSection(
            title="2. 기술 아키텍처",
            body=[
                "■ 시스템 구성도",
                "프론트엔드: React + Next.js (SSR/SSG)",
                "API Gateway: Kong / AWS API Gateway",
                "백엔드: Spring Boot MSA (12-Factor App 준수)",
                "데이터: PostgreSQL + Redis + Elasticsearch",
                "인프라: AWS EKS + Terraform IaC",
            ],
        ),
        ScheduleSection(
            title="3. 추진 일정",
            total_months=6,
            items=[
                ScheduleItem(phase="1단계", task="요구사항 분석", duration="1개월", months=[1]),
                ScheduleItem(phase="2단계", task="설계", duration="1.5개월", months=[2, 3]),
                ScheduleItem(phase="3단계", task="개발", duration="2개월", months=[3, 4]),
                ScheduleItem(phase="4단계", task="테스트/이관", duration="2개월", months=[5, 6]),
            ],
        ),
        TeamSection(
            title="4. 투입 인력 구성",
            members=[
                TeamMember(role="PM", name="김철수", career_years=15, certification="PMP, 정보관리기술사", tasks="프로젝트 총괄 관리"),
                TeamMember(role="PL", name="이영희", career_years=12, certification="정보처리기사", tasks="기술 리드, 아키텍처 설계"),
                TeamMember(role="개발자", name="박민수", career_years=8, certification="AWS SAA", tasks="백엔드 개발, API 설계"),
                TeamMember(role="개발자", name="정수진", career_years=6, certification="정보처리기사", tasks="프론트엔드 개발, UI/UX"),
                TeamMember(role="DBA", name="홍길동", career_years=10, certification="OCP, SQLP", tasks="DB 설계, 데이터 이관"),
            ],
        ),
    ],
)

gen = ProposalPPTGenerator()
ppt_bytes = gen.generate(data)

output_path = "test_output.pptx"
with open(output_path, "wb") as f:
    f.write(ppt_bytes)

print(f"PPT 생성 완료: {output_path} ({len(ppt_bytes):,} bytes)")
print(f"슬라이드 수: {len(gen.prs.slides)}")
