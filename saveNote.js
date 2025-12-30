function toggleNav() {
  document.getElementById('notenavbar').classList.toggle('open');
}

// Function to select a note directory
function openNoteDB(callback) {
  const request = window.indexedDB.open("dsh-note-db", 2);

  request.onupgradeneeded = function (event) {
    const db = event.target.result;
    if (!db.objectStoreNames.contains("notes")) {
      db.createObjectStore("notes", { keyPath: "path" });
    }
    if (!db.objectStoreNames.contains("setting")) {
      db.createObjectStore("setting");
    }
  };

  request.onsuccess = function (event) {
    const db = event.target.result;
    db.onversionchange = () => db.close(); // Prevent stale connection
    callback(db, () => db.close());        // Manual close after use
  };

  request.onerror = function () {
    console.error("❌ Error opening IndexedDB");
  };
}


function renderAllNotes() {
  document.getElementById('note-list').innerHTML = '';
  document.querySelector('.folder').innerHTML = '';
  folders = listFolders(folders => {
    folders.forEach(folder => {
      renderFolderList(folder)
    })
  });
}

function saveNote(path, content) {

  openNoteDB((db, done) => {
    const tx = db.transaction("notes", "readwrite");
    const store = tx.objectStore("notes");

    const getReq = store.get(path);
    getReq.onsuccess = () => {
      const existing = getReq.result || {};

      store.put({
        ...existing,
        path,
        content,                     // ✅ chỉ update nội dung
        created_at: existing.created_at || new Date().toISOString() 
        // ✅ nếu note chưa có created_at (thích hợp cho file cũ) thì thêm
      });
    };

    tx.oncomplete = () => {
      done();
    };
  });

  saveSetting('lastSaveNote', { path, viewportOffset, scale });
}


function listFolders(callback) {
  openNoteDB((db, done) => {
    const tx = db.transaction("notes", "readonly");
    const store = tx.objectStore("notes");

    const folders = new Set();
    const cursor = store.openCursor();

    cursor.onsuccess = event => {
      const cur = event.target.result;
      if (cur) {
        const folder = cur.key.split('/')[0];
        if (folder) folders.add(folder);
        cur.continue();
      } else {
        done();
        callback(Array.from(folders));
      }
    };

    cursor.onerror = () => {
      console.error("❌ Failed to list folders");
      done();
      callback([]);
    };
  });
}


function listAllNotes(callback) {
  openNoteDB((db, done) => {
    const tx = db.transaction("notes", "readonly");
    const store = tx.objectStore("notes");

    const paths = [];
    const cursor = store.openCursor();

    cursor.onsuccess = event => {
      const cur = event.target.result;
      if (cur) {
        paths.push(cur.key);
        cur.continue();
      } else {
        done();
        callback(paths);
      }
    };

    cursor.onerror = () => {
      console.error("❌ Failed to list notes");
      done();
      callback([]);
    };
  });
}


function listNotesInFolder(folder, callback) {
  listAllNotes(paths => {
    const files = paths.filter(p => p.startsWith(folder + "/") && p.endsWith('.json'));
    callback(files);
  });
}

function promptNewFolder() {
  const folderName = prompt("Enter new folder name:");
  if (!folderName) return;
  createFolder(folderName);
}

function createFolder(folderName) {
  const path = `${folderName}/__folder__.meta`;
  openNoteDB((db, done) => {
    const tx = db.transaction("notes", "readwrite");
    const store = tx.objectStore("notes");

    store.put({
      path,
      content: [],
      created_at: new Date().toISOString()
    });

    tx.oncomplete = () => {
      renderFolderList(folderName);
      done();
    };

    tx.onerror = () => {
      console.error(`❌ Failed to create folder: ${folderName}`);
      done();
    };
  });
}


function renderFolderList(folderName) {
  //new
  const folderButton = document.createElement('button');
  folderButton.className = 'folder-button';
  folderButton.id = folderName;
  folderButton.onclick = () => openFolder(folderName);
  const folderText = document.createElement('p');
  folderText.innerHTML = folderName;
  folderButton.appendChild(folderText);
  // const folderSpan = document.createElement('i');
  // folderSpan.className = 'bx bx-menu-right';
  // folderButton.appendChild(folderSpan);
  document.querySelector('.folder').appendChild(folderButton);
}

function openFolder(folderName) {
  //document.getElementById(folderName).style.backgroundColor = '#444444';
  selectedFolder = folderName;
  if (document.querySelector('.selected')) {
    document.querySelector('.selected').classList.toggle('selected')
  }
  document.getElementById(folderName).classList.toggle('selected');
  const notesContainer = document.querySelector('.notes');
  notesContainer.querySelector('#starter').style.display = 'none';
  notesContainer.querySelector('#menubar').style.display =  'flex';
  notesContainer.querySelector('#note-list').innerHTML = '';

  listNotesInFolder(folderName, files => {
    files.forEach(file => {
      createSubnoteButton(file);
    });
  })
} 

function openSubFolder(container) {
  subNotecontainer = container.querySelector('.subnote-container')
  const displayValue = window.getComputedStyle(subNotecontainer).display;
  dropdownIcon = container.querySelector('i');

  if (displayValue === "none") {
    subNotecontainer.style.display = "flex";
    dropdownIcon.style.transform = "rotate(360deg)";
  } else {
    subNotecontainer.style.display = "none";
    dropdownIcon.style.transform = "rotate(180deg)";
  }
}

function promptNewNote(folderName) {
  if (title) saveNote(title, allGroups);

  const noteName = prompt("Enter new note name:");
  if (!noteName || !folderName) return;

  const fullPath = `${folderName}/${noteName}.json`;
  
  openNoteDB((db, done) => {
    const tx = db.transaction("notes", "readwrite");
    const store = tx.objectStore("notes");

    store.put({
      path: fullPath,
      content: [],
      created_at: new Date().toISOString()   // ✅ Lưu ngày tạo chỉ 1 lần
    });

    tx.oncomplete = () => {
      title = fullPath;
      allGroups = [];
      viewportOffset = { x: 0, y: 0 };
      reDrawAll(drawCtx);
      const noteButton = createSubnoteButton(noteName, folderName);
      loadNoteOnBtn(title, noteButton);
      done();
    };

    tx.onerror = () => {
      console.error("❌ Failed to create note:", fullPath);
      done();
    };
  });
}


function createSubnoteButton(noteName, folderName) {
  const fullPath = folderName ? `${folderName}/${noteName}.json` : noteName;
  
  openNoteDB((db, done) => {
    const tx = db.transaction("notes", "readonly");
    const store = tx.objectStore("notes");
    const req = store.get(fullPath);

    req.onsuccess = () => {
      const note = req.result || {};
      const noteText = fullPath.split('/')[1].replace('.json', '');

      // Format ngày tạo
      const created = note.created_at
        ? new Date(note.created_at).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'2-digit' })
        : "—";

      const noteButton = document.createElement('button');
      noteButton.className = 'note-button';
      noteButton.id = fullPath.replace('/', '_').replace('.json', '');
  
      // ✅ hiển thị tên + ngày tạo
      noteButton.innerHTML = `
        <span>${noteText}</span>
        <span class="note-date">${created}</span>
      `;

      noteButton.onclick = () => loadNoteOnBtn(fullPath, noteButton);
      document.getElementById('note-list').appendChild(noteButton);
      done();
    };
  });
}


function loadNoteOnBtn(path, selectedButton) {
  if (title) {
    saveNote(title, allGroups);
  }

  title = path;

  viewportOffset.x = 0;
  viewportOffset.y = 0;
  screenBox.x = viewportOffset.x;
  screenBox.y = viewportOffset.y;

  if (document.querySelector('.noteSelected')) {
    document.querySelector('.noteSelected').classList.toggle('noteSelected')
  }
  selectedButton.classList.toggle('noteSelected');

  loadNote(path, note => {
    if (note) {
      if (note.content) {
        allGroups = note.content;
      } else {
        allGroups = [];
      }
      reDrawAll(drawCtx);
    }
  });
}

function loadNote(path, callback) {
  openNoteDB((db, done) => {
    const tx = db.transaction("notes", "readonly");
    const store = tx.objectStore("notes");

    const request = store.get(path);
    request.onsuccess = () => {
      done();
      callback(request.result);
    };
    request.onerror = () => {
      console.error("❌ Failed to load note:", path);
      done();
      callback(null);
    };
  });
}


// -----save modifiers -----------
function saveToolboxSettings({ modifiers, toolboxLayout }) {
  const payload = {
    version: 2,
    modifiers,
    toolboxLayout,
    updatedAt: Date.now()
  };

  openNoteDB((db, done) => {
    const tx = db.transaction("setting", "readwrite");
    const store = tx.objectStore("setting");

    store.put(payload, "toolboxSettings");

    tx.oncomplete = () => {
      done();
    };

    tx.onerror = () => {
      console.error("❌ Failed to save toolbox settings");
      done();
    };
  });
}

function loadToolboxSettings() {
  return new Promise(resolve => {
    openNoteDB((db, done) => {
      const tx = db.transaction("setting", "readonly");
      const store = tx.objectStore("setting");
      const request = store.get("toolboxSettings");

      request.onsuccess = () => {
        done();
        resolve(request.result ?? null);
      };

      request.onerror = () => {
        console.error("❌ Failed to load toolbox settings");
        done();
        resolve(null);
      };
    });
  });
}

function saveSetting(key, value) {
  openNoteDB((db, done) => {
    const tx = db.transaction("setting", "readwrite");
    const store = tx.objectStore("setting");
    store.put(value, key);
    tx.oncomplete = done;
    tx.onerror = () => { console.error("❌ Failed to save setting"); done(); };
  });
}

function loadSetting(key) {
  return new Promise((resolve, reject) => {
    openNoteDB((db, done) => {
      const tx = db.transaction("setting", "readonly");
      const store = tx.objectStore("setting");
      const request = store.get(key);

      request.onsuccess = () => { done(); resolve(request.result ?? null); };
      request.onerror = () => { console.error("❌ Failed to load setting"); done(); reject(null); };
    });
  });
}

function renameNote(oldName, newName) {
  const folder = oldName.split('/')[0];
  const newTitle = `${folder}/${newName}.json`;

  if (newTitle === oldName) return;

  openNoteDB((db, done) => {
    const tx = db.transaction("notes", "readwrite");
    const store = tx.objectStore("notes");

    // Check if new note name already exists
    const checkReq = store.get(newTitle);
    checkReq.onsuccess = () => {
      if (checkReq.result) {
        alert("❌ A note with that name already exists.");
        done();
        return;
      }

      // Get the existing note
      const getReq = store.get(oldName);
      getReq.onsuccess = () => {
        const note = getReq.result;
        if (!note) {
          console.error("❌ Note not found:", oldName);
          done();
          return;
        }

        const newNote = {
          ...note,
          path: newTitle,
        };

        const addReq = store.add(newNote);
        addReq.onsuccess = () => {
          const deleteReq = store.delete(oldName);
          deleteReq.onsuccess = () => {
            console.log(`✅ Renamed '${oldName}' → '${newTitle}'`);

            if (title === oldName) title = newTitle;
            openFolder(folder); // refresh the folder UI
            done();
          };
        };

        addReq.onerror = (e) => {
          console.error("❌ Failed to save new note:", e);
          done();
        };
      };

      getReq.onerror = () => {
        console.error("❌ Failed to get old note");
        done();
      };
    };

    checkReq.onerror = () => {
      console.error("❌ Failed to check if new name exists");
      done();
    };
  });
}

function deleteNote(noteName) {
  const confirmed = confirm(`Are you sure you want to delete "${noteName.split('/')[1]}"?`);
  if (!confirmed) return;

  openNoteDB((db, done) => {
    const tx = db.transaction("notes", "readwrite");
    const store = tx.objectStore("notes");

    const deleteReq = store.delete(noteName);

    deleteReq.onsuccess = () => {
      if (title === noteName) {
        title = null;
        allGroups = [];
        reDrawAll(drawCtx);
        //clearCanvas();  // Make sure you have this function to clear your drawing
      }

      // Refresh UI
      const folder = noteName.split('/')[0];
      openFolder(folder);  // Reload notes in this folder
    };

    deleteReq.onerror = () => {
      console.error("❌ Failed to delete note:", deleteReq.error);
    };

    tx.oncomplete = () => {
      done();
    };
  });
}


const renameBtn = document.getElementById('renameBtn');
if (renameBtn) {
  renameBtn.onclick = function () {
    if (!title) {
      alert("⚠️ No note selected.");
      return;
    }

    const oldFile = title.split('/')[1].replace('.json', '');
    const newName = prompt("Enter new name:", oldFile);

    if (newName && newName.trim() && newName !== oldFile) {
      renameNote(title, newName.trim());
    }
  };
}

const deleteBtn = document.getElementById('deleteBtn'); 
if (deleteBtn) {
  deleteBtn.onclick = function () {
    deleteNote(title);
  }
}


//share/backup files functionality
function safeClone(v) {
  try {
    return structuredClone(v);
  } catch {
    try {
      return JSON.parse(JSON.stringify(v));
    } catch {
      return null;
    }
  }
}

function ensureFolderMeta(path, notes) {
  const parts = path.split("/");
  if (parts.length < 2) return;

  const folderPath = parts.slice(0, -1).join("/");
  const metaPath = `${folderPath}/__folder__.meta`;

  if (!notes[metaPath]) {
    notes[metaPath] = {
      path: metaPath,
      content: [],
      created_at: new Date().toISOString()
    };
  }
}

async function collectOnePenData(scope = "backup") {
  return new Promise(resolve => {
    openNoteDB(db => {
      const payload = {
        type: "onepen-data",
        version: 1,
        scope,
        generated_at: new Date().toISOString(),
        notes: {},
        settings: scope === "backup" ? {} : undefined,
        _report: { corruptedNotes: [], corruptedSettings: [] }
      };

      const jobs = [];

      // NOTES
      jobs.push(new Promise(res => {
        try {
          const tx = db.transaction("notes", "readonly");
          const store = tx.objectStore("notes");

          store.openCursor().onsuccess = e => {
            const c = e.target.result;
            if (!c) return res();

            const cleaned = safeClone(c.value);
            if (!cleaned || !cleaned.path) {
              payload._report.corruptedNotes.push(c.key);
            } else {
              payload.notes[c.key] = cleaned;
              ensureFolderMeta(c.key, payload.notes);
            }
            c.continue();
          };
        } catch { res(); }
      }));

      // SETTINGS (backup only)
      if (scope === "backup") {
        jobs.push(new Promise(res => {
          try {
            const tx = db.transaction("setting", "readonly");
            const store = tx.objectStore("setting");

            store.openCursor().onsuccess = e => {
              const c = e.target.result;
              if (!c) return res();
              const cleaned = safeClone(c.value);
              if (cleaned) payload.settings[c.key] = cleaned;
              else payload._report.corruptedSettings.push(c.key);
              c.continue();
            };
          } catch { res(); }
        }));
      }

      Promise.all(jobs).then(() => resolve(payload));
    });
  });
}

function backupToDrive(filename = "onepen_backup.json") {
  openNoteDB(db => {
    const noteTx = db.transaction("notes", "readonly");
    const noteStore = noteTx.objectStore("notes");

    const settingTx = db.transaction("setting", "readonly");
    const settingStore = settingTx.objectStore("setting");

    const payload = {
      type: "onepen-data",
      version: 1,
      scope: "backup",
      generated_at: new Date().toISOString(),
      notes: {},
      settings: {}
    };

    // --- Load notes
    const loadNotes = new Promise(resolve => {
      noteStore.openCursor().onsuccess = e => {
        const c = e.target.result;
        if (!c) return resolve();
        payload.notes[c.key] = c.value;
        c.continue();
      };
    });

    // --- Load settings
    const loadSettings = new Promise(resolve => {
      settingStore.openCursor().onsuccess = e => {
        const c = e.target.result;
        if (!c) return resolve();
        payload.settings[c.key] = c.value;
        c.continue();
      };
    });

    Promise.all([loadNotes, loadSettings]).then(async () => {
      const jsonContent = JSON.stringify(payload, null, 2);
      const accessToken = localStorage.getItem("accessToken");

      if (!accessToken) {
        alert("❌ Not signed in");
        return;
      }

      try {
        // 🔍 Search existing backup (EXACT old behavior)
        const searchRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name='${filename}' and trashed=false`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          }
        );

        const searchData = await searchRes.json();
        const existingFile = searchData.files?.[0];

        // 📤 Multipart upload (EXACT old format)
        const metadata = { name: filename, mimeType: "application/json" };
        const boundary = "-------314159265358979323846";
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelimiter = `\r\n--${boundary}--`;

        const body =
          delimiter +
          "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
          JSON.stringify(metadata) +
          delimiter +
          "Content-Type: application/json\r\n\r\n" +
          jsonContent +
          closeDelimiter;

        const url = existingFile
          ? `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`
          : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

        const method = existingFile ? "PATCH" : "POST";

        const uploadRes = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary="${boundary}"`
          },
          body
        });

        const result = await uploadRes.json();

        if (!uploadRes.ok) {
          throw new Error(result.error?.message || "Upload failed");
        }

        alert("✅ Backup saved to Google Drive");
      } catch (err) {
        alert("❌ Backup failed: " + err.message);
      }
    });
  });
}


async function restoreBackupFromDrive(filename = "onepen_backup.json") {
  const token = localStorage.getItem("accessToken");
  if (!token) return alert("❌ Not signed in");

  try {
    const search = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${filename}' and trashed=false`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).then(r => r.json());

    const file = search.files?.[0];
    if (!file) throw new Error("File not found");

    const data = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).then(r => r.json());

    if (data.type !== "onepen-data" || data.scope !== "backup") {
      throw new Error("Invalid backup file");
    }

    openNoteDB(db => {
      const txN = db.transaction("notes", "readwrite");
      const ns = txN.objectStore("notes");
      Object.values(data.notes).forEach(v => {
        ns.put(v); // key comes from v.path
      });


      const txS = db.transaction("setting", "readwrite");
      const ss = txS.objectStore("setting");
      Object.entries(data.settings || {}).forEach(([k, v]) => ss.put(v, k));

      txN.oncomplete = () => {
        renderAllNotes();
        reloadSetting();
        alert("✅ Backup restored");
      };
    });
  } catch (e) {
    alert("❌ Restore failed: " + e.message);
  }
}

async function exportSelectedNotesToFile(selectedPaths) {
  const payload = await collectOnePenData("share");

  payload.notes = Object.fromEntries(
    Object.entries(payload.notes).filter(([k]) =>
      selectedPaths.some(p => k === p || k.startsWith(p.split("/")[0] + "/"))
    )
  );

  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: "application/json" }
  );

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "onepen_shared_notes.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function rewriteSharePath(path) {
  const parts = path.split("/");
  parts[0] = `share_${parts[0]}`;
  return parts.join("/");
}

async function importSharedNotesFromFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";

  input.onchange = async () => {
    const data = JSON.parse(await input.files[0].text());

    if (data.type !== "onepen-data" || data.scope !== "share") {
      return alert("❌ Invalid share file");
    }

    openNoteDB(db => {
      const tx = db.transaction("notes", "readwrite");
      const store = tx.objectStore("notes");

      Object.entries(data.notes).forEach(([path, note]) => {
        const newPath = rewriteSharePath(path);
        store.put({
          ...note,
          path: newPath
        });

      });

      tx.oncomplete = () => {
        renderAllNotes();
        alert("✅ Shared notes imported");
      };
    });
  };

  input.click();
}

async function showSharePopup() {
  const payload = await collectOnePenData("share");
  const notes = payload.notes;

  // group notes by folder path
  const folders = {};
  Object.keys(notes).forEach(path => {
    if (!path.endsWith(".json")) return;
    if (path.endsWith("__folder__.meta")) return;

    const folder = path.includes("/")
      ? path.substring(0, path.lastIndexOf("/"))
      : "Root";

    folders[folder] ??= [];
    folders[folder].push(path);
  });

  // --- UI
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,.4);
    display:flex; justify-content:center; align-items:center; z-index:9999;
  `;

  const modal = document.createElement("div");
  modal.style.cssText = `
    background:#fff; padding:20px; width:460px;
    max-height:70vh; overflow:auto;
    border-radius:12px; font-family:sans-serif;
  `;

  modal.innerHTML = `
    <h3>Share Notes</h3>
    <label>
      <input type="checkbox" id="selectAll"> Select All
    </label>
    <hr/>
    <div id="folderList"></div>
    <hr/>
    <button id="exportBtn">Export Selected</button>
    <button id="cancelBtn">Cancel</button>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const folderList = modal.querySelector("#folderList");

  // --- render folders
  Object.entries(folders).forEach(([folder, paths]) => {
    const fid = folder.replace(/\W/g, "_");

    const block = document.createElement("div");
    block.innerHTML = `
      <label style="font-weight:bold;">
        <input type="checkbox" class="folderCheck" data-folder="${fid}">
        📁 ${folder}
      </label>
      <div id="${fid}" style="margin-left:20px;"></div>
    `;

    const container = block.querySelector(`#${fid}`);

    paths.forEach(path => {
      const name = path.split("/").pop().replace(".json", "");
      container.innerHTML += `
        <label>
          <input type="checkbox"
                 class="noteCheck"
                 data-path="${path}"
                 data-folder="${fid}">
          📝 ${name}
        </label><br/>
      `;
    });

    folderList.appendChild(block);
  });

  // --- folder → notes
  modal.querySelectorAll(".folderCheck").forEach(cb => {
    cb.onchange = () => {
      modal.querySelectorAll(
        `.noteCheck[data-folder="${cb.dataset.folder}"]`
      ).forEach(n => (n.checked = cb.checked));
    };
  });

  // --- notes → folder
  modal.querySelectorAll(".noteCheck").forEach(cb => {
    cb.onchange = () => {
      const all = modal.querySelectorAll(
        `.noteCheck[data-folder="${cb.dataset.folder}"]`
      );
      const folder = modal.querySelector(
        `.folderCheck[data-folder="${cb.dataset.folder}"]`
      );
      folder.checked = [...all].every(n => n.checked);
    };
  });

  // --- select all
  modal.querySelector("#selectAll").onchange = e => {
    modal.querySelectorAll("input[type=checkbox]")
      .forEach(cb => (cb.checked = e.target.checked));
  };

  // --- export
  modal.querySelector("#exportBtn").onclick = () => {
    const selected = [];
    modal.querySelectorAll(".noteCheck:checked")
      .forEach(cb => selected.push(cb.dataset.path));

    if (!selected.length) {
      alert("Select at least one note");
      return;
    }

    exportSelectedNotesToFile(selected);
    overlay.remove();
  };

  modal.querySelector("#cancelBtn").onclick = () => overlay.remove();
}

//auto save
let _dbPromise = null;

function getDB() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open("dsh-note-db", 2);

    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("notes")) {
        db.createObjectStore("notes", { keyPath: "path" });
      }
      if (!db.objectStoreNames.contains("setting")) {
        db.createObjectStore("setting");
      }
    };

    req.onsuccess = e => resolve(e.target.result);
    req.onerror = reject;
  });

  return _dbPromise;
}

function saveNoteFast(path, content) {
  getDB().then(db => {
    const tx = db.transaction("notes", "readwrite");
    const store = tx.objectStore("notes");

    store.put({
      path,
      content
      // ❌ no created_at here
    });
  });
}


let autosaveTimer = null;
let dirty = false;

function markDirty() {
  dirty = true;

  if (!autosaveTimer) {
    autosaveTimer = setTimeout(() => {
      if (!dirty || !title) return;

      saveNoteFast(title, allGroups);
      dirty = false;
      autosaveTimer = null;
    }, 500); // 300–1000ms sweet spot
  }
}
