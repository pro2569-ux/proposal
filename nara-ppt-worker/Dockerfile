FROM python:3.12-slim

WORKDIR /app

# 1단계: 한글 폰트 + Chromium (Mermaid 렌더링에 필요한 헤드리스 브라우저)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gnupg \
        fonts-nanum \
        chromium && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# 2단계: Node.js 20 (NodeSource 공식 저장소 — debian 기본 npm 의 scoped+version 파싱 버그 회피)
RUN mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# 3단계: Mermaid CLI 전역 설치 (패키지명을 반드시 따옴표로 감쌈)
RUN npm install -g "@mermaid-js/mermaid-cli@10.9.1" && \
    npm cache clean --force

# Puppeteer 가 자체 Chromium 다운로드하지 않고 시스템 Chromium 사용하도록 강제
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Python 의존성
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 앱 코드
COPY . .

# Railway는 PORT 환경변수를 자동 주입
ENV PORT=8000
EXPOSE ${PORT}

CMD uvicorn ppt_worker.main:app --host 0.0.0.0 --port ${PORT}
