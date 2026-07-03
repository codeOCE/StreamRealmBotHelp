# StreamPulse Development Guidelines

This document serves as the primary source of truth for the development, architecture, and design of **StreamPulse**—the all-in-one streamer ecosystem. All LLM-generated code and architectural decisions must adhere to these standards to ensure a cohesive, high-performance monorepo.

---

## 1. Core Tech Stack & Architecture

### **Monorepo Structure (npm Workspaces)**
- **`apps/dashboard`**: Next.js (App Router) frontend.
- **`apps/api`**: NestJS backend.
- **`packages/database`**: Prisma schema and client.
- **`packages/types`**: Shared TypeScript interfaces/DTOs for E2E type safety.
- **`packages/ui`**: Shared Tailwind components.

### **Backend (The Engine)**
- **Framework**: NestJS (Modular Architecture).
- **Bot Logic**: `tmi.js` for Twitch IRC integration.
- **Queue System**: BullMQ with Redis for rate-limiting and reliable message delivery.
- **ORM**: Prisma with PostgreSQL.
- **Validation**: `class-validator` and `zod` for strict runtime checking.

### **Frontend (The Dashboard)**
- **Framework**: Next.js 14+ (App Router).
- **Styling**: Tailwind CSS.
- **Data Fetching**: React Hooks (SWR or TanStack Query) hitting internal NestJS REST endpoints.

---

## 2. Visual Identity & Design System

The aesthetic is inspired by high-end SaaS platforms (Ragebite/Linear/Stripe) but with a **Cosmic/Space** twist inspired by `dive.club`. It must feel "premium, interstellar, and deep."

### **Color Palette & Atmosphere**
- **Base**: `black` (#030303) for deepest space.
- **Accents**: Stellar Violet, Nebula Fuchsia, and Comet Cyan.
- **Glassmorphism**: 
  - Use high `backdrop-blur` values and subtle borders.
  - Borders should be thin and subtle: `border-white/5`.
- **Atmosphere**: Use subtle star fields and nebulous gradients.

### **UI Components**
- **Layout**: Spacious with consistent padding. Use a "sidebar-first" navigation approach.
- **Micro-animations**: Use Framer Motion for:
  - Layout transitions.
  - Button hover states (subtle scale-up or glow).
  - Progressive loading of dashboard widgets.
- **Typography**: Clean sans-serif (Inter or Geist) with wider letter spacing for headers to feel more astronomical.

---

## 3. Bot Logic & Stability Standards

### **Rate Limiting (Anti-Ban Protocol)**
- All outgoing Twitch messages must pass through a **BullMQ** queue.
- Implement a "Leaky Bucket" algorithm to ensure the bot stays within Twitch's message-per-30-seconds limit (Verified vs. Non-Verified accounts).

### **Modularity**
- Every bot feature (Commands, Timers, Giveaways, Channel Points) must be a separate NestJS **Module**.
- Use a **Command Pattern** for handling chat triggers to keep the core `tmi.js` listener clean.

---

## 4. Coding Standards & DX

- **Strict TypeScript**: No `any`. Use generics for API responses.
- **Shared Types**: Always export types from `packages/types` so the Frontend knows exactly what the Backend is sending.
- **Functional Components**: Use React functional components with `lucide-react` for iconography.
- **Database Migrations**: Always provide a Prisma migration name when modifying `schema.prisma`.
- **Atomic Commits**: Keep logic changes separate from styling changes.

---

## 5. Implementation Instructions for LLM

1.  **When writing Backend code**: Focus on NestJS Dependency Injection. Always create a Service for logic and a Controller for the API.
2.  **When writing Frontend code**: Prioritize the "Interstellar" aesthetic. Use high blur values and cosmic glows.
3.  **When writing Bot logic**: Ensure there is always a check for `isMod` or `isBroadcaster` for sensitive commands.
4.  **Formatting**: Use Prettier-style formatting, 2-space indentation, and semicolons.

---
*StreamCosmos: Beyond Bots. A New Standard for Streamers.*