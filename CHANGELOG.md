# CHANGELOG

This document records the major milestones and technical updates of the VibeWarden project.

---

## [2026-02-24] - Conversation Control & Button Consolidation

### 🎨 UI/UX Improvements
- **Send & Stop Button Consolidation**:
    - Merged the standalone "Stop" button into the primary message input button.
    - Implemented **Visual State Awareness**: The button now dynamically switches to a "Stop" icon (Square) with a red "Pulse" effect during execution, reverting to "Send" (Send) otherwise.
- **Interactive Animations**: Added a global `pulse` keyframe animation to provide better visual feedback while the Agent is working.

### ⚙️ System Logic & Stability
- **Fixed Stop Responsiveness**:
    - Resolved a critical bug where the message input's stop action was disconnected, preventing task interruption.
    - Improved state synchronization: User input now immediately updates the task status to `running` on both frontend and backend.
- **Workflow Completion Loop**: Enhanced `execution.ts` callbacks to ensure tasks triggered via direct conversation reliably revert to `idle` upon completion.

---

## [2026-02-23] - Git Worktree Isolation & Branding Consolidation

### ⚙️ System Configuration & Stability
- **Robust Git Worktree Isolation**:
    - Enhanced `WorktreeManager` to detect and handle nested Git repository structures (e.g., home directory as Git root).
    - Implemented a fallback mechanism to use physical directory isolation if `git worktree` commands fail due to untracked directory conflicts.
    - Improved `execution.ts` to validate the physical existence of the working directory before task execution, preventing `spawn node ENOENT` errors.
- **Git Tracking Detection**: Added logic to verify if a project directory is properly tracked by Git before performing worktree operations, ensuring compatibility with diverse repository configurations.

### 🔧 Monorepo & Branding Consolidation
- **VibeWarden Rebranding**: Completed the transition from *ClawWarden* to **VibeWarden** across the entire monorepo, including `package.json` updates, logo assets, and documentation.
- **Asset Optimization**: Updated branding assets and optimized the layout for the new identity.

### 📝 Documentation & README
- **Multi-language Documentation**: Synchronized `README.md` with `README.zh-CN.md` and added updated screenshots for the new UI.

---

## [2026-02-17] - Backend Port Configuration Flexibility & Create Task Page Optimization

### 🎨 UI & UX Improvements
- **Create Task Page Overhaul**:
    - **Premium Visuals**: Refactored the Create Task modal to align with the "Premium Dark Mode" aesthetic, using global CSS classes for consistent styling.
    - **Compact Layout**: optimized the layout to be more compact, reducing padding and margins for a cleaner look.
    - **Enhanced Interaction**: Added `Cmd+Enter` (Mac) / `Ctrl+Enter` (Windows) shortcut for quick task submission and auto-focus on title input.
    - **Prompt Input**: Increased the height of the Claude Prompt input area for better editing of long instructions.
    - **Light Mode Support**: Ensured full compatibility with Light Mode using CSS variables.
- **Comprehensive Light Mode Polish**:
    - **Prompt Area**: Optimized background colors to use soft off-white tones (Slate 50/100) instead of harsh pure white or muddy gray.
    - **Conversation & Tools**: Fixed dark backgrounds on Tool IO blocks and Code Blocks in light mode, now using context-aware light themes.
    - **Scrollbars**: Improved scrollbar visibility in light mode for the Kanban board and other panels.

### ⚙️ System Configuration & Stability
- **Dynamic Port Assignment**:
    - Migrated the default backend port from `4001` to `6172` to avoid common port conflicts.
    - Implemented dynamic port loading from the user's home directory configuration file (`~/.vibewarden/config.json`).
    - Added support for overriding the port via the `PORT` environment variable, enhancing deployment flexibility.
- **Configuration Standardization**: Standardized the use of `settings.agentPort` for port configuration and updated default values in `packages/shared`.
- **Full-stack Configuration Sync**: The Web frontend now automatically detects and connects to the configured backend port during both build and development phases, eliminating manual API URL adjustments.



## [2026-02-16] - Visual Polish & Light Mode Optimization

### 🎨 UI Refinement & UX Improvements
- **Light Mode Fine-tuning**:
    - Removed redundant gradients from large task titles (`task-title-large`), improving text legibility in light mode.
    - Updated task title backgrounds to a cleaner, more aesthetically pleasing color palette.
- **Project Selector Enhancements**:
    - Refined the background texture and spacing of project cards for a more modern and breathable layout.
- **Core Action Button Styling**:
    - Improved the visibility and definition of primary action buttons in high-brightness environments, fixing the "washed-out" appearance and enhancing interactive affordance.

---

## [2026-02-15] - Interaction Enhancement & Visual Overhaul

### Workflow & Interaction Optimization
- **Review Controls & State Recovery**:
    - Introduced **Approve** and **Reject** actions for tasks in the `awaiting-review` status.
    - Added a **Reject** button to safely reset task status to `idle`, allowing for iterative refinements without forced lane movement.
    - Added a **Retry** button for `failed` tasks to quickly restart the execution cycle.
- **Action Panel Grid**: Refactored the action button area using a responsive CSS Grid system. This ensures a clean layout when multiple actions (like Approve/Reject) are available simultaneously.

### 🛠️ MCP Tools & Process Integration
- **Direct Task Creation Tool**:
    - Introduced the `create_task` MCP tool, allowing the Claude Agent to autonomously spawn sub-tasks or follow-up tasks into any lane.
    - Integrated automatic **Git Worktree management** into the MCP tool flow; new tasks created via MCP get an isolated development environment immediately.
    - Enhanced task metadata to include traceability, linking MCP-created tasks to their parent sessions.

### 🎨 Visual Identity Evolution (The Zinc Theme)
- **Industrial Dark Mode**: Migrated the entire UI color palette to a professional **Zinc (900/950)** scheme. This flatter, more disciplined aesthetic reduces visual noise and aligns with modern high-end developer tools.
- **Global Background Grid**: Replaced generic background gradients with a sophisticated, lightweight grid pattern. This creates a "design canvas" feel across the main workspace and project selector.
- **Card-based Task Details**: Standardized task information sections using a new `.detail-card` layout, providing clear visual separation and improved information scanning for complex task outputs.

### 🔄 Real-time Synchronization & System Robustness
- **Event-Driven UI Refresh**:
    - Relocated the update trigger to the lowest `JSONStore` layer. Any data modification (task creation, status change, reordering) now instantly triggers a project-wide broadcast.
    - Eliminated reliance on OS-level file notifications for UI updates, resulting in near-zero latency.
- **Robust WebSocket Management**:
    - **Persistent Subscriptions**: Enhanced `ConnectionManager` to maintain project-specific subscriptions.
    - **Auto-Reconnection Recovery**: Implemented automatic subscription restoration upon WebSocket reconnection, ensuring real-time capabilities persist after dev-mode hot reloads or network blips.
- **Error Handling & Stability**:
    - Cleaned up redundant broadcast logic in the backend to prevent message loops.
    - Fixed critical compilation errors in the Task Detail panel regarding message input handlers.

---

## [2026-02-13] - Markdown Enhancement & Stability

### 🎨 Markdown Renderer Optimization
- **Visual Refinement**: Significantly improved the visual presentation of Markdown elements in the Task Detail view, including better heading hierarchy, code block styling, table layouts, and list spacing.
- **Style Isolation**: Introduced a dedicated `MarkdownRenderer.css` module for decoupled and maintainable styling logic.

### 🐞 Bug Fixes & Stability
- **Stop Button Reliability**: Fixed a bug where the "Stop Execution" button would become unresponsive after a page refresh.
- **State Consistency**: Improved the UI state transition logic after task execution stops or completes, ensuring buttons and status indicators accurately reflect the backend state.

---

## [2026-02-12] - Workflow Automation & Summary System Enhancement

### 🚀 Workflow Automation
- **Full Lane Auto-Transition**: Fixed a limitation where auto-transition logic only worked for the "Plan" lane. Now, lanes like "Develop" and "Test" can automatically move tasks to the next stage if `onCompleteLane` is configured.
- **Task State Consistency**: Guaranteed that task status reliably reverts from `running` to `idle` after automated actions (moving lanes, saving files) are completed, preventing UI freezes.

### 📊 Structured Summary System
- **Plan Fallback Mode**: Addressed issues where the Agent SDK might return structured JSON but omit Markdown text. Introduced a "Reconstruction Mode" that assembles a Markdown plan from JSON fields (summary, technical plan, component design).
- **Summary Dashboard Evolution**:
    - **Multi-dimensional Display**: The summary view now presents both a high-level `summary` and detailed `details` for higher information density.
    - **Development Details**: Added explicit rendering for "New Tests", "Breaking Changes", and "Next Steps" in development summaries.
    - **Test Report Enhancement**: Integrated specific displays for code coverage (lines, functions, branches).
- **Real-time Feedback**: Added "Automatic Summary Generated" system notifications and implemented precise real-time refreshing for the summary tab.

### 🛠️ System Robustness
- **Concurrent Write Protection**: Introduced an "Immediate Read-Modify-Write" mechanism in `execution.ts` to prevent data loss in `tasks.json` during rapid lane transitions.
- **Panel Reset**: Fixed a UI bug where plan or summary data from a previous task would persist when switching to a new task card.

### 🤖 AI-Assisted Merge & Environment Isolation
- **AI Merge Protocol**: Refactored the "To Merge" lane logic. A Claude Agent now acts as a Release Engineer, verifying changes, executing Git merges, and autonomously fixing conflicts.
- **Automated Environment Isolation**:
    - **Isolation Hardening**: The system now automatically writes a `.gitignore` to the root of new Worktrees to exclude the `.claude/` directory, preventing configuration leakage.
    - **Lifecycle Management**: Agents can now automatically clean up temporary worktrees and task branches after successful merging based on prompt instructions.

### 🐞 Bug Fixes
- **Summary Completion**: Fixed issues where "Develop" and "Test" lanes failed to generate summaries. Implemented a text-based fallback mechanism.
- **Stop Reliability**: Resolved null-pointer crashes when clicking "Stop" and fixed WebSocket reconnection logic for controlling running tasks after a refresh.

---

## [2026-02-10] - Lane Experience & Tool Permissions

### 🔧 Tool Permissions
- **Full Tool Access**: Removed read-only restrictions from the "Plan" lane. All lanes now have full tool permissions (`Bash`, `Read`, `Edit`, `Glob`, `Grep`, `Find`, `Write`).

### 🐞 Bug Fixes
- **State Synchronization**: Fixed incorrect button states when switching task cards by using `task.status` as the single source of truth.
- **Conversation Refresh**: Ensured the `useConversation` hook clears old messages when the `taskId` changes.
- **Runtime Disabling**: Correctly disabled edit and delete buttons while a task is running.
- **Task Creation**: Fixed a bug where tasks were always created in the "Plan" lane regardless of where the creation button was clicked.

---

## [2026-02-04] - Core Interaction Model Refactoring & UI/UX Leap

### ✨ Core Refactoring
- **Incremental Structured Summaries**: Overhauled summary persistence. Instead of overwriting, the system now maintains an incremental sequence of summaries in the `.clawwarden` directory.
- **Conversational Interaction**: Shifted from a terminal-centric model to a Chat/Conversation-first approach.
- **Streaming Responses**: Deep integration with Claude Agent SDK for millisecond-level streaming message推送.

### 💄 UI/UX Improvements
- **Design Language**: Established a "High-tech, Professional, Cool-tone" aesthetic with glassmorphism and smooth transitions.
- **Lane Synchronization**: Semantic mapping of icons, colors, and actions for each lane (Plan: Purple, Develop: Indigo, Test: Cyan, Merge: Gray).

---

## [2026-02-03] - Flexibility & Project Management
- **Dynamic Project Import**: Added `FolderPicker` to allow importing projects from anywhere in the filesystem.
- **Project Persistence**: Refactored `global.json` storage to support real-time editing and remote deletion.

---

## [2026-02-02] - Branding & Architecture
- **Branding**: Officially renamed to **VibeWarden** (Claw for Claude Code, Warden for monitoring).
- **Worktree Isolation**: Established independent Git Worktrees for each task to prevent file locks and environment pollution during concurrent execution.

---

## [2026-01-30 to 2026-02-01] - Early Development
- **WebSocket Layer**: Built the full-duplex communication system.
- **看板 (Kanban)**: Implemented drag-and-drop interaction using `@dnd-kit`.
- **SDK Integration**: Initial handshake and session persistence with Anthropic Claude Agent SDK.
