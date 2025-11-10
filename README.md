# 🖊️ OnePen  

> “Write it. Erase it. Shape it. Create it — no clicks, no limits, just flow.”  
> OnePen understands your writing, your intent, and your rhythm — so you can focus on ideas, not buttons.

---

## 💡 What is it?

Switching tools breaks the flow.  Each time we pause to change a tool — to title, highlight, or box something — our rhythm breaks.  
Those small interruptions, repeated hundreds of times, **disrupt creativity and productivity**. 

Note-taking should feel as natural as paper — only smarter.

That’s why we built **✨ OnePen** — an AI-powered, handwriting-based note-taking web app that understands *how* you write.  

With **AI stroke recognition**, OnePen lets you **write, format, and organize** without ever touching a toolbar.  
Style your strokes, change colors, or trigger advanced actions — **all directly through your handwriting.**

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
#### 📓 Model traiining notebook:
See the full notebook here: [OnePen_Demo.ipynb](./FinalOnePenModelTraining.ipynb)

We used:  
- **Frontend:** Canvas-based custom rendering with zoom, pan, and HiDPI stylus support.  
- **AI Engine:** TensorFlow.js hybrid model combining image and geometric stroke features.  
- **Backend:** Flask server with Pix2Text integration and Google Drive API for sync.  
- **Storage:** IndexedDB for local autosave and persistent settings, synced via JSON to Drive.  

---
