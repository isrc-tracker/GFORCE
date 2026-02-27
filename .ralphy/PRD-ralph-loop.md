# Feature: Ralph Loop (Autonomous Orchestrator)

> Ralph Loop is the high-level agentic brain of G-Force. It allows the system to handle complex, multi-stage requests by autonomously planning, executing, and refining its actions in a continuous loop.

## Overview

Currently, G-Force handles single skills or scheduled tasks. The **Ralph Loop** elevates this by introducing a "Planning -> Execution -> Validation -> Refinement" cycle. This makes G-Force a truly autonomous agent that can solve ill-defined or complex problems without constant user prompts.

## Requirements

### Core Features (MUST)

- **Autonomous Planning**: The system MUST be able to break down a high-level intent (e.g., "Set up a full news brand on Reddit") into individual actionable sub-tasks.
- **Dynamic Skill Synthesis**: If a required sub-task lacks a corresponding skill, the system MUST trigger the Forge Engine to create it.
- **Recursive Validation**: The system MUST check the output of each step against the "Success Criteria" defined during the planning phase.
- **Fail-Fast & Retry**: The system MUST have a robust retry mechanism with backoff for transient failures (e.g., network timeout).

### Important Features (SHOULD)

- **State Persistence**: The loop SHOULD save its state to disk, allowing it to resume after a server restart.
- **Telegram Heartbeats**: The loop SHOULD send periodic updates to the user (e.g., "Step 2/5 Complete: Scraped 10 posts").
- **Cost/Token Tracking**: The system SHOULD track and limit the number of AI calls per loop to prevent runaway costs.

### Nice-to-Have (COULD)

- **Tool Discovery**: G-Force COULD search through its existing tool/skill library before forging new ones.
- **Parallel Execution**: Independent sub-tasks COULD be executed in parallel via the asynchronous Job Queue.

## User Stories

### Story 1: The Total Automator
As a G-Force operator, I want to give a single command like "Find viral tech news and post it to my 5 Reddit accounts every day" so that I don't have to manually manage each step.

**Acceptance Criteria:**
- [ ] System identifies the need for scraping, content filtering, and posting.
- [ ] System checks for account availability.
- [ ] System executes the full chain autonomously.

## Technical Notes

- **Entry Point**: `lib/automation/ralph/loop.ts`
- **State Store**: `/app/tasks/ralph-states.json`
- **Orchestration**: Use the `JobManager` for underlying execution.
- **LLM Context**: Every step in the loop must pass the "Global Goal" and "Current Progress" to the AI.

## Constraints

- Maximum of 10 iterations per loop to prevent infinite loops.
- Must respect the domain throttling settings in `Monitor`.

---

## Appendix

### Related Documents
- [Implementation Plan](file:///C:/Users/Free/.gemini/antigravity/brain/005bf220-33ce-4dbf-8cb5-ea7ace6a92eb/implementation_plan.md)
- [G-Force Skill Registry](file:///c:/Users/Free/g-force/lib/automation/skills.ts)
