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
    npm install -g @mermaid-js/mermaid