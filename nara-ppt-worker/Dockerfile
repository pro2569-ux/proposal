FROM python:3.12-slim

WORKDIR /app

# 한글 폰트 지원을 위한 시스템 패키지
RUN apt-get update && \
    apt-get install -y --no-install-recommends fonts-nanum && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Railway는 PORT 환경변수를 자동 주입
ENV PORT=8000
EXPOSE ${PORT}

CMD uvicorn ppt_worker.main:app --host 0.0.0.0 --port ${PORT}
