# Goldchild Isolated Backend Module

This module is mounted under `/goldchild` from the main server and does not replace existing routes.

## Route Prefix

- Main app routes stay unchanged (example: `/applications`, `/students`, ...)
- Goldchild routes use: `/goldchild/*`

Sample endpoint for the new frontend:

- `POST /goldchild/api/applications/student`

## Database Isolation

Use these environment variables in your backend `.env`:

- `GOLDCHILD_MONGODB_URI` (recommended, fully separate connection string)
- `GOLDCHILD_DB_NAME` (optional, default: `goldchild`)

Fallback behavior:

- If `GOLDCHILD_MONGODB_URI` is missing, it uses `MONGODB_URI` but still targets `GOLDCHILD_DB_NAME` (default `goldchild`).

This keeps Goldchild collections separate from the pre-existing server data.
