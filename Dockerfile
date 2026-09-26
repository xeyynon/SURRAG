FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 HF_HOME=/opt/hf
COPY backend/requirements.txt ./
# CPU-only torch keeps the image ~2GB smaller than the default CUDA wheel.
RUN pip install torch==2.4.1 --index-url https://download.pytorch.org/whl/cpu \
 && pip install -r requirements.txt \
 && python -m spacy download en_core_web_sm \
 && python -c "from sentence_transformers import SentenceTransformer as S; S('all-MiniLM-L6-v2')"
COPY backend/ ./
COPY --from=web /web/dist ./static
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
