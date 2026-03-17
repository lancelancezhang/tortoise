# Mandarin → English Recorder

Record voice in Mandarin, get live transcription and English translation. Save each session with a timestamp and reopen it later to hear the recording and see the text.

**Stack:** React (Vite) frontend + Express backend. Recordings are stored on the server (files + metadata).

## Features

- **Record** – Capture your voice (microphone required).
- **Transcription** – Mandarin speech-to-text in the browser (Web Speech API; best in Chrome).
- **Translation** – Mandarin → English via MyMemory API (free, no API key).
- **Save** – Store recording + transcript + translation on the backend, named with a timestamp (e.g. `Recording 2025-03-09 14-30-22`).
- **Replay** – Open any saved item to play the audio and view Mandarin transcript and English translation.

## Setup

1. **Install dependencies**

   From the project root:

   ```bash
   npm install
   cd server && npm install && cd ..
   cd client && npm install && cd ..
   ```

2. **Run backend and frontend**

   From the project root:

   ```bash
   npm run dev
   ```

   This starts:
   - **Backend** at `http://localhost:3001`
   - **Frontend** at `http://localhost:3000` (proxies `/api` to the backend)

   Or run them separately:
   - `npm run dev:server` (backend only)
   - `npm run dev:client` (frontend only; ensure backend is running for save/list).

3. Open **http://localhost:3000** in **Chrome** or **Edge**, allow the microphone, then Record → speak in Mandarin → Stop → **Save with timestamp**.

## Project structure

- **`client/`** – React (Vite) app: recording, Web Speech API, MyMemory translation, UI and API client.
- **`server/`** – Express API: stores recordings in `server/uploads/` and metadata in `server/data/recordings.json`.
  - `GET /api/recordings` – list all
  - `GET /api/recordings/:id` – one recording metadata
  - `GET /api/recordings/:id/audio` – audio file
  - `POST /api/recordings` – create (multipart: audio file + name, transcript, translation, etc.)

## External tools

- **Transcription:** Browser Web Speech API (no key). Mandarin works best in Chrome/Edge with `zh-CN`.
- **Translation:** MyMemory (`api.mymemory.translated.net`) – free, no key; ~5000 characters/day without an account.

## Browser support

- **Chrome / Edge (Chromium)** – Full support.
- **Safari** – May support recognition; test locally.
- **Firefox** – Speech recognition is limited; recording still works.
