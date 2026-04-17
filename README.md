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
    <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node" />
    <img src="https://img.shields.io/badge/Google_Gemini-4285F4?style=for-the-badge&logo=googlegemini&logoColor=white" alt="Gemini" />
    <img src="https://img.shields.io/badge/Docker-2CA5E0?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  </p>
  
  <br />
</div>

## 📖 Overview

**AuraScore AI** is a professional-grade social intelligence dashboard that replaces legacy scraping with **Gemini Search Grounding**. It dynamically indexes real-time X (Twitter) profile data through the Google Search engine, hydrates it into a stunning Glassmorphism UI, and provides high-fidelity social sharing capabilities.

### ✨ Key Features
- **Gemini Search Grounding:** Bypasses legacy scraping using Gemini's native `googleSearch` capability to live-index and extract real-time X profile statistics.
- **Deterministic Color Identity:** Implements a high-entropy bitwise string-hash to generate unique, consistent color palettes for every user.
- **Social Export Suite:** Integrated `html-to-image` for PNG generation, native OS Sharing (Web Share API), and a "Post to X" web intent.
- **Enterprise-Grade Backend:** Hardened with **Zod** validation, **LRU-Caching**, **Helmet/CORS** security, and standardized error schemas.

---

## 🏗️ Architecture

```mermaid
graph LR
    A[Client UI<br/>React + Framer] -->|Search Payload| B(Express Server Middleware)
    B -->|LRU Cache Check| C{Memory Cache}
    C -->|If Miss| D[Gemini 2.5 Flash API]
    D -->|Google Search Grounding| E[Live Internet Data]
    E -->|Structured JSON| D
    D -->|Inference & Scoring| B
    B -->|Self-Hosted Assets| F[unavatar.io]
    F -->|Real-time Avatar| A
    B -->|Hydrated Payload| A
```

---

## 🚀 Quick Start (Local)

To run this application locally outside of Docker, ensure you have Node.js (`v22.x` or higher) installed.

```bash
# 1. Clone the repository
git clone https://github.com/HemachandRavulapalli/AuraScoreAI.git
cd AuraScoreAI

# 2. Setup your environment keys in .env
GEMINI_API_KEY="your_api_key_here"

# 3. Start the project
npm install
npm run dev
```

Open **`http://localhost:3000`** to view the application.

---

## 🛡️ Security & Reliability

This project is built for production environments:
- **Zero-Dependency Inference:** Uses native REST calls to Gemini to minimize bundle size.
- **Request Buffering:** Prevents API spam via in-memory caching.
- **Deterministic UI:** Every `@username` has a unique "Aura" that is mathematically derived from their handle.
