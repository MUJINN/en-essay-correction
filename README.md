# English Essay Correction System

An educational AI project for English essay correction. The system combines OCR-assisted input handling, AI-based scoring, annotation matching, persistence, and frontend integration to turn essay grading into a usable product workflow.

## What this project does

- Accepts essay text and OCR results as correction input
- Calls AI workflows to generate structured correction results
- Matches correction annotations back to OCR coordinates
- Persists correction records for later lookup
- Provides frontend pages and API endpoints for interactive use

## Why it matters

This repository is more than a prompt wrapper. It represents an end-to-end essay correction product flow:

- OCR understanding
- correction generation
- annotation alignment
- record storage
- frontend/backend integration

## Main components

- `api_v2.py`: main API service
- `annotation_matcher.py`: aligns correction annotations with OCR text and coordinates
- `database.py`, `models.py`, `schemas.py`: persistence and data models
- `dify_ocr_enhanced.py`: OCR and workflow integration logic
- `templates/`, `static/`: frontend pages and assets

## Repository structure

```text
en-essay-correction/
├── api_v2.py
├── annotation_matcher.py
├── database.py
├── models.py
├── schemas.py
├── dify_ocr_enhanced.py
├── init_db.py
├── templates/
├── static/
├── API_DOCUMENTATION.md
├── FRONTEND_README.md
└── HANDOVER.md
```

## Quick start

```bash
pip install -r requirements.txt
python init_db.py
python api_v2.py
```

Then open the API docs or frontend page exposed by the service.

## Key capabilities

- OCR + essay correction workflow
- Structured AI correction output
- Annotation-to-coordinate matching
- History persistence and retrieval
- Frontend and backend integration

## Related docs

- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
- [FRONTEND_README.md](./FRONTEND_README.md)
- [HANDOVER.md](./HANDOVER.md)
- [config.example.txt](./config.example.txt)

## Notes

This public repository is a cleaned release version prepared for portfolio and code-sharing use. Local runtime data, databases, and private environment files were excluded.
