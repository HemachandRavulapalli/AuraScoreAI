<div align="center">
  <img src="https://img.freepik.com/free-vector/abstract-technology-particle-background_52683-25766.jpg" alt="AuraScore Banner" width="100%" style="max-height: 300px; object-fit: cover; border-radius: 12px;"/>

  <br />
  <br />

  <h1>🔮 AuraScore AI</h1>

  <p>
    <strong>A highly dynamic, AI-powered social engagement profiler.</strong><br/>
    Built with React, Framer Motion, and the Google Gemini SDK.
  </p>

  <p>
    <img src="https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E" alt="Vite" />
    <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
    <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind" />
    <img src="https://img.shields.io/badge/Docker-2CA5E0?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
    <img src="https://img.shields.io/badge/GitHub_Actions-2088FF?style=for-the-badge&logo=github-actions&logoColor=white" alt="GH Actions" />
  </p>
  
  <br />
</div>

## 📖 Overview

**AuraScore AI** redefines how we visualize social engagement. Instead of flat numbers, it instantly scrapes a user's X (Twitter) profile, interpolates organic reach using the **Gemini AI SDK**, and presents a stunning, deterministic Glassmorphism dashboard uniquely colored based on the user's payload footprint.

### ✨ Key Features
- **Deterministic Color Mapping:** Unique color palettes automatically generated via string-hash matrices for every individual profile.
- **Micro-interactions & Physics:** Powered entirely by `framer-motion` to spring-animate metric counters on a stagger.
- **Enterprise-Ready:** Hardened with a multi-stage `Dockerfile`, strict `eslint` policies, and integrated CI/CD via GitHub Actions.

---

## 🏗️ Architecture

```mermaid
graph LR
    A[Client UI<br/>React + Framer] -->|Search Payload| B(Express Server Middleware)
    B -->|Ingest Metrics| C{Upstash Redis Cache}
    C -->|If Miss| D[RapidAPI X Scraper]
    D -->|Sanitization| E[Google Gemini SDK]
    E -->|Analyze Topics| B
    B -->|Send Payload| A
```

---

## 🚀 Quick Start (Local)

To run this application locally outside of Docker, ensure you have Node.js (`v20.x` or higher) installed.

```bash
# 1. Clone the repository
git clone https://github.com/HemachandRavulapalli/AuraScoreAI.git
cd AuraScoreAI

# 2. Install dependencies via clean install
npm ci

# 3. Setup your environment keys
cp .env.example .env
# Edit .env with your GROQ / GEMINI keys!

# 4. Start the development server
npm run dev
```

Open `http://localhost:3000` to view the application in action.

---

## 🐳 Docker Deployment

AuraScore AI uses a robust multi-stage Docker build, isolating the Vite compilation environment from the minimal Alpine runtime environment to sharply reduce container sizes.

```bash
# Spin up the container stack immediately in detached mode
docker-compose up -d --build
```
The Express backend proxy and Vite static artifacts will reliably run at `http://localhost:3000`.

---

## 🔄 CI/CD CI Pipeline

This repository is strictly protected by a GitHub Actions Continuous Integration pipeline:
- **Linting:** Validates zero TypeScript deviations.
- **Build Verification:** Executes `vite build` cleanly to ensure the Docker matrix will successfully compile.
- Triggered automatically on all pushes to `main` and active Pull Requests.
