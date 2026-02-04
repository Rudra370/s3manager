# S3 Manager

<p align="center">
  A beautiful, self-hosted web interface for managing your S3-compatible storage.
</p>

---

## 🎥 Demo Video

<p align="center">
  <video src="demo/demo.mp4" controls width="90%">
    Your browser does not support the video tag.
  </video>
</p>

---

## 📸 Screenshots

<p align="center">
  <img src="screenshots/1. bucket list.png" alt="img1" width="90%">
  </br>
  <small>Bucket list</small>
</p>

<p align="center">
  <img src="screenshots/2. bucket view.png" alt="img2" width="90%">
  </br>
  <small>Bucket view</small>
</p>

<p align="center">
  <img src="screenshots/3. manage team.png" alt="img3" width="90%">
  </br>
  <small>Manage team</small>
</p>

<p align="center">
  <img src="screenshots/4. share file with password.png" alt="img4" width="90%">
  </br>
  <small>Share file with/without password</small>
</p>

<p align="center">
  <img src="screenshots/5. manage multiple storages.png" alt="img5" width="90%">
  </br>
  <small>Manage multiple S3-compatible storages</small>
</p>

---

## ✨ Features

- **📁 Easy File Management** — Upload, organize, and manage your files with a familiar folder interface
- **👥 Multi-User Ready** — Share access with your team
- **🗄 Multi-Storage Support** — Connect multiple S3-compatible storage accounts
- **🔗 Shared Links** - Create and manage shareable links for your files (with/without password)
- **🏷️ Your Brand** - Customize the interface with your logo and Brand name
- **⚡ Quick Uploads** — Upload single or multiple files in seconds
- **🖼️ Built-in Previews** — View images and text files without downloading
- **🌙 Dark Mode** — Easy on the eyes, day or night. Also supports light mode
- **🔍 Lightning Fast Search** — Find files instantly across buckets
- **📊 Size Insights** — Know exactly how much space you're using
- **🔒 Secure by Default** — Your credentials stay on your server encrypted

**Works with:** AWS S3 · MinIO · Wasabi · Hetzner · Any S3-compatible storage

---

## 🚀 Quick Start

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

## ⚙️ Configuration

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

## 🛠️ Updating

```bash
./deploy.sh
```

---

## 🧪 Development & Testing

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

## 📄 License

MIT License — do whatever you want, just don't blame me! 😊

---

## 🙏 Acknowledgements

Built with ❤️ using:
- [FastAPI](https://fastapi.tiangolo.com/) — The Python framework
- [React](https://react.dev/) — The UI library
- [Material-UI](https://mui.com/) — The component library

---

## 💬 Support

- 🐛 [Report a bug](../../issues)
- 💡 [Request a feature](../../discussions)

