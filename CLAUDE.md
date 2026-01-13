# Claude Code Guidelines for Workbench

## Commit Messages

- Do NOT use emojis in commit messages
- Keep messages concise and descriptive
- Use conventional commit format when appropriate
- Sign commits with Claude as co-author:
  ```
  Co-Authored-By: Claude <noreply@anthropic.com>
  ```

## Testing

- Run `./scripts/test.sh all` to run the full test suite
- Use `REMOTE=false` for local testing with GPT-2
- Backend tests: `uv run pytest workbench/_api/tests/ -v`
- Module tests: `uv run pytest workbench/logitlens/tests/ -v`

## Project Structure

- `workbench/_api/` - FastAPI backend
- `workbench/_web/` - Next.js frontend
- `workbench/logitlens/` - Python module for notebook usage
- `scripts/` - Service startup and test runner scripts
