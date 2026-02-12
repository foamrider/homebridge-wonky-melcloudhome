# melcloudhome-homebridge

## Overview

Homebridge platform plugin for Mitsubishi Electric MELCloud devices. This repository follows the agent rules and plan lifecycle described below.

## Project Rules

- Keep code readable and self-documenting.
- Use minimal comments; only for non-obvious logic.
- Use English for code comments and documentation.
- Ask before running tests or linters.

## Agent Documentation

- `.agents/docs/` contains extended docs (architecture notes, API details).
- `.agents/plans/` contains active plans not yet implemented.
- `.agents/skills/` contains reusable procedures.

## Plan Lifecycle

1. Create a plan in `.agents/plans/`.
2. Get explicit user approval before implementing the plan.
3. After implementation, update relevant docs in `.agents/docs/`.
4. Delete the completed plan file.
