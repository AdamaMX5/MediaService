# Microservice Architecture

## Applications

| App | Description |
|-----|-------------|
| **FreeSchool** | Learning platform |
| **VirtualOffice** | Virtual collaboration space |
| **AdminClient** | Graphical UI for admin endpoints |

---

## Services

### AuthService
> Base URL: `https://auth.freischule.info`

**JWT payload** contains: `email`, list of `roles`, dict of `permissions`

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| `POST` | `/user/login` | `email`, `password`, `device_fingerprint`, `device_name` | `id`, `email`, `roles`, `access_token`, `status`, `last_login` |
| `POST` | `/user/register` | `email`, `password`, `repassword`, `device_fingerprint`, `device_name` | same as login |
| `GET` | `/jwt/public-key` | — | RSA public key for JWT signature verification |

> **Registration flow:** Send a login request with a new e-mail address. A `200` response with `status: "register"` signals that the `/user/register` endpoint should be called next.
>
> **Public key:** Each microservice fetches this once on startup and verifies JWTs autonomously — no round-trip to AuthService per request.

**Cookie:** `refresh_token` — `HttpOnly`, path `user/refresh`

---

### ProfileService
> Can store multiple profiles per user ID.

*Endpoints TBD*

---

### EmailService

*Endpoints TBD*

---

### ExceptionService *(not yet implemented)*
> Receives all exceptions, stores them, and sends an e-mail to the admin with an AI interpretation.

---

### PresenceService
> Provides a WebSocket for real-time user positions within VirtualOffice.

*Endpoints TBD*

---

### MessageService
> Handles messages, desk notes, to-do tickets, and calendar entries (events, appointments, meetings, deadlines).

*Endpoints TBD*

---

### LiveKit *(Open Source)*

---

### RecordingService
> Records meeting rooms managed by the LiveKit service.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/rooms` | List all active LiveKit rooms |
| `GET` | `/rooms/:roomName/participants` | List all participants in a room |
| `POST` | `/rooms/:roomName/record` | Start recording — body `{ "participants": ["alice", "bob"] }` optional; omit to record everyone. Response: `202 { started, skipped }` |
| `DELETE` | `/rooms/:roomName/record` | Stop all active recordings in a room |
| `GET` | `/rooms/:roomName/videos` | List all recordings for a room |
| `GET` | `/rooms/:roomName/videos/latest` | Stream / download the latest recording |
| `GET` | `/rooms/:roomName/videos/:filename` | Stream / download a specific recording |

> Append `?download=1` to any video endpoint to force a file download.

---

### MediaService
> Stores and serves uploaded images and videos. Files are organised by app and folder so teams can collaborate in shared directories.

#### Disk layout

```
UPLOAD_DIR/
└── {app_name}/
    └── {folder}/          ← optional, supports nesting: projects/design
        └── {uuid}.{ext}
```

#### Endpoints

##### Upload

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/upload` | ✅ User | Upload a media file |

**Multipart body**

| Field | Required | Description |
|-------|----------|-------------|
| `file` | ✅ | The media file |
| `app_name` | ✅ | Identifying app, e.g. `"VirtualOffice"` |
| `folder` | — | Suggested storage path, nesting allowed: `"projects/design"` |
| `name` | — | Human-readable display name |
| `description` | — | Short description |

Response `201` — full Media document including a ready-to-use `url`.

---

##### File Access *(public, no auth required)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/files/:app_name/*` | Serve a file by path — browser compatible |

```
GET /files/VirtualOffice/projects/design/3f2e1a….jpg
```

---

##### Media — Metadata & User Self-Service

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/media/:id` | ✅ User | Get metadata for a single file |
| `DELETE` | `/media/:id` | ✅ User | Delete **own** file — `403` if not the uploader |

---

##### Browse — Folder Navigation

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/browse/:app_name` | ✅ User | List root of an app |
| `GET` | `/browse/:app_name/*` | ✅ User | List a subfolder |

**Response shape**
```json
{
  "path": "VirtualOffice/projects",
  "folders": ["design", "dev"],
  "files": [ { "...": "Media document" } ]
}
```

---

##### Admin

> All `/admin` endpoints require a JWT containing the `ADMIN` role.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/media` | List all files — query params: `app_name`, `folder`, `uploaded_by`, `page`, `limit` |
| `DELETE` | `/admin/media/:id` | Delete any file regardless of who uploaded it |
