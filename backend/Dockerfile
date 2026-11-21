FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend backend
RUN useradd --create-home appuser
USER appuser
EXPOSE 8085
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8085"]
