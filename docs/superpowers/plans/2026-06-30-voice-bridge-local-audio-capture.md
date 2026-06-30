# Voice Bridge Local Audio Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save raw device recordings on the computer, transcribe them with a local macOS Speech command, and return transcript/reply through the existing Voice AI bridge protocol.

**Architecture:** Keep `desktop-bridge/server.mjs` as the only HTTP backend. Add an optional save directory controlled by `VOICE_BRIDGE_SAVE_AUDIO_DIR`; each `/api/chat` request writes `.pcm`, `.wav`, and `.json` sidecar files. Add a Swift command that implements the existing command-provider stdin/stdout contract and can be used as `VOICE_BRIDGE_TRANSCRIBE_COMMAND`.

**Tech Stack:** Node.js ESM HTTP server, Node test runner, Swift 6.2, macOS Speech framework.

---

### Task 1: Persist Uploaded Audio

**Files:**
- Modify: `desktop-bridge/server.mjs`
- Modify: `desktop-bridge/test.mjs`

- [ ] Add a failing test that starts the bridge with `saveAudioDir`, posts raw PCM, and expects exactly one `.pcm`, one `.wav`, and one `.json` recording sidecar.
- [ ] Implement a small recording helper in `server.mjs` that writes the raw PCM unchanged, writes a WAV wrapper using the request metadata, and writes metadata before/after provider processing.
- [ ] Expose the last saved recording in `/debug/stats` so board smoke can find the latest file without directory scanning.
- [ ] Run `npm run test:voice-bridge`.

### Task 2: Add macOS Speech Command

**Files:**
- Create: `desktop-bridge/apple-speech-transcribe.swift`
- Modify: `desktop-bridge/README.md` if present, otherwise `apps/voice_ai/README.md` and `docs/voice-ai-flow.md`
- Modify: `package.json`

- [ ] Add a Swift CLI that reads JSON stdin with `audio_base64` and `metadata`, writes a temporary WAV file, calls `SFSpeechRecognizer`, and prints `{"transcript":"..."}`.
- [ ] Add an npm script that runs the Swift command with `swift desktop-bridge/apple-speech-transcribe.swift`.
- [ ] Document the launch command with `VOICE_BRIDGE_SAVE_AUDIO_DIR`, `VOICE_BRIDGE_TRANSCRIBE_COMMAND`, and `VOICE_BRIDGE_REPLY_COMMAND`.
- [ ] Run `swift -frontend -parse desktop-bridge/apple-speech-transcribe.swift` and `npm run test:voice-bridge`.
