---
description: Implement a feature based on an implementation plan
---

Please implement the following implementation plan: $ARGUMENTS

**Process**:

1. Implement all required code changes following the code style requirements
2. Most important requirement: Always ensure the formalism and interface correspond
3. Ensure the frontend and backend have the same types for shared data objects to prevent errors
4. Run tests and linting
5. Ensure it works perfectly using the Chrome DevTools MCP server
6. Update CLAUDE.md and reference files after implementation
7. Provide implementation summary

## Code style requirements

Follow these principles:

- Write clean code
- Reuse code wherever applicable; avoid duplicating code that results in multiple versions
- Maintain a clean file structure that follows current best practices and standards
- Don't use comments in code

Backend (Python):

- Use Pydantic models for all data validation and serialization
- NetworkX graphs as primary data structure
- WebSocket communication for real-time sync
- Uses `uv` for dependency management with `pyproject.toml`
- Only add dependencies when actually needed to maintain a lean dependency tree
- Use ruff for linting

Frontend (React):

- Component-based architecture with TypeScript
- Reuse components wherever applicable
- PIXI.js for WebGL-powered graph visualization
- D3.js for layout algorithms
- Zustand for lightweight state management
- Tailwind CSS for styling - no separate CSS files
- WebSocket hooks for real-time updates

Overall:

- Use the datasets from ./data/\* as the datasets to build this application around. These are the use-cases
- This will be published at IEEE VIS, so ensure accuracy in the formalisms and correctness throughout
