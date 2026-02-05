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
| `DATABASE_URL` | sqlite:///data/s3manager.db | SQLite database path |

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
