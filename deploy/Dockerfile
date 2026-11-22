FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080 PUBLIC_ROOT=/app/public
WORKDIR /app
COPY --chown=65532:65532 public/ /app/public/
COPY --chown=65532:65532 server.py /app/server.py
USER 65532:65532
EXPOSE 8080
CMD ["python", "server.py"]
