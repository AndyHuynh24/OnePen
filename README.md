# 🖊️ OnePen  

> “Write it. Erase it. Shape it. Create it — no clicks, no limits, just flow.”  
> OnePen understands your writing, your intent, and your rhythm — so you can focus on ideas, not buttons.

---

## 💡 What is it?

Switching tools breaks the flow.  

To make a title, highlight, or draw a box, we stop writing, reach for a toolbar, then return — again and again.  
It’s a small step that, repeated hundreds of times, disrupts thought and creativity.  

Note-taking should feel as natural as paper — only smarter.  
That’s why you need **OnePen**.  

**OnePen** is a handwriting-based note-taking web app that uses **AI stroke recognition** to let you write, format, and organize without ever touching a toolbar.  
You can change colors, thickness, visibility, or even trigger advanced actions — all directly through how you write.

---

## 🎥 Demo and Demonstration  

[▶️ Watch Demo](https://github.com/user-attachments/assets/841e0054-ee6b-4bc9-9c63-4c769e01642b)

---

## 🧠 Key Features  

| Feature | Description |
|----------|--------------|
| ✍️ **Modifier Recognition** | Detects underlines, boxes, curly brackets, or strike-throughs to automatically highlight, delete, or group content. |
| 🎨 **Auto Styling & Coloring** | Instantly switch between up to 20+ pen styles — color, opacity, and stroke type — all through handwriting context. |
| ⚡ **Quick Tool Selection** | No toolbars needed — simply circle, hold, or gesture to open a smart popup and change tools or colors instantly. |
| 🗒️ **Sticky Notes Behind Text** | Attach a hidden note behind any text. Click the text later to reveal your sticky note — perfect for side thoughts or reminders. |
| 🔗 **Embedded Links on Handwriting** | Turn any handwritten stroke into a clickable link to open files, websites, or folders. |
| 🧮 **Math Recognition** | Integrates with Pix2Text for real-time parsing and solving of handwritten formulas and expressions. |
| 📖 **Handwritten Table of Contents** | Automatically detects titles and subtitles from handwriting and builds a clickable TOC to navigate your notes. |
| 🧾 **Smart Summarize Tool** | Collects all titles, boxes, or formulas from multiple notes into one **“Total Note”** — ideal for cheat sheets or study summaries. |
| ☁️ **Seamless Sync & Backup** | Automatically saves notes locally in IndexedDB and syncs with Google Drive for cross-device access. |

---

## 🛠️ How We Built It  

We used:  
- **Frontend:** Canvas-based custom rendering with zoom, pan, and HiDPI stylus support.  
- **AI Engine:** TensorFlow.js hybrid model combining image and geometric stroke features.  
- **Backend:** Flask server with Pix2Text integration and Google Drive API for sync.  
- **Storage:** IndexedDB for local autosave and persistent settings, synced via JSON to Drive.  

---
