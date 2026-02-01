# Terminal 2.0 Architecture Redesign Plan

**Date:** 2026-01-23
**Status:** DRAFT / PROPOSED
**Author:** AntiGravity Agent

## 1. Executive Summary

This document outlines a redesign of the AntiWarden terminal architecture to address scalability issues and UI customization limitations. The current 1:1 coupling between UI components and WebSocket connections causes instability during frequent component mounting/unmounting. Additionally, the canvas-based rendering of xterm.js limits the ability to customize the input experience (e.g., custom positioning, styling).

**Key Changes:**
1.  **Architecture:** Move from per-component WebSockets to a **Global WebSocket Manager** (Singleton).
2.  **UI/UX:** separate the **Display Layer** (Output) from the **Input Layer** (Command Entry).

## 2. Problem Statement

### 2.1 Connection Instability
- **Current State:** Each `Terminal` component creates its own `WebSocket` connection.
- **Issue:** Switching tabs or Kanban cards unmounts the component, closing the socket. Rapid switching causes connection thrashing, race conditions (like the 1006 error we fixed), and loss of transient state/logs.

### 2.2 Limited Customization
- **Current State:** Input is handled natively by xterm.js (hidden textarea + canvas rendering).
- **Issue:** The prompt line cannot be easily moved or styled. Users cannot implement "Chat-like" interfaces where the input box is separate from the log stream, or add modern features like multi-line editing easily.

## 3. Proposed Solution

### 3.1 Global WebSocket Manager (The "Brain")

We will implement a `ConnectionManager` class (Singleton) in `App.tsx` or a global Context.

**Responsibilities:**
- **Single Connection:** Maintains *one* persistent WebSocket connection to the backend (`/ws/execute`).
- **Session Multiplexing:**
  - The backend format remains largely the same, but the frontend manager tracks which `sessionId` belongs to which `task`.
  - Messages are routed: `Manager -> EventBus -> Specific UI Component`.
- **State Caching:**
  - Maintains a circular buffer of logs for active tasks *even when their UI is not rendered*.
  - When a user opens a task card, the component subscribes to the Manager and immediately receives the cached history.

**Data Flow:**
```mermaid
graph TD
    WS[WebSocket Connection] <--> M[Connection Manager]
    M <--> Store[Log Store / State]
    
    M -->|Emit: task-1| UI1[Terminal Component (Task 1)]
    M -->|Emit: task-2| UI2[Terminal Component (Task 2)]
    
    UI1 -->|Input| M
    UI2 -->|Input| M
```

### 3.2 Hybrid UI Mode (The "Face")

We will decouple the output display from the input mechanism.

#### A. Display Component (`LogViewer`)
- **Purpose:** Purely for displaying ANSI-colored text output.
- **Tech:** Still uses `xterm.js` (performance is best in class) BUT configured as `disableStdin: true` and `cursorBlink: false`.
- **Behavior:** It effectively acts as a "smart scroll view".

#### B. Input Component (`CommandInput`)
- **Purpose:** Accepting user commands.
- **Tech:** Standard React `<input>` or `<textarea>` (or Monaco Editor for advanced usage).
- **Placement:** Can be placed *anywhere* (bottom of card, floating modal, separate panel).
- **Styling:** Fully customizable via CSS (Tailwind).

**Interaction Flow:**
1. User types in React Input: `npm install`
2. User hits Enter.
3. React Component calls `manager.sendInput(taskId, 'npm install\r')`.
4. Manager sends to Backend.
5. Backend PTY executes and streams stdout back.
6. Manager routes stdout to `LogViewer`.
7. `LogViewer` appends text to xterm instance.

## 4. Implementation Steps

### Phase 1: Global Manager (Backend & State)
1.  [ ] Create `services/EventManager.ts` (Frontend).
2.  [ ] Refactor `App.tsx` to initialize the socket once.
3.  [ ] Update `Terminal.tsx` to accept a `streamId` instead of creating a socket.

### Phase 2: Hybrid UI Components
1.  [ ] Create `TerminalDisplay.tsx` (Read-only xterm wrapper).
2.  [ ] Create `TerminalInput.tsx` (Styled input box).
3.  [ ] Update `TaskDetail.tsx` to compose these two newly separated components.

### Phase 3: Polish
1.  [ ] Implement "Unread Logs" indicators for background tasks.
2.  [ ] Add persistent history storage (IndexedDB) for offline resume.

## 5. Benefits

1.  **Zero Reconnection:** Switching tabs is instant; no more WebSocket 1006 errors.
2.  **Background Execution:** Tasks continue running and logging even if you close the UI card.
3.  **UI Freedom:** Input box can be a sleek, floating command palette.
4.  **Performance:** One TCP connection vs Many reduces server load.
