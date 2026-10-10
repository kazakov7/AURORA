<div align="center">

# ✦ AURORA API

**Explore more. Travel better.**

A full-stack travel marketplace backend built for seamless stays, curated tours, and connected travelers.

![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?style=flat-square&logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![GraphQL](https://img.shields.io/badge/GraphQL-E10098?style=flat-square&logo=graphql&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=flat-square&logo=mongodb&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?style=flat-square&logo=socketdotio&logoColor=white)
![Stripe](https://img.shields.io/badge/Stripe-635BFF?style=flat-square&logo=stripe&logoColor=white)

</div>

---

### ✨ Features

- **Travel marketplace** — destinations, properties, tours, bookings and reviews
- **Accounts & access** — authentication, user/agent/admin roles and agent verification
- **Community** — articles, follows, likes, comments and notifications
- **Real-time chat** — direct messaging powered by Socket.IO
- **Payments** — Stripe checkout, verified webhooks and booking holds
- **Discovery** — search, filters, rankings and scheduled batch processing

### 🧩 Architecture

| Service | Stack | Purpose |
|---|---|---|
| `aurora-api` | NestJS · GraphQL · Mongoose | Main API, auth, bookings, payments and chat |
| `aurora-batch` | NestJS · MongoDB | Scheduled rankings and manual refresh |
| Database | MongoDB Atlas | Separate development and production databases |

### 🚀 Local development

```bash
npm install
# Configure the required environment variables locally (never commit secrets)
npm run start:dev    # GraphQL API
npm run dev:batch    # Ranking worker, in another terminal
```

**Endpoints:** `/graphql` · `/payments/stripe/webhook` · `/rankings/run` (batch service, token-protected)

### 🔐 Security & deployment

Environment secrets stay outside Git. Development and production use separate MongoDB databases. Deploy the API and batch worker as separate services, and store user uploads on persistent object storage rather than ephemeral application disks.

---

<div align="center">
  <sub>Built with care for the AURORA travel platform.</sub>
</div>
