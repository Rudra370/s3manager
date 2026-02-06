# S3 Manager

<p align="center">
  A beautiful, self-hosted web interface for managing your S3-compatible storage.
</p>

---

## Demo Video

https://github.com/user-attachments/assets/d6869075-2456-4e32-981b-df77ef6e345d

---

## Screenshots

<p align="center">
  <img src="screenshots/1. bucket list.png" alt="Bucket list" width="90%">
  <br>
  <small>Bucket list</small>
</p>

<p align="center">
  <img src="screenshots/2. bucket view.png" alt="Bucket view" width="90%">
  <br>
  <small>Bucket view</small>
</p>

<p align="center">
  <img src="screenshots/3. manage team.png" alt="Manage team" width="90%">
  <br>
  <small>Manage team</small>
</p>

<p align="center">
  <img src="screenshots/4. share file with password.png" alt="Share file" width="90%">
  <br>
  <small>Share file with/without password</small>
</p>

<p align="center">
  <img src="screenshots/5. manage multiple storages.png" alt="Multiple storages" width="90%">
  <br>
  <small>Manage multiple S3-compatible storages</small>
</p>

---

## Features

| Feature | Description |
|---------|-------------|
| **File Management** | Upload, organize, and manage files with a familiar folder interface |
| **Multi-User** | Share access with your team |
| **Multi-Storage** | Connect multiple S3-compatible storage accounts |
| **Shared Links** | Create shareable links for files (with/without password) |
| **Branding** | Customize with your logo and brand name |
| **Quick Uploads** | Upload single or multiple files in seconds |
| **File Previews** | View images and text files without downloading |
| **Dark/Light Mode** | Choose your preferred theme |
| **Search** | Find files instantly across buckets |
| **Size Insights** | Know exactly how much space you're using |
| **Secure** | Credentials stay on your server encrypted |

**Works with:** AWS S3 · MinIO · Wasabi · Hetzner · Any S3-compatible storage

---

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

### Install & Run

```bash
# Clone the repository
git clone https://github.com/Rudra370/s3manager.git
cd s3manager

# Run the setup script
./setup.sh
```

That's it! The script will:
1. Ask for your preferred port (default: 3012)
2. Generate a secure secret key
3. Build and start everything

Then open **http://localhost:3012** and complete the setup wizard.

---

## Configuration

Create a `.env` file (optional):

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3012 | Port to run the app |
| `SECRET_KEY` | auto-generated | JWT signing key |
| `DATABASE_URL` | postgresql://s3manager:s3manager@postgres:5432/s3manager | PostgreSQL connection URL |

---

## Updating

```bash
./deploy.sh
```

---

## Development & Testing

Want to contribute or run E2E tests?

```bash
# Run E2E tests (requires Python 3.8+ and Playwright)
cd e2e
pip3 install -r requirements.txt
playwright install chromium
python3 test_runner.py
```

> **Note:** E2E tests automatically create and drop a dedicated test database for each test run.
> Make sure the PostgreSQL container is accessible from your host machine (port 5432).

See [e2e/README.md](e2e/README.md) for detailed test configuration.

---

## License

MIT License — do whatever you want, just don't blame me!

---

## Acknowledgements

Built with:
- [FastAPI](https://fastapi.tiangolo.com/) — The Python framework
- [React](https://react.dev/) — The UI library
- [Material-UI](https://mui.com/) — The component library

---

## Support

- [Report a bug](../../issues)
- [Request a feature](../../discussions)

| Tool / Project | Self-hostable | Multi-provider (S3, R2, Wasabi, B2, MinIO...) | Teams / Role-based Permissions | Multi-user auth (login) | Shareable links (expiring/password) | Folder / Prefix size & indexing | Presigned URL support (for uploads/downloads) | Bulk/recursive delete | UI polish / UX | One-command demo / docker-compose | License |
|---|---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---|
| **Rudra370/s3manager** | ✅ Fully (Docker / compose / setup script) | ✅ Connect multiple S3-compatible accounts | ✅ Built-in teams & permissions (first-class) | ✅ Yes — app login, JWT | ✅ Yes — share links with/without password | ✅ Size insights & background indexing (implemented) | ✅ Yes (backend issues presigned flows) | ✅ Yes — recursive delete & bulk ops (worker) | ⭐⭐⭐⭐⭐ Modern React UI, MUI, dark mode, polished | ✅ `./setup.sh` + `docker-compose.yml` included | MIT |
| **MinIO Console (MinIO)** | ✅ Self-hosted (embedded in MinIO server / container) | ✅ Primarily MinIO but can target S3 endpoints (Console mostly for MinIO) | ✅ Console supports admin/IAM for MinIO clusters | ✅ Yes (MinIO users / console auth) | ⚠️ Limited for external S3 targets (console primarily admin) | ⚠️ Exposes storage metrics for MinIO; not for arbitrary external prefixes | ✅ Supports presigned URLs for objects (MinIO/S3 API) | ✅ Yes (MinIO admin features) | ⭐⭐⭐⭐ Enterprise-grade admin UX | ✅ MinIO Docker / k8s manifests | Apache-2.0 (MinIO OSS) / Commercial for AIStor |
| **cloudlena/s3manager** | ✅ Docker image / simple to run | ✅ Works with any S3-compatible endpoint | ❌ No teams built-in (single-account UI) | ❌ Minimal/no multi-user auth by default | ❌ Not native (no share links) | ❌ No size indexing (lists objects) | ✅ Uses S3 API (so presigned possible via env) | ✅ Delete single objects; recursive deletes require config | ⭐⭐ Basic, functional UI (Go, Material) | ✅ `docker run` / example `docker-compose.yml` | MIT |
| **Rclone Web UI (rclone-webui-react / rclone GUI)** | ✅ Self-hostable (run `rcd` + web UI) | ✅ Very wide backend support (S3, R2, B2, many more) | ❌ Not a teams/roles manager out of the box | ✅ Can be secured (rc auth / reverse proxy) | ❌ Not first-class (focus is file operations) | ❌ No built-in indexed folder sizes (can list & sum) | ✅ Presigned / direct API via rclone operations | ✅ Bulk operations supported via rclone commands | ⭐⭐⭐ Power-user oriented (two-panel file manager) | ✅ `rclone rcd --rc-web-gui` / docker images | MIT |
| **UploadThing** | ❌ Primarily hosted developer service (has OSS SDKs) | ⚠️ Integrates with S3 backends but is a hosted upload platform | ❌ Not a storage admin / teams UI (focus: upload flows) | ✅ Hosted dashboard for uploads (managed) | ✅ Yes — links & upload webhooks (developer-oriented) | ❌ Not a general folder/bucket size manager | ✅ Provides safe upload flows / presigned logic via SDK | ❌ Not a bulk storage manager | ⭐⭐⭐ SDK developer UX; nice components | ✅ Quick SDK install; hosted service | Proprietary (service) + OSS SDKs |
| **Cyberduck (desktop)** | ✅ Desktop app (not web self-hosted) | ✅ S3 & many protocols supported | ❌ No team/role server (desktop client) | ✅ Uses user auth locally; can integrate with keys | ✅ Share via signed URLs (depends on backend) | ❌ No background indexed folder sizes server-side | ✅ Presigned and direct S3 operations supported | ✅ Bulk operations supported in client | ⭐⭐⭐⭐ Polished desktop UX | ✅ Desktop install (not docker) | GPL / Donations / commercial builds |
