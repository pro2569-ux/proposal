FROM python:3.12-slim

WORKDIR /app

# 시스템 패키지: 한글 폰트(나눔고딕) + Chromium(Mermaid 렌더링용) + Node.js
# - chromium: 헤드리스 브라우저 — Mermaid CLI(puppeteer)가 사용
# - nodejs/npm: @mermaid-js/mermaid-cli 실행
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        fonts-nanum \
        chromium \
        nodejs \
        npm && \
    npm install -g @mermaid-js/mermaid-cli@10.9.1 && \
    npm cache clean --force && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Puppeteer 가 자체 Chromium 을 다운받지 않고 시스템 패키지를 쓰도록 강제
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Railway는 PORT 환경변수를 자동 주입
ENV PORT=8000
EXPOSE ${PORT}

CMD uvicorn ppt_worker.main:app --host 0.0.0.0 --port ${PORT}
