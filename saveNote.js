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
    // Sort folders alphabetically by name
    folders.sort((a, b) => a.localeCompare(b));
    folders.forEach(folder => {
      renderFolderList(folder)
    })
  });
}

function saveNote(path, content, callback, options = {}) {
  console.log("save");
  openNoteDB((db, done) => {
    const tx = db.transaction("notes", "readwrite");
    const store = tx.objectStore("notes");

    const getReq = store.get(path);
    getReq.onsuccess = () => {
      const existing = getReq.result || {};

      // For summary notes, always use new metadata (don't fallback to existing)
      // This ensures Replace works correctly
      const newSummaryMetadata = options.isSummaryNote
        ? (options.summaryMetadata || null)  // For summaries: use provided or null (don't keep old)
        : (options.summaryMetadata || existing.summaryMetadata || null);  // For regular notes: keep existing

      store.put({
        ...existing,
        path,
        content,
        created_at: existing.created_at || new Date().toISOString(),
        isSummaryNote: options.isSummaryNote || existing.isSummaryNote || false,
        summaryMetadata: newSummaryMetadata
      });
    };

    tx.oncomplete = () => {
      done();
      if (typeof callback === 'function') callback();
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
  const folderButton = document.createElement('button');
  folderButton.className = 'folder-button';
  folderButton.id = folderName;
  folderButton.onclick = () => openFolder(folderName);

  const folderText = document.createElement('p');
  folderText.innerHTML = folderName;
  folderButton.appendChild(folderText);

  // 3-dot menu button
  const menuBtn = document.createElement('button');
  menuBtn.className = 'folder-menu-btn';
  menuBtn.type = 'button';
  menuBtn.title = 'Folder options';

  // Create 3 dots
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('span');
    dot.className = 'menu-dot';
    menuBtn.appendChild(dot);
  }

  menuBtn.onclick = (e) => {
    e.stopPropagation(); // Prevent folder from opening
    showFolderContextMenu(folderName, menuBtn);
  };

  folderButton.appendChild(menuBtn);
  document.querySelector('.folder').appendChild(folderButton);
}

function openFolder(folderName) {
  selectedFolder = folderName;
  if (document.querySelector('.selected')) {
    document.querySelector('.selected').classList.toggle('selected')
  }
  document.getElementById(folderName).classList.toggle('selected');
  const notesContainer = document.querySelector('.notes');
  notesContainer.querySelector('#starter').style.display = 'none';
  notesContainer.querySelector('#menubar').style.display = 'flex';
  notesContainer.querySelector('#note-list').innerHTML = '';

  // Fetch notes with their creation dates
  listNotesInFolderWithDates(folderName, notes => {
    // Sort notes by date (newest first)
    notes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    notes.forEach(note => {
      const noteName = note.path.split('/').pop();
      createSubnoteButton(noteName, folderName, note.created_at, note.isSummaryNote);
    });
  });
}

function listNotesInFolderWithDates(folder, callback) {
  openNoteDB((db, done) => {
    const tx = db.transaction("notes", "readonly");
    const store = tx.objectStore("notes");
    const notes = [];

    store.openCursor().onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) {
        const path = cursor.value.path;
        if (path.startsWith(folder + "/") && path.endsWith('.json')) {
          notes.push({
            path: path,
            created_at: cursor.value.created_at,
            isSummaryNote: cursor.value.isSummaryNote || false
          });
        }
        cursor.continue();
      } else {
        done();
        callback(notes);
      }
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// FOLDER CONTEXT MENU
// ═══════════════════════════════════════════════════════════════════════════

let activeFolderPopup = null;

function showFolderContextMenu(folderName, targetBtn) {
  // Close any existing popup
  hideFolderContextMenu();

  // Create popup
  const popup = document.createElement('div');
  popup.className = 'folder-context-popup';
  popup.id = 'folderContextPopup';

  popup.innerHTML = `
    <button class="context-item" data-action="rename">
      <i class="bx bx-edit-alt"></i>
      <span>Rename</span>
    </button>
    <div class="context-divider"></div>
    <button class="context-item danger" data-action="delete">
      <i class="bx bx-trash"></i>
      <span>Delete</span>
    </button>
  `;

  document.body.appendChild(popup);

  // Position popup near the button
  const rect = targetBtn.getBoundingClientRect();
  popup.style.left = `${rect.left - popup.offsetWidth + rect.width}px`;
  popup.style.top = `${rect.bottom + 4}px`;

  // Ensure popup stays within viewport
  const popupRect = popup.getBoundingClientRect();
  if (popupRect.right > window.innerWidth) {
    popup.style.left = `${window.innerWidth - popupRect.width - 8}px`;
  }
  if (popupRect.bottom > window.innerHeight) {
    popup.style.top = `${rect.top - popupRect.height - 4}px`;
  }

  // Show with animation
  requestAnimationFrame(() => popup.classList.add('visible'));

  // Handle clicks
  popup.querySelector('[data-action="rename"]').onclick = () => {
    hideFolderContextMenu();
    promptRenameFolder(folderName);
  };

  popup.querySelector('[data-action="delete"]').onclick = () => {
    hideFolderContextMenu();
    promptDeleteFolder(folderName);
  };

  // Close on click outside
  activeFolderPopup = { popup, folderName };
  setTimeout(() => {
    document.addEventListener('click', handleFolderPopupOutsideClick);
  }, 10);
}

function hideFolderContextMenu() {
  const popup = document.getElementById('folderContextPopup');
  if (popup) {
    popup.classList.remove('visible');
    setTimeout(() => popup.remove(), 120);
  }
  document.removeEventListener('click', handleFolderPopupOutsideClick);
  activeFolderPopup = null;
}

function handleFolderPopupOutsideClick(e) {
  const popup = document.getElementById('folderContextPopup');
  if (popup && !popup.contains(e.target)) {
    hideFolderContextMenu();
  }
}

function promptRenameFolder(oldName) {
  const newName = prompt(`Rename notebook "${oldName}" to:`, oldName);
  if (!newName || newName === oldName || !newName.trim()) return;

  renameFolder(oldName, newName.trim());
}

function promptDeleteFolder(folderName) {
  const confirmed = confirm(`Delete notebook "${folderName}" and all its notes?\n\nThis action cannot be undone.`);
  if (!confirmed) return;

  deleteFolder(folderName);
}

function renameFolder(oldName, newName) {
  openNoteDB((db, done) => {
    const tx = db.transaction("notes", "readwrite");
    const noteStore = tx.objectStore("notes");

    // Get all notes in this folder (including __folder__.meta)
    const getAllNotes = noteStore.getAll();
    getAllNotes.onsuccess = () => {
      const allNotes = getAllNotes.result;
      const notesToUpdate = allNotes.filter(n => n.path.startsWith(`${oldName}/`));

      // Update each note's path
      notesToUpdate.forEach(note => {
        const newPath = note.path.replace(`${oldName}/`, `${newName}/`);
        noteStore.delete(note.path);
        noteStore.put({
          ...note,
          path: newPath
        });
      });
    };

    tx.oncomplete = () => {
      // Update UI
      const folderBtn = document.getElementById(oldName);
      if (folderBtn) {
        folderBtn.id = newName;
        const textEl = folderBtn.querySelector('p');
        if (textEl) textEl.textContent = newName;
      }

      // Update selectedFolder if it was the renamed one
      if (selectedFolder === oldName) {
        selectedFolder = newName;
      }

      // Update current title if it was in the renamed folder
      if (title && title.startsWith(`${oldName}/`)) {
        title = title.replace(`${oldName}/`, `${newName}/`);
      }

      done();
    };

    tx.onerror = () => {
      console.error(`❌ Failed to rename folder: ${oldName}`);
      done();
    };
  });
}

function deleteFolder(folderName) {
  openNoteDB((db, done) => {
    const tx = db.transaction("notes", "readwrite");
    const noteStore = tx.objectStore("notes");

    // Get all notes and delete those in this folder (including __folder__.meta)
    const getAllNotes = noteStore.getAll();
    getAllNotes.onsuccess = () => {
      const allNotes = getAllNotes.result;
      allNotes.forEach(note => {
        if (note.path.startsWith(`${folderName}/`)) {
          noteStore.delete(note.path);
        }
      });
    };

    tx.oncomplete = () => {
      // Remove folder button from UI
      const folderBtn = document.getElementById(folderName);
      if (folderBtn) {
        folderBtn.remove();
      }

      // Clear note list if this folder was selected
      if (selectedFolder === folderName) {
        selectedFolder = null;
        const notesContainer = document.querySelector('.notes');
        notesContainer.querySelector('#starter').style.display = 'block';
        notesContainer.querySelector('#menubar').style.display = 'none';
        notesContainer.querySelector('#note-list').innerHTML = '';
      }

      // Clear canvas if current note was in deleted folder
      if (title && title.startsWith(`${folderName}/`)) {
        title = null;
        allGroups = [];
        viewportOffset = { x: 0, y: 0 };
        reDrawAll(drawCtx);
      }

      done();
    };

    tx.onerror = () => {
      console.error(`❌ Failed to delete folder: ${folderName}`);
      done();
    };
  });
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
  const createdAt = new Date().toISOString();

  openNoteDB((db, done) => {
    const tx = db.transaction("notes", "readwrite");
    const store = tx.objectStore("notes");

    store.put({
      path: fullPath,
      content: [],
      created_at: createdAt
    });

    tx.oncomplete = () => {
      title = fullPath;
      allGroups = [];
      viewportOffset = { x: 0, y: 0 };
      reDrawAll(drawCtx);
      const noteButton = createSubnoteButton(noteName, folderName, createdAt);
      loadNoteOnBtn(title, noteButton);
      done();
    };

    tx.onerror = () => {
      console.error("❌ Failed to create note:", fullPath);
      done();
    };
  });
}


function createSubnoteButton(noteName, folderName, createdDate = null, isSummaryNote = false) {
  // Handle both "noteName" and "noteName.json" formats
  const cleanName = noteName.replace('.json', '');
  const fullPath = folderName ? `${folderName}/${cleanName}.json` : noteName;
  const noteText = cleanName;

  // Format date - use provided date or placeholder
  const created = createdDate
    ? new Date(createdDate).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'2-digit' })
    : "—";

  const noteButton = document.createElement('button');
  noteButton.className = isSummaryNote ? 'note-button summary-note' : 'note-button';
  noteButton.id = fullPath.replace('/', '_').replace('.json', '');

  noteButton.innerHTML = `<span>${noteText}</span><span class="note-date">${created}</span>`;

  noteButton.onclick = () => loadNoteOnBtn(fullPath, noteButton);

  const noteList = document.getElementById('note-list');

  // Insert summary notes at the top, others at the bottom
  if (isSummaryNote) {
    // Find the last summary note or insert at the beginning
    const existingSummaries = noteList.querySelectorAll('.summary-note');
    if (existingSummaries.length > 0) {
      const lastSummary = existingSummaries[existingSummaries.length - 1];
      lastSummary.after(noteButton);
    } else if (noteList.firstChild) {
      noteList.insertBefore(noteButton, noteList.firstChild);
    } else {
      noteList.appendChild(noteButton);
    }
  } else {
    noteList.appendChild(noteButton);
  }

  return noteButton;
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
        syncGroupIds(allGroups);
      } else {
        allGroups = [];
        idCount = 0;
      }
      reDrawAll(drawCtx);

      // Check if this is a summary note and if it's stale
      if (note.isSummaryNote && note.summaryMetadata) {
        checkSummaryFreshness(note, path);
      }
    }
  });
}

// Flag to prevent infinite loop when auto-opening after regeneration
// Using window property so it can be set from other files (main.js)
window.skipNextFreshnessCheck = false;

// Check if a summary note is stale and prompt user to update
function checkSummaryFreshness(note, summaryPath) {
  // Skip if we just regenerated this summary (prevents infinite loop)
  if (window.skipNextFreshnessCheck) {
    window.skipNextFreshnessCheck = false;
    return;
  }

  const metadata = note.summaryMetadata;
  if (!metadata || !metadata.folderName || !metadata.selectedOptions) return;

  const folderName = metadata.folderName;
  const options = metadata.selectedOptions;

  // Count current important items in the folder
  countImportantItems(folderName, options, (currentCount) => {
    if (currentCount !== metadata.importantItemCount) {
      const diff = currentCount - metadata.importantItemCount;
      const message = diff > 0
        ? `This summary may be outdated. ${diff} new important item(s) found since it was created.\n\nWould you like to update the summary?`
        : `This summary may be outdated. Some important items appear to have been removed.\n\nWould you like to update the summary?`;

      if (confirm(message)) {
        // Extract summary name from path
        const summaryName = summaryPath.split('/').pop().replace('.json', '');
        // Set flag to skip freshness check after regeneration (prevents infinite loop)
        window.skipNextFreshnessCheck = true;
        // Regenerate summary with same options
        summarizeNotes({
          summaryName,
          ...options
        });
      }
    }
  });
}

// Count important items in a folder based on selected options
function countImportantItems(folderName, options, callback) {
  const {
    includeTitle1, includeTitle2, includeTitle3,
    includeBox, includeCurly,
    includeBoxShortcut, includeCurlyShortcut, includeCircleShortcut
  } = options;

  listNotesInFolderWithDates(folderName, (notesWithDates) => {
    // Filter out summary notes
    const filteredNotes = notesWithDates.filter(n => !n.isSummaryNote);

    if (filteredNotes.length === 0) {
      callback(0);
      return;
    }

    let totalCount = 0;
    let pending = filteredNotes.length;

    filteredNotes.forEach(noteInfo => {
      loadNote(noteInfo.path, (note) => {
        if (note?.content && Array.isArray(note.content)) {
          const groups = note.content;

          // Count titles (grouped by titleGroupId to match summary logic)
          if (includeTitle1 || includeTitle2 || includeTitle3) {
            const titleGroups = new Set();
            groups.forEach(group => {
              if (!group.titleStatus || !group.titleLevel || group.visibility === false) return;
              const level = group.titleLevel;
              if ((level === 1 && includeTitle1) ||
                  (level === 2 && includeTitle2) ||
                  (level === 3 && includeTitle3)) {
                const groupId = group.titleGroupId || `fallback_${group.id}`;
                titleGroups.add(groupId);
              }
            });
            totalCount += titleGroups.size;
          }

          // Count box modifiers
          if (includeBox) {
            groups.forEach(group => {
              if (group.visibility === false) return;
              if (group.predictedLabel === STROKE_TYPE.BOX || group.predictedLabel === 1) {
                totalCount++;
              }
            });
          }

          // Count curly modifiers
          if (includeCurly) {
            groups.forEach(group => {
              if (group.visibility === false) return;
              if (group.predictedLabel === STROKE_TYPE.CURLY || group.predictedLabel === 2) {
                totalCount++;
              }
            });
          }

          // Count shortcuts (these have visibility=false but should still be counted)
          const shortcutTypes = [
            { include: includeBoxShortcut, labels: [STROKE_TYPE.BOXS, 4, "boxshortcut"] },
            { include: includeCurlyShortcut, labels: [STROKE_TYPE.CURLYS, 5, "curlyshortcut"] },
            { include: includeCircleShortcut, labels: [STROKE_TYPE.CIRCLES, 6, "circleshortcut"] }
          ];

          shortcutTypes.forEach(({ include, labels }) => {
            if (!include) return;
            groups.forEach(group => {
              if (!group.bbox || !Array.isArray(group.stroke)) return;
              if (labels.includes(group.predictedLabel)) {
                // Check if shortcut has children (non-empty)
                const shortcutBox = group.bbox;
                const hasChildren = groups.some(other => {
                  if (other.id === group.id || !other.bbox || other.visibility === false) return false;
                  const otherBox = other.bbox;
                  return otherBox.y > shortcutBox.y &&
                         (otherBox.y + otherBox.h) < (shortcutBox.y + shortcutBox.h);
                });
                if (hasChildren) totalCount++;
              }
            });
          });
        }

        if (--pending === 0) {
          callback(totalCount);
        }
      });
    });
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

// backupToDrive and restoreBackupFromDrive are now in signin.js

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

    // First get existing note to preserve created_at
    const getReq = store.get(path);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      store.put({
        path,
        content,
        created_at: existing?.created_at || new Date().toISOString()
      });
    };
  });
  saveSetting('lastSaveNote', { path, viewportOffset, scale });
}


let autosaveTimer = null;
let dirty = false;

function markDirty() {
  dirty = true;

  // Invalidate TOC cache when content changes
  if (typeof invalidateTitleCache === 'function') {
    invalidateTitleCache();
  }

  if (!autosaveTimer) {
    autosaveTimer = setTimeout(() => {
      if (!dirty || !title) {
        console.log('[Autosave] markDirty timer: skipping (dirty:', dirty, ', title:', title, ')');
        return;
      }

      console.log('[AutoSync] markDirty: saving locally...');
      saveNoteFast(title, allGroups);
      dirty = false;
      autosaveTimer = null;

      // // Trigger Google Drive auto-sync (if signed in)
      // if (typeof triggerAutoSync === 'function') {
      //   console.log('[AutoSync] markDirty: calling triggerAutoSync()');
      //   triggerAutoSync();
      // } else {
      //   console.log('[AutoSync] markDirty: triggerAutoSync not found!');
      // }
    }, 500); // 300–1000ms sweet spot
  }
}
