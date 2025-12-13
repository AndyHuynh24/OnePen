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
    const noteTx = db.transaction("notes", "readonly");
    const noteStore = noteTx.objectStore("notes");

    const settingTx = db.transaction("setting", "readonly");
    const settingStore = settingTx.objectStore("setting");

    const allData = { notes: {}, setting: {} };

    // Load notes
    const notePromise = new Promise(resolve => {
      const notes = {};
      noteStore.openCursor().onsuccess = function (event) {
        const cursor = event.target.result;
        if (cursor) {
          notes[cursor.key] = cursor.value;
          cursor.continue();
        } else {
          resolve(notes);
        }
      };
    });

    // Load modifiers (settings)
    const settingPromise = new Promise(resolve => {
      const settings = {};
      settingStore.openCursor().onsuccess = function (event) {
        const cursor = event.target.result;
        if (cursor) {
          settings[cursor.key] = cursor.value;
          cursor.continue();
        } else {
          resolve(settings);
        }
      };
    });

    // When both are done
    Promise.all([notePromise, settingPromise]).then(async ([notes, modifiers]) => {
      allData.notes = notes;
      allData.setting = modifiers;

      const jsonContent = JSON.stringify(allData, null, 2);
      const accessToken = localStorage.getItem('accessToken');
      if (!accessToken) {
        alert("❌ Not signed in");
        return;
      }

      try {
        // 🔍 Search for existing file
        const searchRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name='${filename}' and trashed=false`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const searchData = await searchRes.json();
        const existingFile = searchData.files?.[0];

        // 📤 Prepare upload
        const metadata = { name: filename, mimeType: "application/json" };
        const boundary = "-------314159265358979323846";
        const delimiter = "\r\n--" + boundary + "\r\n";
        const closeDelimiter = "\r\n--" + boundary + "--";
        const body =
          delimiter +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(metadata) +
          delimiter +
          'Content-Type: application/json\r\n\r\n' +
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
        if (uploadRes.ok) {
          alert("✅ Backup saved as: " + result.name);
        } else {
          throw new Error(result.error?.message || "Upload failed");
        }
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