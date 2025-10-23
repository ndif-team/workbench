#!/bin/bash

# gunicorn app.main:app --bind 0.0.0.0:8000 --workers 16 --worker-class uvicorn.workers.UvicornWorker --timeout 120
uvicorn app.main:app --host 0.0.0.0 --port 8000