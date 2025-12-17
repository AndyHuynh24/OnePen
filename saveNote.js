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
  folders = listFolders(folders => {
    console.log('📄 All saved folder:', folders);
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
      console.log("✅ Note saved:", path);
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
      console.log(`📁 Created folder: ${folderName}`);
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
    console.log('📄 All saved notes:', files)
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
    console.log("title", title);
    saveNote(title, allGroups);
  }

  title = path;

  //Scroll back up
  viewportOffset.x = 0;
  viewportOffset.y = 0;
  screenBox.x = viewportOffset.x;
  screenBox.y = viewportOffset.y;

  if (document.querySelector('.noteSelected')) {
    document.querySelector('.noteSelected').classList.toggle('noteSelected')
  }
  selectedButton.classList.toggle('noteSelected');
  console.log(title);
  loadNote(path, note => {
    if (note) {
      if (note.content) {
        allGroups = note.content;
      } else {
        allGroups = [];
      }
      console.log('loadAllgroups', allGroups);

      if (note.created_at) {
        console.log("date created:"+ note.created_at);
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
function saveModifiers(modifiers) {
  openNoteDB((db, done) => {
    const tx = db.transaction("setting", "readwrite");
    const store = tx.objectStore("setting");
    store.put(modifiers, "modifiers");
    tx.oncomplete = () => { console.log("✅ Modifiers saved"); done(); };
    tx.onerror = () => { console.error("❌ Failed to save modifiers"); done(); };
  });
}

function loadModifiers() {
  return new Promise((resolve, reject) => {
    openNoteDB((db, done) => {
      const tx = db.transaction("setting", "readonly");
      const store = tx.objectStore("setting");
      const request = store.get("modifiers");

      request.onsuccess = () => { done(); resolve(request.result ?? null); };
      request.onerror = () => { console.error("❌ Failed to load modifiers"); done(); resolve(null); };
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
      console.log(`🗑️ Note deleted: ${noteName}`);

      // If it was the currently open note, clear title and canvas
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


function backupToDrive(filename = "onepen_backup.json") {
  openNoteDB(db => {
    const allData = {
      notes: {},
      setting: {},
      _report: {
        corruptedNotes: [],
        corruptedSettings: [],
        generatedAt: new Date().toISOString()
      }
    };

    // --- Safe clone (prevents circular refs & bad values)
    function safeClone(value) {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch {
        return null;
      }
    }

    function loadStore(storeName, target, reportKey) {
      return new Promise(resolve => {
        try {
          const tx = db.transaction(storeName, "readonly");
          const store = tx.objectStore(storeName);

          store.openCursor().onsuccess = e => {
            const cursor = e.target.result;
            if (!cursor) return resolve();

            try {
              const cleaned = safeClone(cursor.value);
              if (cleaned === null) {
                throw new Error("Unserializable value");
              }
              target[cursor.key] = cleaned;
            } catch (err) {
              allData._report[reportKey].push({
                key: cursor.key,
                error: err.message
              });
            }

            cursor.continue();
          };

          store.openCursor().onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    }

    Promise.all([
      loadStore("notes", allData.notes, "corruptedNotes"),
      loadStore("setting", allData.setting, "corruptedSettings")
    ]).then(async () => {
      let jsonContent;
      try {
        jsonContent = JSON.stringify(allData, null, 2);
      } catch {
        jsonContent = JSON.stringify({
          error: "Critical serialization failure",
          report: allData._report
        });
      }

      const accessToken = localStorage.getItem("accessToken");
      if (!accessToken) {
        alert("❌ Not signed in");
        return;
      }

      try {
        // 🔍 Search existing backup
        const searchRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name='${filename}' and trashed=false`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const searchData = await searchRes.json();
        const existingFile = searchData.files?.[0];

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

        if (!uploadRes.ok) {
          const err = await uploadRes.json();
          throw new Error(err.error?.message || "Upload failed");
        }

        alert(
          `✅ Backup complete\n\n` +
          `Notes saved: ${Object.keys(allData.notes).length}\n` +
          `Settings saved: ${Object.keys(allData.setting).length}\n\n` +
          `⚠️ Corrupted notes: ${allData._report.corruptedNotes.length}\n` +
          `⚠️ Corrupted settings: ${allData._report.corruptedSettings.length}`
        );
      } catch (err) {
        alert("❌ Backup failed: " + err.message);
      }
    });
  });
}

async function restoreBackupFromDrive(filename = "onepen_backup.json") {
  const accessToken = localStorage.getItem('accessToken');
  if (!accessToken) return alert("❌ Not signed in to Google");

  try {
    // 🔍 Step 1: Search for the backup file
    const searchRes = await fetch(
     `https://www.googleapis.com/drive/v3/files?q=name='${filename}' and trashed=false`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const searchData = await searchRes.json();
    const file = searchData.files?.[0];
    if (!file) return alert(`❌ File "${filename}" not found on Drive.`);

    // 📥 Step 2: Download content
    const backupRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const backupData = await backupRes.json();

    if (!backupData || typeof backupData !== 'object') {
      return alert("❌ Invalid backup format.");
    }

    // 💾 Step 3: Import into IndexedDB
    openNoteDB(db => {
      // ✅ Notes
      const tx1 = db.transaction("notes", "readwrite");
      const store1 = tx1.objectStore("notes");
      const notes = backupData.notes || {};
      Object.values(notes).forEach(note => {
        store1.put(note);
      });

      // ✅ Modifiers / Settings
      // Assuming `db` is your open IndexedDB instance
      const tx2 = db.transaction("setting", "readwrite");
      const store2 = tx2.objectStore("setting");

      // Get your modifiers from backup
      const settings = backupData.setting || {};
      const modifiers = settings.modifiers || {};

      console.log("full setting", modifiers);
      console.log("lastSaveNote", settings.lastSaveNote);
      console.log("individual modifiers", settings.modifiers);

      // Save the lastSaveNote info
      if (settings.lastSaveNote) {
        store2.put({
          type: "lastSaveNote",
          path: settings.lastSaveNote.path,
          viewportOffset: settings.lastSaveNote.viewportOffset,
          scale: settings.lastSaveNote.scale,
          created_at: new Date().toISOString()
        }, "lastSaveNote");
      }

      // Save the individual modifier settings
      if (settings.modifiers) {
        store2.put({
          type: "modifiers",
          data: settings.modifiers,
          created_at: new Date().toISOString()
        }, "modifiers");
      }

      // Optional: handle completion callback
      let completedCount = 0;
      const checkComplete = () => {
        completedCount++;
        if (completedCount === 2) {
          alert("✅ Notes and modifiers restored from backup!");
          renderAllNotes(); // or reload settings as needed
          reloadSetting();
        }
      };

      // Wait for both put requests to complete
      tx2.oncomplete = checkComplete;
      tx2.onerror = (e) => {
        console.error("Error restoring settings:", e.target.error);
      };

      tx1.oncomplete = checkComplete;
      tx1.onerror = () => alert("❌ Failed to restore notes.");
      tx2.oncomplete = checkComplete;
      tx2.onerror = () => alert("❌ Failed to restore settings.");
    });

  } catch (err) {
    console.error("❌ Restore failed:", err);
    alert("❌ Error during restore: " + err.message);
  }
}

async function reloadSetting() {
    const rawmodifiers = await loadModifiers();
    const modifiers = rawmodifiers.data;
    console.log("work", modifiers);

    
    document.querySelectorAll('.modifier-card').forEach(card => {
      const modifierName = card.getAttribute('data-modifier');
      console.log(modifierName);
      const colorInput = card.querySelector('#colorInput');
      const checkbox = card.querySelector('.modifier-footer input[type="checkbox"]');
      const isVisible = checkbox.checked;

      // Initialize the object with default value from the input
      if (modifiers[modifierName]) {
        colorInput.value = modifiers[modifierName].color;
        checkbox.checked = modifiers[modifierName].visibility;
        console.log('work');
      } 
      else {
        modifiers[modifierName] = {
          color: colorInput.value,
          visibility: isVisible
        };
      }
     });    
  }


  //shareable feature
  function collectNotesSafe() {
  return new Promise(resolve => {
    openNoteDB(db => {
      const notes = {};
      const report = { corruptedNotes: [] };

      function safeClone(value) {
        try {
          return JSON.parse(JSON.stringify(value));
        } catch {
          return null;
        }
      }

      try {
        const tx = db.transaction("notes", "readonly");
        const store = tx.objectStore("notes");

        store.openCursor().onsuccess = e => {
          const cursor = e.target.result;
          if (!cursor) {
            resolve({ notes, report });
            return;
          }

          try {
            const cleaned = safeClone(cursor.value);
            if (!cleaned) throw new Error("Unserializable note");
            notes[cursor.key] = cleaned;
          } catch (err) {
            report.corruptedNotes.push({
              key: cursor.key,
              error: err.message
            });
          }

          cursor.continue();
        };

        store.openCursor().onerror = () => resolve({ notes, report });
      } catch {
        resolve({ notes, report });
      }
    });
  });
}

function buildFolderTree(notes) {
  const tree = {};

  Object.entries(notes).forEach(([path, note]) => {
    if (!path.endsWith(".json")) return;
    if (path.endsWith("__folder__.meta")) return;

    const parts = path.split("/");
    let node = tree;

    for (let i = 0; i < parts.length - 1; i++) {
      const folder = parts[i];
      node[folder] ??= { __notes: [], __children: {} };
      node = node[folder].__children;
    }

    const filename = parts[parts.length - 1];
    const folderNode = parts.length > 1
      ? tree[parts[0]].__notes
      : tree.__notes;

    node.__notes ??= [];
    node.__notes.push({ path, note });
  });

  return tree;
}

function flattenFolders(notes) {
  const folders = {};

  Object.entries(notes).forEach(([path, note]) => {
    if (!path.endsWith(".json")) return;
    if (path.endsWith("__folder__.meta")) return;

    const folderPath = path.includes("/")
      ? path.substring(0, path.lastIndexOf("/"))
      : "Root";

    folders[folderPath] ??= [];
    folders[folderPath].push({ path, note });
  });

  return folders;
}
async function showSharePopup() {
  const { notes, report } = await collectNotesSafe();
  const folders = flattenFolders(notes);

  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,.4);
    display:flex; justify-content:center; align-items:center; z-index:9999;
  `;

  const modal = document.createElement("div");
  modal.style.cssText = `
    background:#fff; padding:20px; width:460px; max-height:70vh;
    overflow:auto; border-radius:12px; font-family:sans-serif;
  `;

  modal.innerHTML = `
    <h3>Share Notes</h3>
    <label><input type="checkbox" id="selectAll"> Select All</label>
    <hr />
    <div id="folderList"></div>
    <hr />
    <button id="exportBtn">Export Selected</button>
    <button id="cancelBtn">Cancel</button>
    <p style="font-size:12px;color:#666;">
      ⚠️ Corrupted notes skipped: ${report.corruptedNotes.length}
    </p>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const folderList = modal.querySelector("#folderList");

  Object.entries(folders).forEach(([folderPath, items]) => {
    const folderId = folderPath.replace(/\W/g, "_");

    const block = document.createElement("div");
    block.style.marginBottom = "10px";

    block.innerHTML = `
      <label style="font-weight:bold;">
        <input type="checkbox" class="folderCheck" data-folder="${folderId}">
        📁 ${folderPath}
      </label>
      <div style="margin-left:20px;" id="${folderId}"></div>
    `;

    const container = block.querySelector(`#${folderId}`);

    items.forEach(({ path, note }) => {
      const name = path.split("/").pop().replace(".json", "");
      container.innerHTML += `
        <label>
          <input type="checkbox"
                 class="noteCheck"
                 data-path="${path}"
                 data-folder="${folderId}">
          📝 ${name}
        </label><br/>
      `;
    });

    folderList.appendChild(block);
  });

  // Folder → notes
  modal.querySelectorAll(".folderCheck").forEach(cb => {
    cb.onchange = () => {
      const id = cb.dataset.folder;
      modal.querySelectorAll(`.noteCheck[data-folder="${id}"]`)
        .forEach(n => n.checked = cb.checked);
    };
  });

  // Notes → folder
  modal.querySelectorAll(".noteCheck").forEach(cb => {
    cb.onchange = () => {
      const id = cb.dataset.folder;
      const all = modal.querySelectorAll(`.noteCheck[data-folder="${id}"]`);
      const folderCb = modal.querySelector(`.folderCheck[data-folder="${id}"]`);
      folderCb.checked = [...all].every(n => n.checked);
    };
  });

  modal.querySelector("#selectAll").onchange = e => {
    modal.querySelectorAll("input[type=checkbox]")
      .forEach(cb => cb.checked = e.target.checked);
  };

  modal.querySelector("#cancelBtn").onclick = () => overlay.remove();

  modal.querySelector("#exportBtn").onclick = () => {
    const selected = {};
    modal.querySelectorAll(".noteCheck:checked").forEach(cb => {
      selected[cb.dataset.path] = notes[cb.dataset.path];
    });

    if (!Object.keys(selected).length) {
      alert("Select at least one note");
      return;
    }

    exportSelectedNotes(selected);
    overlay.remove();
  };
}

function exportSelectedNotes(notes) {
  const payload = {
    type: "onepen-share",
    version: 1,
    exportedAt: new Date().toISOString(),
    notes
  };

  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "onepen_shared_notes.json";
  a.click();
  URL.revokeObjectURL(url);
}

//import function 
function rewriteSharedPath(originalPath) {
  const parts = originalPath.split("/");

  // No folder → create one
  if (parts.length === 1) {
    return `share_Root/${parts[0]}`;
  }

  parts[0] = `share_${parts[0]}`;
  return parts.join("/");
}

async function importSharedNotesFromFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";

  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;

    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      alert("❌ Invalid JSON file");
      return;
    }

    if (data.type !== "onepen-share" || typeof data.notes !== "object") {
      alert("❌ Not a valid OnePen shared file");
      return;
    }

    openNoteDB(db => {
      const tx = db.transaction("notes", "readwrite");
      const store = tx.objectStore("notes");

      let importedCount = 0;
      let skippedCount = 0;

      Object.entries(data.notes).forEach(([path, note]) => {
        try {
          const newPath = rewriteSharedPath(path);

          store.put({
            ...note,
            path: newPath,
            importedFromShare: true,
            importedAt: new Date().toISOString()
          }, newPath);

          importedCount++;
        } catch {
          skippedCount++;
        }
      });

      tx.oncomplete = () => {
        alert(
          `✅ Shared notes imported\n\n` +
          `Imported: ${importedCount}\n` +
          `Skipped: ${skippedCount}`
        );
        renderAllNotes();
      };

      tx.onerror = () => {
        alert("❌ Failed to import shared notes");
      };
    });
  };

  input.click();
}
