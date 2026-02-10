
//----Default parameters-----
// Scale and grid constants are defined in config.js (CONFIG.CONFIG.MIN_SCALE, CONFIG.CONFIG.MAX_SCALE, etc.)
let scale = CONFIG.DEFAULT_SCALE;

//parameters for background
let backgroundColor;
let gridLineColor;
let gridSize = Number(document.getElementById("gridWidth").value);
let gridStyle = "square"; // "line" = horizontal only, "square" = both horizontal and vertical
let penSize;
const backgroundColorPicker = document.getElementById("backgroundColorPicker");
const gridLineColorPicker = document.getElementById("gridLineColorPicker");

//parameters for live drawing
let currentStroke = []; 
let drawing = false;
let drawingLock = false;
let idCount = 0; // Unique ID for each group

// Helper function to generate unique IDs safely
function getNextId() {
    if (!Number.isFinite(idCount)) idCount = 0;
    return idCount++;
}

// Helper function to fix and sync IDs after loading notes
function syncGroupIds(groups) {
    if (!Array.isArray(groups)) return;
    let maxId = groups.reduce((max, group) => Math.max(max, Number.isFinite(group.id) ? group.id : -Infinity), 0);
    groups.forEach(group => {
        if (!Number.isFinite(group.id)) {
            group.id = ++maxId;
        }
    });
    idCount = maxId + 1;
}

// normalHeight is defined in config.js as CONFIG.NORMAL_HEIGHT
let normalHeight = CONFIG.NORMAL_HEIGHT;
let allGroups = [];
let pastGroups = [];
let redoGroups = [];
let title = null;
let currentNoteIsSummary = false; // Track if current note is a summary note

//parameters for viewport offset
let viewportOffset = { x: 0, y: 0 }; // default viewport offset
//screenbox is the coordinate of the rectangle of the viewport
let screenBox = {
    x: viewportOffset.x,
    y: viewportOffset.y,
    w: window.innerWidth,
    h: window.innerHeight
};

//parameters for moving
let movingToggle = false; // Toggle for moving mode
let dxRecord = 0;
let dyRecord = 0;
let movingColor = null;
let moveStartX = null;
let moveStartY = null;

//parameters for copy/paste
let clipboard = null; // Stores copied strokes
let pasteMode = false; // Toggle for paste-move mode
let pastedGroups = []; // Groups being pasted
let pasteBBox = null; // Bounding box of pasted strokes

//parameters for scrolling:
let panningLimit = {left: 0, right:-1, top: 0, bottom: -1}
let isPanning = false;
let panStart = { x: 0, y: 0 };
let isScrollingX = false;
let isScrollingY = false;
let lockedAxis = null; // 'x', 'y', or null

let velocity = { x: 0, y: 0 };
let lastPanPos = { x: 0, y: 0 };
let lastPanTime = 0;
let momentumActive = false;
// friction and minVelocity constants moved to config.js (CONFIG.FRICTION, CONFIG.MIN_VELOCITY)

//parameters for toolbox
let isClosingToolbox = false;
const nav = document.querySelector("#penTools");
let isPointerInside = false;
const toggleBtn = nav.querySelector(".toggle-btn");

let toolLinks = nav.querySelectorAll("span a");
let pointerDownForToolbox = false;

//parameters for detecting holds/movement
let lastPointerX = null;
let lastPointerY = null;
let totalMovement = 0;
// CONFIG.MOVEMENT_THRESHOLD moved to config.js (CONFIG.CONFIG.MOVEMENT_THRESHOLD)

//parameters for scrollbar
const scrollbar = document.getElementById("scrollbar");
const thumb = document.getElementById("thumb");
const viewportHeight = window.innerHeight;
let lockScroll = false;
let maxHeightObj = null;
let contentHeight = null;
let thumbHeight = null;
// countdownSeconds moved to config.js (CONFIG.COUNTDOWN_SECONDS)
let remaining = CONFIG.COUNTDOWN_SECONDS;
let timer = null;

//parameters for eraser
let eraserMode = false;
let erasedGroups = [];
let eraserSize = CONFIG.DEFAULT_ERASER_SIZE;
let eraserBox = {
    x: 0,
    y: 0,
    w: eraserSize,
    h: eraserSize
};
let erasing = false;

//parameters for folder
let selectedFolder = null;

//parameters for autoshape
let shapeMode = false;
let shapeStartX = null;
let shapeStartY = null;
let predictedShape = -1;

const shortcutGroup = [STROKE_TYPE.SQUAREBRACKET, STROKE_TYPE.WAVYBRACKET, STROKE_TYPE.CIRCLEBRACKET];

//parameters for tools/colors setting
let defaultPenColor = CONFIG.DEFAULT_PEN_COLOR; // Can be changed at runtime
let defaultPenType = STROKE_TYPE.NONE;

//parameters for google sync
const accessToken = localStorage.getItem("accessToken");
const userEmail = localStorage.getItem("userEmail");
const userName = localStorage.getItem("userName");

//parameters for canvas
const canvasGroup = document.querySelector(".canvasGroup");
const liveCanvas = document.getElementById("liveCanvas");
const drawCanvas = document.getElementById("drawCanvas");
const backgroundCanvas = document.getElementById("backgroundCanvas");

let drawCtx = setupHiDPICanvas(drawCanvas);
let liveCtx = setupHiDPICanvas(liveCanvas);
let backgroundCtx = setupHiDPICanvas(backgroundCanvas);

let isDetectionOn = true;



//-----------functions for stickynotes and hyperlink---------
function flashStickyNote(note) {
  const originalColor = note.color;
  note.color = "#FFD700"; // highlight gold
  reDrawAll(drawCtx);

  setTimeout(() => {
    note.color = originalColor;
    reDrawAll(drawCtx);
  }, 200);
}

function flashLink(link) {
  const originalColor = link.color;
  link.color = "#00b7ff";
  reDrawAll(drawCtx);

  setTimeout(() => {
    link.color = originalColor;
    reDrawAll(drawCtx);
  }, 200);
}

//-----------functions for copy/paste---------
function drawPastePreview() {
  if (!pasteMode || pastedGroups.length === 0) return;

  liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
  liveCtx.save();
  liveCtx.translate(-viewportOffset.x, -viewportOffset.y);

  // Draw dashed bounding box (without label, we'll draw it separately)
  if (pasteBBox) {
    const padding = 8;
    const boxWithPadding = {
      x: pasteBBox.x - padding,
      y: pasteBBox.y - padding,
      w: pasteBBox.w + padding * 2,
      h: pasteBBox.h + padding * 2
    };
    drawBox(boxWithPadding, 'rgba(144, 144, 144, 0.7)', '', true, liveCtx);

    // Draw label within box width with text wrap
    const label = 'Hold and drag to move, click outside to paste';
    const maxWidth = boxWithPadding.w;
    const lineHeight = 16;
    liveCtx.font = '200 14px "Mali"';
    liveCtx.fillStyle = 'rgba(200, 200, 200, 0.9)';

    // Wrap text into lines that fit within maxWidth
    const words = label.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      if (liveCtx.measureText(testLine).width <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);

    // Draw lines centered above the box
    const totalHeight = lines.length * lineHeight;
    lines.forEach((line, i) => {
      const lineWidth = liveCtx.measureText(line).width;
      const textX = boxWithPadding.x + (maxWidth - lineWidth) / 2;
      const textY = boxWithPadding.y - totalHeight + (i * lineHeight) - 4;
      liveCtx.fillText(line, textX, textY);
    });
  }

  // Draw the pasted strokes (like move feature uses drawStroke)
  pastedGroups.forEach(group => {
    if (group.type === 'text') {
      drawTextGroup(liveCtx, group);
    } else if (group.predictedLabel === STROKE_TYPE.HIGHLIGHT) {
      drawHighlight(liveCtx, group.bbox, group.color);
    } else {
      drawStroke(liveCtx, group.stroke, group.color, 2);
    }
  });

  liveCtx.restore();
}

function isPointInPasteBBox(worldX, worldY) {
  if (!pasteBBox) return false;
  const padding = 8;
  return (
    worldX >= pasteBBox.x - padding &&
    worldX <= pasteBBox.x + pasteBBox.w + padding &&
    worldY >= pasteBBox.y - padding &&
    worldY <= pasteBBox.y + pasteBBox.h + padding
  );
}

function finalizePaste() {
  if (!pasteMode || pastedGroups.length === 0) return;

  // Add pasted groups to allGroups
  pastedGroups.forEach(group => {
    allGroups.push(group);
  });

  // Save to undo history
  pastGroups.push({
    change: 'paste',
    modifiedGroups: [...pastedGroups],
    dx: dxRecord,
    dy: dyRecord
  });

  // Reset paste state
  pasteMode = false;
  pastedGroups = [];
  pasteBBox = null;
  dxRecord = 0;
  dyRecord = 0;
  moveStartX = null;
  moveStartY = null;

  liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
  reDrawAll(drawCtx);
  if (title) saveNote(title, allGroups, null, { isSummaryNote: currentNoteIsSummary });
}

function cancelPaste() {
  pasteMode = false;
  pastedGroups = [];
  pasteBBox = null;
  dxRecord = 0;
  dyRecord = 0;
  moveStartX = null;
  moveStartY = null;
  liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
  reDrawAll(drawCtx);
}

//-----------functions for tape (flashcard cover)---------
let currentTapePreset = 'polkadot'; // Default preset
let lastTapeClickTime = 0;
let lastTapeClickTarget = null;

// Text block click tracking for double-click detection
let lastTextClickTime = 0;
let lastTextClickTarget = null;

function flashTape(tape) {
  const originalColor = tape.borderColor;
  tape.borderColor = CONFIG.COLORS.FLASH_TAPE;
  reDrawAll(drawCtx);

  setTimeout(() => {
    tape.borderColor = originalColor;
    reDrawAll(drawCtx);
  }, CONFIG.FLASH_DURATION);
}

// Toggle tape reveal state with fade animation
function toggleTapeReveal(tape) {
  tape.revealed = !tape.revealed;
  tape.fadeProgress = 0;

  // Animate fade
  const startTime = performance.now();
  const duration = CONFIG.TAPE.FADE_DURATION;

  function animateFade(currentTime) {
    const elapsed = currentTime - startTime;
    tape.fadeProgress = Math.min(elapsed / duration, 1);
    reDrawAll(drawCtx);

    if (tape.fadeProgress < 1) {
      requestAnimationFrame(animateFade);
    } else {
      tape.fadeProgress = 1;
      if (tape.revealed) {
        flashTape(tape);
      }
      // Save after toggle
      if (title) saveNote(title, allGroups, null, { isSummaryNote: currentNoteIsSummary });
    }
  }

  requestAnimationFrame(animateFade);
}

// Remove tape permanently
function removeTape(tape) {
  const index = allGroups.findIndex(g => g.id === tape.id);
  if (index !== -1) {
    // Deep clone for undo before deletion
    pastGroups.push({
      change: 'delete',
      modifiedGroups: [structuredClone(allGroups[index])]
    });

    allGroups.splice(index, 1);
    reDrawAll(drawCtx);
    if (title) {
      saveNote(title, allGroups, null, { isSummaryNote: currentNoteIsSummary });
      // Trigger flashcard scan after tape removal
      if (typeof scanNotebookForFlashcards === 'function' && selectedFolder) {
        scanNotebookForFlashcards(selectedFolder).then(flashcards => {
          if (typeof updateFlashcardButton === 'function') {
            updateFlashcardButton(flashcards);
          }
        });
      }
    }
  }
}

// Sync tape stored copies with current state of covered groups
function syncTapeCoveredData() {
  allGroups.forEach(tape => {
    if (tape.type !== "tape" || !tape.coveredGroupIds) return;

    // Rebuild stroke and text copies from the original covered groups
    const newStrokes = [];
    const newTextBlocks = [];

    tape.coveredGroupIds.forEach(id => {
      const original = allGroups.find(g => g.id === id);
      if (!original) return;

      if (original.type === 'text') {
        newTextBlocks.push({
          text: original.text,
          fontFamily: original.fontFamily,
          fontSize: original.fontSize,
          color: original.color,
          bbox: { ...original.bbox },
          opacity: original.opacity
        });
      } else if (original.stroke && original.stroke.length >= 2) {
        newStrokes.push({
          path: original.stroke,
          color: original.color,
          size: original.size || 2
        });
      }
    });

    tape.stroke = newStrokes;
    tape.textBlocks = newTextBlocks;
  });
}

// Generate pattern canvas for tape preset
function generateTapePattern(preset, size = CONFIG.TAPE.PATTERN_SIZE) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const presetData = CONFIG.TAPE.PRESETS.find(p => p.id === preset) || CONFIG.TAPE.PRESETS[0];
  const { color1, color2 } = presetData;

  // Fill background
  ctx.fillStyle = color1;
  ctx.fillRect(0, 0, size, size);

  switch (preset) {
    case 'polkadot':
      ctx.fillStyle = color2;
      const dotRadius = size / 6;
      // Center dot
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, dotRadius, 0, Math.PI * 2);
      ctx.fill();
      // Corner dots (quarter visible)
      ctx.beginPath();
      ctx.arc(0, 0, dotRadius, 0, Math.PI * 2);
      ctx.arc(size, 0, dotRadius, 0, Math.PI * 2);
      ctx.arc(0, size, dotRadius, 0, Math.PI * 2);
      ctx.arc(size, size, dotRadius, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'stripes':
      ctx.strokeStyle = color2;
      ctx.lineWidth = size / 4;
      for (let i = -size; i < size * 2; i += size / 3) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + size, size);
        ctx.stroke();
      }
      break;

    case 'stars':
      ctx.fillStyle = color2;
      const drawStar = (cx, cy, r) => {
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
          const x = cx + r * Math.cos(angle);
          const y = cy + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
      };
      drawStar(size / 2, size / 2, size / 4);
      drawStar(0, 0, size / 6);
      drawStar(size, size, size / 6);
      break;

    case 'hearts':
      ctx.fillStyle = color2;
      const drawHeart = (cx, cy, s) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy + s / 4);
        ctx.bezierCurveTo(cx, cy, cx - s / 2, cy, cx - s / 2, cy + s / 4);
        ctx.bezierCurveTo(cx - s / 2, cy + s / 2, cx, cy + s * 0.7, cx, cy + s * 0.7);
        ctx.bezierCurveTo(cx, cy + s * 0.7, cx + s / 2, cy + s / 2, cx + s / 2, cy + s / 4);
        ctx.bezierCurveTo(cx + s / 2, cy, cx, cy, cx, cy + s / 4);
        ctx.fill();
      };
      drawHeart(size / 2, size / 4, size / 2);
      break;

    case 'confetti':
      const colors = [color1, color2, '#ffffff', '#ffd700'];
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = colors[i % colors.length];
        ctx.save();
        ctx.translate(Math.random() * size, Math.random() * size);
        ctx.rotate(Math.random() * Math.PI);
        ctx.fillRect(-3, -6, 6, 12);
        ctx.restore();
      }
      break;

    case 'zigzag':
      ctx.strokeStyle = color2;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let y = 0; y < size; y += size / 4) {
        for (let x = 0; x <= size; x += size / 8) {
          const yOffset = (x / (size / 8)) % 2 === 0 ? 0 : size / 8;
          if (x === 0) ctx.moveTo(x, y + yOffset);
          else ctx.lineTo(x, y + yOffset);
        }
      }
      ctx.stroke();
      break;

    default:
      // Solid color fallback
      break;
  }

  return canvas;
}

// Cache for tape patterns
const tapePatternCache = new Map();

// -------------------- CONSTANTS (now in config.js) --------------------
// TOOL_ID, TOOL_REGISTRY, PEN_TYPES are defined in config.js

const DEFAULT_MODIFIERS = {
    defaultPen: {label: "Default Pen", color: "#ffffff", penType: PEN_TYPES.NORMAL, size: 2.5, visibility: true},
    box: { label: "Box", color: "#ffb6ff", penType: PEN_TYPES.NORMAL, size: 2.5, visibility: true },
    curly: { label: "Curly", color: "#fa6e6e", penType: PEN_TYPES.NORMAL, size: 2.5, visibility: true },
    squarebracket: { label: "Square Bracket", color: "#a3fba9", penType: PEN_TYPES.NORMAL, size: 2.5, visibility: false},
    wavybracket: { label: "Wavy Bracket", color: "#74d8ff", penType: PEN_TYPES.NORMAL, size: 2.5, visibility: false},
    circlebracket: { label: "Circle Bracket", color: "#ffc5d3", penType: PEN_TYPES.NORMAL, size: 2.5, visibility: false},
    backgroundCanvas: {canvasSetting: true, backgroundColor: "#201f1e", gridLineColor: "#153b57", gridWidth: 58, gridStyle: "square"},
    syncBracketToolboxes: true,
    syncStrokeSize: false,
}; 

const DEFAULT_TOOLBOX_LAYOUT = {
  press: [
    { id: TOOL_ID.ERASER, color: "#ffffff", size: 2},
    { id: TOOL_ID.PEN, color: "#ffffff", size: 2},
    { id: TOOL_ID.PEN, color: "#a3fba9", size: 3 },
    { id: TOOL_ID.PEN, color: "#ff9a52", size: 2 },
    { id: TOOL_ID.HIGHLIGHT, color: "#9095fe", size: 30 },
    { id: TOOL_ID.HIGHLIGHT, color: "#fefe58", size: 30},
    { id: TOOL_ID.MEDIA, color: "#ffffff", size: 2},
    { id: TOOL_ID.PASTE, color: "#ffffff", size: 2 },
  ],
  underline: [
    { id: TOOL_ID.TITLE1, color: "#f4c64a", visibility: true , size: 3},
    { id: TOOL_ID.TITLE2, color: "#ff9a52", visibility: true, size: 3 },
    { id: TOOL_ID.TITLE3, color: "#ffbb8a", visibility: false, size: 2.8 },
    { id: TOOL_ID.HIGHLIGHT, color: "#fefe58", size: 2 },
    { id: TOOL_ID.TAPE, color: "#ffffff", size: 2, tapePreset: "confetti" },
    { id: TOOL_ID.BOLD_DEFAULT, color: "#ffffff", size: 2 },
    { id: TOOL_ID.BOLD_CUSTOM, color: "#fa6e6e", visibility: true, size: 2 },
    { id: TOOL_ID.PEN, color: "#74d8ff", size: 2 }
  ],
  box: [
    { id: TOOL_ID.DELETE, color: "#ffffff", size: 2 },
    { id: TOOL_ID.MOVE, color: "#ffffff", size: 2 },
    { id: TOOL_ID.STICKY, color: "#ffffff", size: 2 },
    { id: TOOL_ID.LINK, color: "#ffffff", size: 2 },
    { id: TOOL_ID.REMINDER, color: "#ff6b6b", size: 2 },
    { id: TOOL_ID.TAPE, color: "#ff69b4", size: 2, tapePreset: "polkadot" },
    { id: TOOL_ID.COPY, color: "#ffffff" , size: 2},
    { id: TOOL_ID.PASTE, color: "#ffffff" , size: 2},
  ],
   curly: [
    { id: TOOL_ID.BOLD_DEFAULT, color: "#ffffff", size: 2 },
    { id: TOOL_ID.BOLD_CUSTOM, color: "#55ffd7ff", size: 4 },
    { id: TOOL_ID.PEN, color: "#ffffff", size: 2.5, visibility: false},
    { id: TOOL_ID.TAPE, color: "#ffffff", size: 2, tapePreset: "stripes" },
    { id: TOOL_ID.REMINDER, color: "#ff6b6b", size: 2 },
    { id: TOOL_ID.TAPE, color: "#ffffff", size: 2, tapePreset: "hearts" },
    { id: TOOL_ID.TAPE, color: "#ffffff", size: 2, tapePreset: "confetti" },
    { id: TOOL_ID.TAPE, color: "#ffffff", size: 2, tapePreset: "zigzag" },
  ],
  squareBracket: [
    { id: TOOL_ID.PEN, color: "#ffffff", size: 2.5},
    { id: TOOL_ID.PEN, color: "#ffffff", size: 3.5},
    { id: TOOL_ID.PEN, color: "#a3fba9", size: 2.5 },
    { id: TOOL_ID.PEN, color: "#74d8ff", size: 2.5 },
    { id: TOOL_ID.PEN, color: "#fa6e6e", size: 2.5 },
    { id: TOOL_ID.TITLE1, color: "#f4c64a", size: 3},
    { id: TOOL_ID.COPY, color: "#ffffff", size: 2},
    { id: TOOL_ID.DELETE, color: "#ffffff", size: 2 },
  ],
  wavyBracket: [
    { id: TOOL_ID.PEN, color: "#ff0000", size: 2.5},
    { id: TOOL_ID.PEN, color: "#ff7700", size: 2.5 },
    { id: TOOL_ID.PEN, color: "#fff700", size: 2.5 },
    { id: TOOL_ID.PEN, color: "#00ff4c", size: 2.5 },
    { id: TOOL_ID.PEN, color: "#000dff", size: 2.5},
    { id: TOOL_ID.PEN, color: "#6200ff", size: 2.5 },
    { id: TOOL_ID.PEN, color: "#bf00ff", size: 2.5 },
    { id: TOOL_ID.PEN, color: "#ff3a51", size: 2.5 },
  ],
  circleBracket: [
    { id: TOOL_ID.ERASER, color: "#ffffff", size: 2.5},
    { id: TOOL_ID.PEN, color: "#ffa0a0", size: 2.5},
    { id: TOOL_ID.PEN, color: "#ffcd8b", size: 2.5 },
    { id: TOOL_ID.PEN, color: "#ffe190", size: 2.5 },
    { id: TOOL_ID.PEN, color: "#92ffa6", size: 2.5 },
    { id: TOOL_ID.TITLE3, color: "#91f6ff", size: 2.5},
    { id: TOOL_ID.COPY, color: "#ffb1de", size: 2.5},
    { id: TOOL_ID.DELETE, color: "#ffffff", size: 2.5 },
  ],
};
// -------------------- GLOBAL STATE --------------------
let modifiers = {};
let toolboxLayout = {};
let colorTools = [];
let underlineTools = [];
let boxTools = [];

// -------------------- STROKE SIZE PRESETS --------------------
const STROKE_SIZE_PRESETS = [
    { label: "Hair", size: 0.5 },
    { label: "Fine", size: 1 },
    { label: "Thin", size: 1.5 },
    { label: "Regular", size: 2.5 },
    { label: "Medium", size: 4 },
    { label: "Thick", size: 6 },
    { label: "Bold", size: 10 }
];

let syncStrokeSizeEnabled = false;
let syncBracketToolboxesEnabled = false;

// -------------------- CREATE MODIFIER CARD --------------------
function createModifierCard(id, mod) {
  const card = document.createElement("div");
  card.className = "modifier-card";
  card.dataset.modifier = id;

  const isDefaultPen = mod.label === "Default Pen";
  const showStrokeDropdown = isDefaultPen || !syncStrokeSizeEnabled;

  // Find matching preset or use custom
  const currentSize = mod.size || 2.5;
  const matchingPreset = STROKE_SIZE_PRESETS.find(p => p.size === currentSize);
  const isCustomSize = !matchingPreset;

  card.innerHTML = `
    <div class="modifier-title">${mod.label}</div>
    <label>Color:</label>
    <input type="color" class="modifier-color" value="${mod.color}" ${isDefaultPen ? "id='defaultPen'" : ""}>
    <div class="stroke-size-section" ${!showStrokeDropdown ? 'style="display:none;"' : ''}>
      <label>Stroke size:</label>
      <div class="stroke-dropdown-container">
        <button class="stroke-dropdown-btn" type="button">
          <span class="stroke-preview-line" style="height: ${currentSize}px;"></span>
          <span class="stroke-label">${matchingPreset ? matchingPreset.label : 'Custom'} (${currentSize})</span>
          <span class="dropdown-arrow">▼</span>
        </button>
        <div class="stroke-dropdown-menu">
          ${STROKE_SIZE_PRESETS.map(p => `
            <div class="stroke-option ${p.size === currentSize ? 'selected' : ''}" data-size="${p.size}">
              <span class="stroke-preview-line" style="height: ${p.size}px;"></span>
              <span class="stroke-label">${p.label} (${p.size})</span>
            </div>
          `).join('')}
          <div class="stroke-option stroke-custom-option ${isCustomSize ? 'selected' : ''}" data-size="custom">
            <span class="stroke-label">Custom...</span>
          </div>
        </div>
      </div>
      <div class="custom-stroke-input" style="display: ${isCustomSize ? 'flex' : 'none'};">
        <input type="number" class="custom-size-input" min="0.4" max="30" step="0.1" value="${currentSize}" placeholder="0.4-30">
        <span class="custom-size-unit">px</span>
      </div>
    </div>
    <div class="modifier-footer">
      <label>Visibility:</label>
      <label class="toggle-switch">
        <input type="checkbox" ${mod.visibility ? "checked" : ""}>
        <span class="slider"></span>
      </label>
    </div>
  `;

  if (isDefaultPen) {
    card.style.backgroundColor = "#142231ff";
    penSize = mod.size;
    defaultPenColor = mod.color;
  }

  console.log('mod', mod);

  if (isDefaultPen || mod?.label?.includes("Shortcut")) {
    card.querySelector(".modifier-footer").style.display = "none";
  }

  // Dropdown functionality
  const dropdownBtn = card.querySelector(".stroke-dropdown-btn");
  const dropdownMenu = card.querySelector(".stroke-dropdown-menu");
  const customInput = card.querySelector(".custom-stroke-input");
  const customSizeInput = card.querySelector(".custom-size-input");
  const strokeOptions = card.querySelectorAll(".stroke-option");

  function updateStrokeDisplay(size, label) {
    const previewLine = dropdownBtn.querySelector(".stroke-preview-line");
    const labelSpan = dropdownBtn.querySelector(".stroke-label");
    previewLine.style.height = `${size}px`;
    labelSpan.textContent = `${label} (${size})`;
  }

  function setStrokeSize(size) {
    mod.size = size;
    if (isDefaultPen) {
      penSize = size;
      // If sync is enabled, update all other modifiers
      if (syncStrokeSizeEnabled) {
        syncAllModifierSizes(size);
      }
    }
    updateTools();
  }

  // Toggle dropdown
  dropdownBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = dropdownMenu.classList.contains("show");
    // Close all other dropdowns first
    document.querySelectorAll(".stroke-dropdown-menu.show").forEach(menu => {
      menu.classList.remove("show");
    });
    if (!isOpen) {
      dropdownMenu.classList.add("show");
    }
  });

  // Handle option selection
  strokeOptions.forEach(option => {
    option.addEventListener("click", (e) => {
      e.stopPropagation();
      const size = option.dataset.size;

      // Remove selected from all
      strokeOptions.forEach(opt => opt.classList.remove("selected"));
      option.classList.add("selected");

      if (size === "custom") {
        customInput.style.display = "flex";
        dropdownMenu.classList.remove("show");
        customSizeInput.focus();
      } else {
        const numSize = parseFloat(size);
        const preset = STROKE_SIZE_PRESETS.find(p => p.size === numSize);
        customInput.style.display = "none";
        updateStrokeDisplay(numSize, preset.label);
        setStrokeSize(numSize);
        dropdownMenu.classList.remove("show");
      }
    });
  });

  // Custom size input handling
  customSizeInput.addEventListener("input", (e) => {
    let val = parseFloat(e.target.value);
    if (isNaN(val)) return;
    val = Math.min(30, Math.max(0.4, val));
    updateStrokeDisplay(val, "Custom");
    setStrokeSize(val);
  });

  customSizeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.target.blur();
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", () => {
    dropdownMenu.classList.remove("show");
  });

  return card;
}

// Sync all modifier sizes to the default pen size
function syncAllModifierSizes(size) {
  Object.keys(modifiers).forEach(key => {
    const mod = modifiers[key];
    if (!mod.canvasSetting && mod.label !== "Default Pen") {
      mod.size = size;
    }
  });
}

// -------------------- RENDER / BIND UI --------------------
function renderModifiers(mods = modifiers) {
  const grid = document.getElementById("modifierGrid");
  if (!grid) return console.warn("No modifier grid found");
  grid.innerHTML = "";

  // Update sync toggle state
  const syncToggle = document.getElementById("syncStrokeSize");
  if (syncToggle) {
    syncToggle.checked = syncStrokeSizeEnabled;
  }
  Object.entries(mods).forEach(([id, mod]) => {
    if (!mod.canvasSetting && mod.label) {
        grid.appendChild(createModifierCard(id, mod));
    } else if (mod.canvasSetting){
        backgroundColor = mod.backgroundColor;
        gridLineColor = mod.gridLineColor;
        backgroundColorPicker.value = mod.backgroundColor;
        gridLineColorPicker.value = mod.gridLineColor;
        setGridSize(mod.gridWidth);

        backgroundColorPicker.oninput = () => {
            backgroundColor = backgroundColorPicker.value; 
            mod.backgroundColor = backgroundColor;
            drawGrid(backgroundCtx); 
            updateTools()
        };
        gridLineColorPicker.oninput = () => {
            gridLineColor = gridLineColorPicker.value; 
            mod.gridLineColor = gridLineColor;
            drawGrid(backgroundCtx); 
            updateTools();
        };

        // Slider → number
        gridSlider.addEventListener("input", e => {
            setGridSize(e.target.value);
            mod.gridWidth = clamp(Number(e.target.value) || MIN);
            updateTools();
        });

        // Number typing → slider
        gridInput.addEventListener("input", e => {
            setGridSize(e.target.value);
            mod.gridWdith = e.target.value; 
            updateTools();
        });

        // Commit on Enter
        gridInput.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            e.target.blur();
        }
        });

        // Grid style selection
        gridStyle = mod.gridStyle || "square";
        const gridStyleLineBtn = document.getElementById("gridStyleLine");
        const gridStyleSquareBtn = document.getElementById("gridStyleSquare");

        // Set initial active state based on saved gridStyle
        if (gridStyle === "line") {
            gridStyleLineBtn?.classList.add("active");
            gridStyleSquareBtn?.classList.remove("active");
        } else {
            gridStyleLineBtn?.classList.remove("active");
            gridStyleSquareBtn?.classList.add("active");
        }

        // Redraw grid with loaded style
        drawGrid(backgroundCtx);

        // Handle grid style button clicks
        gridStyleLineBtn?.addEventListener("click", () => {
            gridStyle = "line";
            mod.gridStyle = "line";
            gridStyleLineBtn.classList.add("active");
            gridStyleSquareBtn?.classList.remove("active");
            drawGrid(backgroundCtx);
            updateTools();
        });

        gridStyleSquareBtn?.addEventListener("click", () => {
            gridStyle = "square";
            mod.gridStyle = "square";
            gridStyleSquareBtn.classList.add("active");
            gridStyleLineBtn?.classList.remove("active");
            drawGrid(backgroundCtx);
            updateTools();
        });
    }
  });
  bindModifierUI(mods);
}

function bindModifierUI(mods = modifiers) {
  document.querySelectorAll(".modifier-card").forEach(card => {
    const id = card.dataset.modifier;
    const mod = mods[id];
    if (!mod) return;

    const colorInput = card.querySelector(".modifier-color");
    const penTypeSelect = card.querySelector(".modifier-penType");
    const visibilityCheckbox = card.querySelector("input[type=checkbox]");

    if (colorInput) colorInput.oninput = () => { mod.color = colorInput.value; updateTools(); };
    if (penTypeSelect) penTypeSelect.onchange = () => { mod.penType = penTypeSelect.value; updateTools(); };
    if (visibilityCheckbox) visibilityCheckbox.onchange = () => { mod.visibility = visibilityCheckbox.checked; updateTools(); };
  });
}

function updateTools() {
    saveToolboxSettings({
        modifiers,
        toolboxLayout,
        syncStrokeSize: syncStrokeSizeEnabled,
        syncBracketToolboxes: syncBracketToolboxesEnabled
    });
}

/**
 * Reset modifier styles to default settings
 */
function resetModifiersToDefault() {
    if (!confirm("Are you sure you want to reset all Modifier Styles to default?\n\nThis will reset all modifier colors, sizes, and visibility settings. All your customizations will be lost.")) {
        return;
    }

    // Reset modifiers to defaults (deep clone to avoid reference issues)
    modifiers = structuredClone(DEFAULT_MODIFIERS);

    // Reset sync settings
    syncStrokeSizeEnabled = false;
    const syncCheckbox = document.getElementById("syncStrokeSize");
    if (syncCheckbox) syncCheckbox.checked = false;

    // Apply background settings from defaults
    const bgSettings = modifiers.backgroundCanvas;
    backgroundColor = bgSettings.backgroundColor;
    gridLineColor = bgSettings.gridLineColor;
    gridStyle = bgSettings.gridStyle || "square";

    // Update color pickers
    backgroundColorPicker.value = bgSettings.backgroundColor;
    gridLineColorPicker.value = bgSettings.gridLineColor;

    // Update grid size
    setGridSize(bgSettings.gridWidth);

    // Update grid style buttons
    const gridStyleLineBtn = document.getElementById("gridStyleLine");
    const gridStyleSquareBtn = document.getElementById("gridStyleSquare");
    if (gridStyle === "line") {
        gridStyleLineBtn?.classList.add("active");
        gridStyleSquareBtn?.classList.remove("active");
    } else {
        gridStyleLineBtn?.classList.remove("active");
        gridStyleSquareBtn?.classList.add("active");
    }

    // Redraw the grid
    drawGrid(backgroundCtx);

    // Re-render the modifiers UI
    renderModifiers(modifiers);

    // Save the reset settings
    updateTools();
}

/**
 * Reset toolbox styles to default settings
 */
function resetToolboxToDefault() {
    if (!confirm("Are you sure you want to reset all Toolbox Styles to default?\n\nThis will reset all tool colors, sizes, visibility, and tape presets in every toolbox. All your customizations will be lost.")) {
        return;
    }

    // Reset toolbox layout to defaults (deep clone to avoid reference issues)
    toolboxLayout = structuredClone(DEFAULT_TOOLBOX_LAYOUT);

    // Reset sync bracket toolboxes setting
    syncBracketToolboxesEnabled = true;
    const syncBracketCheckbox = document.getElementById("syncBracketToolboxes");
    if (syncBracketCheckbox) syncBracketCheckbox.checked = true;

    // Re-render the toolboxes UI
    renderTools();

    // Save the reset settings
    updateTools();
}

// -------------------- TOOLBOX --------------------
function assignToolBox() {
  colorTools = toolboxLayout.color.map(t => ({
    icon: TOOL_REGISTRY[t.id]?.icon ?? "",
    label: t.id,
    color: t?.color ?? "#ffffff", 
    visibility: t?.visibility ?? false,
  }));

  underlineTools = toolboxLayout.underline.map(t => ({
    icon: TOOL_REGISTRY[t.id]?.icon ?? "",
    label: t.id,
    color: t?.color ?? "#ffffff", 
    visibility: t?.visibility ?? false,
  }));

  boxTools = toolboxLayout.box.map(t => ({
    icon: TOOL_REGISTRY[t.id]?.icon ?? "",
    label: t.id,
    color: t?.color ?? "#ffffff", 
    visibility: t?.visibility ?? false,
  }));

}

const container = document.getElementById("toolboxes");

/**
 * Get the effective customization flags for a tool in a specific toolbox context.
 * Handles contextual overrides (e.g., highlight has different settings in press vs other toolboxes).
 * @param {string} toolId - The tool ID (e.g., "pen", "highlight")
 * @param {string} toolboxId - The toolbox context (e.g., "press", "underline", "box", "curly")
 * @returns {object} - { colorCustomizable, sizeCustomizable, visibilityCustomizable, tapePresetCustomizable }
 */
function getToolCustomization(toolId, toolboxId) {
    const registry = TOOL_REGISTRY[toolId];
    if (!registry) {
        return {
            colorCustomizable: false,
            sizeCustomizable: false,
            visibilityCustomizable: false,
            tapePresetCustomizable: false
        };
    }

    // Start with base values
    let result = {
        colorCustomizable: registry.colorCustomizable ?? false,
        sizeCustomizable: registry.sizeCustomizable ?? false,
        visibilityCustomizable: registry.visibilityCustomizable ?? false,
        tapePresetCustomizable: registry.tapePresetCustomizable ?? false
    };

    // Apply contextual overrides if present
    if (registry.contextual) {
        const contextOverrides = registry.contextual[toolboxId] || registry.contextual.default || {};
        result = { ...result, ...contextOverrides };
    }

    return result;
}

/**
 * Update the tool settings popup to show/hide controls based on customization flags.
 * @param {HTMLElement} popup - The popup element
 * @param {object} customization - Result from getToolCustomization()
 */
function applyToolCustomization(popup, customization) {
    const colorLabel = popup.querySelector("#colorLabel");
    const colorPicker = popup.querySelector("#colorPicker");
    const sizeSection = popup.querySelector("#sizeSection");
    const footer = popup.querySelector(".modifier-footer");
    const customizable = popup.querySelector("#customizable");
    const tapePresets = popup.querySelector("#tapePresets");

    const hasAnyStandardCustomization =
        customization.colorCustomizable ||
        customization.sizeCustomizable ||
        customization.visibilityCustomizable;

    // Show/hide the main customizable section
    if (customizable) {
        customizable.style.display = hasAnyStandardCustomization ? "block" : "none";
    }

    // Show/hide individual controls
    if (colorLabel) colorLabel.style.display = customization.colorCustomizable ? "block" : "none";
    if (colorPicker) colorPicker.style.display = customization.colorCustomizable ? "block" : "none";
    if (sizeSection) sizeSection.style.display = customization.sizeCustomizable ? "block" : "none";
    if (footer) footer.style.display = customization.visibilityCustomizable ? "flex" : "none";

    // Show/hide tape presets
    if (tapePresets) {
        tapePresets.style.display = customization.tapePresetCustomizable ? "block" : "none";
    }
}

async function renderTools() {
    const container = document.getElementById("toolboxes");
    if (container) container.innerHTML = "";

    // Update sync bracket toggle state
    const syncBracketToggle = document.getElementById("syncBracketToolboxes");
    if (syncBracketToggle) {
        syncBracketToggle.checked = syncBracketToolboxesEnabled;
    }

    Object.entries(toolboxLayout).forEach(([id, tools]) => {
        const dial = document.createElement("div");
        dial.className = "toolbox-dial";

        // Check if this is a synced bracket toolbox
        const isSyncedBracket = syncBracketToolboxesEnabled &&
            (id === "wavyBracket" || id === "circleBracket");

        const title = document.createElement("div");
        title.className = "toolbox-title";

        if (id != 'underline' && id != 'press') {
          const img = document.createElement("img");
          img.src = `assets/${id}.png`;
          img.alt = id;
          img.className = "toolbox-title-icon"; // optional for styling

          title.appendChild(img);
          dial.appendChild(title); 
        } else {
          const title = document.createElement("div");
          title.className = "toolbox-title";
          title.innerText = id;
          dial.appendChild(title);
        }
    

        // Add sync overlay for synced bracket toolboxes
        if (isSyncedBracket) {
            const syncOverlay = document.createElement("div");
            syncOverlay.className = "toolbox-sync-overlay";
            syncOverlay.innerHTML = `
                <div class="sync-overlay-content">
                    <i class='bx bx-link'></i>
                    <span>Synced to Square Bracket</span>
                    <small>Disable sync to customize</small>
                </div>
            `;
            dial.appendChild(syncOverlay);
        }

        const radius = 85;
        const center = 125; // Half of 250px dial width
        const toolHalfSize = 25;
        const toolCount = tools.length;

        Object.entries(tools).forEach(([index, tool]) => {
            const angle = (index / toolCount) * 2 * Math.PI + (Math.PI/2);
            const x = radius * Math.cos(angle);
            const y = radius * Math.sin(angle);

            const toolDiv = document.createElement("div");
            toolDiv.className = "tool";
            toolDiv.style.left = `${center + x - toolHalfSize}px`;
            toolDiv.style.top = `${center + y - toolHalfSize}px`;

            // Use gradient for tape tool (with tool's own preset), solid color for others
            if (tool.id === "tape") {
                const toolPreset = tool.tapePreset || "polkadot";
                const presetData = CONFIG.TAPE.PRESETS.find(p => p.id === toolPreset) || CONFIG.TAPE.PRESETS[0];
                toolDiv.style.background = `linear-gradient(135deg, ${presetData.color1}, ${presetData.color2})`;
            }
            else {
                // Force white for non-colorCustomizable tools
                const toolCustomization = getToolCustomization(tool.id, id);
                if (!toolCustomization.colorCustomizable) {
                    tool.color = "#ffffff";
                }
                toolDiv.style.backgroundColor = tool.color || "#fff";
            }

            // Inner border with thickness based on pen size (0.4-30 → 1.5-11px, sqrt curve, capped at 11px)
            const borderThickness = Math.min(Math.sqrt(tool.size || 2) * 2.46, 11);
            toolDiv.style.boxShadow = `inset 0 0 0 ${borderThickness}px rgba(0, 0, 0, 0.35)`;
            
            const icon = document.createElement('i');
            icon.className = `bx ${TOOL_REGISTRY[tool.id]?.icon ?? ""}`;
            icon.setAttribute('data-label', tool.id);   
            toolDiv.appendChild(icon);

            const popup = document.createElement("div");
            popup.className = "tool-popup";

            toolDiv.appendChild(popup);

            toolDiv.addEventListener("click", function(e) {
                // Get current size and find matching preset
                const currentSize = tool.size || 2;
                const matchingPreset = STROKE_SIZE_PRESETS.find(p => p.size === currentSize);
                const isCustomSize = !matchingPreset;

                popup.innerHTML = `
                    <div class="modifier-title">Tool Settings</div>
                    <label>Tool:</label>
                    <select class="modifier-toolType" id="toolPicker">
                    ${Object.values(TOOLBOX_SELECTION[id]).map(t => `<option value="${t}" ${t === tool.id ? "selected" : ""}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join("")}
                    </select>
                    <div id="customizable">
                    <label id="colorLabel">Color:</label>
                    <input type="color" id="colorPicker" class="modifier-color" value="${tool.color}">
                    <div id="sizeSection" class="stroke-size-section">
                      <label id="sizeLabel">Size:</label>
                      <div class="stroke-dropdown-container">
                        <button class="stroke-dropdown-btn" type="button" id="toolSizeDropdownBtn">
                          <span class="stroke-preview-line" style="height: ${currentSize}px;"></span>
                          <span class="stroke-label">${matchingPreset ? matchingPreset.label : 'Custom'} (${currentSize})</span>
                          <span class="dropdown-arrow">▼</span>
                        </button>
                        <div class="stroke-dropdown-menu" id="toolSizeDropdownMenu">
                          ${STROKE_SIZE_PRESETS.map(p => `
                            <div class="stroke-option ${p.size === currentSize ? 'selected' : ''}" data-size="${p.size}">
                              <span class="stroke-preview-line" style="height: ${p.size}px;"></span>
                              <span class="stroke-label">${p.label} (${p.size})</span>
                            </div>
                          `).join('')}
                          <div class="stroke-option stroke-custom-option ${isCustomSize ? 'selected' : ''}" data-size="custom">
                            <span class="stroke-label">Custom...</span>
                          </div>
                        </div>
                      </div>
                      <div class="custom-stroke-input" id="toolCustomInput" style="display: ${isCustomSize ? 'flex' : 'none'};">
                        <input type="number" class="custom-size-input" id="toolCustomSizeInput" min="0.4" max="30" step="0.1" value="${currentSize}" placeholder="0.4-30">
                        <span class="custom-size-unit">px</span>
                      </div>
                    </div>
                    <div class="modifier-footer">
                        <label id="visibilityLabel">Visible</label>
                        <label class="toggle-switch">
                            <input type="checkbox" ${tool.visibility ? "checked" : ""}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    </div>
                    <div id="tapePresets" style="display: none;">
                        <label>Tape Style:</label>
                        <div class="tape-preset-grid">
                            ${CONFIG.TAPE.PRESETS.map(p => `
                                <button class="tape-preset-btn ${(tool.tapePreset || 'polkadot') === p.id ? 'active' : ''}"
                                        data-preset="${p.id}"
                                        title="${p.name}">
                                    <canvas class="tape-preview-canvas" width="40" height="40"></canvas>
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    <button class="delete-modifier-btn" title="Close">✕</button>
                `;

                // Apply customization flags based on tool and toolbox context
                const customization = getToolCustomization(tool.id, id);
                applyToolCustomization(popup, customization);

                // Render tape preset canvases if tape tool
                if (customization.tapePresetCustomizable) {
                    // Render actual tape patterns on preview canvases
                    popup.querySelectorAll(".tape-preset-btn").forEach(btn => {
                        const presetId = btn.dataset.preset;
                        const canvas = btn.querySelector(".tape-preview-canvas");
                        if (canvas) {
                            const ctx = canvas.getContext("2d");
                            const patternCanvas = generateTapePattern(presetId, 40);
                            ctx.drawImage(patternCanvas, 0, 0);
                        }
                        // Setup click handler
                        btn.addEventListener("click", (e) => {
                            e.stopPropagation();
                            // Remove active from all
                            popup.querySelectorAll(".tape-preset-btn").forEach(b => b.classList.remove("active"));
                            // Add active to clicked
                            btn.classList.add("active");
                            // Update THIS tool's preset (not global)
                            tool.tapePreset = btn.dataset.preset;
                            // Clear pattern cache to regenerate
                            tapePatternCache.clear();
                            // Update dial background with new preset gradient
                            const presetData = CONFIG.TAPE.PRESETS.find(p => p.id === presetId);
                            if (presetData) {
                                toolDiv.style.background = `linear-gradient(135deg, ${presetData.color1}, ${presetData.color2})`;
                            }
                            // Save the toolbox layout with updated preset
                            updateTools();
                        });
                    });
                }

                popup.querySelector('.delete-modifier-btn').onclick = () => {popup.style.display = "none"};

                // popup.style.display = popup.style.display === "block" ? "none" : "block";
                popup.style.display = "flex";
                popup.addEventListener("click", function(e) {
                    e.stopPropagation(); // so clicks inside popup don't close or interfere
                });
                
                const toolInput = popup.querySelector(".modifier-toolType");
                const colorInput = popup.querySelector(".modifier-color");
                const penTypeSelect = popup.querySelector(".modifier-penType");
                const visibilityCheckbox = popup.querySelector("input[type=checkbox]");
                
                if (toolInput) toolInput.oninput = () => {
                    tool.id = toolInput.value;
                    icon.className = `bx ${TOOL_REGISTRY[tool.id]?.icon ?? ""}`;
                    icon.setAttribute('data-label', tool.id);

                    // Get customization flags for the new tool in this toolbox context
                    const newCustomization = getToolCustomization(tool.id, id);
                    applyToolCustomization(popup, newCustomization);

                    // Handle tape tool dial background
                    if (newCustomization.tapePresetCustomizable) {
                        // Set default tape preset if not set
                        if (!tool.tapePreset) tool.tapePreset = "polkadot";
                        // Update dial with gradient background
                        const currentPresetData = CONFIG.TAPE.PRESETS.find(p => p.id === tool.tapePreset) || CONFIG.TAPE.PRESETS[0];
                        toolDiv.style.background = `linear-gradient(135deg, ${currentPresetData.color1}, ${currentPresetData.color2})`;
                        toolDiv.style.backgroundColor = ""; // Clear solid color
                        // Render tape preset previews and setup click handlers
                        popup.querySelectorAll(".tape-preset-btn").forEach(btn => {
                            const presetId = btn.dataset.preset;
                            // Clone and replace to remove old handlers first
                            const newBtn = btn.cloneNode(true);
                            btn.parentNode.replaceChild(newBtn, btn);
                            // Update active state on the new button
                            newBtn.classList.toggle("active", presetId === tool.tapePreset);
                            // Now draw on the cloned canvas (cloneNode doesn't preserve canvas content)
                            const canvas = newBtn.querySelector(".tape-preview-canvas");
                            if (canvas) {
                                const ctx = canvas.getContext("2d");
                                const patternCanvas = generateTapePattern(presetId, 40);
                                ctx.drawImage(patternCanvas, 0, 0);
                            }
                            // Add click handler
                            newBtn.addEventListener("click", (e) => {
                                e.stopPropagation();
                                // Remove active from all
                                popup.querySelectorAll(".tape-preset-btn").forEach(b => b.classList.remove("active"));
                                // Add active to clicked
                                newBtn.classList.add("active");
                                // Update tool's preset
                                tool.tapePreset = newBtn.dataset.preset;
                                // Clear pattern cache
                                tapePatternCache.clear();
                                // Update dial background
                                const newPresetData = CONFIG.TAPE.PRESETS.find(p => p.id === newBtn.dataset.preset);
                                if (newPresetData) {
                                    toolDiv.style.background = `linear-gradient(135deg, ${newPresetData.color1}, ${newPresetData.color2})`;
                                }
                                updateTools();
                            });
                        });
                    } else {
                        // Clear gradient and use solid color for non-tape tools
                        toolDiv.style.background = "";
                        if (newCustomization.colorCustomizable) {
                            tool.color = tool.color || "#ffffff";
                            toolDiv.style.backgroundColor = tool.color;
                            popup.querySelector("#colorPicker").value = tool.color;
                        } else {
                            // Force color to white for non-colorCustomizable tools
                            tool.color = "#ffffff";
                            toolDiv.style.backgroundColor = "#ffffff";
                            popup.querySelector("#colorPicker").value = "#ffffff";
                        }
                    }

                    // Set default size for highlight (fixed at 30) or default for other tools
                    const defaultSize = TOOL_REGISTRY[toolInput.value]?.defaultSize || 2;
                    tool.size = defaultSize;
                    const newPreset = STROKE_SIZE_PRESETS.find(p => p.size === defaultSize);
                    const dropdownBtnEl = popup.querySelector("#toolSizeDropdownBtn");
                    if (dropdownBtnEl) {
                        const previewLine = dropdownBtnEl.querySelector(".stroke-preview-line");
                        const labelSpan = dropdownBtnEl.querySelector(".stroke-label");
                        if (previewLine) previewLine.style.height = `${defaultSize}px`;
                        if (labelSpan) labelSpan.textContent = `${newPreset ? newPreset.label : 'Custom'} (${defaultSize})`;
                    }
                    // Update border thickness
                    const borderThickness = Math.min(Math.sqrt(defaultSize) * 2.46, 11);
                    toolDiv.style.boxShadow = `inset 0 0 0 ${borderThickness}px rgba(0, 0, 0, 0.35)`;
                    updateTools();
                };

                

                // Stroke size dropdown functionality
                const dropdownBtn = popup.querySelector("#toolSizeDropdownBtn");
                const dropdownMenu = popup.querySelector("#toolSizeDropdownMenu");
                const customInput = popup.querySelector("#toolCustomInput");
                const customSizeInput = popup.querySelector("#toolCustomSizeInput");
                const strokeOptions = popup.querySelectorAll(".stroke-option");

                function updateToolSizeDisplay(size, label) {
                    const previewLine = dropdownBtn.querySelector(".stroke-preview-line");
                    const labelSpan = dropdownBtn.querySelector(".stroke-label");
                    previewLine.style.height = `${size}px`;
                    labelSpan.textContent = `${label} (${size})`;
                }

                function setToolSize(size) {
                    tool.size = size;
                    // Update inner border thickness based on new size (0.4-30 → 1.5-11px, sqrt curve, capped at 11px)
                    const borderThickness = Math.min(Math.sqrt(size) * 2.46, 11);
                    toolDiv.style.boxShadow = `inset 0 0 0 ${borderThickness}px rgba(0, 0, 0, 0.35)`;
                    updateTools();
                }

                // Toggle dropdown
                dropdownBtn.addEventListener("click", (ev) => {
                    ev.stopPropagation();
                    const isOpen = dropdownMenu.classList.contains("show");
                    // Close all other dropdowns first
                    document.querySelectorAll(".stroke-dropdown-menu.show").forEach(menu => {
                        menu.classList.remove("show");
                    });
                    if (!isOpen) {
                        dropdownMenu.classList.add("show");
                    }
                });

                // Handle option selection
                strokeOptions.forEach(option => {
                    option.addEventListener("click", (ev) => {
                        ev.stopPropagation();
                        const size = option.dataset.size;

                        // Remove selected from all
                        strokeOptions.forEach(opt => opt.classList.remove("selected"));
                        option.classList.add("selected");

                        if (size === "custom") {
                            customInput.style.display = "flex";
                            dropdownMenu.classList.remove("show");
                            customSizeInput.focus();
                        } else {
                            const numSize = parseFloat(size);
                            const preset = STROKE_SIZE_PRESETS.find(p => p.size === numSize);
                            customInput.style.display = "none";
                            updateToolSizeDisplay(numSize, preset.label);
                            setToolSize(numSize);
                            dropdownMenu.classList.remove("show");
                        }
                    });
                });

                // Custom size input handling
                customSizeInput.addEventListener("input", (ev) => {
                    let val = parseFloat(ev.target.value);
                    if (isNaN(val)) return;
                    val = Math.min(30, Math.max(0.4, val));
                    updateToolSizeDisplay(val, "Custom");
                    setToolSize(val);
                });

                customSizeInput.addEventListener("keydown", (ev) => {
                    if (ev.key === "Enter") {
                        ev.target.blur();
                    }
                });

                if (colorInput) colorInput.oninput = () => { 
                    tool.color = colorInput.value; 
                    updateTools(); 
                    toolDiv.style.backgroundColor = tool.color || "#fff";
                };
                if (visibilityCheckbox) {
                    visibilityCheckbox.onchange = () => { tool.visibility = visibilityCheckbox.checked;
                    updateTools(); };
                }
            });

            dial.appendChild(toolDiv);
        });

        container.appendChild(dial);

    });
}



// -------------------- INIT --------------------
async function initModifiers() {
  const saved = await loadToolboxSettings(); // may return nul
  //const saved = null;

  let modifiers;
  // Load modifiers: use saved if exists, otherwise defaults
  if (saved?.modifiers) {
    modifiers = structuredClone(saved.modifiers);
  } else {
    modifiers = structuredClone(DEFAULT_MODIFIERS);
  }

  // Load toolbox layout: use saved if exists, otherwise defaults
  if (saved?.toolboxLayout) {
    toolboxLayout = structuredClone(saved.toolboxLayout);
  } else {
    toolboxLayout = structuredClone(DEFAULT_TOOLBOX_LAYOUT);
  }

  // Load sync stroke size setting
  syncStrokeSizeEnabled = modifiers?.syncStrokeSize ?? false;
  const syncToggle = document.getElementById("syncStrokeSize");
  if (syncToggle) {
    syncToggle.checked = syncStrokeSizeEnabled;
    syncToggle.addEventListener("change", handleSyncToggleChange);
  }

  // Load sync bracket toolboxes setting
  syncBracketToolboxesEnabled = modifiers.syncBracketToolboxes ?? false;
  const syncBracketToggle = document.getElementById("syncBracketToolboxes");
  if (syncBracketToggle) {
    syncBracketToggle.checked = syncBracketToolboxesEnabled;
    syncBracketToggle.addEventListener("change", handleBracketSyncToggleChange);
  }

  // Reset colors to white for non-colorCustomizable tools
  for (const boxId in toolboxLayout) {
    toolboxLayout[boxId].forEach(tool => {
      const customization = getToolCustomization(tool.id, boxId);
      if (!customization.colorCustomizable) {
        tool.color = "#ffffff";
      }
    });
  }

  // Render UI and assign tools
  renderModifiers(modifiers);
  //assignToolBox();
  renderTools();

  return modifiers;
}

// Handle sync toggle change
function handleSyncToggleChange(e) {
  syncStrokeSizeEnabled = e.target.checked;

  if (syncStrokeSizeEnabled) {
    // Sync all modifier sizes to default pen size
    const defaultPenSize = modifiers.defaultPen?.size || 3;
    syncAllModifierSizes(defaultPenSize);
  }

  // Re-render modifiers to show/hide stroke dropdowns
  renderModifiers(modifiers);
  updateTools();
}

// Handle bracket sync toggle change
function handleBracketSyncToggleChange(e) {
  syncBracketToolboxesEnabled = e.target.checked;

  if (syncBracketToolboxesEnabled) {
    // Sync wavy and circle bracket toolboxes to square bracket
    toolboxLayout.wavyBracket = structuredClone(toolboxLayout.squareBracket);
    toolboxLayout.circleBracket = structuredClone(toolboxLayout.squareBracket);
  }

  // Re-render tools to show/hide synced toolbox overlays
  renderTools();
  updateTools();
}


//------functions for detect strokes groups--------
function getBoundingBox(stroke) {
    const xs = stroke.map(p => p.x);
    const ys = stroke.map(p => p.y);
    return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys)
    };
}
function intersect(a, b) {
    return !(b.x > a.x + a.w ||
        b.x + b.w < a.x ||
        b.y > a.y + a.h ||
        b.y + b.h < a.y);
}

function detectPointerHold(targetElement, holdDuration, onHoldCallback) {
    let holdTimer = null;

    const controller = {
        start(e) {
            controller.cancel();
            holdTimer = setTimeout(() => {
                onHoldCallback(e);
                holdTimer = null;
            }, holdDuration);
        },
        cancel() {
            if (holdTimer !== null) {
                clearTimeout(holdTimer);
                holdTimer = null;
            }
        }
    };

    function onPointerDown(e) {
        controller.start(e);
    }

    targetElement.addEventListener('pointerdown', onPointerDown);
    targetElement.addEventListener('pointerup', controller.cancel);
    targetElement.addEventListener('pointerleave', controller.cancel);
    targetElement.addEventListener('pointercancel', controller.cancel);

    return controller;
}

function doLinesIntersect(a1, a2, b1, b2) {
    const det = (a2.x - a1.x) * (b2.y - b1.y) - (b2.x - b1.x) * (a2.y - a1.y);
    if (det === 0) return false; // parallel lines

    const lambda = ((b2.y - b1.y) * (b2.x - a1.x) + (b1.x - b2.x) * (b2.y - a1.y)) / det;
    const gamma = ((a1.y - a2.y) * (b2.x - a1.x) + (a2.x - a1.x) * (b2.y - a1.y)) / det;

    return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
}

function strokesIntersect(strokeA, strokeB) {
    let strokeCount = 0;
    for (let i = 0; i < strokeA.length - 1; i++) {
        for (let j = 0; j < strokeB.length - 1; j++) {
            if (doLinesIntersect(strokeA[i], strokeA[i+1], strokeB[j], strokeB[j+1])) {
                strokeCount ++;
            }
        }
    }
    return strokeCount;
}


function isPointInBox(point, box) {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.w &&
    point.y >= box.y &&
    point.y <= box.y + box.h
  );
}
 
function isSBoxInLBox(sBox, lBox) {
    return sBox.x >= lBox.x &&
            sBox.x + sBox.w <= lBox.x + lBox.w &&
            sBox.y >= lBox.y &&
            sBox.y + sBox.h <= lBox.y + lBox.h;
}

// Ray casting algorithm for point-in-polygon detection
// Works correctly for any closed shape: rectangles, circles, L-shapes, etc.
function isPointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return false;

  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    // Check if horizontal ray from point crosses this edge
    if (((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

// Check if a stroke is inside a modifier polygon
// Uses ray casting for accurate detection with any closed shape
function isInside(stroke, modifier) {
  if (!stroke || stroke.length === 0 || !modifier || modifier.length < 3) {
    return false;
  }

  // Quick bounding box check first (optimization)
  const modifierBox = getBoundingBox(modifier);
  const strokeBox = getBoundingBox(stroke);

  // If stroke bbox is completely outside modifier bbox, definitely not inside
  if (strokeBox.x + strokeBox.w < modifierBox.x ||
      strokeBox.x > modifierBox.x + modifierBox.w ||
      strokeBox.y + strokeBox.h < modifierBox.y ||
      strokeBox.y > modifierBox.y + modifierBox.h) {
    return false;
  }

  // Check if all points of the stroke are inside the modifier polygon
  return stroke.every(point => isPointInPolygon(point, modifier));
}

// Legacy function kept for compatibility - slices stroke into horizontal bands
function sliceStroke(stroke, sliceHeight = 25) {
    const box = getBoundingBox(stroke);
    const numSlices = Math.ceil(box.h / sliceHeight);
    const slices = [];
    for (let i = 0; i < numSlices; i++) {
        const top = box.y + i * sliceHeight;
        const bottom = (i + 1 === numSlices) ? box.y + box.h : top + sliceHeight;
        const slicePoints = stroke.filter(p => p.y >= top && p.y < bottom);
        if (slicePoints.length === 0) continue;
        const xs = slicePoints.map(p => p.x);
        const sliceBox = {
            x: Math.min(...xs),
            y: top,
            w: Math.max(...xs) - Math.min(...xs),
            h: bottom - top,
        }
        slices.push({ x: Math.min(...xs), y: top, w: Math.max(...xs) - Math.min(...xs), h: bottom - top });
    }
  return slices;
}


async function classifyStroke(stroke, hold = false) {
    let modifiedGroups = [];
    let intersectGroups = [];
    let intersectPointsCount = 0;
    let shownModifier = true;
    let predictedLabel = STROKE_TYPE.NONE;

    //for underline
    const newBox = getBoundingBox(stroke);
    let maxY = 100000;
    let minY = newBox.y + newBox.h - normalHeight * 0.55;
    const wideenough = (newBox.w > 30) || (newBox.h > 52 );

    //normal stroke
    if (!wideenough || !isDetectionOn) {
        //group creation
        const modifier = {
            id: getNextId(), // Unique ID for the group
            stroke: currentStroke, //strokes data
            bbox: newBox,
            color: defaultPenColor,
            predictedLabel: defaultPenType,
            visibility: shownModifier, 
            size: penSize
        };
        allGroups.push(modifier);
        modifiedGroups.push(modifier);

        const change = {
            change: 'normalStroke',
            modifiedGroups: modifier
        }
        pastGroups.push(change)

        return {
            modifiedGroups,
            predictedLabel,
        }
    }

    //
    let activeGroupsCount = 0
    for (const group of allGroups) {
        //only proceed with Groups that are in screenbox/visible and have stroke.
        if (group.visibility == false || !group.bbox || !intersect(group.bbox, screenBox) || !group?.stroke) continue;
        activeGroupsCount++;

        if (group.predictedLabel != STROKE_TYPE.DELETE) {
            const box = group.bbox;
            const isBBoxIntersecting = intersect(newBox, box);

            if (isBBoxIntersecting) {
                intersectPointsCount += strokesIntersect(currentStroke, group.stroke);
                if (intersectPointsCount > 0) {
                    intersectGroups.push(group);
                }
            }

            //check if inside box
            // Special handling for text blocks - check if bbox is inside modifier
            let isGroupInside = false;
            if (group.type === 'text') {
                // For text blocks, check if bbox corners are inside the modifier
                const corners = [
                    { x: group.bbox.x, y: group.bbox.y },
                    { x: group.bbox.x + group.bbox.w, y: group.bbox.y },
                    { x: group.bbox.x + group.bbox.w, y: group.bbox.y + group.bbox.h },
                    { x: group.bbox.x, y: group.bbox.y + group.bbox.h }
                ];
                isGroupInside = isInside(corners, currentStroke);
            } else {
                isGroupInside = isInside(group.stroke, currentStroke);
            }

            if (isGroupInside) {
                modifiedGroups.push(group);
            //else set maxY to detect underline for later on
            } else {
                if (maxY >= minY - normalHeight * 0.55) maxY = Math.min(minY - 7, newBox.y);
                const withinBand = (box.y + box.h) > maxY;
                const approxAboveLine = Math.abs(box.y + box.h - newBox.y - newBox.h) < normalHeight * 0.7;
                const overlapsX = box.x + box.w > newBox.x && box.x < newBox.x + newBox.w;
                const above = withinBand && approxAboveLine && overlapsX;
                if (above) {
                    maxY = Math.min(maxY, box.y, newBox.y);
                    minY = Math.max(minY, box.y + box.h, newBox.y + newBox.h)
                }
            }
        } 
    }

    // console.log('activeGroups',activeGroupsCount);
    // console.log("intersect groups", intersectGroups);
    // console.log("intersect count", intersectPointsCount);

    //only continue underline and delete check if there isn't more than
    //2 stroke inside the current modifer
    const continueCheck = modifiedGroups.length <= 2 || intersectGroups.length >= 2;

    if (continueCheck) {
        const latestbox = {
            x: newBox.x - 14,
            y: maxY - 8,
            w: newBox.w + 14,
            h: minY - maxY + 18
        }
        //drawBox(latestbox, 'rgba(255, 0, 0, 0.5)', 'Modifier', true, backgroundCtx);
        for (const group of allGroups) {
            if (group.visibility == false || !group.bbox || !intersect(group.bbox, screenBox)) continue;
                    
            const box = group.bbox;
            const insidelatestbox = isSBoxInLBox(box, latestbox);
            if (insidelatestbox && !modifiedGroups.some(element => element.bbox === group.bbox)){
                modifiedGroups.push(group);
            }
        }
    }

    // Count effective strokes (text blocks count as 3)
    let effectiveStrokeCount = 0;
    modifiedGroups.forEach(g => {
        if (g.type === 'text' && g.fakeStrokes) {
            effectiveStrokeCount += g.fakeStrokes.length;
        } else {
            effectiveStrokeCount += 1;
        }
    });

    if (effectiveStrokeCount >= 3 || intersectPointsCount >= 4)  {
        imgData = extractImageData(stroke, 96);
        // Preview
        const viewerCanvas = document.getElementById('viewer');
        const viewerCtx = viewerCanvas.getContext('2d');
        viewerCtx.clearRect(0, 0, 136, 136);
        viewerCtx.drawImage(imgData, 0, 0);

        predictedLabel = await predictImageFromCanvas(currentStroke, imgData, model);
        if (predictedLabel == STROKE_TYPE.UNDERLINE || predictedLabel == STROKE_TYPE.NONE || predictedLabel == STROKE_TYPE.DELETE) {
            color = defaultPenColor;
            shownModifier = true;   
        }
        else {
            color = modifiers[predictedLabel].color || defaultPenColor;
            shownModifier = modifiers[predictedLabel].visibility;
        }

        if (predictedLabel == STROKE_TYPE.DELETE) {
            intersectGroups.forEach(group => {
                if (!modifiedGroups.some(element => element.stroke === group.stroke)){
                    modifiedGroups.push(group);
                }
            })
        } else if (shortcutGroup.includes(predictedLabel)) {
            modifiedGroups = [];
            allGroups.forEach(group => {
                if (group.visibility == false || (!group.bbox || !intersect(group.bbox, screenBox))) return;
                if (group.bbox) {
                    inside = group.bbox.y > newBox.y && ((group.bbox.y + group.bbox.h) < (newBox.y + newBox.h));
                    if (inside) {
                        modifiedGroups.push(group);
                    }
                }
            });
        }
    }

    //group creation
    const modifier = {
        id: getNextId(), // Unique ID for the group
        stroke: currentStroke, //strokes data
        bbox: newBox,
        color: defaultPenColor,
        predictedLabel: predictedLabel,  // Use actual AI prediction, not defaultPenType
        visibility: shownModifier,
        size: penSize
    };
    
    if (predictedLabel != STROKE_TYPE.DELETE) {
        allGroups.push(modifier);
        modifiedGroups.push(modifier);
    } 
    //recalculate modified groups for delete
    else {
        modifiedGroups = [];
        for (const group of allGroups) {
            // Skip hidden groups (visibility=false) - these are shortcut markers and shouldn't be deleted
            if (group.visibility == false || !group.bbox || !intersect(group.bbox, screenBox)) continue;
            const box = group.bbox;
            const insideNewBox = isSBoxInLBox(box, newBox);
            if (insideNewBox || intersect(box, newBox)){
                modifiedGroups.push(group);
            }
        }
    } 

    //save changes to pastgroups - unified styling format
    if (predictedLabel == STROKE_TYPE.BOX || predictedLabel == STROKE_TYPE.CURLY || shortcutGroup.includes(predictedLabel)) {
        const originalStyles = {};
        modifiedGroups.forEach(group => {
            // Skip the modifier itself
            if (group.id === modifier.id) return;
            originalStyles[group.id] = {
                color: group.color,
                size: group.size,
                titleStatus: group.titleStatus,
                titleLevel: group.titleLevel,
                titleGroupId: group.titleGroupId,
                reminderStatus: group.reminderStatus,
                reminderDate: group.reminderDate,
                reminderGroupId: group.reminderGroupId
            };
        });
        const change = {
            change: 'styling',
            originalStyles: originalStyles,
            groupToRemove: modifier,
        }
        pastGroups.push(change);
        redoGroups = [];
    } else if (predictedLabel == STROKE_TYPE.NONE) {
        const change = {
            change: 'normalStroke',
            modifiedGroups: modifier
        }
        pastGroups.push(change)
    }  else if (predictedLabel === 3) {
        change = {
            change: 'delete',
            modifiedGroups: structuredClone(modifiedGroups),
        }
        pastGroups.push(change);
    }

    //taking action
    for (const group of modifiedGroups) {
        if (hold) {
            continue;
        }
        if (predictedLabel === STROKE_TYPE.DELETE && group.type != 'media' && defaultPenType != PEN_TYPES.HIGHLIGHTER) {
            allGroups.splice(allGroups.indexOf(group), 1);
        } else if (predictedLabel == STROKE_TYPE.BOX || predictedLabel == STROKE_TYPE.CURLY || shortcutGroup.includes(predictedLabel)) {
            const isHighlight = group.type === STROKE_TYPE.HIGHLIGHT || group.predictedLabel === STROKE_TYPE.HIGHLIGHT || group.type === TOOL_ID.HIGHLIGHT || group.predictedLabel === PEN_TYPES.HIGHLIGHTER;
            if (!isHighlight) {
                group.color = color;
                group.size = modifiers[predictedLabel]?.size ?? group.size;
            }
        }
    }

    syncTapeCoveredData();
    reDrawAll(drawCtx);

    // Record prediction for feedback collection (ML improvement)
    if (typeof recordPrediction === 'function' && predictedLabel !== STROKE_TYPE.NONE) {
        const predData = typeof getLastPredictionData === 'function' ? getLastPredictionData() : null;
        if (predData) {
            recordPrediction({
                stroke: predData.stroke,
                predictedLabel: predData.predictedLabel,
                confidence: predData.confidence,
                probabilities: predData.probabilities,
                modifier: modifier,
            });
            console.log('work');
        }
    }

    return {
        modifiedGroups,
        predictedLabel,
        modifier,
    }
}

const holdController = detectPointerHold(canvasGroup, 300, async (e) => {
    if (e.pointerType == 'touch') return;
    modifiedGroups = await classifyStroke(currentStroke, true);
    liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
    drawing = false;

    if (modifiedGroups.predictedLabel == STROKE_TYPE.NONE) {
        allGroups.pop();
        showToolbox(e.offsetX, e.offsetY, "press");
    } 
    else if (modifiedGroups.predictedLabel == STROKE_TYPE.CURLY) {
        showToolbox(e.offsetX, e.offsetY, "curly");
    }
    else if (shortcutGroup.includes(modifiedGroups.predictedLabel)) {
      // Set visibility to false instead of removing, so summary feature can find shortcuts
      allGroups[allGroups.length - 1].visibility = false;
      // Determine which bracket toolbox to open
      let bracketToolbox = "squareBracket";
      if (!syncBracketToolboxesEnabled) {
        if (modifiedGroups.predictedLabel === STROKE_TYPE.SQUAREBRACKET) {
          bracketToolbox = "squareBracket";
        } else if (modifiedGroups.predictedLabel === STROKE_TYPE.WAVYBRACKET) {
          bracketToolbox = "wavyBracket";
        } else if (modifiedGroups.predictedLabel === STROKE_TYPE.CIRCLEBRACKET) {
          bracketToolbox = "circleBracket";
        }
      }
      showToolbox(e.offsetX, e.offsetY, bracketToolbox);
    }
    else if (modifiedGroups.predictedLabel == STROKE_TYPE.UNDERLINE) {
        showToolbox(e.offsetX, e.offsetY, "underline");
    } else if (modifiedGroups.predictedLabel == STROKE_TYPE.BOX) {
        showToolbox(e.offsetX, e.offsetY, "box");
    }
    
    pointerDownForToolbox = true; 
    isPointerInside = true;

    //please search for shapeTimer
    // shapeHoldTimer = setTimeout(() => {
    //     if (isPointerInside) {
    //         hideToolbox();
    //         toggleShape(e);
    //     }
    // }, 700); 
});

const gridSlider = document.getElementById("gridWidth");
const gridInput  = document.getElementById("gridWidthValue");

const MIN = Number(gridSlider.min);
const MAX = Number(gridSlider.max);

function clamp(value) {
  return Math.min(MAX, Math.max(MIN, value));
}

function setGridSize(value) {
  const v = clamp(Number(value) || MIN);
  gridSlider.value = v;
  gridInput.value = v;
  gridSize = v;        // <-- your existing gridSize
  drawGrid(backgroundCtx);       // <-- redraw grid
}

// Eraser size slider
const eraserSizeSlider = document.getElementById("eraserSizeSlider");
const eraserSizeInput = document.getElementById("eraserSizeValue");

const MIN_ERASER = 5;
const MAX_ERASER = 80;

function clampEraser(value) {
  return Math.min(MAX_ERASER, Math.max(MIN_ERASER, value));
}

function setEraserSize(value) {
  const v = clampEraser(Number(value) || MIN_ERASER);
  if (eraserSizeSlider) eraserSizeSlider.value = v;
  if (eraserSizeInput) eraserSizeInput.value = v;
  eraserSize = v;
}

// Eraser size event listeners
if (eraserSizeSlider) {
  eraserSizeSlider.addEventListener("input", e => {
    setEraserSize(e.target.value);
  });
}

if (eraserSizeInput) {
  eraserSizeInput.addEventListener("input", e => {
    setEraserSize(e.target.value);
  });

  eraserSizeInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.target.blur();
    }
  });
}

window.onload = async () => {
    // Auth UI is now handled by signin.js (updateAuthUI function)

    allModels = await loadModel();
    model = allModels.model;
    autoShapeModel = allModels.autoShapeModel;

    renderAllNotes();

    // Draw initial grid
    drawGrid(backgroundCtx);

    //import last save note
    setTimeout(async () => {
        const lastSaveNote = await loadSetting('lastSaveNote');
        if (lastSaveNote) {
            pathSegments = lastSaveNote.path.split('/');
            title = lastSaveNote.path;

            openFolder(pathSegments[0]);
            loadNote(lastSaveNote.path, note => {
                if (note) {
                    // Close any open embed frame when switching notes
                    if (typeof closeEmbedFrame === 'function') closeEmbedFrame();

                    if (note.content) {
                        allGroups = note.content;
                        syncGroupIds(allGroups);
                    } else {
                        allGroups = [];
                        idCount = 0;
                    }
                    reDrawAll(drawCtx);
                    updateReminderCount();
                }
            });
            setTimeout(() => {
                const noteEl = document.getElementById(lastSaveNote.path.replace('/','_').replace('.json',''));
                if (noteEl) noteEl.classList.toggle('noteSelected');
                drawingLock = true;

                if (allGroups.length > 0) {
                    maxHeightObj = allGroups.reduce((max, obj) => (obj?.bbox?.y + obj?.bbox?.h) > (max?.bbox?.y + max?.bbox?.h) ? obj : max, { bbox: { y: 0, h: 0 } });
                    contentHeight = maxHeightObj.bbox.y + maxHeightObj.bbox.h + viewportHeight;
                } else {
                    contentHeight = viewportHeight;
                }

                scrollbar.style.display = "block";
                thumbHeight = Math.max((viewportHeight/contentHeight)*(viewportHeight*0.86), 0);
                thumb.style.height = thumbHeight + "px";
                updateScrollbar();
                startScrollBarCountdown();
            }, 200);
            
        } else {
            drawingLock = true;
        }
    }, 500);

    // Add event listeners for resizing
    window.addEventListener("resize", () => {
        //update viewport offset
        drawCtx = setupHiDPICanvas(drawCanvas);
        liveCtx = setupHiDPICanvas(liveCanvas);
        backgroundCtx = setupHiDPICanvas(backgroundCanvas);
        //update screen box
        screenBox.w = window.innerWidth / scale;
        screenBox.h = window.innerHeight / scale;

        drawGrid(backgroundCtx);
        reDrawAll(drawCtx);
    });

    // === Prevent ALL default browser behaviors on the canvas ===
    // These targeted handlers kill defaults WITHOUT using e.preventDefault()
    // on pointer events, which can break pen input on some browsers/devices.

    // Block text selection drag (blue highlight)
    canvasGroup.addEventListener("selectstart", (e) => e.preventDefault());

    // Block drag-and-drop ghost images
    canvasGroup.addEventListener("dragstart", (e) => e.preventDefault());

    // Block default touch behaviors (scroll, zoom, Scribble, etc.)
    // This is critical - prevents the browser from "stealing" pen/touch input
    canvasGroup.addEventListener("touchstart", (e) => {
        // Allow multi-touch for pinch zoom, but prevent single-touch defaults
        if (e.touches.length === 1) e.preventDefault();
    }, { passive: false });

    // Block Safari gesture events (pinch/rotate recognition)
    canvasGroup.addEventListener("gesturestart", (e) => e.preventDefault());
    canvasGroup.addEventListener("gesturechange", (e) => e.preventDefault());
    canvasGroup.addEventListener("gestureend", (e) => e.preventDefault());

    // Block default mousedown behaviors (text caret, focus stealing, etc.)
    canvasGroup.addEventListener("mousedown", (e) => e.preventDefault());

    // Track active pen pointer to reject palm touches during pen drawing
    let activePenPointerId = null;

    // Clean up drawing state when browser cancels a pointer (palm rejection, gesture takeover)
    canvasGroup.addEventListener("pointercancel", (e) => {
        if (e.pointerId === activePenPointerId) {
            activePenPointerId = null;
        }
        if (drawing) {
            drawing = false;
            currentStroke = [];
            liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
        }
        isPanning = false;
        erasing = false;
        canvasGroup.style.cursor = "default";
    });

    canvasGroup.addEventListener("pointerdown", (e) => {
        // NOTE: Do NOT call e.preventDefault() here - it interferes with
        // the browser's pointer tracking and can cause alternating strokes
        // to be swallowed. All defaults are handled via CSS and targeted
        // event handlers (touchstart, mousedown, selectstart, dragstart).

        // === Palm rejection: ignore touch input while pen is active ===
        if (e.pointerType === "touch" && activePenPointerId !== null) {
            return; // Ignore palm/finger touches during pen drawing
        }

        // Track pen pointer
        if (e.pointerType === "pen") {
            activePenPointerId = e.pointerId;
        }

        currentStroke = [];

        // === Clean up panning state when pen input starts ===
        if (e.pointerType === "pen" && isPanning) {
            isPanning = false;
            canvasGroup.style.cursor = "default";
        }

        // Reset movement tracking
        lastPointerX = e.offsetX/scale;
        lastPointerY = e.offsetY/scale;
        totalMovement = 0;

        // === 🟨 Sticky Note / 🔗 Link / 🎁 Tape Click Detection ===
        const worldX = (e.offsetX / scale) + viewportOffset.x;
        const worldY = (e.offsetY / scale) + viewportOffset.y;

        // One pass through allGroups for stickynote, link, tape, and summary_nav
        const clicked = allGroups.find(
            (g) =>
            (g?.type === "stickynote" || g?.type === "link" || g?.type === "tape" || g?.type === "summary_nav") &&
            g.visibility !== false &&
            g.bbox &&
            worldX >= g.bbox.x &&
            worldX <= g.bbox.x + g.bbox.w &&
            worldY >= g.bbox.y &&
            worldY <= g.bbox.y + g.bbox.h
        );

        if (clicked) {
            e.preventDefault();
            e.stopPropagation();

            if (clicked.type === "stickynote") {
                // Toggle sticky popup - close if already open for this note, open otherwise
                const existingPopup = document.getElementById("stickyPopup");
                if (existingPopup && existingPopup.dataset.noteId === String(clicked.id)) {
                    existingPopup.remove();
                } else {
                    showStickyPopup(clicked);
                }
            }
            else if (clicked.type === "link") {
                showLinkPopup(clicked);
            }
            else if (clicked.type === "tape") {
                const now = Date.now();
                // Check for double-click (same target, within delay)
                if (lastTapeClickTarget === clicked.id &&
                    now - lastTapeClickTime < CONFIG.TAPE.DOUBLE_CLICK_DELAY) {
                    // Double-click: remove tape permanently
                    removeTape(clicked);
                    lastTapeClickTarget = null;
                    lastTapeClickTime = 0;
                } else {
                    // Single click: toggle reveal
                    toggleTapeReveal(clicked);
                    lastTapeClickTarget = clicked.id;
                    lastTapeClickTime = now;
                }
            }
            else if (clicked.type === "summary_nav") {
                // Navigate to the original note and scroll to position
                navigateToSummarySource(clicked);
            }

            return; // Prevents other canvas actions
        }

        // === Paste Mode Click Detection ===
        if (pasteMode) {
            if (isPointInPasteBBox(worldX, worldY)) {
                // Start moving paste
                moveStartX = e.offsetX / scale;
                moveStartY = e.offsetY / scale;
            } else {
                // Click outside - cancel paste
                cancelPaste();
            }
            return;
        }

        // === Media Resize Handle Detection ===
        // Check if clicking on a resize handle of selected media
        const resizeHandleHit = getMediaResizeHandle(e.offsetX, e.offsetY);
        if (resizeHandleHit) {
            e.preventDefault();
            e.stopPropagation();
            startMediaResize(resizeHandleHit, e.offsetX, e.offsetY);
            return; // Prevents drawing
        }

        // === Text/Media Click Detection ===
        // Check for clicks on text or media blocks
        const clickedGroup = findMediaGroupAt(worldX, worldY);
        if (clickedGroup) {
            e.preventDefault();
            e.stopPropagation();

            const now = Date.now();

            // Check for double-click to edit (text blocks only)
            if (clickedGroup.type === 'text' &&
                lastTextClickTarget === clickedGroup.id &&
                now - lastTextClickTime < 400) {
                startTextEditing(clickedGroup);
                lastTextClickTarget = null;
                lastTextClickTime = 0;
                return;
            }

            // If already selected, check for resize handle first
            if (selectedMedia && selectedMedia.id === clickedGroup.id) {
                const handleHit = getMediaResizeHandle(e.offsetX, e.offsetY);
                if (handleHit) {
                    startMediaResize(handleHit, e.offsetX, e.offsetY);
                    return;
                }
                // Start drag
                startMediaDrag(e.offsetX, e.offsetY);
                // Track for double-click (text only)
                if (clickedGroup.type === 'text') {
                    lastTextClickTarget = clickedGroup.id;
                    lastTextClickTime = now;
                }
                return;
            }

            // Select the group
            selectedMedia = clickedGroup;
            if (clickedGroup.type === 'text') {
                lastTextClickTarget = clickedGroup.id;
                lastTextClickTime = now;
            }
            reDrawAll(drawCtx);
            return;
        }

        // === Media Selection Management ===
        // If media is selected but user clicked outside it, deselect and close popup
        if (selectedMedia) {
            selectedMedia = null;
            const popup = document.getElementById('mediaEditPopup');
            if (popup) popup.remove();
            reDrawAll(drawCtx); // Remove resize handles
        }

        // === Media Long Press Detection ===
        // Start long press detection for media editing (touch or mouse only, not pen)
        if (e.pointerType === 'touch' || e.pointerType === 'mouse') {
            startMediaLongPressDetection(e.offsetX, e.offsetY);
        }

        //for scrolling
        if (((e.shiftKey && e.pointerType === "mouse") || (e.pointerType === "touch"))) {
            const panParams = {
                startX: e.offsetX / scale,
                startY: e.offsetY / scale,
                viewportX: viewportOffset.x,
                viewportY: viewportOffset.y
            };

            const activatePanning = (params) => {
                isPanning = true;
                momentumActive = false;
                panStart.x = params.startX;
                panStart.y = params.startY;
                initialViewportOffset = { x: params.viewportX, y: params.viewportY };
                isScrollingX = false;
                isScrollingY = false;
                lockedAxis = null;
                canvasGroup.style.cursor = "grabbing";
                lastPanPos = { x: params.startX, y: params.startY };
                lastPanTime = performance.now();
                scrollbar.style.display = "block";
            };

            // Immediate panning for both mouse+shift and touch
            activatePanning(panParams);
        } else if (movingToggle) {
            moveStartX = e.offsetX / scale;
            moveStartY = e.offsetY / scale;
        } else if (eraserMode) {
            erasing = true; 
            eraserBox.x = e.offsetX / scale + viewportOffset.x - eraserSize / 2;
            eraserBox.y = e.offsetY / scale + viewportOffset.y - eraserSize / 2;
            eraseStrokes();
        }
        else {
            if (drawingLock) {
                drawing = true;
            }
            // NOTE: Do NOT call setPointerCapture here - it can cause the
            // browser to swallow every other pen stroke on some devices.
            // Events already bubble from child elements to canvasGroup.
            const pos = toCanvasCoords(e);
            currentStroke = [{ x: pos.x, y: pos.y }];
        }

    });

    const moveEvent = "onpointerrawupdate" in window ? "pointerrawupdate" : "pointermove";
    console.log("moveevent", moveEvent);
    window._hasRawPointer = moveEvent === "pointerrawupdate";

    canvasGroup.addEventListener(moveEvent, (e) => {
        // Check if the pointer has moved significantly
        const movementDx = e.offsetX/scale - lastPointerX;
        const movementDy = e.offsetY/scale - lastPointerY;
        totalMovement += Math.sqrt(movementDx * movementDx + movementDy * movementDy);
        lastPointerX = e.offsetX/scale;
        lastPointerY = e.offsetY/scale;

        if (totalMovement > CONFIG.MOVEMENT_THRESHOLD) {
            holdController.cancel();
            cancelMediaLongPress(); // Cancel media long press if user moved
            totalMovement = 0;
        }

        // === Media Resize Handling ===
        if (isResizingMedia) {
            e.preventDefault();
            handleMediaResize(e.offsetX, e.offsetY);
            return; // Don't do anything else while resizing
        }

        // === Media Drag Handling ===
        if (isDraggingMedia) {
            e.preventDefault();
            handleMediaDrag(e.offsetX, e.offsetY);
            return; // Don't do anything else while dragging
        }

        // === Paste Mode Movement ===
        if (pasteMode && moveStartX !== null) {
            const dx = e.offsetX / scale - moveStartX;
            const dy = e.offsetY / scale - moveStartY;

            dxRecord += dx;
            dyRecord += dy;

            // Move all pasted strokes
            pastedGroups.forEach(group => {
                group.bbox.x += dx;
                group.bbox.y += dy;
                if (group.type === 'text') {
                    // For text blocks, update fake strokes based on new bbox position
                    updateTextStrokes(group);
                } else if (group.stroke) {
                    group.stroke.forEach(st => {
                        if (st.path) {
                            st.path.forEach(point => {
                                point.x += dx;
                                point.y += dy;
                            });
                        }
                        st.x += dx;
                        st.y += dy;
                    });
                }
            });

            // Update pasteBBox
            if (pasteBBox) {
                pasteBBox.x += dx;
                pasteBBox.y += dy;
            }

            moveStartX = e.offsetX / scale;
            moveStartY = e.offsetY / scale;
            drawPastePreview();
            return;
        }

        // === Media Cursor Feedback ===
        // Show appropriate cursor when hovering over selected media
        if (selectedMedia && !isPanning && !drawing) {
            const handleHover = getMediaResizeHandle(e.offsetX, e.offsetY);
            if (handleHover) {
                const cursors = { nw: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', se: 'nwse-resize' };
                canvasGroup.style.cursor = cursors[handleHover];
            } else if (isPointInsideSelectedMedia(e.offsetX, e.offsetY)) {
                canvasGroup.style.cursor = 'move';
            } else {
                canvasGroup.style.cursor = 'default';
            }
        }

        if (isPanning) {
            maxHeightObj = allGroups.reduce((max, obj) => (obj?.bbox.y + obj?.bbox.h) > (max.bbox?.y + obj?.bbox.h) ? obj : max);
            contentHeight = maxHeightObj.bbox.y + maxHeightObj.bbox.h + viewportHeight;

            thumbHeight = Math.max((viewportHeight/contentHeight)*(viewportHeight*0.86), 0);
            thumb.style.height = thumbHeight + "px";

            drawing = false;
            let dx = -((e.offsetX / scale) - panStart.x);
            let dy = -((e.offsetY / scale) - panStart.y);

            const lockThreshold = 10 / scale;

            if (!lockedAxis) {
                if (Math.abs(dx) > lockThreshold || Math.abs(dy) > lockThreshold) {
                    lockedAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
                } else {
                    return;
                }
            }

            if (lockedAxis === 'x') {
                dy = 0;
            } else if (lockedAxis === 'y') {
                dx = 0;
            }

            if ((initialViewportOffset.y + dy) < panningLimit.top) {
                dy = panningLimit.top - initialViewportOffset.y;
                return;
            }
            if ((initialViewportOffset.x + dx) < panningLimit.left) {
                dx = panningLimit.left - initialViewportOffset.x;
                return;
            }

            // Enforce bottom scroll limit (1 extra screen + bottom stroke)
            const bottomStroke = allGroups.reduce((max, obj) =>
                (obj?.bbox?.y + obj?.bbox?.h) > (max?.bbox?.y + max?.bbox?.h) ? obj : max,
                { bbox: { y: 0, h: 0 } }
            );
            const maxScrollY = bottomStroke.bbox.y + bottomStroke.bbox.h + viewportHeight;
            if ((initialViewportOffset.y + dy) > maxScrollY - viewportHeight) {
                dy = maxScrollY - viewportHeight - initialViewportOffset.y;
            }

            if (dy < 0) {
                lockScroll = false;
            }

            if (lockScroll == false) {
                viewportOffset.x = initialViewportOffset.x + dx;
                viewportOffset.y = initialViewportOffset.y + dy;
            }

            // Momentum scrolling
            const now = performance.now();
            const dt = now - lastPanTime;
            if (dt > 0) {
                velocity.x = ((e.offsetX / scale) - lastPanPos.x) / dt * 16; // normalize to ~60FPS
                velocity.y = ((e.offsetY / scale) - lastPanPos.y) / dt * 16;
                lastPanPos = { x: e.offsetX / scale, y: e.offsetY / scale };
                lastPanTime = now;
            }

            screenBox.x = viewportOffset.x;
            screenBox.y = viewportOffset.y;

            //scrollbar
            updateScrollbar();
            drawGrid(backgroundCtx);
            reDrawAll(drawCtx);

            // Update popup position if media is selected
            updateMediaEditPopupPosition();
        }
        else if (pointerDownForToolbox) {
            const rect = toggleBtn.getBoundingClientRect();
            const x = e.clientX;
            const y = e.clientY;

            isPointerInside =
            x >= rect.left &&
            x <= rect.right &&
            y >= rect.top &&
            y <= rect.bottom;

            //shapeTimer
            // if (!isPointerInside) {
            //     clearTimeout(shapeHoldTimer);
            //     toggleBtn.classList.remove("countdown");
            // }
        }
        else if (shapeMode) {
            drawShape(liveCtx, e);
        }
        else if (movingToggle) {
            let dx = 0;
            let dy = 0;
            
            try {
                if (!moveStartX) {
                    reDrawMovement();
                    return;
                }
                dx = e.offsetX/scale - moveStartX;
                dy = e.offsetY/scale - moveStartY;
            } catch {
                reDrawMovement();
                return;
            };
        

            dxRecord += dx;
            dyRecord += dy;

            modifiedGroups.modifiedGroups.forEach(group => {
                group.bbox.x += dx;
                group.bbox.y += dy;
                if (group.type === 'text') {
                    // For text blocks, update fake strokes based on new bbox position
                    updateTextStrokes(group);
                } else {
                    group.stroke.forEach(point => {
                        point.x += dx;
                        point.y += dy;
                    });
                }
            });

            moveStartX = e.offsetX/scale;
            moveStartY = e.offsetY/scale;
            reDrawMovement();        
        }
        else if (eraserMode) {
            eraserBox.x = e.offsetX / scale + viewportOffset.x - eraserSize / 2;
            eraserBox.y = e.offsetY / scale + viewportOffset.y - eraserSize / 2;

            if (erasing) {
                eraseStrokes();
            }
            reDrawMovement();
        }
        else if (drawing && e.pointerType !== "touch") {
            const pos = toCanvasCoords(e);
            currentStroke.push({ x: pos.x, y: pos.y });
            liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
            liveCtx.save();
            liveCtx.translate(-viewportOffset.x, -viewportOffset.y);
            drawStroke(liveCtx, currentStroke, defaultPenColor, penSize);
            liveCtx.restore();

            if (totalMovement == 0) {
                holdController.start(e); // Restart hold detection
            }
        }
    });

    canvasGroup.addEventListener("pointerup", (e) => {
        // NOTE: Do NOT call e.preventDefault() on pointer events - see pointerdown note.

        // Clear active pen tracking
        if (e.pointerId === activePenPointerId) {
            activePenPointerId = null;
        }

        markDirty();
        cancelMediaLongPress(); // Cancel any pending media long press

        // === End Media Resize ===
        if (isResizingMedia) {
            endMediaResize();
            return;
        }

        // === End Media Drag ===
        if (isDraggingMedia) {
            endMediaDrag();
            return;
        }

        // === End Paste Mode Movement ===
        if (pasteMode && moveStartX !== null) {
            finalizePaste();
            return;
        }

        if (isPanning) {
            isPanning = false;

            if (Math.abs(velocity.x) > CONFIG.MIN_VELOCITY || Math.abs(velocity.y) > CONFIG.MIN_VELOCITY) {
                applyMomentum();
            }
            canvasGroup.style.cursor = "default"; // Reset cursor
            isScrollingX = false;
            isScrollingY = false;
            startScrollBarCountdown();
            return;
        }
        else if (movingToggle) {
            movingToggle = false;
            drawing = false;

            const change = {
                change: 'move',
                dx: dxRecord,
                dy: dyRecord,
                modifiedGroups: modifiedGroups.modifiedGroups,
            };
            pastGroups.push(change);

            dxRecord = 0;
            dyRecord = 0;  
            moveStartX = null;
            moveStartY = null;
            liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
            reDrawAll(drawCtx);
        }
        else if (shapeMode) {
            shapeMode = false;
            shape = drawShape(drawCtx, e);
            allGroups.push(shape);

            const change = {
                change: 'shape', 
                modifiedGroups: shape,
            }
            pastGroups.push(change);

            reDrawAll(drawCtx);
        } 
        else if (pointerDownForToolbox) {
            //shapeTimer
            //clearTimeout(shapeHoldTimer);
            isPointerInside = false;
            let selectedTool = null;
            let icon;

            toolLinks.forEach(link => {
            const rect = link.getBoundingClientRect();
                if (
                    e.clientX >= rect.left &&
                    e.clientX <= rect.right &&
                    e.clientY >= rect.top &&
                    e.clientY <= rect.bottom
                ) {
                    icon = link.querySelector('i');
                    selectedTool = icon?.getAttribute('data-label') || 'Unknown tool';                
                }
            });

            // Execute tools
            if (selectedTool) {    
                toolColor = icon?.getAttribute('data-color') || null;
                toolVisibility = icon?.getAttribute('data-visibility') || null;
                toolSize = icon?.getAttribute('data-size') || null;
                toolBox = icon?.getAttribute('data-toolBox') || null;
                const toolTapePreset = icon?.getAttribute('data-tapePreset') || null;
                const toolIndex = icon?.getAttribute('data-toolIndex') || null;

                //delete tool
                executeTool(selectedTool, toolColor, toolVisibility, toolSize, toolBox, toolTapePreset, toolIndex);
            } else {
                allGroups.pop();
            }
            hideToolbox();
            reDrawAll(drawCtx);
            // Redraw paste preview if we just entered paste mode
            if (pasteMode) {
                drawPastePreview();
            }
            return;
        }
        else if (eraserMode) {
            erasing = false;
            recordEraser();
        }
        else if (e.pointerType !== "touch") {
            drawing = false;
            canvasGroup.style.cursor = "default";
            // Draw the final stroke
            if (currentStroke.length > 1) {
                liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
                drawCtx.save();
                drawCtx.translate(-viewportOffset.x, -viewportOffset.y);
                drawStroke(drawCtx, currentStroke, defaultPenColor, penSize);
                drawCtx.restore();
                classifyStroke(currentStroke);
            }
        }
    });

    canvasGroup.addEventListener("touchmove", function (e) {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (lastTouchDistance) {
                const delta = distance - lastTouchDistance;
                if (Math.abs(delta) > 5) {
                zoomCanvas(delta * 0.005); // adjust sensitivity
                }
            }

            lastTouchDistance = distance;
            e.preventDefault(); // prevent scrolling
        }
    }, { passive: false });

    canvasGroup.addEventListener("touchend", () => {
        lastTouchDistance = null;
    });

    // ═══════════════════════════════════════════════════════════════════════
    // DISABLE RIGHT-CLICK CONTEXT MENU (prevents Windows 2-finger tap menu)
    // ═══════════════════════════════════════════════════════════════════════
    canvasGroup.addEventListener("contextmenu", function(e) {
        e.preventDefault();
        return false;
    });

    // ═══════════════════════════════════════════════════════════════════════
    // TOUCH GESTURE DETECTION (with palm rejection)
    // 2 fingers single tap = undo
    //
    // Palm rejection methods:
    // 1. Pen cooldown - ignore touches for 600ms after stylus use
    // 2. Touch size - palms have larger contact area than fingertips
    // ═══════════════════════════════════════════════════════════════════════
    const TAP_THRESHOLD = 250;      // Max duration for a tap
    const MOVE_THRESHOLD = 20;      // Max movement for a tap
    const PEN_COOLDOWN = 600;       // Ignore touch gestures for this long after pen use
    const MAX_TOUCH_RADIUS = 35;    // Max touch radius for valid finger tap (palms are larger)

    let lastPenUseTime = 0;         // Track when stylus was last used

    // Update pen use time on any pen interaction
    canvasGroup.addEventListener("pointerdown", function(e) {
        if (e.pointerType === "pen") {
            lastPenUseTime = Date.now();
        }
    }, { passive: true });

    canvasGroup.addEventListener("pointermove", function(e) {
        if (e.pointerType === "pen" && e.pressure > 0) {
            lastPenUseTime = Date.now();
        }
    }, { passive: true });

    // Helper: check if touch is likely a palm (too large)
    function isTouchTooBig(touch) {
        const radiusX = touch.radiusX || 0;
        const radiusY = touch.radiusY || 0;
        return radiusX > MAX_TOUCH_RADIUS || radiusY > MAX_TOUCH_RADIUS;
    }

    // Helper: check if we should ignore touch gestures
    function shouldIgnoreTouchGesture(touch) {
        // Method 1: Pen was used recently
        if ((Date.now() - lastPenUseTime) < PEN_COOLDOWN) return true;

        // Method 2: Touch is too large (likely palm)
        if (touch && isTouchTooBig(touch)) return true;

        return false;
    }

    // --- 2-finger single tap for undo ---
    let twoFingerTap = {
        startTime: 0,
        startPositions: [],
        moved: false
    };

    canvasGroup.addEventListener("touchstart", function(e) {
        if (e.touches.length === 2) {
            // Palm rejection check on both touches
            if (shouldIgnoreTouchGesture(e.touches[0]) || shouldIgnoreTouchGesture(e.touches[1])) {
                twoFingerTap.startTime = 0;
                return;
            }

            twoFingerTap.startTime = Date.now();
            twoFingerTap.moved = false;
            twoFingerTap.startPositions = [
                { x: e.touches[0].clientX, y: e.touches[0].clientY },
                { x: e.touches[1].clientX, y: e.touches[1].clientY }
            ];
        } else if (e.touches.length > 2) {
            twoFingerTap.startTime = 0; // Invalidate if more fingers added
        }
    }, { passive: true });

    canvasGroup.addEventListener("touchmove", function(e) {
        if (twoFingerTap.startTime && e.touches.length >= 2) {
            for (let i = 0; i < Math.min(2, e.touches.length); i++) {
                const start = twoFingerTap.startPositions[i];
                if (start) {
                    const dx = Math.abs(e.touches[i].clientX - start.x);
                    const dy = Math.abs(e.touches[i].clientY - start.y);
                    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
                        twoFingerTap.moved = true;
                        break;
                    }
                }
            }
        }
    }, { passive: true });

    canvasGroup.addEventListener("touchend", function(e) {
        if (e.touches.length === 0 && twoFingerTap.startTime) {
            const duration = Date.now() - twoFingerTap.startTime;

            // Valid 2-finger tap: quick and didn't move
            // (palm rejection already checked at touchstart)
            if (duration < TAP_THRESHOLD && !twoFingerTap.moved) {
                // === 2-FINGER SINGLE TAP: undo ===
                undo();
            }

            twoFingerTap.startTime = 0;
        }
    }, { passive: true });

    canvasGroup.addEventListener("wheel", function (e) {
        if (e.metaKey) {
            const delta = -e.deltaY;
            zoomCanvas(delta * 0.001); // adjust sensitivity
            e.preventDefault(); // avoid scrolling
        }
    }, { passive: false });

    // Initialize zoom indicator click handler
    initZoomIndicator();


    // modifiers = {
    //     title1: {color: '#ffa052', visibility: true}, 
    //     title2: {color: '#f4c64a', visibility: true}, 
    //     highlight1: {color: '#ffff00', visibility: true}, // red
    //     highlight2: {color: '#ffff00', visibility: true}, // green
    //     highlight3: {color: '#00ffff', visibility: true}, // blue
    //     box: {color: '#ffb6ff', visibility: true},
    //     curly: {color: '#fa6e6e', visibility: true},
    //     squarebracket: {color: '#a3fba9', visibility: false},
    //     wavybracket: {color: '#74e8ff', visibility: false},
    //     circlebracket: {color: 'pink', visibility: false}, 
    // }

    modifiers = await initModifiers();

    updateReminderCount();
}

// ═══════════════════════════════════════════════════════════════════════════
// ZOOM INDICATOR (Auto-hide floating UI)
// ═══════════════════════════════════════════════════════════════════════════
let zoomIndicatorTimer = null;

function showZoomIndicator() {
    const indicator = document.getElementById('zoomIndicator');
    if (!indicator) return;

    // Update percentage
    const percent = Math.round(scale * 100);
    document.getElementById('zoomPercent').textContent = `${percent}%`;

    // Show indicator
    indicator.classList.add('visible');

    // Clear existing timer
    if (zoomIndicatorTimer) clearTimeout(zoomIndicatorTimer);

    // Auto-hide after 2 seconds
    zoomIndicatorTimer = setTimeout(() => {
        indicator.classList.remove('visible');
    }, 2000);
}

function initZoomIndicator() {
    const indicator = document.getElementById('zoomIndicator');
    if (!indicator) return;

    // Click to reset zoom to 100%
    indicator.addEventListener('click', () => {
        scale = 1.0;

        // Re-setup canvases with new scale
        drawCtx = setupHiDPICanvas(drawCanvas);
        liveCtx = setupHiDPICanvas(liveCanvas);
        backgroundCtx = setupHiDPICanvas(backgroundCanvas);

        screenBox.w = window.innerWidth / scale;
        screenBox.h = window.innerHeight / scale;

        showZoomIndicator();
        drawGrid(backgroundCtx);
        reDrawAll(drawCtx);
    });
}

function zoomCanvas(zoomDelta) {
    const newScale = Math.min(Math.max(scale + zoomDelta, CONFIG.MIN_SCALE), CONFIG.MAX_SCALE);
    if (newScale !== scale) {
        scale = newScale;

        // Re-setup canvases with new scale
        drawCtx = setupHiDPICanvas(drawCanvas);
        liveCtx = setupHiDPICanvas(liveCanvas);
        backgroundCtx = setupHiDPICanvas(backgroundCanvas);

        screenBox.w = window.innerWidth / scale;
        screenBox.h = window.innerHeight / scale;

        showZoomIndicator();

        drawGrid(backgroundCtx);
        reDrawAll(drawCtx);

        // Update popup position if media is selected
        updateMediaEditPopupPosition();
    }
}

function applyMomentum() {
    if (momentumActive) return;
    momentumActive = true;

    // Cache scroll limits once at start of momentum (avoid recalculating every frame)
    const bottomStroke = allGroups.reduce((max, obj) =>
        (obj?.bbox?.y + obj?.bbox?.h) > (max?.bbox?.y + max?.bbox?.h) ? obj : max,
        { bbox: { y: 0, h: 0 } }
    );
    const maxScrollY = bottomStroke.bbox.y + bottomStroke.bbox.h + viewportHeight;
    const cachedContentHeight = bottomStroke.bbox.y + bottomStroke.bbox.h + viewportHeight;
    const cachedThumbHeight = Math.max((viewportHeight/cachedContentHeight)*(viewportHeight*0.86), 0);

    // Update scrollbar dimensions once
    contentHeight = cachedContentHeight;
    thumbHeight = cachedThumbHeight;
    thumb.style.height = thumbHeight + "px";

    function step() {
        if (!momentumActive || lockScroll) {
            momentumActive = false;
            return;
        }

        velocity.x *= CONFIG.FRICTION;
        velocity.y *= CONFIG.FRICTION;

        if (Math.abs(velocity.x) < CONFIG.MIN_VELOCITY && Math.abs(velocity.y) < CONFIG.MIN_VELOCITY) {
            momentumActive = false;
            return;
        }

        let dx = -velocity.x;
        let dy = -velocity.y;

        // Lock direction if previously locked
        if (lockedAxis === 'x') dy = 0;
        else if (lockedAxis === 'y') dx = 0;

        // Apply limits
        if (viewportOffset.x + dx < panningLimit.left) {
            dx = panningLimit.left - viewportOffset.x;
            velocity.x = 0;
        }
        if (viewportOffset.y + dy < panningLimit.top) {
            dy = panningLimit.top - viewportOffset.y;
            velocity.y = 0;
        }

        // Enforce bottom scroll limit
        if (viewportOffset.y + dy > maxScrollY - viewportHeight) {
            dy = maxScrollY - viewportHeight - viewportOffset.y;
            velocity.y = 0;
        }

        viewportOffset.x += dx;
        viewportOffset.y += dy;

        screenBox.x = viewportOffset.x;
        screenBox.y = viewportOffset.y;

        updateScrollbar();
        drawGrid(backgroundCtx);
        reDrawAll(drawCtx);
        updateMediaEditPopupPosition();

        requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
}

//------scroll bar---------
function updateScrollbar() {
    const maxScroll = contentHeight - viewportHeight;
    const maxThumb = viewportHeight * 0.86 - thumbHeight;

    //convert viewportoffset.y to thumb position
    const scrollRatio = viewportOffset.y/maxScroll;

    //console.log("thumb height top", scrollRatio * maxThumb+thumbHeight);

    if (((scrollRatio * maxThumb) + thumbHeight) >= viewportHeight * 0.86) {
        lockScroll = true;
    } else {
        lockScroll = false;
    }

    thumb.style.top = scrollRatio * maxThumb + "px";
}


function startScrollBarCountdown() {

    // Reset countdown
    remaining = CONFIG.COUNTDOWN_SECONDS;


    // Clear any old timer
    if (timer) clearInterval(timer);

    // Start new timer
    timer = setInterval(() => {
    remaining--;
    if (remaining > 0) {

    } else {
        scrollbar.style.display = "none"; // hide scrollbar
        clearInterval(timer);
        timer = null;
    }
    }, 1000);
}

function executeTool(selectedTool, toolColor, toolVisibility, toolSize, toolBox, toolTapePreset = null, toolIndex = null) {
    if (selectedTool.includes("pen")) {
        eraserMode = false; 
        
        if (toolVisibility == "false") {
            // Skip pop if last group is already hidden (shortcut marker for summary)
            if (allGroups[allGroups.length - 1]?.visibility !== false) {
                allGroups.pop();
            }
        }

        liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);

        if (toolBox != "press") {
            modifiedGroups.modifiedGroups.forEach(group => {
                const isHighlight = group.type === STROKE_TYPE.HIGHLIGHT || group.predictedLabel === STROKE_TYPE.HIGHLIGHT || group.type === TOOL_ID.HIGHLIGHT || group.predictedLabel === PEN_TYPES.HIGHLIGHTER;
                if (!isHighlight) {
                    group.color = toolColor;
                    group.size = toolSize;
                }
            });
            syncTapeCoveredData();
        }
        else {
            defaultPenColor = toolColor;
            penSize = toolSize;
            defaultPenType = STROKE_TYPE.NONE;
            // document.getElementById('defaultPen').value = toolColor;
            // modifiers['defaultPen'].color = toolColor;
            // updateTools();
        }
    }
    else if (selectedTool == "delete") {
        // Deep clone groups before deletion to preserve state for undo
        change = {
            change: 'delete',
            modifiedGroups: structuredClone(modifiedGroups.modifiedGroups),
        }
        pastGroups.push(change);
        for (const group of modifiedGroups.modifiedGroups) {
            allGroups.splice(allGroups.indexOf(group), 1);
        }
        
    //highlighter tool
    }else if (selectedTool == "highlight") {
        if (toolBox == "press") {
            defaultPenColor = hexToRgb(toolColor);
            penSize = toolSize;
            defaultPenType = TOOL_ID.HIGHLIGHT;
        } else {
            selectHighlight(toolColor);
        }
    }  
    else if (selectedTool.includes('bold')) {
        if (toolVisibility === "false" || (selectedTool == TOOL_ID.BOLD_DEFAULT)) {
            // Skip pop if last group is already hidden (shortcut marker for summary)
            if (allGroups[allGroups.length - 1]?.visibility !== false) {
                allGroups.pop();
            }
        }

        // Track original values for undo - unified styling format
        const modifierId = modifiedGroups.modifier?.id;
        const originalStyles = {};
        modifiedGroups.modifiedGroups.forEach(group => {
            if (group.id === modifierId) return;
            originalStyles[group.id] = {
                color: group.color,
                size: group.size,
                titleStatus: group.titleStatus,
                titleLevel: group.titleLevel,
                titleGroupId: group.titleGroupId,
                reminderStatus: group.reminderStatus,
                reminderDate: group.reminderDate,
                reminderGroupId: group.reminderGroupId
            };
        });

        modifiedGroups.modifiedGroups.forEach(group => {
            if (group.id === modifierId) return;
            const isHighlight = group.type === STROKE_TYPE.HIGHLIGHT || group.predictedLabel === STROKE_TYPE.HIGHLIGHT || group.type === TOOL_ID.HIGHLIGHT || group.predictedLabel === PEN_TYPES.HIGHLIGHTER;
            if (isHighlight) return;
            group.size = parseInt(group.size, 10) + 2;
            if (selectedTool == "bold") {
                group.color = alterRgbaBrightness(group.color);
            } else {
                group.color = toolColor;
            }
        });
        syncTapeCoveredData();

        // Track for undo - unified styling format
        pastGroups.push({
            change: 'styling',
            originalStyles: originalStyles,
            groupToRemove: modifiedGroups.modifier
        });
        redoGroups = [];
    }
    else if (selectedTool == "title1") {
        selectTitle(toolColor, toolVisibility, 1, toolSize);
    }
    else if (selectedTool == "title2") {
        selectTitle(toolColor, toolVisibility, 2, toolSize);
    }
    else if (selectedTool == "title3") {
        selectTitle(toolColor, toolVisibility, 3, toolSize);
    }
    else if (selectedTool == "reminder") {
        // Show date/time picker for reminder deadline
        showReminderPicker(toolColor, toolVisibility, toolSize);
        return; // Don't close toolbox yet, wait for date selection
    }
    else if (selectedTool == "move") {
        // Skip pop if last group is already hidden (shortcut marker for summary)
        if (allGroups[allGroups.length - 1]?.visibility !== false) {
            allGroups.pop();
        }
        modifiedGroups.modifiedGroups.pop();
        movingColor = modifiedGroups.modifiedGroups[0].color;
        // modifiedGroups.modifiedGroups.forEach(group => {
        //     group.color = 'lightgray'; // Set to white
        // });
        movingToggle = true;
    }
    else if (selectedTool == "copy") {
        // Deep clone the selected strokes to clipboard
        // Skip pop if last group is already hidden (shortcut marker for summary)
        if (allGroups[allGroups.length - 1]?.visibility !== false) {
            allGroups.pop();
        }
        modifiedGroups.modifiedGroups.pop();
        clipboard = modifiedGroups.modifiedGroups.map(group => {
            // Handle text blocks specially
            if (group.type === 'text') {
                return {
                    ...group,
                    stroke: group.stroke ? [...group.stroke] : [],
                    fakeStrokes: group.fakeStrokes ? group.fakeStrokes.map(s => [...s]) : [],
                    bbox: { ...group.bbox }
                };
            }
            // Handle regular stroke groups
            return {
                ...group,
                stroke: group.stroke ? group.stroke.map(s => {
                    if (typeof s === 'object' && s !== null) {
                        return { ...s, path: s.path ? s.path.map(p => ({ ...p })) : undefined };
                    }
                    return { ...s };
                }) : [],
                bbox: { ...group.bbox }
            };
        });
        // Flash feedback
        reDrawAll(drawCtx);
        return;
    }
    else if (selectedTool == "paste") {
        // Skip pop if last group is already hidden (shortcut marker for summary)
        if (allGroups[allGroups.length - 1]?.visibility !== false) {
            allGroups.pop();
        }
        modifiedGroups.modifiedGroups.pop();

        if (!clipboard || clipboard.length === 0) {
            reDrawAll(drawCtx);
            return;
        }

        // Deep clone clipboard strokes at original position (no offset)
        pastedGroups = clipboard.map(group => {
            // Handle text blocks specially
            if (group.type === 'text') {
                const newGroup = {
                    ...group,
                    id: 'text_' + Date.now() + '_' + getNextId(),
                    stroke: group.stroke ? [...group.stroke] : [],
                    fakeStrokes: group.fakeStrokes ? group.fakeStrokes.map(s => [...s]) : [],
                    bbox: { ...group.bbox }
                };
                return newGroup;
            }
            // Handle regular stroke groups
            const newGroup = {
                ...group,
                id: getNextId(),
                stroke: group.stroke ? group.stroke.map(s => {
                    if (typeof s === 'object' && s !== null) {
                        return {
                            ...s,
                            path: s.path ? s.path.map(p => ({ x: p.x, y: p.y })) : undefined,
                            x: s.x,
                            y: s.y
                        };
                    }
                    return { ...s };
                }) : [],
                bbox: {
                    x: group.bbox.x,
                    y: group.bbox.y,
                    w: group.bbox.w,
                    h: group.bbox.h
                }
            };
            return newGroup;
        });

        // Calculate combined bounding box from group bboxes
        const allBboxes = pastedGroups.map(g => g.bbox);
        pasteBBox = {
            x: Math.min(...allBboxes.map(b => b.x)),
            y: Math.min(...allBboxes.map(b => b.y)),
            w: Math.max(...allBboxes.map(b => b.x + b.w)) - Math.min(...allBboxes.map(b => b.x)),
            h: Math.max(...allBboxes.map(b => b.y + b.h)) - Math.min(...allBboxes.map(b => b.y))
        };

        // Enter paste mode
        pasteMode = true;
        dxRecord = 0;
        dyRecord = 0;
        moveStartX = null;
        moveStartY = null;

        // Draw the paste preview immediately with border
        reDrawAll(drawCtx);
        drawPastePreview();
        return;
    }
    else if (selectedTool == "eraser") {
        toggleEraser();
    }
    else if (selectedTool == "mathSolver") {
        modifiedGroups.modifiedGroups.pop();
        // Skip pop if last group is already hidden (shortcut marker for summary)
        if (allGroups[allGroups.length - 1]?.visibility !== false) {
            allGroups.pop();
        }
        const canvas = extractImageDataFromStrokes(modifiedGroups.modifiedGroups);
        //downloadCanvasImage(canvas, "my_strokes.png");
        if (canvas !== -1) {
        // Send to backend for recognition
        canvas.toBlob(async (blob) => {
            const { latex, result } = await detectAndSolveMath(blob);
            if (result != 'no equation'){
                const resultGroup = createMathResultGroup(modifiedGroups.modifiedGroups, result);
                allGroups.push(resultGroup);

                // Track for undo
                pastGroups.push({
                    change: 'add',
                    modifiedGroups: [resultGroup]
                });
                redoGroups = [];

                reDrawAll(drawCtx);
                if (title) saveNote(title, allGroups, null, { isSummaryNote: currentNoteIsSummary });
            }
        });
        }
    } else if (selectedTool == "stickynote") {
        // Remove selection highlights
        // Skip pop if last group is already hidden (shortcut marker for summary)
        if (allGroups[allGroups.length - 1]?.visibility !== false) {
            allGroups.pop();
        }
        modifiedGroups.modifiedGroups.pop();

        const groupBBox = getBoundingBox(modifiedGroups.modifiedGroups.flatMap(g => g.stroke));

        // Create the sticky note group
        const stickynoteGroup = {
            id: getNextId(),
            type: "stickynote",
            bbox: groupBBox,
            stroke: modifiedGroups.modifiedGroups.flatMap(g => g.stroke),
            color: "#ffd700", // Yellow
            visibility: true,
        };

        allGroups.push(stickynoteGroup);

        // Track for undo
        pastGroups.push({
            change: 'add',
            modifiedGroups: [stickynoteGroup]
        });
        redoGroups = [];

        showStickyPopup(stickynoteGroup);
        return;
    }
    else if (selectedTool == "link") {
        // Skip pop if last group is already hidden (shortcut marker for summary)
        if (allGroups[allGroups.length - 1]?.visibility !== false) {
            allGroups.pop();
        }
        modifiedGroups.modifiedGroups.pop();

        const groupBBox = getBoundingBox(modifiedGroups.modifiedGroups.flatMap(g => g.stroke));

        // Create the empty link group
        const linkGroup = {
            id: getNextId(),
            type: "link",
            bbox: groupBBox,
            stroke: modifiedGroups.modifiedGroups.flatMap(g => g.stroke),
            color: "#0077ff",
            visibility: true,
        };

        allGroups.push(linkGroup);

        // Track for undo
        pastGroups.push({
            change: 'add',
            modifiedGroups: [linkGroup]
        });
        redoGroups = [];
    }
    else if (selectedTool == "tape") {
        // Remove selection highlights
        // Skip pop if last group is already hidden (shortcut marker for summary)
        if (allGroups[allGroups.length - 1]?.visibility !== false) {
            allGroups.pop();
        }
        modifiedGroups.modifiedGroups.pop();

        // Collect all strokes in proper format and calculate bbox
        const coveredGroups = modifiedGroups.modifiedGroups;
        const strokesForTape = [];
        const textBlocksForTape = [];
        let allPoints = [];

        coveredGroups.forEach(g => {
            if (g.type === 'text') {
                // Store text block info for rendering
                textBlocksForTape.push({
                    text: g.text,
                    fontFamily: g.fontFamily,
                    fontSize: g.fontSize,
                    color: g.color,
                    bbox: { ...g.bbox },
                    opacity: g.opacity
                });
                // Add bbox corners to allPoints for bbox calculation
                allPoints.push({ x: g.bbox.x, y: g.bbox.y });
                allPoints.push({ x: g.bbox.x + g.bbox.w, y: g.bbox.y + g.bbox.h });
            } else if (g.stroke && g.stroke.length >= 2) {
                // Store stroke with proper format
                strokesForTape.push({
                    path: g.stroke,
                    color: g.color,
                    size: g.size || 2
                });
                allPoints = allPoints.concat(g.stroke);
            }
        });

        const groupBBox = getBoundingBox(allPoints);

        // Store IDs of covered groups
        const coveredGroupIds = coveredGroups.map(g => g.id);

        // Use the tool's preset (from toolbox) or fallback to default
        const tapePresetToUse = toolTapePreset || "polkadot";

        // Create the tape group
        const tapeGroup = {
            id: getNextId(),
            type: "tape",
            bbox: groupBBox,
            stroke: strokesForTape,
            textBlocks: textBlocksForTape,
            coveredGroupIds: coveredGroupIds,
            preset: tapePresetToUse,
            revealed: false,
            fadeProgress: 1,
            borderColor: CONFIG.COLORS.FLASH_TAPE,
            visibility: true,
        };

        allGroups.push(tapeGroup);

        // Track for undo
        pastGroups.push({
            change: 'add',
            modifiedGroups: [tapeGroup]
        });
        redoGroups = [];

        flashTape(tapeGroup);
        reDrawAll(drawCtx);
        if (title) {
            saveNote(title, allGroups, null, { isSummaryNote: currentNoteIsSummary });
            // Trigger flashcard scan after tape creation
            if (typeof scanNotebookForFlashcards === 'function' && selectedFolder) {
                scanNotebookForFlashcards(selectedFolder).then(flashcards => {
                    if (typeof updateFlashcardButton === 'function') {
                        updateFlashcardButton(flashcards);
                    }
                });
            }
        }
        return;
    }
}

function undo() {
    if (pastGroups.length < 1) return;

    action = pastGroups.pop();

    // Record undo for feedback collection (ML improvement)
    if (typeof recordUndo === 'function') {
        recordUndo(action);
    }

    // Unified styling handler - handles all modifier styling changes (box, curly, bold, title, etc.)
    if (action.change == 'styling') {
        // Get originalStyles (handle both new and old formats)
        console.log(action);
        const styles = action.originalStyles || {};

        // Save current values for redo
        const currentStyles = {};
        for (const id in styles) {
            const group = allGroups.find(g => g.id == id);
            if (group) {
                currentStyles[id] = {
                    color: group.color,
                    size: group.size,
                    titleStatus: group.titleStatus,
                    titleLevel: group.titleLevel,
                    titleGroupId: group.titleGroupId,
                    reminderStatus: group.reminderStatus,
                    reminderDate: group.reminderDate,
                    reminderGroupId: group.reminderGroupId
                };
            }
        }

        const redo = {
            change: 'styling',
            originalStyles: currentStyles,
            groupToAdd: action.groupToRemove
        };
        redoGroups.push(redo);

        // Restore original values for each group
        for (const id in styles) {
            const group = allGroups.find(g => g.id == id);
            if (group) {
                const original = styles[id];
                if (original) {
                    group.color = original.color;
                    group.size = original.size;
                    group.titleStatus = original.titleStatus;
                    group.titleLevel = original.titleLevel;
                    group.titleGroupId = original.titleGroupId;
                    group.reminderStatus = original.reminderStatus;
                    group.reminderDate = original.reminderDate;
                    group.reminderGroupId = original.reminderGroupId;
                }
            }
        }

        if (action.groupToRemove) {
            allGroups.splice(allGroups.indexOf(action.groupToRemove), 1);
        }

        // Refresh TOC and Reminders
        titleAnchorsNeedRefresh = true;
        if (typeof populateTocList === 'function') populateTocList();
        if (typeof updateReminderCount === 'function') updateReminderCount();
    }
    else if (action.change == 'normalStroke') { 
        const redo = {
            change: 'normalStroke',
            modifiedGroups: action.modifiedGroups, 
        }
        redoGroups.push(redo);

        allGroups.splice(allGroups.indexOf(action.modifiedGroups), 1);         
    } 
    else if (action.change == 'delete') {
        const redo = {
            change: 'delete', 
            modifiedGroups: action.modifiedGroups, 
        }
        redoGroups.push(redo);

        allGroups.push(...action.modifiedGroups);
    } 
    else if (action.change == 'move') {
        redoGroups.push(action);

        const dx = action.dx;
        const dy = action.dy;
        action.modifiedGroups.forEach(group => {
          // Move bbox back (same direction as strokes)
          if (group.bbox) {
            group.bbox.x -= dx;
            group.bbox.y -= dy;
          }
          // Move strokes back
          if (group.type === 'text') {
            // For text blocks, update fake strokes based on new bbox position
            updateTextStrokes(group);
          } else if (group.stroke && Array.isArray(group.stroke)) {
            group.stroke.forEach(p => {
              p.x -= dx;
              p.y -= dy;
            });
          }
        });
    }
    else if (action.change == "shape") {
        const redo = {
            change: 'shape',
            modifiedGroups: action.modifiedGroups,
        }
        redoGroups.push(redo);

        allGroups.splice(allGroups.indexOf(action.modifiedGroups), 1);
    }
    else if (action.change == "add") {
        // Handle add for stickynote, link, tape, and media
        const redo = {
            change: 'add',
            modifiedGroups: action.modifiedGroups,
        }
        redoGroups.push(redo);

        // Remove added groups from allGroups
        action.modifiedGroups.forEach(group => {
            const index = allGroups.indexOf(group);
            if (index > -1) {
                allGroups.splice(index, 1);
                // Clear media cache if it's a media group
                if (group.type === 'media' && typeof mediaCache !== 'undefined') {
                    mediaCache.delete(group.id);
                }
            }
        });
    }
    else if (action.action == "add") {
        // Handle old media format (action instead of change)
        const redo = {
            action: 'add',
            groups: action.groups,
        }
        redoGroups.push(redo);

        action.groups.forEach(group => {
            const index = allGroups.indexOf(group);
            if (index > -1) {
                allGroups.splice(index, 1);
                if (typeof mediaCache !== 'undefined') {
                    mediaCache.delete(group.id);
                }
            }
        });
    }
    else if (action.action == "delete") {
        // Handle old media delete format
        const redo = {
            action: 'delete',
            groups: action.groups,
        }
        redoGroups.push(redo);

        // Re-add the deleted groups
        allGroups.push(...action.groups);
    }
    else if (action.change == "paste") {
        const redo = {
            change: 'paste',
            modifiedGroups: action.modifiedGroups,
        }
        redoGroups.push(redo);

        // Remove pasted groups from allGroups
        action.modifiedGroups.forEach(group => {
            const index = allGroups.indexOf(group);
            if (index > -1) {
                allGroups.splice(index, 1);
            }
        });
    }
    reDrawAll(drawCtx);
}

function redo() {
    if (redoGroups.length < 1) return;

    action = redoGroups.pop();

    // Record redo for feedback collection (ML improvement)
    if (typeof recordRedo === 'function') {
        recordRedo(action);
    }

    // Unified styling handler - handles all modifier styling changes (box, curly, bold, title, etc.)
    if (action.change == 'styling') {
        // Get originalStyles (handle both new and old formats)
        const styles = action.originalStyles || {};

        // Save current values for undo
        const currentStyles = {};
        for (const id in styles) {
            const group = allGroups.find(g => g.id == id);
            if (group) {
                currentStyles[id] = {
                    color: group.color,
                    size: group.size,
                    titleStatus: group.titleStatus,
                    titleLevel: group.titleLevel,
                    titleGroupId: group.titleGroupId,
                    reminderStatus: group.reminderStatus,
                    reminderDate: group.reminderDate,
                    reminderGroupId: group.reminderGroupId
                };
            }
        }

        const change = {
            change: 'styling',
            originalStyles: currentStyles,
            groupToRemove: action.groupToAdd
        };
        pastGroups.push(change);

        // Add modifier back
        if (action.groupToAdd) {
            allGroups.push(action.groupToAdd);
        }

        // Apply stored values for each group
        for (const id in styles) {
            const group = allGroups.find(g => g.id == id);
            if (group) {
                const original = styles[id];
                if (original) {
                    group.color = original.color;
                    group.size = original.size;
                    group.titleStatus = original.titleStatus;
                    group.titleLevel = original.titleLevel;
                    group.titleGroupId = original.titleGroupId;
                    group.reminderStatus = original.reminderStatus;
                    group.reminderDate = original.reminderDate;
                    group.reminderGroupId = original.reminderGroupId;
                }
            }
        }

        // Refresh TOC and Reminders
        titleAnchorsNeedRefresh = true;
        if (typeof populateTocList === 'function') populateTocList();
        if (typeof updateReminderCount === 'function') updateReminderCount();
    }
    else if (action.change == 'normalStroke') {
        const change = {
            change: 'normalStroke', 
            modifiedGroups: action.modifiedGroups,
        }
        pastGroups.push(change);

        allGroups.push(action.modifiedGroups);
    }
    else if (action.change == 'delete') {
        const change = {
            change: 'delete', 
            modifiedGroups: action.modifiedGroups, 
        }
        pastGroups.push(change);

        for (const group of action.modifiedGroups) {
            allGroups.splice(allGroups.indexOf(group), 1);
        } 
    }
    else if (action.change == 'move') {
        pastGroups.push(action);

        const dx = action.dx;
        const dy = action.dy;

        action.modifiedGroups.forEach(group => {
          // Move bbox forward (same direction as strokes)
          if (group.bbox) {
            group.bbox.x += dx;
            group.bbox.y += dy;
          }
          // Move strokes forward
          if (group.type === 'text') {
            // For text blocks, update fake strokes based on new bbox position
            updateTextStrokes(group);
          } else if (group.stroke && Array.isArray(group.stroke)) {
            group.stroke.forEach(p => {
              p.x += dx;
              p.y += dy;
            });
          }
        });
    }
    else if (action.change == 'paste') {
        const change = {
            change: 'paste',
            modifiedGroups: action.modifiedGroups,
        }
        pastGroups.push(change);

        // Re-add pasted groups
        allGroups.push(...action.modifiedGroups);
    }
    else if (action.change == 'shape') {
        const change = {
            change: 'shape',
            modifiedGroups: action.modifiedGroups,
        }
        pastGroups.push(change);

        allGroups.push(action.modifiedGroups);
    }
    else if (action.change == 'add') {
        // Handle add for stickynote, link, tape, and media
        const change = {
            change: 'add',
            modifiedGroups: action.modifiedGroups,
        }
        pastGroups.push(change);

        // Re-add the groups
        allGroups.push(...action.modifiedGroups);
    }
    else if (action.action == "add") {
        // Handle old media format (action instead of change)
        const change = {
            action: 'add',
            groups: action.groups,
        }
        pastGroups.push(change);

        // Re-add the groups
        allGroups.push(...action.groups);
    }
    else if (action.action == "delete") {
        // Handle old media delete format
        const change = {
            action: 'delete',
            groups: action.groups,
        }
        pastGroups.push(change);

        // Remove the groups again
        action.groups.forEach(group => {
            const index = allGroups.indexOf(group);
            if (index > -1) {
                allGroups.splice(index, 1);
                if (typeof mediaCache !== 'undefined') {
                    mediaCache.delete(group.id);
                }
            }
        });
    }

    reDrawAll(drawCtx);
}

function toggleViewer() {
    document.getElementById('viewer').classList.toggle('show');
}


function toggleSetting() {
  document.getElementById('settings-wrapper').classList.toggle('show');
}

function toggleDetection() {
    isDetectionOn = !isDetectionOn;
    if (isDetectionOn) {
        document.querySelector(".aiText").innerHTML = "AI ON"
    }else {
        document.querySelector(".aiText").innerHTML = "AI OFF"
    }
    
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN: FLAG MISCLASSIFIED STROKE POPUP
// ═══════════════════════════════════════════════════════════════════════════

function showFlagMisclassifiedPopup() {
    // Check if user is admin
    if (typeof isAdmin === 'function' && !isAdmin()) {
        console.warn('Not authorized to flag strokes');
        return;
    }

    // Remove existing popup
    const existing = document.getElementById('flagMisclassifiedPopup');
    if (existing) existing.remove();

    // Get recent strokes (exclude special types like media, text, stickynote, link, tape)
    const recentStrokes = allGroups
        .filter(g => g.stroke && g.stroke.length > 0 && !['media', 'text', 'stickynote', 'link', 'tape'].includes(g.type))
        .slice(-10) // Get last 10 strokes
        .reverse(); // Most recent first

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'flagMisclassifiedPopup';
    overlay.className = 'flag-popup-overlay';

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'flag-popup';

    // Build class options from STROKE_TYPE
    const classOptions = Object.values(STROKE_TYPE)
        .filter(v => v !== 'move' && v !== 'highlight')
        .map(v => `<option value="${v}">${v.charAt(0).toUpperCase() + v.slice(1)}</option>`)
        .join('');

    modal.innerHTML = `
        <h3><i class='bx bx-flag'></i> Flag Misclassified Stroke</h3>
        <div class="flag-popup-preview">
            ${recentStrokes.length > 0
                ? `<canvas id="flagStrokePreview" width="280" height="150"></canvas>
                   <div class="flag-popup-info">
                       <span id="flagStrokeIndex">Stroke 1 of ${recentStrokes.length}</span>
                       <span id="flagCurrentPrediction"></span>
                   </div>
                   <div style="display: flex; gap: 8px; margin-top: 8px;">
                       <button id="flagPrevBtn" class="cancel-btn" style="padding: 6px 12px; font-size: 12px;">← Prev</button>
                       <button id="flagNextBtn" class="cancel-btn" style="padding: 6px 12px; font-size: 12px;">Next →</button>
                   </div>`
                : `<div class="no-stroke">No recent strokes to flag</div>`
            }
        </div>
        <div class="flag-popup-class-select">
            <label>Correct classification:</label>
            <select id="flagClassSelect" ${recentStrokes.length === 0 ? 'disabled' : ''}>
                <option value="">-- Select class --</option>
                ${classOptions}
            </select>
        </div>
        <div class="flag-popup-actions">
            <button class="cancel-btn" id="flagCancelBtn">Cancel</button>
            <button class="submit-btn" id="flagSubmitBtn" disabled>Submit Flag</button>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // State
    let currentStrokeIndex = 0;

    // Draw stroke preview
    function drawStrokePreview(index) {
        if (recentStrokes.length === 0) return;

        const canvas = document.getElementById('flagStrokePreview');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const stroke = recentStrokes[index];

        // Clear canvas
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (!stroke || !stroke.stroke || stroke.stroke.length < 2) return;

        // Calculate bounding box
        const points = stroke.stroke;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        points.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });

        const strokeWidth = maxX - minX;
        const strokeHeight = maxY - minY;
        const padding = 20;

        // Calculate scale to fit canvas
        const scaleX = (canvas.width - padding * 2) / Math.max(strokeWidth, 1);
        const scaleY = (canvas.height - padding * 2) / Math.max(strokeHeight, 1);
        const drawScale = Math.min(scaleX, scaleY, 2); // Cap at 2x

        // Center offset
        const offsetX = (canvas.width - strokeWidth * drawScale) / 2 - minX * drawScale;
        const offsetY = (canvas.height - strokeHeight * drawScale) / 2 - minY * drawScale;

        // Draw stroke
        ctx.beginPath();
        ctx.strokeStyle = stroke.color || '#ffffff';
        ctx.lineWidth = Math.max(1.5, (stroke.size || 2) * drawScale * 0.5);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        points.forEach((p, i) => {
            const x = p.x * drawScale + offsetX;
            const y = p.y * drawScale + offsetY;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Update info
        const indexEl = document.getElementById('flagStrokeIndex');
        const predEl = document.getElementById('flagCurrentPrediction');
        if (indexEl) indexEl.textContent = `Stroke ${index + 1} of ${recentStrokes.length}`;
        if (predEl) {
            const pred = stroke.predictedLabel || 'none';
            predEl.textContent = ` | Predicted: ${pred}`;
        }

        // Update nav buttons
        const prevBtn = document.getElementById('flagPrevBtn');
        const nextBtn = document.getElementById('flagNextBtn');
        if (prevBtn) prevBtn.disabled = index === 0;
        if (nextBtn) nextBtn.disabled = index === recentStrokes.length - 1;
    }

    // Initial draw
    if (recentStrokes.length > 0) {
        setTimeout(() => drawStrokePreview(0), 50);
    }

    // Event handlers
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    document.getElementById('flagCancelBtn')?.addEventListener('click', () => overlay.remove());

    document.getElementById('flagPrevBtn')?.addEventListener('click', () => {
        if (currentStrokeIndex > 0) {
            currentStrokeIndex--;
            drawStrokePreview(currentStrokeIndex);
        }
    });

    document.getElementById('flagNextBtn')?.addEventListener('click', () => {
        if (currentStrokeIndex < recentStrokes.length - 1) {
            currentStrokeIndex++;
            drawStrokePreview(currentStrokeIndex);
        }
    });

    const classSelect = document.getElementById('flagClassSelect');
    const submitBtn = document.getElementById('flagSubmitBtn');

    classSelect?.addEventListener('change', () => {
        if (submitBtn) submitBtn.disabled = !classSelect.value;
    });

    submitBtn?.addEventListener('click', async () => {
        if (!classSelect?.value || recentStrokes.length === 0) return;

        const stroke = recentStrokes[currentStrokeIndex];
        const correctClass = classSelect.value;

        // Prepare data for Firebase
        const flagData = {
            timestamp: Date.now(),
            strokeId: stroke.id,
            strokePoints: stroke.stroke.slice(0, 200), // Limit points
            predictedLabel: stroke.predictedLabel || 'none',
            correctLabel: correctClass,
            flaggedBy: firebase.auth().currentUser?.email || 'unknown',
            noteId: title || 'unknown',
            bbox: stroke.bbox || null
        };

        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting...';

            // Save to Firebase Firestore
            const db = firebase.firestore();
            await db.collection('flagged_strokes').add(flagData);

            console.log('[Admin] Flagged stroke saved:', flagData);

            // Show success and close
            submitBtn.textContent = 'Submitted!';
            setTimeout(() => overlay.remove(), 800);
        } catch (error) {
            console.error('[Admin] Error saving flagged stroke:', error);
            submitBtn.textContent = 'Error - Try Again';
            submitBtn.disabled = false;
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED EXPORT/SHARE POPUP
// ═══════════════════════════════════════════════════════════════════════════

function showExportSharePopup() {
    // Remove existing popup
    const existing = document.getElementById('exportSharePopup');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'exportSharePopup';
    overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.6);
        display: flex; justify-content: center; align-items: center;
        z-index: 99999; backdrop-filter: blur(3px);
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
        background: #1f1f1f; color: #fff; padding: 24px 28px;
        border-radius: 16px; font-family: 'Mali', sans-serif;
        min-width: 320px; max-width: 400px;
    `;

    modal.innerHTML = `
        <h3 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 500;">Export & Share</h3>

        <div style="display: flex; flex-direction: column; gap: 12px;">
            <!-- Export PDF Option -->
            <div class="export-option" data-type="pdf" style="
                background: #2a2a2a; border-radius: 12px; padding: 16px;
                cursor: pointer; border: 2px solid transparent;
                transition: border-color 0.2s, background 0.2s;
            ">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <i class='bx bxs-file-pdf' style="font-size: 28px; color: #ff6b6b;"></i>
                    <div>
                        <div style="font-weight: 500;">Export as PDF</div>
                        <div style="font-size: 12px; color: #888;">Save current note as PDF file</div>
                    </div>
                </div>

                <!-- PDF Options (hidden by default) -->
                <div class="pdf-options" style="display: none; margin-top: 16px; padding-top: 16px; border-top: 1px solid #444;">
                    <div style="margin-bottom: 12px; font-size: 13px; color: #aaa;">Export Mode:</div>
                    <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;">
                        <input type="radio" name="pdfMode" value="continuous" checked style="accent-color: #4ecdc4;">
                        <span>Continuous (single long page)</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; cursor: pointer;">
                        <input type="radio" name="pdfMode" value="paginated" style="accent-color: #4ecdc4;">
                        <span>Paginated (A4 pages)</span>
                    </label>

                    <div style="margin-bottom: 12px; font-size: 13px; color: #aaa;">Include:</div>
                    <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;">
                        <input type="checkbox" id="includeGrid" checked style="accent-color: #4ecdc4;">
                        <span>Background grid</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; cursor: pointer;">
                        <input type="checkbox" id="includeMedia" checked style="accent-color: #4ecdc4;">
                        <span>Images & media</span>
                    </label>

                    <button id="exportPdfBtn" style="
                        width: 100%; padding: 10px; background: #4ecdc4; color: #000;
                        border: none; border-radius: 8px; font-weight: 600;
                        cursor: pointer; font-family: inherit; font-size: 14px;
                    ">Export PDF</button>
                </div>
            </div>

            <!-- Share Notebook Option -->
            <div class="export-option" data-type="share" style="
                background: #2a2a2a; border-radius: 12px; padding: 16px;
                cursor: pointer; border: 2px solid transparent;
                transition: border-color 0.2s, background 0.2s;
            ">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <i class='bx bxs-share-alt' style="font-size: 28px; color: #a855f7;"></i>
                    <div>
                        <div style="font-weight: 500;">Share Notebook</div>
                        <div style="font-size: 12px; color: #888;">Export notes as shareable file</div>
                    </div>
                </div>
            </div>
        </div>

        <button id="cancelExportBtn" style="
            width: 100%; padding: 10px; margin-top: 16px;
            background: transparent; color: #888; border: 1px solid #444;
            border-radius: 8px; cursor: pointer; font-family: inherit;
        ">Cancel</button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Event handlers
    const exportOptions = modal.querySelectorAll('.export-option');
    const pdfOptions = modal.querySelector('.pdf-options');

    exportOptions.forEach(opt => {
        opt.addEventListener('click', (e) => {
            // Don't trigger if clicking inside pdf-options
            if (e.target.closest('.pdf-options')) return;

            const type = opt.dataset.type;

            // Reset all options
            exportOptions.forEach(o => {
                o.style.borderColor = 'transparent';
                o.style.background = '#2a2a2a';
            });

            // Select this option
            opt.style.borderColor = '#4ecdc4';
            opt.style.background = '#333';

            if (type === 'pdf') {
                pdfOptions.style.display = 'block';
            } else if (type === 'share') {
                pdfOptions.style.display = 'none';
                // Show share notebook popup
                overlay.remove();
                showSharePopup();
            }
        });
    });

    // Export PDF button
    modal.querySelector('#exportPdfBtn').addEventListener('click', async () => {
        const mode = modal.querySelector('input[name="pdfMode"]:checked').value;
        const includeGrid = modal.querySelector('#includeGrid').checked;
        const includeMedia = modal.querySelector('#includeMedia').checked;

        overlay.remove();
        await exportCanvasToPDF(allGroups, mode, includeGrid, includeMedia);
    });

    // Cancel button
    modal.querySelector('#cancelExportBtn').addEventListener('click', () => {
        overlay.remove();
    });

    // Click outside to close
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPROVED PDF EXPORT (matches reDrawAll rendering)
// ═══════════════════════════════════════════════════════════════════════════

async function exportCanvasToPDF(groups, mode = "continuous", includeGrid = true, includeMedia = true) {
    // Show loading indicator
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'pdfLoadingOverlay';
    loadingOverlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.7);
        display: flex; justify-content: center; align-items: center;
        z-index: 999999; flex-direction: column; gap: 16px;
    `;
    loadingOverlay.innerHTML = `
        <div style="color: #fff; font-family: Mali; font-size: 18px;">Generating PDF...</div>
        <div style="width: 200px; height: 4px; background: #333; border-radius: 2px; overflow: hidden;">
            <div id="pdfProgress" style="width: 0%; height: 100%; background: #4ecdc4; transition: width 0.3s;"></div>
        </div>
    `;
    document.body.appendChild(loadingOverlay);

    const updateProgress = (percent) => {
        const bar = document.getElementById('pdfProgress');
        if (bar) bar.style.width = percent + '%';
    };

    try {
        updateProgress(10);

        // Helper to get bbox from group (compute from stroke if missing)
        function getGroupBounds(group) {
            // Try bbox first
            if (group.bbox) {
                const b = group.bbox;
                if (typeof b.x === 'number' && typeof b.y === 'number') {
                    return {
                        minX: b.x,
                        minY: b.y,
                        maxX: b.x + (b.w || 0),
                        maxY: b.y + (b.h || 0)
                    };
                }
                if (typeof b.minX === 'number') {
                    return { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY };
                }
            }

            // Compute from stroke if available
            if (Array.isArray(group.stroke) && group.stroke.length > 0) {
                const points = group.stroke.flat ? group.stroke.flat() : group.stroke;
                if (points.length > 0 && points[0]?.x !== undefined) {
                    const xs = points.map(p => p.x).filter(v => Number.isFinite(v));
                    const ys = points.map(p => p.y).filter(v => Number.isFinite(v));
                    if (xs.length > 0 && ys.length > 0) {
                        return {
                            minX: Math.min(...xs),
                            minY: Math.min(...ys),
                            maxX: Math.max(...xs),
                            maxY: Math.max(...ys)
                        };
                    }
                }
            }

            return null;
        }

        // --- Compute full bounding box ---
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let validGroupCount = 0;

        for (const group of groups) {
            if (group?.visibility === false) continue;

            const bounds = getGroupBounds(group);
            if (!bounds) continue;

            // Validate all values are finite numbers
            if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY) ||
                !Number.isFinite(bounds.maxX) || !Number.isFinite(bounds.maxY)) {
                continue;
            }

            minX = Math.min(minX, bounds.minX);
            minY = Math.min(minY, bounds.minY);
            maxX = Math.max(maxX, bounds.maxX);
            maxY = Math.max(maxY, bounds.maxY);
            validGroupCount++;
        }

        console.log('PDF Export - Valid groups:', validGroupCount, 'Bounds:', { minX, minY, maxX, maxY });

        // Handle empty canvas
        if (minX === Infinity || validGroupCount === 0) {
            loadingOverlay.remove();
            alert('No content to export');
            return;
        }

        // --- Apply minimum A4 ratio size ---
        const A4_WIDTH_PT = 595.28;
        const A4_HEIGHT_PT = 841.89;
        const A4_RATIO = A4_WIDTH_PT / A4_HEIGHT_PT;

        const padding = 40;
        let contentWidth = maxX - minX + padding * 2;
        let contentHeight = maxY - minY + padding * 2;

        // Ensure minimum size based on A4 ratio (at least half A4 width equivalent)
        const MIN_WIDTH = 400;
        const MIN_HEIGHT = MIN_WIDTH / A4_RATIO;

        if (contentWidth < MIN_WIDTH) {
            const diff = MIN_WIDTH - contentWidth;
            minX -= diff / 2;
            contentWidth = MIN_WIDTH;
        }
        if (contentHeight < MIN_HEIGHT) {
            const diff = MIN_HEIGHT - contentHeight;
            minY -= diff / 2;
            contentHeight = MIN_HEIGHT;
        }

        updateProgress(20);

        const dpr = Math.min(window.devicePixelRatio || 1, 2); // Cap at 2x for performance

        // --- Create offscreen canvas ---
        const fullCanvas = document.createElement("canvas");
        fullCanvas.width = contentWidth * dpr;
        fullCanvas.height = contentHeight * dpr;
        const ctx = fullCanvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.translate(-minX + padding, -minY + padding);

        updateProgress(30);

        // --- Draw background ---
        if (includeGrid) {
            // Draw background color
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = backgroundColor || CONFIG.DEFAULT_BG_COLOR;
            ctx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);
            ctx.restore();

            // Draw grid
            ctx.save();
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const gridColor = gridLineColor || CONFIG.DEFAULT_GRIDLINE_COLOR;
            const gridSz = gridSize || CONFIG.DEFAULT_GRID_SIZE;
            ctx.strokeStyle = gridColor;
            ctx.lineWidth = 0.5;

            const startX = Math.floor((minX - padding) / gridSz) * gridSz;
            const startY = Math.floor((minY - padding) / gridSz) * gridSz;
            const endX = minX - padding + contentWidth;
            const endY = minY - padding + contentHeight;

            // Horizontal lines
            for (let y = startY; y <= endY; y += gridSz) {
                ctx.beginPath();
                ctx.moveTo(0, y - (minY - padding));
                ctx.lineTo(contentWidth, y - (minY - padding));
                ctx.stroke();
            }

            // Vertical lines (if square grid)
            if (gridStyle === 'square') {
                for (let x = startX; x <= endX; x += gridSz) {
                    ctx.beginPath();
                    ctx.moveTo(x - (minX - padding), 0);
                    ctx.lineTo(x - (minX - padding), contentHeight);
                    ctx.stroke();
                }
            }
            ctx.restore();
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.translate(-minX + padding, -minY + padding);
        } else {
            // Use app background color (not white)
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = backgroundColor || CONFIG.DEFAULT_BG_COLOR;
            ctx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);
            ctx.restore();
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.translate(-minX + padding, -minY + padding);
        }

        updateProgress(40);

        // --- First pass: Draw media and text groups (behind strokes) ---
        if (includeMedia) {
            for (const group of groups) {
                if (!group?.bbox || group?.visibility === false) continue;
                if (group.type === "media") {
                    await drawMediaForExport(ctx, group);
                } else if (group.type === "text") {
                    drawTextGroupForExport(ctx, group);
                }
            }
        }

        updateProgress(60);

        // --- Second pass: Draw all other groups (matching reDrawAll) ---
        for (const group of groups) {
            if (!group?.bbox || group?.visibility === false) continue;
            if (group.type === "media" || group.type === "text") continue; // Already drawn

            const hasStroke = Array.isArray(group.stroke) && group.stroke.length > 0;

            // For stickynote, link, and tape - just render the strokes, not the decorative boxes
            if (group.type === "stickynote" || group.type === "link" || group.type === "tape") {
                if (hasStroke) {
                    const size = group?.size ?? 2;
                    drawStroke(ctx, group.stroke, group.color || defaultPenColor, size);
                }
                continue;
            }

            if (hasStroke) {
                if (group.type === "math_result") {
                    const text = group.text || "??";
                    const textHeight = group.bbox.h;
                    const fontSize = Math.max(14, textHeight * 0.8);
                    ctx.save();
                    ctx.font = `300 ${fontSize}px Mali`;
                    ctx.fillStyle = group.color || "red";
                    ctx.textBaseline = "top";
                    ctx.fillText(text, group.bbox.x, group.bbox.y + 10);
                    ctx.restore();
                }
                else if (group.titleStatus) {
                    const size = group?.size ?? 3;
                    drawStroke(ctx, group.stroke, group.color, size);
                }
                else if (group.type === STROKE_TYPE.HIGHLIGHT || group.predictedLabel === STROKE_TYPE.HIGHLIGHT) {
                    drawHighlight(ctx, group.bbox, group.color);
                }
                else {
                    const size = group?.size ?? 2;
                    drawStroke(ctx, group.stroke, group.color, size);
                }
            } else {
                if (group.shape === 0) drawFinalLine(ctx, group.bbox, group.color, group.directX, group.directY);
                if (group.shape === 1) drawFinalRectangle(ctx, group.bbox, group.color);
                if (group.shape === 2) drawFinalCircle(ctx, group.bbox, group.color);
            }
        }

        updateProgress(80);

        // --- Convert to PDF ---
        const jpegQuality = 0.92;
        const fileName = (title || 'untitled').replace(/[^a-zA-Z0-9]/g, '_');

        // Ensure dimensions are valid positive numbers
        const pdfWidth = Math.max(Math.floor(contentWidth), 100);
        const pdfHeight = Math.max(Math.floor(contentHeight), 100);

        console.log('PDF Export Debug:', { contentWidth, contentHeight, pdfWidth, pdfHeight, canvasW: fullCanvas.width, canvasH: fullCanvas.height, mode });

        // Get image data first
        const imgData = fullCanvas.toDataURL("image/jpeg", jpegQuality);

        // Access jsPDF from the global jspdf object (UMD build)
        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error('jsPDF library not loaded properly');
        }
        const { jsPDF } = window.jspdf;

        // Validate dimensions
        if (!Number.isFinite(pdfWidth) || !Number.isFinite(pdfHeight) || pdfWidth <= 0 || pdfHeight <= 0) {
            throw new Error(`Invalid dimensions: ${pdfWidth} x ${pdfHeight}`);
        }

        // Parse background color for PDF page fill (handles rgba format)
        function parseRgbaToRgb(rgbaStr) {
            const match = rgbaStr.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
            if (match) {
                return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
            }
            // Default dark background
            return { r: 32, g: 31, b: 30 };
        }
        const bgColorStr = backgroundColor || CONFIG.DEFAULT_BG_COLOR;
        const bgRgb = parseRgbaToRgb(bgColorStr);

        if (mode === "continuous") {
            // Create a single-page PDF matching the canvas aspect ratio
            // Use A4 as base and scale appropriately
            const aspectRatio = pdfWidth / pdfHeight;
            let pageW, pageH;

            if (aspectRatio > 1) {
                // Landscape
                pageW = 297;
                pageH = 297 / aspectRatio;
            } else {
                // Portrait
                pageH = 297;
                pageW = 297 * aspectRatio;
            }

            const doc = new jsPDF({
                orientation: aspectRatio > 1 ? 'l' : 'p',
                unit: 'mm',
                format: [pageW, pageH]
            });

            // Fill page with background color (covers any extra space)
            doc.setFillColor(bgRgb.r, bgRgb.g, bgRgb.b);
            doc.rect(0, 0, pageW, pageH, 'F');

            doc.addImage(imgData, 'JPEG', 0, 0, pageW, pageH);
            doc.save(`${fileName}_continuous.pdf`);
        }
        else if (mode === "paginated") {
            // A4 dimensions in mm
            const A4_W = 210;
            const A4_H = 297;

            const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

            // Calculate how to scale the image to fit A4 width
            const aspectRatio = pdfWidth / pdfHeight;
            const imgW = A4_W;
            const imgH = A4_W / aspectRatio;

            // How many pages needed
            const totalPages = Math.ceil(imgH / A4_H);

            for (let page = 0; page < totalPages; page++) {
                if (page > 0) doc.addPage();

                // Fill page with background color (covers any extra space on this page)
                doc.setFillColor(bgRgb.r, bgRgb.g, bgRgb.b);
                doc.rect(0, 0, A4_W, A4_H, 'F');

                // Draw the full image, offset by page number
                const yPos = -(page * A4_H);
                doc.addImage(imgData, 'JPEG', 0, yPos, imgW, imgH);

                updateProgress(80 + (page / totalPages) * 15);
            }

            doc.save(`${fileName}_a4.pdf`);
        }

        updateProgress(100);
        setTimeout(() => loadingOverlay.remove(), 300);

    } catch (error) {
        console.error('PDF export error:', error);
        loadingOverlay.remove();
        alert('Error exporting PDF: ' + error.message);
    }
}

// Helper: Draw media for export (handles async image loading)
async function drawMediaForExport(ctx, group) {
    if (!group.dataUrl) return;

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const { x, y, w, h } = group.bbox;
            ctx.save();
            ctx.globalAlpha = group.opacity !== undefined ? group.opacity : 1.0;

            if (group.rotation && group.rotation !== 0) {
                const cx = x + w / 2;
                const cy = y + h / 2;
                ctx.translate(cx, cy);
                ctx.rotate((group.rotation * Math.PI) / 180);
                ctx.translate(-cx, -cy);
            }

            ctx.drawImage(img, x, y, w, h);
            ctx.restore();
            resolve();
        };
        img.onerror = () => resolve();
        img.src = group.dataUrl;
    });
}

// Helper: Draw text group for export
function drawTextGroupForExport(ctx, group) {
    if (!group.text) return;

    const { x, y, w } = group.bbox;

    ctx.save();
    ctx.globalAlpha = group.opacity !== undefined ? group.opacity : 1.0;

    if (group.rotation && group.rotation !== 0) {
        const cx = x + group.bbox.w / 2;
        const cy = y + group.bbox.h / 2;
        ctx.translate(cx, cy);
        ctx.rotate((group.rotation * Math.PI) / 180);
        ctx.translate(-cx, -cy);
    }

    ctx.font = `${group.fontSize}px '${group.fontFamily}', sans-serif`;
    ctx.fillStyle = group.color || '#ffffff';
    ctx.textBaseline = 'top';

    let textX = x + 10;
    if (group.textAlign === 'center') {
        ctx.textAlign = 'center';
        textX = x + w / 2;
    } else if (group.textAlign === 'right') {
        ctx.textAlign = 'right';
        textX = x + w - 10;
    } else {
        ctx.textAlign = 'left';
    }

    const lines = group.text.split('\n');
    const lineHeight = group.fontSize * 1.3;
    lines.forEach((line, i) => {
        ctx.fillText(line, textX, y + 5 + i * lineHeight);
    });

    ctx.restore();
}

// Helper: Draw tape for export
function drawTapeForExport(ctx, group) {
    const { x, y, w, h } = group.bbox;
    const revealed = group.revealed || false;
    const preset = group.preset || 'polkadot';

    const padding = 6;
    const tx = x - padding;
    const ty = y - padding;
    const tw = w + padding * 2;
    const th = h + padding * 2;

    ctx.save();

    // Draw strokes underneath
    if (Array.isArray(group.stroke) && group.stroke.length > 0) {
        group.stroke.forEach(st => {
            if (!st.path || st.path.length < 2) return;
            ctx.beginPath();
            for (let i = 0; i < st.path.length; i++) {
                const point = st.path[i];
                if (i === 0) ctx.moveTo(point.x, point.y);
                else ctx.lineTo(point.x, point.y);
            }
            ctx.strokeStyle = st.color || '#ffffff';
            ctx.lineWidth = st.size || 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        });
    }

    // Draw text blocks underneath
    if (Array.isArray(group.textBlocks) && group.textBlocks.length > 0) {
        group.textBlocks.forEach(tb => {
            ctx.save();
            ctx.globalAlpha = tb.opacity !== undefined ? tb.opacity : 1.0;
            ctx.font = `${tb.fontSize}px '${tb.fontFamily}', sans-serif`;
            ctx.fillStyle = tb.color || '#ffffff';
            ctx.textBaseline = 'top';
            ctx.textAlign = 'left';

            const lines = tb.text.split('\n');
            const lineHeight = tb.fontSize * 1.3;
            lines.forEach((line, i) => {
                ctx.fillText(line, tb.bbox.x + 10, tb.bbox.y + 5 + i * lineHeight);
            });
            ctx.restore();
        });
    }

    // Draw tape if not revealed
    if (!revealed) {
        const presetData = CONFIG.TAPE.PRESETS.find(p => p.id === preset) || CONFIG.TAPE.PRESETS[0];
        const patternCanvas = generateTapePattern(preset);
        const pattern = ctx.createPattern(patternCanvas, 'repeat');

        // Draw zigzag tape shape
        ctx.beginPath();
        const zigzagSize = 8;
        ctx.moveTo(tx, ty);
        for (let px = tx; px < tx + tw; px += zigzagSize * 2) {
            ctx.lineTo(Math.min(px + zigzagSize, tx + tw), ty - zigzagSize);
            ctx.lineTo(Math.min(px + zigzagSize * 2, tx + tw), ty);
        }
        ctx.lineTo(tx + tw, ty + th);
        for (let px = tx + tw; px > tx; px -= zigzagSize * 2) {
            ctx.lineTo(Math.max(px - zigzagSize, tx), ty + th + zigzagSize);
            ctx.lineTo(Math.max(px - zigzagSize * 2, tx), ty + th);
        }
        ctx.closePath();

        ctx.fillStyle = pattern;
        ctx.fill();
    }

    ctx.restore();
}

// =============== SMART SUMMARIZE FEATURE ===================
document.getElementById("sendToTotalBtn").onclick = () => {
  if (!selectedFolder) return alert("Please choose a folder first");
  showSummarizePopup();
};

// =============== POPUP MENU (CHECKBOX UI) ===================
function showSummarizePopup() {
  const old = document.getElementById("summarizePopup");
  if (old) old.remove();

  // Get colors from settings
  const getToolColor = (toolId, fallback) => {
    const tool = toolboxLayout?.underline?.find(t => t.id === toolId);
    return tool?.color || fallback;
  };
  const title1Color = getToolColor(TOOL_ID.TITLE1, "#f4c64a");
  const title2Color = getToolColor(TOOL_ID.TITLE2, "#ff6a00");
  const title3Color = getToolColor(TOOL_ID.TITLE3, "#7adb13");
  const boxColor = modifiers?.box?.color || DEFAULT_MODIFIERS.box.color;
  const curlyColor = modifiers?.curly?.color || DEFAULT_MODIFIERS.curly.color;
  const squareBracketColor = modifiers?.squarebracket?.color || DEFAULT_MODIFIERS.squarebracket.color;
  const wavyBracketColor = modifiers?.wavybracket?.color || DEFAULT_MODIFIERS.wavybracket.color;
  const circleBracketColor = modifiers?.circlebracket?.color || DEFAULT_MODIFIERS.circlebracket.color;

  const overlay = document.createElement("div");
  overlay.id = "summarizePopup";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.6)";
  overlay.style.backdropFilter = "blur(3px)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = 999999;

  const box = document.createElement("div");
  box.style.background = "#1f1f1f";
  box.style.color = "#fff";
  box.style.padding = "24px 36px";
  box.style.borderRadius = "16px";
  box.style.boxShadow = "0 4px 20px rgba(0,0,0,0.3)";
  box.style.fontFamily = "sans-serif";
  box.style.textAlign = "left";
  box.style.minWidth = "320px";
  box.style.maxHeight = "80vh";
  box.style.overflowY = "auto";

  box.innerHTML = `
    <h3 style="margin-top:0;font-size:18px;text-align:center">Select Important Information</h3>
    <p style="font-size:12px;color:#aaa;margin-bottom:16px;text-align:center;">Choose what modifiers to include in the summary</p>

    <div style="margin-bottom:16px;">
      <p style="font-size:13px;color:#888;margin:0 0 6px;font-weight:600;">Summary Name</p>
      <input id="summaryNameInput" type="text" value="summary" placeholder="Enter summary name..."
        style="width:100%;padding:8px 12px;border:1px solid #444;border-radius:6px;background:#2a2a2a;color:#fff;font-size:14px;box-sizing:border-box;">
    </div>

    <div style="margin-bottom:12px;">
      <p style="font-size:13px;color:#888;margin:0 0 6px;font-weight:600;">Titles</p>
      <label style="display:block;margin:6px 0;padding-left:12px;">
        <input id="chkTitle1" type="checkbox" checked style="transform:scale(1.2);margin-right:8px;accent-color:${title1Color};">
        <span style="color:${title1Color};">Title 1</span>
      </label>
      <label style="display:block;margin:6px 0;padding-left:12px;">
        <input id="chkTitle2" type="checkbox" checked style="transform:scale(1.2);margin-right:8px;accent-color:${title2Color};">
        <span style="color:${title2Color};">Title 2</span>
      </label>
      <label style="display:block;margin:6px 0;padding-left:12px;">
        <input id="chkTitle3" type="checkbox" style="transform:scale(1.2);margin-right:8px;accent-color:${title3Color};">
        <span style="color:${title3Color};">Title 3</span>
      </label>
    </div>

    <div style="margin-bottom:12px;">
      <p style="font-size:13px;color:#888;margin:0 0 6px;font-weight:600;">Modifiers</p>
      <label style="display:block;margin:6px 0;padding-left:12px;">
        <input id="chkBox" type="checkbox" checked style="transform:scale(1.2);margin-right:8px;accent-color:${boxColor};">
        <span style="color:${boxColor};">Box</span>
      </label>
      <label style="display:block;margin:6px 0;padding-left:12px;">
        <input id="chkCurly" type="checkbox" style="transform:scale(1.2);margin-right:8px;accent-color:${curlyColor};">
        <span style="color:${curlyColor};">Curly Bracket</span>
      </label>
      <label style="display:block;margin:6px 0;padding-left:12px;">
        <input id="chkSquareBracket" type="checkbox" style="transform:scale(1.2);margin-right:8px;accent-color:${squareBracketColor};">
        <span style="color:${squareBracketColor};">Square bracket</span>
      </label>
      <label style="display:block;margin:6px 0;padding-left:12px;">
        <input id="chkWavyBracket" type="checkbox" style="transform:scale(1.2);margin-right:8px;accent-color:${wavyBracketColor};">
        <span style="color:${wavyBracketColor};">Wavy bracket</span>
      </label>
      <label style="display:block;margin:6px 0;padding-left:12px;">
        <input id="chkCircleBracket" type="checkbox" style="transform:scale(1.2);margin-right:8px;accent-color:${circleBracketColor};">
        <span style="color:${circleBracketColor};">Circle bracket</span>
      </label>
    </div>

    <div style="text-align:center;margin-top:16px;">
      <button id="startSummarizeBtn" style="background:#007aff;color:white;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;">Generate Summary</button>
      <button id="cancelSummarizeBtn" style="margin-left:10px;background:#444;color:white;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;">Cancel</button>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  document.getElementById("cancelSummarizeBtn").onclick = () => overlay.remove();

  document.getElementById("startSummarizeBtn").onclick = () => {
    const summaryName = document.getElementById("summaryNameInput").value.trim() || "summary";
    const options = {
      summaryName: summaryName,
      includeTitle1: document.getElementById("chkTitle1").checked,
      includeTitle2: document.getElementById("chkTitle2").checked,
      includeTitle3: document.getElementById("chkTitle3").checked,
      includeBox: document.getElementById("chkBox").checked,
      includeCurly: document.getElementById("chkCurly").checked,
      includeSquareBracket: document.getElementById("chkSquareBracket").checked,
      includeWavyBracket: document.getElementById("chkWavyBracket").checked,
      includeCircleBracket: document.getElementById("chkCircleBracket").checked,
    };
    overlay.remove();

    // Check if summary with this name already exists
    const summaryPath = `${selectedFolder}/${summaryName}.json`;
    checkSummaryExists(summaryPath, (exists) => {
      if (exists) {
        showSummaryExistsWarning(summaryName, options);
      } else {
        summarizeNotes(options);
      }
    });
  };
}

// Check if a summary note already exists
function checkSummaryExists(path, callback) {
  loadNote(path, (note) => {
    callback(note !== null && note !== undefined);
  });
}

// Show warning when summary already exists
function showSummaryExistsWarning(summaryName, options) {
  const overlay = document.createElement("div");
  overlay.id = "summaryWarningPopup";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.7)";
  overlay.style.backdropFilter = "blur(3px)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = 1000000;

  const box = document.createElement("div");
  box.style.background = "#1f1f1f";
  box.style.color = "#fff";
  box.style.padding = "24px 32px";
  box.style.borderRadius = "12px";
  box.style.boxShadow = "0 4px 20px rgba(0,0,0,0.4)";
  box.style.fontFamily = "sans-serif";
  box.style.textAlign = "center";
  box.style.maxWidth = "340px";

  box.innerHTML = `
    <h3 style="margin:0 0 12px;font-size:16px;color:#ffaa00;">Summary Already Exists</h3>
    <p style="font-size:13px;color:#ccc;margin-bottom:20px;">
      A summary named "<strong>${summaryName}</strong>" already exists in this folder.
    </p>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
      <button id="replaceBtn" style="background:#ff6b6b;color:white;border:none;padding:10px 20px;border-radius:8px;font-size:13px;cursor:pointer;">Replace</button>
      <button id="renameBtn" style="background:#007aff;color:white;border:none;padding:10px 20px;border-radius:8px;font-size:13px;cursor:pointer;">Rename</button>
      <button id="cancelWarningBtn" style="background:#444;color:white;border:none;padding:10px 20px;border-radius:8px;font-size:13px;cursor:pointer;">Cancel</button>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  document.getElementById("replaceBtn").onclick = () => {
    overlay.remove();
    // Skip freshness check after replacing (prevents "outdated" prompt)
    window.skipNextFreshnessCheck = true;
    summarizeNotes(options);
  };

  document.getElementById("renameBtn").onclick = () => {
    overlay.remove();
    showSummarizePopup(); // Go back to the popup to rename
  };

  document.getElementById("cancelWarningBtn").onclick = () => {
    overlay.remove();
  };
}

// =============== NORMALIZE COLOR HELPER ===================
// Converts colors to a consistent format for comparison
function normalizeColor(color) {
  if (!color) return '';
  color = String(color).trim().toLowerCase();

  // Handle hex colors
  if (color.startsWith('#')) {
    // Expand shorthand (#abc -> #aabbcc)
    if (color.length === 4) {
      return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
    }
    return color;
  }

  // Handle rgb/rgba colors -> convert to hex
  if (color.startsWith('rgb')) {
    const match = color.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (match) {
      const r = parseInt(match[1]).toString(16).padStart(2, '0');
      const g = parseInt(match[2]).toString(16).padStart(2, '0');
      const b = parseInt(match[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
  }

  return color;
}

// =============== MAIN SUMMARIZE PROCESS ===================
function summarizeNotes(options) {
  const {
    summaryName = "summary",
    includeTitle1, includeTitle2, includeTitle3,
    includeBox, includeCurly,
    includeSquareBracket, includeWavyBracket, includeCircleBracket
  } = options;

  const summaryPath = `${selectedFolder}/${summaryName}.json`;

  // Use listNotesInFolderWithDates to get creation dates for ordering
  listNotesInFolderWithDates(selectedFolder, (notesWithDates) => {
    // Filter out all summary notes to avoid double counting, and sort by creation date (oldest first)
    const filteredNotes = notesWithDates
      .filter(n => n.path !== summaryPath && !n.isSummaryNote)
      .sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
        const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
        return dateA - dateB;
      });

    if (filteredNotes.length === 0) {
      return alert("No notes found in this folder.");
    }

    // Collect all important content from all notes
    let allSummaryItems = [];
    let pending = filteredNotes.length;

    filteredNotes.forEach((noteInfo, noteIndex) => {
      loadNote(noteInfo.path, (note) => {
        if (note?.content && Array.isArray(note.content)) {
          const groups = note.content;
          const noteCreatedAt = noteInfo.created_at || new Date(0).toISOString();

          // ========== GLOBAL DEDUPLICATION ==========
          // Track claimed stroke IDs across ALL modifier types to prevent duplicates
          // Priority order: Titles > Box > Curly > Shortcuts (most recent shortcut wins within shortcuts)
          const claimedStrokeIds = new Set();

          // ========== COLLECT TITLES (grouped by titleGroupId) ==========
          if (includeTitle1 || includeTitle2 || includeTitle3) {
            const titleGroupsMap = new Map(); // titleGroupId -> { level, strokes, bbox }

            groups.forEach(group => {
              if (!group.titleStatus || !group.titleLevel || group.visibility === false) return;
              if (!group.bbox || !Array.isArray(group.stroke)) return;

              // Check if this title level is selected
              const level = group.titleLevel;
              if ((level === 1 && !includeTitle1) ||
                  (level === 2 && !includeTitle2) ||
                  (level === 3 && !includeTitle3)) return;

              const groupId = group.titleGroupId || `fallback_${group.id}`;

              if (!titleGroupsMap.has(groupId)) {
                titleGroupsMap.set(groupId, {
                  level: level,
                  strokes: [structuredClone(group)],
                  strokeIds: [group.id], // Track IDs for claiming
                  minX: group.bbox.x,
                  maxX: group.bbox.x + group.bbox.w,
                  minY: group.bbox.y,
                  maxY: group.bbox.y + group.bbox.h
                });
              } else {
                const existing = titleGroupsMap.get(groupId);
                existing.strokes.push(structuredClone(group));
                existing.strokeIds.push(group.id);
                existing.minX = Math.min(existing.minX, group.bbox.x);
                existing.maxX = Math.max(existing.maxX, group.bbox.x + group.bbox.w);
                existing.minY = Math.min(existing.minY, group.bbox.y);
                existing.maxY = Math.max(existing.maxY, group.bbox.y + group.bbox.h);
              }
            });

            // Convert title groups to summary items and claim their stroke IDs
            titleGroupsMap.forEach((titleGroup, groupId) => {
              // Claim all stroke IDs in this title group
              titleGroup.strokeIds.forEach(id => claimedStrokeIds.add(id));

              const combinedBbox = {
                x: titleGroup.minX,
                y: titleGroup.minY,
                w: titleGroup.maxX - titleGroup.minX,
                h: titleGroup.maxY - titleGroup.minY
              };

              allSummaryItems.push({
                summaryType: "title",
                summaryLevel: titleGroup.level,
                summarySource: noteInfo.path,
                noteCreatedAt: noteCreatedAt,
                noteIndex: noteIndex,
                originalY: titleGroup.minY,
                originalBbox: { ...combinedBbox },
                bbox: { ...combinedBbox },
                strokes: titleGroup.strokes, // Array of stroke groups
                children: []
              });
            });
          }

          // ========== COLLECT BOX MODIFIERS ==========
          if (includeBox) {
            // Get the expected box modifier color from settings
            const boxModifierColor = normalizeColor(modifiers?.box?.color || DEFAULT_MODIFIERS.box.color);

            groups.forEach(group => {
              if (group.visibility === false) return;
              if (!group.bbox || !Array.isArray(group.stroke)) return;

              const isBox = group.predictedLabel === STROKE_TYPE.BOX ||
                           group.predictedLabel === 1 ||
                           group.predictedLabel === "box";

              if (isBox) {
                const boxClone = structuredClone(group);
                const children = [];

                // Collect strokes inside the box (only unclaimed ones WITH matching color)
                groups.forEach(other => {
                  if (other.id !== group.id && other.bbox && Array.isArray(other.stroke) && other.visibility !== false) {
                    // Check if stroke color matches the box modifier color
                    const strokeColor = normalizeColor(other.color);
                    const colorMatches = strokeColor === boxModifierColor;

                    if (!claimedStrokeIds.has(other.id) && colorMatches && isInside(other.stroke, group.stroke)) {
                      children.push(structuredClone(other));
                    }
                  }
                });

                // Only add if there are unclaimed children with matching color
                if (children.length > 0) {
                  // Claim these stroke IDs
                  children.forEach(c => claimedStrokeIds.add(c.id));

                  allSummaryItems.push({
                    summaryType: "box",
                    summaryLevel: null,
                    summarySource: noteInfo.path,
                    noteCreatedAt: noteCreatedAt,
                    noteIndex: noteIndex,
                    originalY: group.bbox.y,
                    originalBbox: { ...group.bbox },
                    bbox: { ...group.bbox },
                    strokes: [boxClone], // The box modifier itself
                    children: children
                  });
                }
              }
            });
          }

          // ========== COLLECT CURLY MODIFIERS ==========
          if (includeCurly) {
            // Get the expected curly modifier color from settings
            const curlyModifierColor = normalizeColor(modifiers?.curly?.color || DEFAULT_MODIFIERS.curly.color);

            groups.forEach(group => {
              if (group.visibility === false) return;
              if (!group.bbox || !Array.isArray(group.stroke)) return;

              const isCurly = group.predictedLabel === STROKE_TYPE.CURLY ||
                             group.predictedLabel === 2 ||
                             group.predictedLabel === "curly";

              if (isCurly) {
                const curlyClone = structuredClone(group);
                const children = [];

                // Collect strokes inside the curly (only unclaimed ones WITH matching color)
                groups.forEach(other => {
                  if (other.id !== group.id && other.bbox && Array.isArray(other.stroke) && other.visibility !== false) {
                    // Check if stroke color matches the curly modifier color
                    const strokeColor = normalizeColor(other.color);
                    const colorMatches = strokeColor === curlyModifierColor;

                    if (!claimedStrokeIds.has(other.id) && colorMatches && isInside(other.stroke, group.stroke)) {
                      children.push(structuredClone(other));
                    }
                  }
                });

                // Only add if there are unclaimed children with matching color
                if (children.length > 0) {
                  // Claim these stroke IDs
                  children.forEach(c => claimedStrokeIds.add(c.id));

                  allSummaryItems.push({
                    summaryType: "curly",
                    summaryLevel: null,
                    summarySource: noteInfo.path,
                    noteCreatedAt: noteCreatedAt,
                    noteIndex: noteIndex,
                    originalY: group.bbox.y,
                    originalBbox: { ...group.bbox },
                    bbox: { ...group.bbox },
                    strokes: [curlyClone], // The curly modifier itself
                    children: children
                  });
                }
              }
            });
          }

          // ========== COLLECT SHORTCUTS (box, curly, circle) ==========
          // First pass: collect all potential shortcuts with their children
          const potentialShortcuts = [];
          const shortcutTypes = [
            { include: includeSquareBracket, labels: [STROKE_TYPE.SQUAREBRACKET, 4, "squarebracket"], type: "squarebracket" },
            { include: includeWavyBracket, labels: [STROKE_TYPE.WAVYBRACKET, 5, "wavybracket"], type: "wavybracket" },
            { include: includeCircleBracket, labels: [STROKE_TYPE.CIRCLEBRACKET, 6, "circlebracket"], type: "circlebracket" }
          ];

          shortcutTypes.forEach(({ include, labels, type }) => {
            if (!include) return;

            // Get the expected shortcut modifier color from settings
            const shortcutModifierColor = normalizeColor(modifiers?.[type]?.color || DEFAULT_MODIFIERS[type]?.color);

            groups.forEach((group, groupIndex) => {
              if (!group.bbox || !Array.isArray(group.stroke)) return;

              const isShortcut = labels.includes(group.predictedLabel);
              // Skip visibility=false unless it's a shortcut we're looking for
              // (shortcuts have visibility=false but should still be collected)
              if (group.visibility === false && !isShortcut) return;

              if (isShortcut) {
                const children = [];
                const shortcutBox = group.bbox;

                // Collect strokes within Y bounds (how shortcuts select - see classifyStroke)
                // Exclude the shortcut modifier itself - only collect content strokes WITH matching color
                groups.forEach(other => {
                  if (other.id !== group.id && other.bbox && Array.isArray(other.stroke) && other.visibility !== false) {
                    const otherBox = other.bbox;
                    // Match classifyStroke logic: bbox.y > newBox.y && (bbox.y + bbox.h) < (newBox.y + newBox.h)
                    const isWithinYBounds = otherBox.y > shortcutBox.y &&
                                           (otherBox.y + otherBox.h) < (shortcutBox.y + shortcutBox.h);

                    // Check if stroke color matches the shortcut modifier color
                    const strokeColor = normalizeColor(other.color);
                    const colorMatches = strokeColor === shortcutModifierColor;

                    if (isWithinYBounds && colorMatches) {
                      children.push(structuredClone(other));
                    }
                  }
                });

                // Store potential shortcut with its groupIndex for sorting
                if (children.length > 0) {
                  potentialShortcuts.push({
                    groupIndex,
                    type,
                    children,
                    noteInfoPath: noteInfo.path,
                    noteCreatedAt,
                    noteIndex
                  });
                }
              }
            });
          });

          // Deduplicate: newest shortcuts claim strokes first
          // (if user corrects a shortcut, the newer one wins)

          // Sort by groupIndex descending (most recent shortcut first)
          potentialShortcuts.sort((a, b) => b.groupIndex - a.groupIndex);

          potentialShortcuts.forEach(item => {
            // Filter children to only those not claimed by a more recent shortcut
            const unclaimedChildren = item.children.filter(c => !claimedStrokeIds.has(c.id));

            if (unclaimedChildren.length === 0) return; // Skip - all children already claimed

            // Claim these stroke IDs
            unclaimedChildren.forEach(c => claimedStrokeIds.add(c.id));

            // Calculate bounding box from unclaimed children only
            const childBboxes = unclaimedChildren.map(c => c.bbox);
            const combinedBbox = {
              x: Math.min(...childBboxes.map(b => b.x)),
              y: Math.min(...childBboxes.map(b => b.y)),
              w: Math.max(...childBboxes.map(b => b.x + b.w)) - Math.min(...childBboxes.map(b => b.x)),
              h: Math.max(...childBboxes.map(b => b.y + b.h)) - Math.min(...childBboxes.map(b => b.y))
            };

            allSummaryItems.push({
              summaryType: item.type,
              summaryLevel: null,
              summarySource: item.noteInfoPath,
              noteCreatedAt: item.noteCreatedAt,
              noteIndex: item.noteIndex,
              originalY: combinedBbox.y,
              originalBbox: { ...combinedBbox },
              bbox: { ...combinedBbox },
              strokes: unclaimedChildren,  // Only unclaimed content strokes
              children: []
            });
          });
        }

        if (--pending === 0) finalize();
      });
    });

    // ===== FINALIZE (layout + save) =====
    function finalize() {
      if (allSummaryItems.length === 0) {
        return alert("No important content found with the selected modifiers.");
      }

      // Sort: first by note creation date (noteIndex), then by Y position within each note
      allSummaryItems.sort((a, b) => {
        if (a.noteIndex !== b.noteIndex) {
          return a.noteIndex - b.noteIndex;
        }
        return a.originalY - b.originalY;
      });

      // Layout parameters
      const leftMargin = 40;
      const baseSpacing = 20;
      const sectionSpacing = 10;
      const navButtonHeight = 28;
      const heightThreshold = 100; // If gap between consecutive items exceeds this, start new section
      let currentY = 80;
      const newGroups = [];
      let startID = Date.now();

      // Group items into sections based on height threshold
      // Items from the same note that are close together (gap < threshold) form one section
      const sections = [];
      let currentSection = null;

      allSummaryItems.forEach((item, idx) => {
        const prevItem = idx > 0 ? allSummaryItems[idx - 1] : null;

        // Check if we should start a new section
        const isDifferentNote = !prevItem || item.noteIndex !== prevItem.noteIndex;
        const exceedsHeightThreshold = prevItem &&
          item.noteIndex === prevItem.noteIndex &&
          (item.originalY - (prevItem.originalY + prevItem.originalBbox.h)) > heightThreshold;

        if (isDifferentNote || exceedsHeightThreshold) {
          // Start a new section
          currentSection = {
            noteIndex: item.noteIndex,
            summarySource: item.summarySource,
            noteCreatedAt: item.noteCreatedAt,
            items: [item],
            // Track original bbox for the section (for nav link positioning)
            originalBbox: { ...item.originalBbox }
          };
          sections.push(currentSection);
        } else {
          // Add to current section
          currentSection.items.push(item);
        }
      });

      // Now layout each section
      sections.forEach((section, sectionIdx) => {
        // Add extra spacing between sections
        if (sectionIdx > 0) {
          currentY += sectionSpacing;
        }

        // Calculate the section's combined original bbox
        const sectionMinY = Math.min(...section.items.map(it => it.originalY));
        const sectionMaxBottom = Math.max(...section.items.map(it => it.originalY + it.originalBbox.h));

        // First, add the nav link at the top of the section
        const navLinkGroup = createSummaryNavLink(
          section.summarySource,
          section.originalBbox,
          leftMargin,
          currentY,
          startID++,
          section.noteCreatedAt
        );
        newGroups.push(navLinkGroup);

        // Move currentY below the nav link
        currentY += navButtonHeight + 8; // Small gap after nav link

        // Track the starting Y for this section's content
        const sectionStartY = currentY;
        let maxBottomY = currentY;

        // Layout items within the section
        section.items.forEach((item, itemIdx) => {
          let dy;

          if (section.items.length === 1) {
            // Single item section: place directly at currentY
            dy = sectionStartY - item.bbox.y;
          } else {
            // Multiple items in section: preserve their relative y positions
            dy = sectionStartY + (item.originalY - sectionMinY) - item.bbox.y;
          }

          const dx = leftMargin - item.bbox.x;

          // Translate and add all strokes in this summary item
          item.strokes.forEach(strokeGroup => {
            translateGroup(strokeGroup, dx, dy);
            strokeGroup.id = startID++;
            newGroups.push(strokeGroup);

            // Track bottom after translation
            const bottom = strokeGroup.bbox.y + strokeGroup.bbox.h;
            if (bottom > maxBottomY) maxBottomY = bottom;
          });

          // Translate and add children
          item.children.forEach(child => {
            translateGroup(child, dx, dy);
            child.id = startID++;
            newGroups.push(child);

            // Track bottom after translation
            const bottom = child.bbox.y + child.bbox.h;
            if (bottom > maxBottomY) maxBottomY = bottom;
          });

          // Update item bbox after translation
          item.bbox.x += dx;
          item.bbox.y += dy;
        });

        // Update currentY for next section
        currentY = maxBottomY + baseSpacing;
      });

      // Store metadata for freshness tracking
      const summaryMetadata = {
        generatedAt: new Date().toISOString(),
        importantItemCount: allSummaryItems.length,
        folderName: selectedFolder,
        selectedOptions: {
          includeTitle1, includeTitle2, includeTitle3,
          includeBox, includeCurly,
          includeSquareBracket, includeWavyBracket, includeCircleBracket
        }
      };

      // Save as summary note and auto-open it
      saveNote(summaryPath, newGroups, () => {
        showStatus(`Summary "${summaryName}" created with ${allSummaryItems.length} items`);
        // Refresh folder to show the new summary note
        openFolder(selectedFolder);
        // Auto-open the summary note after a short delay to ensure list is updated
        setTimeout(() => {
          autoOpenSummaryNote(summaryPath);
        }, 100);
      }, { isSummaryNote: true, summaryMetadata });
    }
  });
}

/// Helper: Create a navigation link group for summary items
function createSummaryNavLink(sourcePath, originalBbox, x, y, id, noteDate) {
  const noteName = sourcePath.split('/').pop().replace('.json', '');

  // Format date for display
  const formattedDate = noteDate
    ? new Date(noteDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '';

  return {
    id: id,
    type: "summary_nav",
    bbox: { x: x, y: y, w: 160, h: 20 }, // Wider to fit date
    stroke: [],
    color: "#4a9eff",
    visibility: true,
    summaryNavTarget: sourcePath,
    summaryNavScrollY: originalBbox.y,
    summaryNavLabel: noteName,
    summaryNavDate: formattedDate,
    size: 1
  };
}

// Helper: Auto-open the summary note after generation
function autoOpenSummaryNote(summaryPath) {
  // Find the summary button in the note list and click it
  const noteList = document.getElementById('note-list');
  if (!noteList) return;

  const buttons = noteList.querySelectorAll('.note-button');
  for (const btn of buttons) {
    // Check if this button is for the summary note
    const btnId = btn.id;
    const expectedId = summaryPath.replace('/', '_').replace('.json', '');
    if (btnId === expectedId) {
      btn.click();
      return;
    }
  }

  // Fallback: directly load the note if button not found
  loadNote(summaryPath, (note) => {
    if (note) {
      // Close any open embed frame when switching notes
      if (typeof closeEmbedFrame === 'function') closeEmbedFrame();

      title = summaryPath;
      allGroups = note.content || [];
      syncGroupIds(allGroups);
      reDrawAll(drawCtx);
      drawGrid(backgroundCtx);
    }
  });
}

// ================== HELPERS ===================
function translateGroup(group, dx, dy) {
  if (group.bbox) {
    group.bbox.x += dx;
    group.bbox.y += dy;
  }
  if (group.type === 'text') {
    // For text blocks, update fake strokes based on new bbox position
    updateTextStrokes(group);
  } else if (Array.isArray(group.stroke)) {
    group.stroke.forEach(p => {
        if (p && typeof p.x === "number" && typeof p.y === "number") {
        p.x += dx;
        p.y += dy;
        }
    });
  }
}

function showStatus(msg) {
  const div = document.createElement("div");
  div.textContent = msg;
  div.style.position = "fixed";
  div.style.bottom = "20px";
  div.style.left = "50%";
  div.style.transform = "translateX(-50%)";
  div.style.padding = "10px 18px";
  div.style.background = "rgba(0,0,0,0.75)";
  div.style.color = "white";
  div.style.borderRadius = "8px";
  div.style.fontSize = "14px";
  div.style.zIndex = 999999;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 1400);
}


// ======== Floating Pointer Overlay (Pen Image, Top-Left Anchor, Scaled) ========


// ======================= TOC PANEL HANDLER ==========================
const tocPanel = document.getElementById("tocPanel");
const tocTab = document.getElementById("tocTab");
const tocList = document.getElementById("tocList");

// Cache for title anchors to avoid recalculation
let cachedTitleAnchors = null;
let titleAnchorsNeedRefresh = true;

function invalidateTitleCache() {
  titleAnchorsNeedRefresh = true;
  cachedTitleAnchors = null;
}

function toggleTocPanel() {
  tocPanel.classList.toggle("open");
  if (tocPanel.classList.contains("open")) {
    populateTocList();
  }
}

function populateTocList() {
  if (!tocList) return;

  // Only regroup if needed
  if (titleAnchorsNeedRefresh) {
    regroupTitles();
    cachedTitleAnchors = allGroups.filter(g => g.isTitleAnchor);
    cachedTitleAnchors.sort((a, b) => a.bbox.y - b.bbox.y);
    titleAnchorsNeedRefresh = false;
  }

  const anchors = cachedTitleAnchors || [];

  // Clear and check for empty state
  tocList.innerHTML = "";

  if (anchors.length === 0) {
    tocList.innerHTML = '<div class="toc-empty">No headings yet</div>';
    return;
  }

  // Use DocumentFragment for efficient batch DOM insertion
  const fragment = document.createDocumentFragment();

  anchors.forEach(anchor => {
    const item = document.createElement("div");
    const level = anchor.titleLevel || 1;
    item.className = `toc-item toc-level-${level}`;

    // Thumbnail preview only (no text label)
    const img = document.createElement("img");
    img.className = "toc-item-preview";
    img.src = renderTitleThumbnailFromAnchor(anchor);
    img.alt = "";
    item.appendChild(img);

    // Click to scroll with smooth animation
    item.onclick = () => scrollToAnchor(anchor);

    fragment.appendChild(item);
  });

  tocList.appendChild(fragment);
}

function scrollToAnchor(anchor) {
  // Position title with generous top margin (100px from screen top)
  const targetY = anchor.bbox.y - 80;
  const duration = 400;
  const startY = viewportOffset.y;
  const deltaY = targetY - startY;
  const startTime = performance.now();

  // Calculate bounds once
  const maxHeightObj = allGroups.reduce((max, obj) =>
    (obj?.bbox?.y + obj?.bbox?.h) > (max.bbox?.y + max.bbox?.h) ? obj : max
  , { bbox: { y: 0, h: 0 } });
  const contentHeight = maxHeightObj.bbox.y + maxHeightObj.bbox.h + viewportHeight;
  const minY = panningLimit?.top || 0;
  const maxY = contentHeight - viewportHeight;

  function smoothScroll() {
    const now = performance.now();
    const progress = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    viewportOffset.y = startY + deltaY * ease;
    viewportOffset.y = Math.min(Math.max(viewportOffset.y, minY), maxY);
    screenBox.y = viewportOffset.y;

    updateScrollbar?.();
    drawGrid?.(backgroundCtx);
    reDrawAll?.(drawCtx);
    updateMediaEditPopupPosition?.();

    if (progress < 1) requestAnimationFrame(smoothScroll);
  }
  requestAnimationFrame(smoothScroll);

  // Close panel after navigation
  tocPanel.classList.remove("open");
}

// Navigate to source note from summary navigation button
function navigateToSummarySource(navGroup) {
  const targetPath = navGroup.summaryNavTarget;
  const scrollY = navGroup.summaryNavScrollY || 0;

  if (!targetPath) {
    console.error("No target path for summary navigation");
    return;
  }

  // Load the target note
  loadNote(targetPath, (note) => {
    if (!note) {
      showStatus("Could not load the original note");
      return;
    }

    // Close any open embed frame when switching notes
    if (typeof closeEmbedFrame === 'function') closeEmbedFrame();

    // Update current note state
    title = targetPath;
    if (note.content) {
      allGroups = note.content;
    } else {
      allGroups = [];
    }

    // Update viewport offset to scroll to the original position
    viewportOffset.y = Math.max(0, scrollY - 80); // 80px margin from top
    viewportOffset.x = 0;
    screenBox.y = viewportOffset.y;
    screenBox.x = viewportOffset.x;

    // Refresh display
    syncGroupIds();
    reDrawAll(drawCtx);
    drawGrid(backgroundCtx);
    updateScrollbar?.();

    // Refresh TOC
    titleAnchorsNeedRefresh = true;
    if (typeof populateTocList === 'function') populateTocList();

    // Update UI to show note name
    const noteName = targetPath.split('/').pop().replace('.json', '');
    showStatus(`Opened: ${noteName}`);

    // Update selected note in sidebar if visible
    const noteButtons = document.querySelectorAll('.note-button');
    noteButtons.forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset?.path === targetPath) {
        btn.classList.add('active');
      }
    });
  });
}

// Initialize TOC tab click
if (tocTab) {
  tocTab.onclick = toggleTocPanel;
}

// ═══════════════════════════════════════════════════════════════════════════
// REMINDER SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

let reminderPickerContext = null; // Stores tool context when picker opens

// Show the reminder date/time picker modal
function showReminderPicker(toolColor, toolVisibility, toolSize) {
    const overlay = document.getElementById('reminderPickerOverlay');
    const dateInput = document.getElementById('reminderDate');
    const timeInput = document.getElementById('reminderTime');

    // Store context for when user confirms
    reminderPickerContext = { toolColor, toolVisibility, toolSize };

    // Set default date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateInput.value = tomorrow.toISOString().split('T')[0];

    // Set default time to 9:00 AM
    timeInput.value = '09:00';

    overlay.classList.add('show');
}

// Initialize reminder picker events
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('reminderPickerOverlay');
    const cancelBtn = document.getElementById('reminderCancel');
    const confirmBtn = document.getElementById('reminderConfirm');

    if (cancelBtn) {
        cancelBtn.onclick = () => {
            overlay.classList.remove('show');
            reminderPickerContext = null;
            // Clean up modifier stroke
            if (allGroups[allGroups.length - 1]?.visibility !== false) {
                allGroups.pop();
            }
            modifiedGroups.modifiedGroups.pop();
            reDrawAll(drawCtx);
        };
    }

    if (confirmBtn) {
        confirmBtn.onclick = () => {
            const dateInput = document.getElementById('reminderDate');
            const timeInput = document.getElementById('reminderTime');

            if (!dateInput.value) {
                alert('Please select a date');
                return;
            }

            const reminderDate = new Date(`${dateInput.value}T${timeInput.value || '09:00'}`);

            if (reminderPickerContext) {
                selectReminder(
                    reminderPickerContext.toolColor,
                    reminderPickerContext.toolVisibility,
                    reminderPickerContext.toolSize,
                    reminderDate.toISOString()
                );
            }

            overlay.classList.remove('show');
            reminderPickerContext = null;
            reDrawAll(drawCtx);

            // Save the note
            if (title) {
              saveNote(title, allGroups);
            }
        };
    }

    // Close on overlay click (outside modal)
    if (overlay) {
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                cancelBtn?.click();
            }
        };
    }

    // Initialize reminder count on load
    updateReminderCount();
});

// Toggle reminder panel visibility
function toggleReminderPanel() {
    const panel = document.getElementById('reminderPanel');
    const btn = document.getElementById('reminderBtn');

    if (panel.classList.contains('show')) {
        panel.classList.remove('show');
    } else {
        // Unfold the button if it's folded
        if (btn.classList.contains('folded')) {
            btn.classList.remove('folded');
        }
        panel.classList.add('show');
        populateReminderList();
    }
}

// Toggle folded state of reminder button
function toggleReminderBtnFold() {
    const btn = document.getElementById('reminderBtn');
    const wasFolded = btn.classList.contains('folded');
    btn.classList.toggle('folded');

    // If unfolding, also close the panel
    if (wasFolded) {
        const panel = document.getElementById('reminderPanel');
        if (panel) panel.classList.remove('show');
    }
}

// Update reminder count in the button (counts all reminders across all notebooks)
function updateReminderCount() {
    const countSpan = document.getElementById('reminderCount');
    const btn = document.getElementById('reminderBtn');
    if (!countSpan || !btn) return;

    // First count reminders from current note (in-memory, includes unsaved changes)
    const currentNoteReminderIds = new Set();
    allGroups.forEach(group => {
        if (group.reminderStatus && group.reminderGroupId) {
            currentNoteReminderIds.add(group.reminderGroupId);
        }
    });

    // Count reminders from all other notebooks via IndexedDB
    openNoteDB((db, done) => {
        const tx = db.transaction("notes", "readonly");
        const store = tx.objectStore("notes");
        const otherReminderIds = new Set();
        const currentNotePath = title; // Current note path

        const cursor = store.openCursor();
        cursor.onsuccess = (event) => {
            const cur = event.target.result;
            if (cur) {
                // Skip current note (we already counted it from allGroups)
                if (cur.key !== currentNotePath) {
                    const content = cur.value.content || [];
                    content.forEach(group => {
                        if (group.reminderStatus && group.reminderGroupId) {
                            otherReminderIds.add(group.reminderGroupId);
                        }
                    });
                }
                cur.continue();
            } else {
                done();
                // Combine counts: current note + other notes
                const count = currentNoteReminderIds.size + otherReminderIds.size;

                // Hide button if no reminders, show if there are reminders
                if (count === 0) {
                    btn.style.display = 'none';
                    const panel = document.getElementById('reminderPanel');
                    if (panel) panel.classList.remove('show');
                } else {
                    btn.style.display = 'flex';
                }

                // Update button text
                countSpan.textContent = `${count} reminder${count !== 1 ? 's' : ''}`;

                // Update badge for folded state
                let badge = btn.querySelector('.reminder-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'reminder-badge';
                    btn.appendChild(badge);
                }
                badge.textContent = count;
                badge.style.display = count > 0 ? 'flex' : 'none';
            }
        };

        cursor.onerror = () => {
            done();
        };
    });
}

// Populate the reminder list panel with all reminders from all notebooks
async function populateReminderList() {
    const reminderList = document.getElementById('reminderList');
    if (!reminderList) return;

    reminderList.innerHTML = '<div class="reminder-empty">Loading reminders...</div>';

    // Get all folders and notes from IndexedDB
    openNoteDB(async (db, done) => {
        const tx = db.transaction("notes", "readonly");
        const store = tx.objectStore("notes");
        const allNotes = [];

        const cursor = store.openCursor();
        cursor.onsuccess = (event) => {
            const cur = event.target.result;
            if (cur) {
                allNotes.push({
                    path: cur.key,
                    content: cur.value.content || []
                });
                cur.continue();
            } else {
                done();
                renderReminderList(allNotes, reminderList);
            }
        };

        cursor.onerror = () => {
            done();
            reminderList.innerHTML = '<div class="reminder-empty">Error loading reminders</div>';
        };
    });
}

// Render the reminder list organized by notebook/note
function renderReminderList(allNotes, container) {
    // Organize reminders by notebook > note
    const notebooks = {};

    allNotes.forEach(note => {
        const parts = note.path.split('/');
        const notebook = parts[0] || 'Default';
        const noteName = parts.slice(1).join('/').replace('.json', '') || note.path;

        // Find all reminders in this note
        const reminderGroups = new Map();
        (note.content || []).forEach(group => {
            if (group.reminderStatus && group.reminderGroupId) {
                if (!reminderGroups.has(group.reminderGroupId)) {
                    reminderGroups.set(group.reminderGroupId, {
                        id: group.reminderGroupId,
                        date: group.reminderDate,
                        groups: [],
                        notePath: note.path
                    });
                }
                reminderGroups.get(group.reminderGroupId).groups.push(group);
            }
        });

        if (reminderGroups.size > 0) {
            if (!notebooks[notebook]) {
                notebooks[notebook] = {};
            }
            if (!notebooks[notebook][noteName]) {
                notebooks[notebook][noteName] = [];
            }
            notebooks[notebook][noteName].push(...reminderGroups.values());
        }
    });

    // Check if any reminders exist
    if (Object.keys(notebooks).length === 0) {
        container.innerHTML = '<div class="reminder-empty">No reminders yet</div>';
        return;
    }

    // Build the HTML
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();

    Object.entries(notebooks).forEach(([notebookName, notes]) => {
        const notebookDiv = document.createElement('div');
        notebookDiv.className = 'reminder-notebook';

        const notebookHeader = document.createElement('div');
        notebookHeader.className = 'reminder-notebook-header';
        notebookHeader.innerHTML = `
            <i class='bx bx-folder'></i>
            <span>${notebookName}</span>
            <i class='bx bx-chevron-down chevron'></i>
        `;
        notebookHeader.onclick = () => notebookDiv.classList.toggle('collapsed');
        notebookDiv.appendChild(notebookHeader);

        const notesContainer = document.createElement('div');
        notesContainer.className = 'reminder-notebook-notes';

        Object.entries(notes).forEach(([noteName, reminders]) => {
            const noteDiv = document.createElement('div');
            noteDiv.className = 'reminder-note';

            const noteHeader = document.createElement('div');
            noteHeader.className = 'reminder-note-header';
            noteHeader.innerHTML = `
                <i class='bx bx-file'></i>
                <span>${noteName}</span>
            `;
            noteHeader.onclick = (e) => {
                e.stopPropagation();
                noteDiv.classList.toggle('collapsed');
            };
            noteDiv.appendChild(noteHeader);

            const itemsContainer = document.createElement('div');
            itemsContainer.className = 'reminder-items';

            reminders.forEach(reminder => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'reminder-item';

                // Create thumbnail
                const thumbnail = createReminderThumbnail(reminder.groups);

                // Format due date
                const dueDate = new Date(reminder.date);
                const now = new Date();
                const diffMs = dueDate - now;
                const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

                let dueClass = '';
                let dueText = '';

                if (diffMs < 0) {
                    dueClass = 'overdue';
                    dueText = 'Overdue';
                } else if (diffDays <= 1) {
                    dueClass = 'soon';
                    dueText = 'Due today';
                } else if (diffDays <= 3) {
                    dueClass = 'soon';
                    dueText = `Due in ${diffDays} days`;
                } else {
                    dueText = dueDate.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: dueDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
                    });
                }

                itemDiv.innerHTML = `
                    <img class="reminder-item-preview" src="${thumbnail}" alt="Reminder preview">
                    <div class="reminder-item-info">
                        <div class="reminder-item-due ${dueClass}">
                            <i class='bx bx-calendar'></i>
                            <span>${dueText}</span>
                        </div>
                        <button class="reminder-delete-btn" title="Delete reminder">
                            <i class='bx bx-trash'></i>
                        </button>
                    </div>
                `;

                // Click thumbnail to navigate to reminder
                itemDiv.querySelector('.reminder-item-preview').onclick = () => {
                    navigateToReminder(reminder.notePath, reminder.groups[0]);
                };

                // Delete button
                itemDiv.querySelector('.reminder-delete-btn').onclick = (e) => {
                    e.stopPropagation();
                    deleteReminder(reminder.notePath, reminder.id);
                };

                itemsContainer.appendChild(itemDiv);
            });

            noteDiv.appendChild(itemsContainer);
            notesContainer.appendChild(noteDiv);
        });

        notebookDiv.appendChild(notesContainer);
        fragment.appendChild(notebookDiv);
    });

    container.appendChild(fragment);
}

// Create a thumbnail image for reminder strokes
function createReminderThumbnail(groups) {
    const canvas = document.createElement('canvas');
    canvas.width = 250;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');

    const contentGroups = [...groups];
    contentGroups.pop();

    // Background
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!contentGroups || contentGroups.length === 0) {
        return canvas.toDataURL();
    }

    // Calculate bounding box of all groups
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    contentGroups.forEach(group => {
        if (group.bbox) {
            minX = Math.min(minX, group.bbox.x);
            minY = Math.min(minY, group.bbox.y);
            maxX = Math.max(maxX, group.bbox.x + group.bbox.w);
            maxY = Math.max(maxY, group.bbox.y + group.bbox.h);
        }
    });

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    if (contentWidth <= 0 || contentHeight <= 0) {
        return canvas.toDataURL();
    }

    // Calculate scale to fit
    const padding = 4;
    const availableWidth = canvas.width - padding * 2;
    const availableHeight = canvas.height - padding * 2;
    const scale = Math.min(availableWidth / contentWidth, availableHeight / contentHeight, 1);

    // Center the content
    const offsetX = (canvas.width - contentWidth * scale) / 2 - minX * scale;
    const offsetY = (canvas.height - contentHeight * scale) / 2 - minY * scale;

    // Draw strokes and text blocks
    contentGroups.forEach(group => {
        if (group.visibility == false) return;

        // Handle text blocks
        if (group.type === 'text') {
            ctx.save();
            const fontSize = Math.max(group.fontSize * scale, 8);
            ctx.font = `${fontSize}px '${group.fontFamily}', sans-serif`;
            ctx.fillStyle = group.color || '#ffffff';
            ctx.textBaseline = 'top';

            const textX = group.bbox.x * scale + offsetX + 4;
            const textY = group.bbox.y * scale + offsetY + 2;

            const lines = group.text.split('\n');
            const lineHeight = fontSize * 1.2;
            lines.forEach((line, i) => {
                ctx.fillText(line, textX, textY + i * lineHeight);
            });
            ctx.restore();
            return;
        }

        // Handle regular strokes
        if (!group.stroke || group.stroke.length < 2) return;

        ctx.beginPath();
        ctx.strokeStyle = group.color || '#ff6b6b';
        ctx.lineWidth = Math.max((group.size || 2) * scale, 1);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const firstPoint = group.stroke[0];
        ctx.moveTo(firstPoint.x * scale + offsetX, firstPoint.y * scale + offsetY);

        for (let i = 1; i < group.stroke.length; i++) {
            const point = group.stroke[i];
            ctx.lineTo(point.x * scale + offsetX, point.y * scale + offsetY);
        }

        ctx.stroke();
    });

    return canvas.toDataURL();
}

// Navigate to a specific reminder
function navigateToReminder(notePath, targetGroup) {
    // Close reminder panel
    document.getElementById('reminderPanel').classList.remove('show');

    // Load the note if different from current
    if (title !== notePath) {
        loadNote(notePath, (note) => {
            if (!note) return;

            // Close any open embed frame when switching notes
            if (typeof closeEmbedFrame === 'function') closeEmbedFrame();

            title = notePath;
            allGroups = note.content || [];

            // Scroll to the reminder
            if (targetGroup && targetGroup.bbox) {
                viewportOffset.y = Math.max(0, targetGroup.bbox.y - 100);
                viewportOffset.x = 0;
                screenBox.y = viewportOffset.y;
                screenBox.x = viewportOffset.x;
            }

            syncGroupIds();
            reDrawAll(drawCtx);
            drawGrid(backgroundCtx);
            updateScrollbar?.();
            updateReminderCount();
            titleAnchorsNeedRefresh = true;
            if (typeof populateTocList === 'function') populateTocList();
        });
    } else {
        // Same note, just scroll
        if (targetGroup && targetGroup.bbox) {
            const targetY = targetGroup.bbox.y - 100;
            const duration = 400;
            const startY = viewportOffset.y;
            const deltaY = targetY - startY;
            const startTime = performance.now();

            function smoothScroll() {
                const now = performance.now();
                const progress = Math.min((now - startTime) / duration, 1);
                const ease = 1 - Math.pow(1 - progress, 3);
                viewportOffset.y = startY + deltaY * ease;
                screenBox.y = viewportOffset.y;

                updateScrollbar?.();
                drawGrid?.(backgroundCtx);
                reDrawAll?.(drawCtx);

                if (progress < 1) requestAnimationFrame(smoothScroll);
            }
            requestAnimationFrame(smoothScroll);
        }
    }
}

// Delete a reminder
function deleteReminder(notePath, reminderGroupId) {
    if (!confirm('Delete this reminder?')) return;

    // Load the note, remove reminder status, save
    loadNote(notePath, (note) => {
        if (!note || !note.content) return;

        // Remove reminder properties from matching groups
        note.content.forEach(group => {
            if (group.reminderGroupId === reminderGroupId) {
                delete group.reminderStatus;
                delete group.reminderDate;
                delete group.reminderGroupId;
            }
        });

        // Save the note
        saveNote(notePath, note.content, () => {
            // If it's the current note, update display
            if (title === notePath) {
                allGroups = note.content;
                reDrawAll(drawCtx);
                updateReminderCount();
            }

            // Refresh the reminder list
            populateReminderList();
        });
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// FLASHCARD SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

let generatedFlashcards = [];
let currentFlashcardIndex = 0;

// Scan a notebook (folder) for tapes and generate flashcards
async function scanNotebookForFlashcards(folderName) {
    return new Promise((resolve) => {
        const flashcards = [];

        openNoteDB((db, done) => {
            const tx = db.transaction("notes", "readonly");
            const store = tx.objectStore("notes");
            const notesToProcess = [];

            store.openCursor().onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    const path = cursor.value.path;
                    if (path.startsWith(folderName + "/") && path.endsWith('.json')) {
                        notesToProcess.push({
                            path: path,
                            content: cursor.value.content || []
                        });
                    }
                    cursor.continue();
                } else {
                    done();

                    // Process each note to find tapes
                    notesToProcess.forEach(note => {
                        const noteFlashcards = extractFlashcardsFromNote(note.path, note.content, folderName);
                        flashcards.push(...noteFlashcards);
                    });

                    resolve(flashcards);
                }
            };
        });
    });
}

// Extract flashcards from a single note's content
function extractFlashcardsFromNoteOld(notePath, content, folderName) {
    const flashcards = [];
    if (!content || !Array.isArray(content)) return flashcards;

    // Find all tapes in the note
    const tapes = content.filter(g => g.type === "tape" && g.visibility !== false);

    // Track which tapes have already been processed (to avoid double-counting)
    const processedTapeIds = new Set();

    // Process tapes from newest to oldest (by id, assuming higher id = newer)
    tapes.sort((a, b) => (b.id || 0) - (a.id || 0));

    tapes.forEach(tape => {
        if (processedTapeIds.has(tape.id)) return;
        processedTapeIds.add(tape.id);

        // Get the strokes covered by the tape (keywords - front of card)
        const keywordIds = tape.coveredGroupIds || [];
        const keywordStrokes = content.filter(g =>
            keywordIds.includes(g.id) &&
            g.visibility !== false &&
            g.type !== "tape"
        );

        if (keywordStrokes.length === 0) return;

        // Find info strokes: strokes that are spatially related to the tape
        // but NOT covered by it (above, below, or beside the tape)
        const infoStrokes = findInfoStrokesForTape(tape, content, keywordIds);

        if (infoStrokes.length === 0) return; // Skip if no info strokes found

        // Create the flashcard
        const noteName = notePath.split('/').pop().replace('.json', '');
        flashcards.push({
            id: `fc_${tape.id}`,
            tapeId: tape.id,
            notePath: notePath,
            noteName: noteName,
            folderName: folderName,
            keywordStrokes: keywordStrokes,
            infoStrokes: infoStrokes,
            tapeBbox: tape.bbox
        });
    });

    return flashcards;
}

// Find strokes that are spatially related to the tape (the "info" or "answer" part)
function extractFlashcardsFromNote(notePath, content, folderName) {
       // ========== GLOBAL DEDUPLICATION ==========
        // Track claimed stroke IDs across ALL modifier types to prevent duplicates
        // Priority order: Titles > Box > Curly > Shortcuts (most recent shortcut wins within shortcuts)
        let allSummaryItems = [];
        const flashcards = [];
        const keywords = {};
        const claimedStrokeIds = new Set();
        const noteName = notePath.split('/').pop().replace('.json', '');

         // Find all tapes in the note
        const tapes = content.filter(g => g.type === "tape" && g.visibility !== false);

        // Track which tapes have already been processed (to avoid double-counting)
        const processedTapeIds = new Set();

        // Process tapes from newest to oldest (by id, assuming higher id = newer)
        tapes.sort((a, b) => (b.id || 0) - (a.id || 0));

        console.log("tapes", tapes);

        tapes.forEach(tape => {
          if (processedTapeIds.has(tape.id)) return;
          processedTapeIds.add(tape.id);

          // Get the strokes covered by the tape (keywords - front of card)
          const keywordIds = tape.coveredGroupIds || [];
          const keywordStrokes = content.filter(g =>
              keywordIds.includes(g.id) &&
              g.visibility !== false &&
              g.type !== "tape"
          );

          if (keywordStrokes.length === 0) return;

          keywords[tape.id] = keywordStrokes;
        });

        // ========== COLLECT BOX MODIFIERS ==========
        // Get the expected box modifier color from settings
        const boxModifierColor = normalizeColor(modifiers?.box?.color || DEFAULT_MODIFIERS.box.color);

        content.forEach(group => {
          if (group.visibility === false) return;
          if (!group.bbox || !Array.isArray(group.stroke)) return;

          const isBox = group.predictedLabel === STROKE_TYPE.BOX ||
                        group.predictedLabel === 1 ||
                        group.predictedLabel === "box";

          if (isBox) {
            const boxClone = structuredClone(group);
            const children = [];

            // Collect strokes inside the box (only unclaimed ones WITH matching color)
            content.forEach(other => {
              if (other.id !== group.id && other.bbox && Array.isArray(other.stroke) && other.visibility !== false) {
                // Check if stroke color matches the box modifier color
                const strokeColor = normalizeColor(other.color);
                const colorMatches = strokeColor === boxModifierColor;

                if (!claimedStrokeIds.has(other.id) && colorMatches && isInside(other.stroke, group.stroke)) {
                  children.push(structuredClone(other));
                }
              }
            });

            //Find whether this box contains the tape and which tape this box matches based on keywords 
            let matchResult = null;

            for (const [tapeId, keywordStrokes] of Object.entries(keywords)) {
              const keywordIds = new Set(keywordStrokes.map(s => s.id));

              const matchedStrokes = children.filter(
                s => keywordIds.has(s.id)
              );

              if (matchedStrokes.length > 0) {
                matchResult = {
                  tapeId,
                  keywordStrokes,
                  matchedStrokes
                };
                break; // remove if you want ALL tape matches
              }
            }

            if (children.length > 0 && matchResult) {
              // Claim these stroke IDs
              children.forEach(c => claimedStrokeIds.add(c.id));
              
              flashcards.push({
                id: `fc_${matchResult.tapeId}`,
                tapeId: matchResult.tapeId,
                notePath: notePath,
                noteName: noteName, 
                folderName: folderName,
                keywordStrokes: matchResult.keywordStrokes,
                infoStrokes: children,
                tapeBbox: tapes.find(item => item.id === matchResult.tapeId)?.bbox || null,
              });
            }
          }
        });
  
        // ========== COLLECT CURLY MODIFIERS ==========
        // Get the expected curly modifier color from settings
        const curlyModifierColor = normalizeColor(modifiers?.curly?.color || DEFAULT_MODIFIERS.curly.color);

        content.forEach(group => {
          if (group.visibility === false) return;
          if (!group.bbox || !Array.isArray(group.stroke)) return;

          const isCurly = group.predictedLabel === STROKE_TYPE.CURLY ||
                          group.predictedLabel === 2 ||
                          group.predictedLabel === "curly";

          if (isCurly) {
            const children = [];

            // Collect strokes inside the curly (only unclaimed ones WITH matching color)
            content.forEach(other => {
              if (other.id !== group.id && other.bbox && Array.isArray(other.stroke) && other.visibility !== false) {
                // Check if stroke color matches the curly modifier color
                const strokeColor = normalizeColor(other.color);
                const colorMatches = strokeColor === curlyModifierColor;

                if (!claimedStrokeIds.has(other.id) && colorMatches && isInside(other.stroke, group.stroke)) {
                  children.push(structuredClone(other));
                }
              }
            });

            //Find whether this modifier contains the tape and which tape this modifier matches based on keywords 
            let matchResult = null;

            for (const [tapeId, keywordStrokes] of Object.entries(keywords)) {
              const keywordIds = new Set(keywordStrokes.map(s => s.id));

              const matchedStrokes = children.filter(
                s => keywordIds.has(s.id)
              );

              if (matchedStrokes.length > 0) {
                matchResult = {
                  tapeId,
                  keywordStrokes,
                  matchedStrokes
                };
                break; // remove if you want ALL tape matches
              }
            }

            // Only add if there are unclaimed children with matching color
            if (children.length > 0 && matchResult) {
              // Claim these stroke IDs
              children.forEach(c => claimedStrokeIds.add(c.id));

              // Calculate combined bbox from children
              const childBboxes = children.map(c => c.bbox);
              const combinedBbox = {
                x: Math.min(...childBboxes.map(b => b.x)),
                y: Math.min(...childBboxes.map(b => b.y)),
                w: Math.max(...childBboxes.map(b => b.x + b.w)) - Math.min(...childBboxes.map(b => b.x)),
                h: Math.max(...childBboxes.map(b => b.y + b.h)) - Math.min(...childBboxes.map(b => b.y))
              };

              flashcards.push({
                id: `fc_${matchResult.tapeId}`,
                tapeId: matchResult.tapeId,
                notePath: notePath,
                noteName: noteName, 
                folderName: folderName,
                keywordStrokes: matchResult.keywordStrokes,
                infoStrokes: children,
                tapeBbox: tapes.find(item => item.id === matchResult.tapeId)?.bbox || null,
              });
            }
          }
        });
        

        // ========== COLLECT SHORTCUTS (box, curly, circle) ==========
        // First pass: collect all potential shortcuts with their children
        const potentialShortcuts = [];
        const shortcutTypes = [
          { include: true, labels: [STROKE_TYPE.SQUAREBRACKET, 4, "squarebracket"], type: "squarebracket" },
          { include: true, labels: [STROKE_TYPE.WAVYBRACKET, 5, "wavybracket"], type: "wavybracket" },
          { include: true, labels: [STROKE_TYPE.CIRCLEBRACKET, 6, "circlebracket"], type: "circlebracket" }
        ];

        shortcutTypes.forEach(({ include, labels, type }) => {
          if (!include) return;

          // Get the expected shortcut modifier color from settings
          const shortcutModifierColor = normalizeColor(modifiers?.[type]?.color || DEFAULT_MODIFIERS[type]?.color);

          content.forEach((group, groupIndex) => {
            if (!group.bbox || !Array.isArray(group.stroke)) return;

            const isShortcut = labels.includes(group.predictedLabel);
            // Skip visibility=false unless it's a shortcut we're looking for
            // (shortcuts have visibility=false but should still be collected)
            if (group.visibility === false && !isShortcut) return;

            if (isShortcut) {
              const children = [];
              const shortcutBox = group.bbox;

              // Collect strokes within Y bounds (how shortcuts select - see classifyStroke)
              // Exclude the shortcut modifier itself - only collect content strokes WITH matching color
              content.forEach(other => {
                if (other.id !== group.id && other.bbox && Array.isArray(other.stroke) && other.visibility !== false) {
                  const otherBox = other.bbox;
                  // Match classifyStroke logic: bbox.y > newBox.y && (bbox.y + bbox.h) < (newBox.y + newBox.h)
                  const isWithinYBounds = otherBox.y > shortcutBox.y &&
                                          (otherBox.y + otherBox.h) < (shortcutBox.y + shortcutBox.h);

                  // Check if stroke color matches the shortcut modifier color
                  const strokeColor = normalizeColor(other.color);
                  const colorMatches = strokeColor === shortcutModifierColor;

                  if (isWithinYBounds && colorMatches) {
                    children.push(structuredClone(other));
                  }
                }
              });

               //Find whether this modifier contains the tape and which tape this modifier matches based on keywords 
              let matchResult = null;

              for (const [tapeId, keywordStrokes] of Object.entries(keywords)) {
                const keywordIds = new Set(keywordStrokes.map(s => s.id));

                const matchedStrokes = children.filter(
                  s => keywordIds.has(s.id)
                );

                if (matchedStrokes.length > 0) {
                  matchResult = {
                    tapeId,
                    keywordStrokes,
                    matchedStrokes
                  };
                  break; // remove if you want ALL tape matches
                }
              }

              // Store potential shortcut with its groupIndex for sorting
              if (children.length > 0 && matchResult) {
                potentialShortcuts.push({
                  groupIndex,
                  type,
                  children,
                  noteInfoPath: notePath,
                  matchResult: matchResult
                });
              }
            }
          });
        });

        // Deduplicate: newest shortcuts claim strokes first
        // (if user corrects a shortcut, the newer one wins)

        // Sort by groupIndex descending (most recent shortcut first)
        potentialShortcuts.sort((a, b) => b.groupIndex - a.groupIndex);

        potentialShortcuts.forEach(item => {
          // Filter children to only those not claimed by a more recent shortcut
          const unclaimedChildren = item.children.filter(c => !claimedStrokeIds.has(c.id));

          if (unclaimedChildren.length === 0) return; // Skip - all children already claimed

          // Claim these stroke IDs
          unclaimedChildren.forEach(c => claimedStrokeIds.add(c.id));

          // Calculate bounding box from unclaimed children only
          const childBboxes = unclaimedChildren.map(c => c.bbox);
          const combinedBbox = {
            x: Math.min(...childBboxes.map(b => b.x)),
            y: Math.min(...childBboxes.map(b => b.y)),
            w: Math.max(...childBboxes.map(b => b.x + b.w)) - Math.min(...childBboxes.map(b => b.x)),
            h: Math.max(...childBboxes.map(b => b.y + b.h)) - Math.min(...childBboxes.map(b => b.y))
          };

          matchResult = item.matchResult;

          flashcards.push({
            id: `fc_${matchResult.tapeId}`,
            tapeId: matchResult.tapeId,
            notePath: notePath,
            noteName: noteName, 
            folderName: folderName,
            keywordStrokes: matchResult.keywordStrokes,
            infoStrokes: unclaimedChildren,
            tapeBbox: tapes.find(item => item.id === matchResult.tapeId)?.bbox || null,
          });
        });

  return flashcards
}

// Helper: Check if bbox A is fully contained within bbox B
function isFullyContained(a, b) {
    return a.x >= b.x &&
           a.y >= b.y &&
           (a.x + a.w) <= (b.x + b.w) &&
           (a.y + a.h) <= (b.y + b.h);
}

// Update flashcard button visibility and count
function updateFlashcardButton(flashcards) {
    const btn = document.getElementById('flashcardBtn');
    const btnText = document.getElementById('flashcardBtnText');

    if (!btn || !btnText) return;

    if (flashcards.length > 0) {
        btn.style.display = 'flex';
        btnText.textContent = `${flashcards.length} Flashcard${flashcards.length !== 1 ? 's' : ''} Ready`;
        // Reverse order so oldest flashcard displays first, latest displays last
        // (flashcards are collected newest-first for deduplication, but should display oldest-first)
        generatedFlashcards = flashcards.slice().reverse();
    } else {
        btn.style.display = 'none';
        generatedFlashcards = [];
    }
}

// Open flashcard review modal
function openFlashcardReview() {
    if (generatedFlashcards.length === 0) return;

    const modal = document.getElementById('flashcardModal');
    if (!modal) return;

    currentFlashcardIndex = 0;
    modal.classList.add('show');

    // Add click handler for flashcard container
    const flashcardContainer = document.querySelector('.flashcard-container');
    if (flashcardContainer) {
        flashcardContainer.onclick = flipFlashcard;
    }

    renderCurrentFlashcard();
    updateFlashcardNavButtons();
}

// Close flashcard review modal
function closeFlashcardReview() {
    const modal = document.getElementById('flashcardModal');
    if (modal) {
        modal.classList.remove('show');
    }
    // Reset card to front
    const card = document.getElementById('flashcard');
    if (card) card.classList.remove('flipped');
}

// Flip the flashcard
function flipFlashcard() {
    const card = document.getElementById('flashcard');
    if (card) card.classList.toggle('flipped');
}

// Navigate to previous flashcard
function prevFlashcard() {
    if (currentFlashcardIndex > 0) {
        currentFlashcardIndex--;
        renderCurrentFlashcard();
        updateFlashcardNavButtons();
    }
}

// Navigate to next flashcard
function nextFlashcard() {
    if (currentFlashcardIndex < generatedFlashcards.length - 1) {
        currentFlashcardIndex++;
        renderCurrentFlashcard();
        updateFlashcardNavButtons();
    }
}

// Update navigation buttons state
function updateFlashcardNavButtons() {
    const prevBtn = document.getElementById('flashcardPrevBtn');
    const nextBtn = document.getElementById('flashcardNextBtn');

    if (prevBtn) prevBtn.disabled = currentFlashcardIndex === 0;
    if (nextBtn) nextBtn.disabled = currentFlashcardIndex >= generatedFlashcards.length - 1;

    // Update progress
    const progress = document.getElementById('flashcardProgress');
    const progressFill = document.getElementById('flashcardProgressFill');

    if (progress) {
        progress.textContent = `${currentFlashcardIndex + 1} / ${generatedFlashcards.length}`;
    }
    if (progressFill) {
        const percent = ((currentFlashcardIndex + 1) / generatedFlashcards.length) * 100;
        progressFill.style.width = `${percent}%`;
    }
}

// Render the current flashcard
function renderCurrentFlashcard() {
    const flashcard = generatedFlashcards[currentFlashcardIndex];
    if (!flashcard) return;

    // Reset flip state
    const card = document.getElementById('flashcard');
    if (card) card.classList.remove('flipped');

    // Update source labels
    const sourceFront = document.getElementById('flashcardSourceFront');
    const sourceBack = document.getElementById('flashcardSourceBack');

    if (sourceFront) {
        sourceFront.innerHTML = `<i class='bx bx-folder'></i> ${flashcard.folderName} / <i class='bx bx-file'></i> ${flashcard.noteName}`;
    }
    if (sourceBack) {
        sourceBack.innerHTML = `<i class='bx bx-folder'></i> ${flashcard.folderName} / <i class='bx bx-file'></i> ${flashcard.noteName}`;
    }

    // Render front canvas (keywords - covered by tape)
    const frontCanvas = document.getElementById('flashcardFrontCanvas');
    if (frontCanvas) {
        renderStrokesToCanvas(frontCanvas, flashcard.keywordStrokes);
    }

    // Render back canvas (info/answer)
    const backCanvas = document.getElementById('flashcardBackCanvas');
    if (backCanvas) {
        renderStrokesToCanvas(backCanvas, flashcard.infoStrokes);
    }
}

// Render strokes to a canvas
function renderStrokesToCanvas(canvas, strokes) {
    if (!canvas || !strokes || strokes.length === 0) return;

    const ctx = canvas.getContext('2d');
    const containerWidth = canvas.parentElement.clientWidth || 500;
    // Account for source header and hint footer
    const containerHeight = Math.max(canvas.parentElement.clientHeight - 36, 150);

    // HiDPI support
    const dpr = window.devicePixelRatio || 1;
    canvas.width = containerWidth * dpr;
    canvas.height = containerHeight * dpr;
    canvas.style.width = containerWidth + 'px';
    canvas.style.height = containerHeight + 'px';
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, containerWidth, containerHeight);

    // Calculate bounding box of all strokes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    strokes.forEach(group => {
        if (group.bbox) {
            minX = Math.min(minX, group.bbox.x);
            minY = Math.min(minY, group.bbox.y);
            maxX = Math.max(maxX, group.bbox.x + group.bbox.w);
            maxY = Math.max(maxY, group.bbox.y + group.bbox.h);
        } else if (group.stroke) {
            group.stroke.forEach(pt => {
                minX = Math.min(minX, pt.x);
                minY = Math.min(minY, pt.y);
                maxX = Math.max(maxX, pt.x);
                maxY = Math.max(maxY, pt.y);
            });
        }
    });

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    if (contentWidth <= 0 || contentHeight <= 0) return;

    // Calculate scale to fit with padding
    const padding = 20;
    const availableWidth = containerWidth - padding * 2;
    const availableHeight = containerHeight - padding * 2;
    const scale = Math.min(availableWidth / contentWidth, availableHeight / contentHeight, 2.5);

    // Center the content
    const offsetX = (containerWidth - contentWidth * scale) / 2 - minX * scale;
    const offsetY = (containerHeight - contentHeight * scale) / 2 - minY * scale;

    // Draw each group (strokes and text blocks)
    strokes.forEach(group => {
        // Handle text blocks
        if (group.type === 'text') {
            ctx.save();
            ctx.globalAlpha = group.opacity !== undefined ? group.opacity : 1.0;

            const fontSize = group.fontSize * scale;
            ctx.font = `${fontSize}px '${group.fontFamily}', sans-serif`;
            ctx.fillStyle = group.color || '#ffffff';
            ctx.textBaseline = 'top';
            ctx.textAlign = 'left';

            const textX = group.bbox.x * scale + offsetX + 10 * scale;
            const textY = group.bbox.y * scale + offsetY + 5 * scale;

            const lines = group.text.split('\n');
            const lineHeight = fontSize * 1.3;
            lines.forEach((line, i) => {
                ctx.fillText(line, textX, textY + i * lineHeight);
            });

            ctx.restore();
            return;
        }

        // Handle regular strokes
        if (!group.stroke || group.stroke.length < 2) return;

        ctx.beginPath();
        ctx.strokeStyle = group.color || '#ffffff';

        // Calculate stroke width: scale proportionally but clamp to reasonable range
        const baseSize = group.size || 2;
        const scaledSize = baseSize * scale;
        // Clamp between 1.5 and 5 for balanced appearance on larger cards
        ctx.lineWidth = Math.min(Math.max(scaledSize, 1.5), 5);

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const firstPoint = group.stroke[0];
        ctx.moveTo(firstPoint.x * scale + offsetX, firstPoint.y * scale + offsetY);

        for (let i = 1; i < group.stroke.length; i++) {
            const point = group.stroke[i];
            ctx.lineTo(point.x * scale + offsetX, point.y * scale + offsetY);
        }

        ctx.stroke();
    });
}

// Navigate to the source note of the current flashcard
function goToFlashcardSource() {
    const flashcard = generatedFlashcards[currentFlashcardIndex];
    if (!flashcard) return;

    // Close the modal
    closeFlashcardReview();

    // Close the notes navbar if needed
    const navbar = document.getElementById('notenavbar');
    if (navbar && navbar.classList.contains('open')) {
        navbar.classList.remove('open');
    }

    // Load the note
    loadNote(flashcard.notePath, (note) => {
        if (!note) return;

        // Close any open embed frame when switching notes
        if (typeof closeEmbedFrame === 'function') closeEmbedFrame();

        title = flashcard.notePath;
        allGroups = note.content || [];

        // Scroll to the tape location
        if (flashcard.tapeBbox) {
            viewportOffset.y = Math.max(0, flashcard.tapeBbox.y - 100);
            viewportOffset.x = Math.max(0, flashcard.tapeBbox.x - 100);
            screenBox.y = viewportOffset.y;
            screenBox.x = viewportOffset.x;
        }

        syncGroupIds();
        reDrawAll(drawCtx);
        drawGrid(backgroundCtx);
        updateScrollbar?.();
        updateReminderCount();
        titleAnchorsNeedRefresh = true;
        if (typeof populateTocList === 'function') populateTocList();
    });
}

// Initialize flashcard click to flip
document.addEventListener('DOMContentLoaded', () => {
    const flashcard = document.getElementById('flashcard');
    if (flashcard) {
        flashcard.addEventListener('click', flipFlashcard);
    }

    // Close modal on clicking outside
    const modal = document.getElementById('flashcardModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeFlashcardReview();
            }
        });
    }
});


// ======================= REGROUP TITLES ==========================
// Groups title strokes by their titleGroupId (strokes selected in the same
// selectTitle call belong to the same title group)
function regroupTitles() {
  if (!Array.isArray(allGroups) || allGroups.length === 0) {
    return;
  }

  // Remove any old anchors first
  allGroups = allGroups.filter(g => !g.isTitleAnchor);

  // Helper to normalize bbox to {x, y, w, h} format
  function normalizeBbox(bbox) {
    if (!bbox) return null;
    if (typeof bbox.x === 'number' && typeof bbox.y === 'number') {
      return { x: bbox.x, y: bbox.y, w: bbox.w || 0, h: bbox.h || 0 };
    }
    if (typeof bbox.minX === 'number' && typeof bbox.minY === 'number') {
      return {
        x: bbox.minX,
        y: bbox.minY,
        w: (bbox.maxX || bbox.minX) - bbox.minX,
        h: (bbox.maxY || bbox.minY) - bbox.minY
      };
    }
    return null;
  }

  // Find all title strokes (with titleStatus: true)
  const titleStrokes = allGroups.filter(g => {
    if (!g?.titleStatus || g?.visibility === false) return false;
    return normalizeBbox(g?.bbox) !== null;
  });

  if (titleStrokes.length === 0) {
    return;
  }

  // Group by titleGroupId - strokes selected in the same selectTitle call belong together
  const groupsMap = new Map(); // titleGroupId -> { level, strokes, minX, maxX, minY, maxY }

  for (const stroke of titleStrokes) {
    const box = normalizeBbox(stroke.bbox);
    if (!box) continue;

    const groupId = stroke.titleGroupId;
    const level = stroke.titleLevel || 1;

    if (groupId) {
      // Use titleGroupId for grouping (accurate method)
      if (!groupsMap.has(groupId)) {
        groupsMap.set(groupId, {
          level: level,
          minX: box.x,
          maxX: box.x + box.w,
          minY: box.y,
          maxY: box.y + box.h,
          strokes: [stroke]
        });
      } else {
        const group = groupsMap.get(groupId);
        group.strokes.push(stroke);
        group.minX = Math.min(group.minX, box.x);
        group.maxX = Math.max(group.maxX, box.x + box.w);
        group.minY = Math.min(group.minY, box.y);
        group.maxY = Math.max(group.maxY, box.y + box.h);
      }
    } else {
      // Fallback for old notes without titleGroupId: create individual groups
      const fallbackKey = `fallback_${stroke.id}`;
      groupsMap.set(fallbackKey, {
        level: level,
        minX: box.x,
        maxX: box.x + box.w,
        minY: box.y,
        maxY: box.y + box.h,
        strokes: [stroke]
      });
    }
  }

  // Convert map to array of groups
  const groups = Array.from(groupsMap.values());

  // For fallback groups (old notes without titleGroupId), merge nearby ones with same level
  function shouldMergeGroups(g1, g2) {
    if (g1.level !== g2.level) return false;
    const tolerance = normalHeight || 29;

    // Check vertical proximity
    const yOverlap = !(g1.maxY < g2.minY - tolerance || g2.maxY < g1.minY - tolerance);
    if (!yOverlap) return false;

    // Check horizontal proximity
    const xOverlap = !(g1.maxX < g2.minX - tolerance || g2.maxX < g1.minX - tolerance);
    return xOverlap;
  }

  // Merge fallback groups that should be together
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < groups.length; i++) {
      // Only merge fallback groups (single stroke, no real titleGroupId)
      if (groups[i].strokes.length > 1 ||
          groups[i].strokes[0]?.titleGroupId) continue;

      for (let j = i + 1; j < groups.length; j++) {
        if (groups[j].strokes.length > 1 ||
            groups[j].strokes[0]?.titleGroupId) continue;

        if (shouldMergeGroups(groups[i], groups[j])) {
          groups[i].strokes.push(...groups[j].strokes);
          groups[i].minX = Math.min(groups[i].minX, groups[j].minX);
          groups[i].maxX = Math.max(groups[i].maxX, groups[j].maxX);
          groups[i].minY = Math.min(groups[i].minY, groups[j].minY);
          groups[i].maxY = Math.max(groups[i].maxY, groups[j].maxY);
          groups.splice(j, 1);
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }

  // Create one anchor per group
  for (const group of groups) {
    if (group.strokes.length === 0) continue;

    const anchor = {
      id: getNextId(),
      bbox: { x: group.minX, y: group.minY, w: group.maxX - group.minX, h: group.maxY - group.minY },
      isTitleAnchor: true,
      titleLevel: group.level,
      titleText: `Title (Level ${group.level})`,
      titleGroupIds: group.strokes.map(g => g.id),
    };
    allGroups.push(anchor);
  }

  reDrawAll?.(drawCtx);
}



// ======================= HIGH DPI THUMBNAIL RENDER ==========================
function renderTitleThumbnailFromAnchor(anchor) {
  const PAD = 16;
  const { x, y, w, h } = anchor.bbox;
  const dpr = window.devicePixelRatio || 2; // Default to 2x for HiDPI

  // Helper to normalize bbox
  function normBox(bbox) {
    if (!bbox) return null;
    if (typeof bbox.x === 'number') {
      return { x: bbox.x, y: bbox.y, w: bbox.w || 0, h: bbox.h || 0 };
    }
    if (typeof bbox.minX === 'number') {
      return {
        x: bbox.minX, y: bbox.minY,
        w: (bbox.maxX || bbox.minX) - bbox.minX,
        h: (bbox.maxY || bbox.minY) - bbox.minY
      };
    }
    return null;
  }

  // Find strokes within anchor bbox with small tolerance
  const strokes = allGroups.filter(g => {
    if (!g.titleStatus || !g.bbox) return false;
    const b = normBox(g.bbox);
    if (!b) return false;
    return b.x >= x - 4 &&
           b.y >= y - 4 &&
           (b.x + b.w) <= x + w + 4 &&
           (b.y + b.h) <= y + h + 4;
  });

  if (strokes.length === 0) {
    return "";
  }

  // Create HiDPI canvas
  const canvas = document.createElement("canvas");
  const baseW = w + PAD * 2;
  const baseH = h + PAD * 2;
  canvas.width = Math.ceil(baseW * dpr);
  canvas.height = Math.ceil(baseH * dpr);

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.translate(PAD - x, PAD - y);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Render strokes and text blocks using each group's actual size
  strokes.forEach(st => {
    // Handle text blocks
    if (st.type === 'text') {
      ctx.save();
      ctx.globalAlpha = st.opacity !== undefined ? st.opacity : 1.0;
      ctx.font = `${st.fontSize}px '${st.fontFamily}', sans-serif`;
      ctx.fillStyle = st.color || '#ffffff';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      const lines = st.text.split('\n');
      const lineHeight = st.fontSize * 1.3;
      lines.forEach((line, i) => {
        ctx.fillText(line, st.bbox.x + 10, st.bbox.y + 5 + i * lineHeight);
      });
      ctx.restore();
      return;
    }
    // Handle regular strokes
    if (!st.stroke || st.stroke.length < 2) return;
    ctx.strokeStyle = st.color || "#fff";
    // Use the group's size, with a minimum of 2 and scale up slightly for visibility
    const strokeSize = Math.max(2, (st.size || 2) * 1.2);
    ctx.lineWidth = strokeSize;
    ctx.beginPath();
    st.stroke.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
  });

  return canvas.toDataURL("image/png");
}

// ═══════════════════════════════════════════════════════════════════════════
// ADD CONTENT DROPDOWN (Media/PDF and Text)
// ═══════════════════════════════════════════════════════════════════════════

function toggleAddContentDropdown(e) {
  e.stopPropagation();
  const dropdown = document.getElementById('addContentDropdown');
  if (dropdown.style.display === 'none') {
    dropdown.style.display = 'block';
    // Close dropdown when clicking outside
    setTimeout(() => {
      document.addEventListener('click', hideAddContentDropdown, { once: true });
    }, 0);
  } else {
    dropdown.style.display = 'none';
  }
}

function hideAddContentDropdown() {
  const dropdown = document.getElementById('addContentDropdown');
  if (dropdown) dropdown.style.display = 'none';
}

// ═══════════════════════════════════════════════════════════════════════════
// TEXT BLOCK FEATURE
// ═══════════════════════════════════════════════════════════════════════════


/**
 * Create a new text block near the toolbar
 */
function handleTextInsert() {
  // Position near the toolbar (top-left area of visible viewport)
  const insertX = viewportOffset.x + 60;
  const insertY = viewportOffset.y + 80;

  const textGroup = {
    id: 'text_' + Date.now() + '_' + getNextId(),
    type: 'text',
    bbox: { x: insertX, y: insertY, w: 100, h: 30 }, // Placeholder, will be recalculated
    stroke: [],
    fakeStrokes: [],
    visibility: true,
    text: 'Double-click to edit',
    fontFamily: 'Mali',
    fontSize: 24,
    color: '#ffffff',
    textAlign: 'left',
    rotation: 0,
    opacity: 1.0,
    zIndex: 0,
    aspectLocked: false
  };

  // Calculate correct bbox based on text content
  recalculateTextBbox(textGroup);

  allGroups.push(textGroup);
  selectedMedia = textGroup;
  reDrawAll(drawCtx);

  if (title) saveNote(title, allGroups, null, { isSummaryNote: currentNoteIsSummary });
  markDirty();
}

/**
 * Find text group at given canvas coordinates
 */
function findTextGroupAt(canvasX, canvasY) {
  const textGroups = allGroups
    .filter(g => g.type === 'text' && g.visibility)
    .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));

  for (const group of textGroups) {
    const bbox = group.bbox;
    if (canvasX >= bbox.x && canvasX <= bbox.x + bbox.w &&
        canvasY >= bbox.y && canvasY <= bbox.y + bbox.h) {
      return group;
    }
  }
  return null;
}

/**
 * Show text edit popup with textarea and settings
 */
function startTextEditing(group) {
  const old = document.getElementById('textEditPopup');
  if (old) old.remove();

  if (typeof hideToolbox === 'function') {
    hideToolbox();
  }

  selectedMedia = group;

  // Calculate position near the text block
  const screenX = (group.bbox.x - viewportOffset.x) * scale;
  const screenY = (group.bbox.y - viewportOffset.y) * scale;

  const popupWidth = 260;
  let popupX = screenX;
  let popupY = screenY + group.bbox.h * scale + 10;

  // Keep popup on screen
  popupX = Math.max(10, Math.min(popupX, window.innerWidth - popupWidth - 10));
  popupY = Math.max(10, Math.min(popupY, window.innerHeight - 350));

  const popup = document.createElement('div');
  popup.id = 'textEditPopup';
  popup.style.cssText = `
    position: fixed;
    left: ${popupX}px;
    top: ${popupY}px;
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 10px;
    padding: 12px;
    z-index: 100001;
    width: ${popupWidth}px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.5);
    font-family: 'Mali', sans-serif;
    color: #fff;
  `;

  const currentText = group.text === 'Double-click to edit' ? '' : group.text;

  popup.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
      <span style="font-size: 13px; font-weight: 500; color: #aaa;">Edit Text</span>
      <button id="textPopupClose" style="background: none; border: none; color: #666; font-size: 18px; cursor: pointer; padding: 0;">&times;</button>
    </div>

    <textarea id="textContentInput" style="
      width: 100%;
      height: 80px;
      background: #1e1e1e;
      border: 1px solid #444;
      border-radius: 6px;
      padding: 8px;
      color: #fff;
      font-family: '${group.fontFamily}', sans-serif;
      font-size: 14px;
      resize: vertical;
      margin-bottom: 10px;
      box-sizing: border-box;
    ">${currentText}</textarea>

    <div style="display: flex; gap: 8px; margin-bottom: 8px;">
      <select id="textFontSelect" style="flex: 1; background: #333; border: 1px solid #444; border-radius: 4px; padding: 6px; color: #fff; font-size: 12px;">
        <option value="Mali" ${group.fontFamily === 'Mali' ? 'selected' : ''}>Mali</option>
        <option value="Arial" ${group.fontFamily === 'Arial' ? 'selected' : ''}>Arial</option>
        <option value="Georgia" ${group.fontFamily === 'Georgia' ? 'selected' : ''}>Georgia</option>
        <option value="Courier New" ${group.fontFamily === 'Courier New' ? 'selected' : ''}>Courier</option>
      </select>
      <input type="number" id="textSizeInput" value="${group.fontSize}" min="12" max="72" style="width: 50px; background: #333; border: 1px solid #444; border-radius: 4px; padding: 6px; color: #fff; font-size: 12px; text-align: center;">
      <input type="color" id="textColorInput" value="${group.color}" style="width: 36px; height: 32px; border: 1px solid #444; border-radius: 4px; cursor: pointer; padding: 0;">
    </div>

    <div style="display: flex; gap: 8px;">
      <button id="textSaveBtn" style="flex: 1; background: #3a6ea5; border: none; border-radius: 6px; padding: 8px; color: #fff; cursor: pointer; font-size: 13px;">Save</button>
      <button id="textDeleteBtn" style="background: #5a3a3a; border: none; border-radius: 6px; padding: 8px 12px; color: #fff; cursor: pointer; font-size: 13px;"><i class='bx bx-trash'></i></button>
    </div>
  `;

  document.body.appendChild(popup);

  // Focus textarea
  const textarea = document.getElementById('textContentInput');
  textarea.focus();
  textarea.select();

  // Live text preview as user types
  textarea.oninput = () => {
    group.text = textarea.value || 'Text';
    recalculateTextBbox(group);
    reDrawAll(drawCtx);
  };

  // Live preview handlers
  document.getElementById('textFontSelect').onchange = (e) => {
    group.fontFamily = e.target.value;
    textarea.style.fontFamily = `'${e.target.value}', sans-serif`;
    recalculateTextBbox(group);
    reDrawAll(drawCtx);
  };

  document.getElementById('textSizeInput').onchange = (e) => {
    group.fontSize = parseInt(e.target.value) || 24;
    recalculateTextBbox(group);
    reDrawAll(drawCtx);
  };

  document.getElementById('textColorInput').oninput = (e) => {
    group.color = e.target.value;
    reDrawAll(drawCtx);
  };

  // Save button
  document.getElementById('textSaveBtn').onclick = () => {
    const newText = textarea.value.trim() || 'Text';
    group.text = newText;
    recalculateTextBbox(group);
    popup.remove();
    reDrawAll(drawCtx);
    if (title) saveNote(title, allGroups, null, { isSummaryNote: currentNoteIsSummary });
    markDirty();
  };

  // Delete button
  document.getElementById('textDeleteBtn').onclick = () => {
    const idx = allGroups.indexOf(group);
    if (idx !== -1) allGroups.splice(idx, 1);
    selectedMedia = null;
    popup.remove();
    reDrawAll(drawCtx);
    if (title) saveNote(title, allGroups, null, { isSummaryNote: currentNoteIsSummary });
    markDirty();
  };

  // Close button
  document.getElementById('textPopupClose').onclick = () => {
    popup.remove();
    reDrawAll(drawCtx);
  };

  // Enter to save (Shift+Enter for newline)
  textarea.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('textSaveBtn').click();
    } else if (e.key === 'Escape') {
      popup.remove();
      reDrawAll(drawCtx);
    }
  };
}

/**
 * Recalculate text bounding box based on content
 */
/**
 * Generate 3 fake strokes for text block (for modifier compatibility)
 */
function generateTextFakeStrokes(x, y, w, h) {
  // Create 3 strokes: top edge, right edge, bottom edge
  return [
    // Stroke 1: top edge
    [{ x: x, y: y }, { x: x + w, y: y }],
    // Stroke 2: right edge
    [{ x: x + w, y: y }, { x: x + w, y: y + h }],
    // Stroke 3: bottom edge
    [{ x: x + w, y: y + h }, { x: x, y: y + h }]
  ];
}

/**
 * Update text block strokes after bbox change
 */
function updateTextStrokes(group) {
  const { x, y, w, h } = group.bbox;
  const fakeStrokes = generateTextFakeStrokes(x, y, w, h);
  group.stroke = fakeStrokes[0];
  group.fakeStrokes = fakeStrokes;
}

function recalculateTextBbox(group) {
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.font = `${group.fontSize}px '${group.fontFamily}', sans-serif`;

  const lines = group.text.split('\n');
  let maxWidth = 0;
  lines.forEach(line => {
    const metrics = tempCtx.measureText(line);
    maxWidth = Math.max(maxWidth, metrics.width);
  });

  const lineHeight = group.fontSize * 1.3;
  const totalHeight = lines.length * lineHeight;

  // Padding: 10px left/right, 5px top/bottom
  const paddingX = 10;
  const paddingY = 5;

  group.bbox.w = Math.max(maxWidth + paddingX * 2, 50);
  group.bbox.h = Math.max(totalHeight + paddingY * 2, 30);

  // Update fake strokes for modifier compatibility
  updateTextStrokes(group);
}

// ═══════════════════════════════════════════════════════════════════════════
// MEDIA (Images & PDFs) INSERTION FEATURE
// ═══════════════════════════════════════════════════════════════════════════

// Media cache to avoid re-decoding base64 data
const mediaCache = new Map();

// State for media editing
let selectedMedia = null;
let mediaLongPressTimer = null;
let mediaLongPressTarget = null;

// State for media resizing
let isResizingMedia = false;
let resizeHandle = null; // 'nw', 'ne', 'sw', 'se'
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartBbox = null;

// State for media dragging/moving
let isDraggingMedia = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartBbox = null;

// Configure pdf.js worker
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/**
 * Trigger file picker for media insertion
 */
function handleMediaInsert() {
  const input = document.getElementById('mediaFileInput');
  input.value = ''; // Reset to allow re-selecting same file
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const mediaData = await processMediaFile(file);
      if (mediaData) {
        
        // Check if it's an array (multi-page PDF) or single item
        if (Array.isArray(mediaData)) {
          createMediaGroupsVertical(mediaData);
        } else {
          createMediaGroup(mediaData);
        }
      }
    } catch (err) {
      console.error('Error processing media file:', err);
      alert('Failed to process file: ' + err.message);
    }
  };
  input.click();
}

/**
 * Process uploaded file (image or PDF)
 */
async function processMediaFile(file) {
  if (file.type === 'application/pdf') {
    return await processPdfFile(file);
  } else if (file.type.startsWith('image/')) {
    return await processImageFile(file);
  } else {
    throw new Error('Unsupported file type: ' + file.type);
  }
}

/**
 * Process image file to base64
 */
async function processImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          dataUrl: e.target.result,
          width: img.width,
          height: img.height,
          mediaType: 'image'
        });
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Process PDF file - render ALL pages as a vertical list
 * Stores original PDF data for re-rendering on resize
 */
async function processPdfFile(file) {
  if (typeof pdfjsLib === 'undefined') {
    throw new Error('PDF.js library not loaded');
  }

  const arrayBuffer = await file.arrayBuffer();

  // Store PDF as base64 for re-rendering on resize
  const pdfBase64 = arrayBufferToBase64(arrayBuffer);

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const pages = [];
  const dpr = window.devicePixelRatio || 1;

  // Calculate 90% of viewport width for initial render
  const viewportWidth = window.innerWidth / (scale || 1);
  const targetWidth = Math.max(viewportWidth * 0.9, CONFIG.MEDIA.DEFAULT_INSERT_WIDTH);

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    console.log(`Processing PDF page ${pageNum} of ${totalPages}...`);
    const page = await pdf.getPage(pageNum);
    console.log(`Got page ${pageNum}, pageNumber:`, page.pageNumber);
    const pageData = await renderPdfPageHiDPI(page, pageNum, totalPages, dpr, targetWidth);
    // Store PDF data for re-rendering
    pageData.pdfBase64 = pdfBase64;
    pages.push(pageData);
    // Cleanup page to free memory
    page.cleanup();
  }

  return pages;
}

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Render PDF page at optimal HiDPI resolution
 * @param {PDFPageProxy} page - PDF.js page object
 * @param {number} pageNum - Page number
 * @param {number} totalPages - Total pages
 * @param {number} dpr - Device pixel ratio
 * @param {number} targetWidth - Target display width in CSS pixels (optional)
 */
async function renderPdfPageHiDPI(page, pageNum, totalPages, dpr, targetWidth = 700) {
  const baseViewport = page.getViewport({ scale: 1.0 });
  const pdfWidth = baseViewport.width;
  const pdfHeight = baseViewport.height;

  // Render at 3x the display resolution for sharpness
  const qualityMultiplier = 3;
  const renderScale = (targetWidth * dpr * qualityMultiplier) / pdfWidth;

  const pixelWidth = Math.ceil(pdfWidth * renderScale);
  const pixelHeight = Math.ceil(pdfHeight * renderScale);

  const canvas = document.createElement('canvas');
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;

  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, pixelWidth, pixelHeight);

  const viewport = page.getViewport({ scale: renderScale });
  await page.render({
    canvasContext: ctx,
    viewport: viewport,
    intent: 'print'
  }).promise;

  console.log(`PDF page ${pageNum}/${totalPages}: ${pixelWidth}x${pixelHeight}px @ ${targetWidth}px display`);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: pdfWidth,
    height: pdfHeight,
    displayWidth: targetWidth,
    mediaType: 'pdf',
    pdfPage: pageNum,
    pdfTotalPages: totalPages
  };
}

/**
 * Re-render a PDF media group at its current size
 */
async function reRenderPdfMedia(group) {
  console.log('reRenderPdfMedia called', {
    mediaType: group.mediaType,
    hasPdfBase64: !!group.pdfBase64,
    pdfPage: group.pdfPage,
    newWidth: group.bbox.w
  });

  if (group.mediaType !== 'pdf') {
    console.log('Not a PDF, skipping re-render');
    return;
  }

  if (!group.pdfBase64) {
    console.log('No pdfBase64 stored, cannot re-render');
    return;
  }

  const newWidth = Math.round(group.bbox.w);
  const dpr = window.devicePixelRatio || 1;

  try {
    console.log('Converting base64 to ArrayBuffer...');
    const arrayBuffer = base64ToArrayBuffer(group.pdfBase64);

    console.log('Loading PDF document...');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    console.log('Getting page', group.pdfPage);
    const page = await pdf.getPage(group.pdfPage);

    console.log('Rendering at width:', newWidth);
    const pageData = await renderPdfPageHiDPI(page, group.pdfPage, group.pdfTotalPages, dpr, newWidth);

    // Update the group with new render
    group.dataUrl = pageData.dataUrl;
    group.displayWidth = newWidth;

    // Clear cache to force reload
    mediaCache.delete(group.id);
    loadMediaImage(group);

    // Save the updated note
    if (title) saveNote(title, allGroups, null, { isSummaryNote: currentNoteIsSummary });

    console.log(`Re-rendered PDF page ${group.pdfPage} at ${newWidth}px - SUCCESS`);
  } catch (err) {
    console.error('Failed to re-render PDF:', err);
  }
}

/**
 * Show PDF page selector popup
 */
function showPdfPageSelector(totalPages) {
  return new Promise((resolve) => {
    const old = document.getElementById('pdfPageSelector');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pdfPageSelector';
    overlay.className = 'media-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100000;
    `;

    const box = document.createElement('div');
    box.className = 'pdf-page-selector';
    box.style.cssText = `
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 12px;
      padding: 24px;
      min-width: 280px;
      color: #fff;
      font-family: sans-serif;
    `;

    box.innerHTML = `
      <h3 style="margin: 0 0 16px; font-size: 16px; text-align: center;">Select PDF Page</h3>
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
        <label style="color: #aaa;">Page:</label>
        <input type="number" id="pdfPageInput" min="1" max="${totalPages}" value="1"
               style="flex: 1; padding: 8px 12px; background: #3a3a3a; border: 1px solid #555;
                      border-radius: 6px; color: #fff; font-size: 14px;">
        <span style="color: #888;">/ ${totalPages}</span>
      </div>
      <div style="display: flex; gap: 12px; justify-content: center;">
        <button id="pdfPageConfirm" style="background: #007aff; color: white; border: none;
                padding: 10px 24px; border-radius: 8px; cursor: pointer; font-size: 14px;">Insert</button>
        <button id="pdfPageCancel" style="background: #444; color: white; border: none;
                padding: 10px 24px; border-radius: 8px; cursor: pointer; font-size: 14px;">Cancel</button>
      </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const input = document.getElementById('pdfPageInput');
    input.focus();
    input.select();

    document.getElementById('pdfPageCancel').onclick = () => {
      overlay.remove();
      resolve(null);
    };

    document.getElementById('pdfPageConfirm').onclick = () => {
      const page = parseInt(input.value);
      if (page >= 1 && page <= totalPages) {
        overlay.remove();
        resolve(page);
      } else {
        input.style.borderColor = '#ff4444';
      }
    };

    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        document.getElementById('pdfPageConfirm').click();
      } else if (e.key === 'Escape') {
        document.getElementById('pdfPageCancel').click();
      }
    };

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(null);
      }
    };
  });
}

/**
 * Create a media group and add to canvas
 */
function createMediaGroup(mediaData) {
  const { dataUrl, width, height, mediaType, pdfPage, pdfTotalPages } = mediaData;

  // Calculate default size maintaining aspect ratio
  // Use 90% of viewport width for better visibility
  const viewportWidth = window.innerWidth / scale;
  const maxWidth = Math.max(viewportWidth * 0.9, CONFIG.MEDIA.DEFAULT_INSERT_WIDTH);
  const aspectRatio = width / height;
  let displayWidth = Math.min(width, maxWidth);
  let displayHeight = displayWidth / aspectRatio;

  // Position at center of current viewport
  const centerX = viewportOffset.x + (window.innerWidth / scale) / 2;
  const centerY = viewportOffset.y + (window.innerHeight / scale) / 2;

  const mediaGroup = {
    id: 'media_' + Date.now() + '_' + getNextId(),
    type: 'media',
    mediaType: mediaType,
    bbox: {
      x: centerX - displayWidth / 2,
      y: centerY - displayHeight / 2,
      w: displayWidth,
      h: displayHeight
    },
    visibility: true,
    dataUrl: dataUrl,
    originalWidth: width,
    originalHeight: height,
    rotation: 0,
    opacity: CONFIG.MEDIA.DEFAULT_OPACITY,
    zIndex: 0,
    aspectLocked: true
  };

  // Add PDF-specific properties
  if (mediaType === 'pdf') {
    mediaGroup.pdfPage = pdfPage;
    mediaGroup.pdfTotalPages = pdfTotalPages;
  }

  // Add to groups and redraw
  allGroups.push(mediaGroup);

  // Record for undo
  pastGroups.push({
    action: 'add',
    groups: [structuredClone(mediaGroup)]
  });
  redoGroups = [];

  // Preload into cache
  loadMediaImage(mediaGroup);

  reDrawAll(drawCtx);
  if (title) saveNote(title, allGroups, null, { isSummaryNote: currentNoteIsSummary });
}

/**
 * Create multiple media groups positioned vertically (for multi-page PDFs)
 */
function createMediaGroupsVertical(pagesData) {
  if (!pagesData || pagesData.length === 0) return;

  const PAGE_GAP = 30; // Gap between pages

  // Start position - at current viewport position
  let currentY = viewportOffset.y + 50;
  const startX = viewportOffset.x + 50;

  const createdGroups = [];

  // Calculate 90% of viewport width for PDF pages
  const viewportWidth = window.innerWidth / scale;
  const targetWidth = Math.max(viewportWidth * 0.9, CONFIG.MEDIA.DEFAULT_INSERT_WIDTH);

  for (let i = 0; i < pagesData.length; i++) {
    const pageData = pagesData[i];
    const { dataUrl, width, height, displayWidth, mediaType, pdfPage, pdfTotalPages, pdfBase64 } = pageData;

    // Use the display width from render, calculate height from aspect ratio
    const aspectRatio = width / height;
    const finalWidth = displayWidth || targetWidth;
    const finalHeight = finalWidth / aspectRatio;

    const mediaGroup = {
      id: 'media_' + Date.now() + '_' + getNextId(),
      type: 'media',
      mediaType: mediaType,
      bbox: {
        x: startX,
        y: currentY,
        w: finalWidth,
        h: finalHeight
      },
      visibility: true,
      dataUrl: dataUrl,
      originalWidth: width,
      originalHeight: height,
      rotation: 0,
      opacity: CONFIG.MEDIA.DEFAULT_OPACITY,
      zIndex: i,
      aspectLocked: true,
      pdfPage: pdfPage,
      pdfTotalPages: pdfTotalPages,
      pdfBase64: pdfBase64  // Store for re-rendering on resize
    };

    allGroups.push(mediaGroup);
    createdGroups.push(structuredClone(mediaGroup));

    // Preload into cache
    loadMediaImage(mediaGroup);

    // Move Y position for next page
    currentY += finalHeight + PAGE_GAP;
  }

  // Record all pages for undo as single action
  pastGroups.push({
    action: 'add',
    groups: createdGroups
  });
  redoGroups = [];

  console.log(`Inserted ${pagesData.length} PDF pages vertically`);

  reDrawAll(drawCtx);
  if (title) saveNote(title, allGroups, null, { isSummaryNote: currentNoteIsSummary });
}

/**
 * Load media image into cache
 */
function loadMediaImage(group) {
  if (mediaCache.has(group.id)) {
    return mediaCache.get(group.id);
  }

  const img = new Image();
  img.onload = () => {
    mediaCache.set(group.id, img);
    reDrawAll(drawCtx);
  };
  img.src = group.dataUrl;
  return img;
}

/**
 * Find media or text group at given canvas coordinates
 */
function findMediaGroupAt(canvasX, canvasY) {
  // Search in reverse order (top-most first) respecting z-index
  // Include both media and text types
  const mediaGroups = allGroups
    .filter(g => (g.type === 'media' || g.type === 'text') && g.visibility)
    .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));

  for (const group of mediaGroups) {
    const bbox = group.bbox;
    if (canvasX >= bbox.x && canvasX <= bbox.x + bbox.w &&
        canvasY >= bbox.y && canvasY <= bbox.y + bbox.h) {
      return group;
    }
  }
  return null;
}

/**
 * Start long press detection for media/text editing
 */
function startMediaLongPressDetection(screenX, screenY) {
  const canvasX = (screenX / scale) + viewportOffset.x;
  const canvasY = (screenY / scale) + viewportOffset.y;

  const mediaGroup = findMediaGroupAt(canvasX, canvasY);
  if (!mediaGroup) return false;

  mediaLongPressTarget = mediaGroup;
  mediaLongPressTimer = setTimeout(() => {
    // Show appropriate popup based on group type
    if (mediaGroup.type === 'text') {
      startTextEditing(mediaGroup);
    } else {
      showMediaEditPopup(mediaGroup);
    }
  }, CONFIG.MEDIA.LONG_PRESS_MS);

  return true;
}

/**
 * Cancel long press detection
 */
function cancelMediaLongPress() {
  if (mediaLongPressTimer) {
    clearTimeout(mediaLongPressTimer);
    mediaLongPressTimer = null;
  }
  mediaLongPressTarget = null;
}

/**
 * Show media edit popup
 */
function showMediaEditPopup(group) {
  const old = document.getElementById('mediaEditPopup');
  if (old) old.remove();

  // Hide toolbox when editing media
  if (typeof hideToolbox === 'function') {
    hideToolbox();
  }

  selectedMedia = group;

  // Calculate scale percentage (current width vs original width)
  const scalePercent = Math.round((group.bbox.w / group.originalWidth) * 100);

  // Check if this is a multi-page PDF
  const isMultiPagePdf = group.mediaType === 'pdf' && group.pdfTotalPages > 1;
  const pageInfo = isMultiPagePdf ? ` (Page ${group.pdfPage}/${group.pdfTotalPages})` : '';

  // Calculate media top-left corner on screen
  const mediaScreenLeft = (group.bbox.x - viewportOffset.x) * scale;
  const mediaScreenTop = (group.bbox.y - viewportOffset.y) * scale;

  // Popup dimensions (approximate)
  const popupWidth = 220;
  const popupHeight = 350;

  // Position popup at top-left corner of media with small offset
  let popupX = mediaScreenLeft + 10;
  let popupY = mediaScreenTop + 10;

  // Clamp to screen bounds so popup stays visible
  popupX = Math.max(10, Math.min(popupX, window.innerWidth - popupWidth - 10));
  popupY = Math.max(10, Math.min(popupY, window.innerHeight - popupHeight - 10));

  const popup = document.createElement('div');
  popup.id = 'mediaEditPopup';
  popup.className = 'media-edit-popup';
  popup.style.cssText = `
    position: fixed;
    left: ${popupX}px;
    top: ${popupY}px;
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 10px;
    padding: 14px;
    z-index: 100000;
    min-width: 200px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.5);
    font-family: sans-serif;
    color: #fff;
  `;

  popup.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #444;">
      <span style="font-size: 14px; font-weight: 500;">Edit ${group.mediaType}${pageInfo}</span>
      <button id="mediaEditClose" style="background: none; border: none; color: #888; font-size: 18px; cursor: pointer; padding: 0; line-height: 1;">&times;</button>
    </div>

    <div style="margin-bottom: 10px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <label style="width: 70px; color: #aaa; font-size: 12px;">Scale</label>
        <span id="scaleValue" style="font-size: 13px; color: #fff;">${scalePercent}%</span>
        <span style="font-size: 11px; color: #666;">(${Math.round(group.bbox.w)} × ${Math.round(group.bbox.h)})</span>
      </div>

      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <label style="width: 70px; color: #aaa; font-size: 12px;">Rotation</label>
        <button id="rotateCCW" style="background: #3a3a3a; border: 1px solid #555; border-radius: 4px; padding: 6px 10px; color: #fff; cursor: pointer;"><i class="bx bx-rotate-left"></i></button>
        <span id="rotationValue" style="min-width: 40px; text-align: center; font-size: 13px;">${group.rotation}°</span>
        <button id="rotateCW" style="background: #3a3a3a; border: 1px solid #555; border-radius: 4px; padding: 6px 10px; color: #fff; cursor: pointer;"><i class="bx bx-rotate-right"></i></button>
      </div>

      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <label style="width: 70px; color: #aaa; font-size: 12px;">Opacity</label>
        <input type="range" id="opacitySlider" min="0" max="100" value="${Math.round(group.opacity * 100)}"
               style="flex: 1; accent-color: #007aff;">
        <span id="opacityValue" style="min-width: 36px; text-align: right; font-size: 13px;">${Math.round(group.opacity * 100)}%</span>
      </div>

      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <label style="width: 70px; color: #aaa; font-size: 12px;">Layer</label>
        <button id="layerDown" style="background: #3a3a3a; border: 1px solid #555; border-radius: 4px; padding: 6px 10px; color: #fff; cursor: pointer;"><i class="bx bx-chevron-down"></i></button>
        <span id="layerValue" style="min-width: 40px; text-align: center; font-size: 13px;">${group.zIndex || 0}</span>
        <button id="layerUp" style="background: #3a3a3a; border: 1px solid #555; border-radius: 4px; padding: 6px 10px; color: #fff; cursor: pointer;"><i class="bx bx-chevron-up"></i></button>
      </div>

      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
        <label style="width: 70px; color: #aaa; font-size: 12px;">Lock Aspect</label>
        <input type="checkbox" id="aspectLock" ${group.aspectLocked ? 'checked' : ''}
               style="width: 18px; height: 18px; accent-color: #007aff;">
      </div>
    </div>

    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
      <button id="mediaDelete" style="background: #5a2a2a; border: 1px solid #744; border-radius: 6px; padding: 8px 12px; color: #fff; cursor: pointer; font-size: 13px;"><i class="bx bx-trash"></i> Delete</button>
      ${isMultiPagePdf ? `<button id="mediaDeleteAll" style="background: #5a2a2a; border: 1px solid #744; border-radius: 6px; padding: 8px 12px; color: #fff; cursor: pointer; font-size: 13px;"><i class="bx bx-trash"></i> Delete All Pages</button>` : ''}
    </div>
  `;

  document.body.appendChild(popup);
  setupMediaEditListeners(popup, group);

  // Redraw canvas to show selection border and handles
  reDrawAll(drawCtx);
}

/**
 * Setup event listeners for media edit popup
 */
function setupMediaEditListeners(popup, group) {
  // Close button - keep selectedMedia so resize handles stay visible
  document.getElementById('mediaEditClose').onclick = () => {
    popup.remove();
    // Don't clear selectedMedia - user may want to resize
    reDrawAll(drawCtx);
  };

  // Rotation
  document.getElementById('rotateCCW').onclick = () => {
    group.rotation = (group.rotation - CONFIG.MEDIA.ROTATION_SNAP + 360) % 360;
    document.getElementById('rotationValue').textContent = group.rotation + '°';
    reDrawAll(drawCtx);
    if (title) saveNote(title, allGroups, null, { isSummaryNote: currentNoteIsSummary });
  };

  document.getElementById('rotateCW').onclick = () => {
    group.rotation = (group.rotation + CONFIG.MEDIA.ROTATION_SNAP) % 360;
    document.getElementById('rotationValue').textContent = group.rotation + '°';
    reDrawAll(drawCtx);
    if (title) saveNote(title, allGroups, null, { isSummaryNote: currentNoteIsSummary });
  };

  // Opacity
  const opacitySlider = document.getElementById('opacitySlider');
  const opacityValue = document.getElementById('opacityValue');
  opacitySlider.oninput = () => {
    group.opacity = parseInt(opacitySlider.value) / 100;
    opacityValue.textContent = opacitySlider.value + '%';
    reDrawAll(drawCtx);
  };
  opacitySlider.onchange = () => {
    if (title) saveNote(title, allGroups, null, { isSummaryNote: currentNoteIsSummary });
  };

  // Layer (z-index)
  document.getElementById('layerDown').onclick = () => {
    group.zIndex = (group.zIndex || 0) - 1;
    document.getElementById('layerValue').textContent = group.zIndex;
    reDrawAll(drawCtx);
    if (title) saveNote(title, allGroups, null, { isSummaryNote: currentNoteIsSummary });
  };

  document.getElementById('layerUp').onclick = () => {
    group.zIndex = (group.zIndex || 0) + 1;
    document.getElementById('layerValue').textContent = group.zIndex;
    reDrawAll(drawCtx);
    if (title) saveNote(title, allGroups, null, { isSummaryNote: currentNoteIsSummary });
  };

  // Aspect lock
  document.getElementById('aspectLock').onchange = (e) => {
    group.aspectLocked = e.target.checked;
    if (title) saveNote(title, allGroups, null, { isSummaryNote: currentNoteIsSummary });
  };

  // Delete single page
  document.getElementById('mediaDelete').onclick = () => {
    const index = allGroups.findIndex(g => g.id === group.id);
    if (index !== -1) {
      const removed = allGroups.splice(index, 1)[0];
      pastGroups.push({
        action: 'delete',
        groups: [structuredClone(removed)]
      });
      redoGroups = [];
      mediaCache.delete(group.id);
      reDrawAll(drawCtx);
      if (title) saveNote(title, allGroups, null, { isSummaryNote: currentNoteIsSummary });
    }
    popup.remove();
    selectedMedia = null;
  };

  // Delete All Pages (for multi-page PDFs)
  const deleteAllBtn = document.getElementById('mediaDeleteAll');
  if (deleteAllBtn) {
    deleteAllBtn.onclick = () => {
      // Find all pages from the same PDF (same pdfBase64)
      const pdfBase64 = group.pdfBase64;
      const pagesToDelete = allGroups.filter(g =>
        g.type === 'media' &&
        g.mediaType === 'pdf' &&
        g.pdfBase64 === pdfBase64
      );

      // Remove all pages
      const removedGroups = [];
      for (const page of pagesToDelete) {
        const index = allGroups.findIndex(g => g.id === page.id);
        if (index !== -1) {
          const removed = allGroups.splice(index, 1)[0];
          removedGroups.push(structuredClone(removed));
          mediaCache.delete(page.id);
        }
      }

      // Record for undo
      if (removedGroups.length > 0) {
        pastGroups.push({
          action: 'delete',
          groups: removedGroups
        });
        redoGroups = [];
      }

      reDrawAll(drawCtx);
      if (title) saveNote(title, allGroups, null, { isSummaryNote: currentNoteIsSummary });
      popup.remove();
      selectedMedia = null;
    };
  }

  // Close popup when clicking outside - keep selectedMedia for resize handles
  const closeOnClickOutside = (e) => {
    if (!popup.contains(e.target)) {
      popup.remove();
      // Don't clear selectedMedia - user may want to resize
      // selectedMedia will be cleared when user clicks elsewhere on canvas
      document.removeEventListener('pointerdown', closeOnClickOutside);
      reDrawAll(drawCtx);
    }
  };
  setTimeout(() => {
    document.addEventListener('pointerdown', closeOnClickOutside);
  }, 100);
}

/**
 * Clear media from cache when note changes
 */
function clearMediaCache() {
  mediaCache.clear();
}

/**
 * Check if a screen point is inside the selected media
 */
function isPointInsideSelectedMedia(screenX, screenY) {
  if (!selectedMedia) return false;

  const canvasX = (screenX / scale) + viewportOffset.x;
  const canvasY = (screenY / scale) + viewportOffset.y;
  const bbox = selectedMedia.bbox;

  return canvasX >= bbox.x && canvasX <= bbox.x + bbox.w &&
         canvasY >= bbox.y && canvasY <= bbox.y + bbox.h;
}

/**
 * Check if a point is on a resize handle of the selected media
 * Returns handle name ('nw', 'ne', 'sw', 'se') or null
 */
function getMediaResizeHandle(screenX, screenY) {
  if (!selectedMedia) return null;

  const bbox = selectedMedia.bbox;
  const handleSize = CONFIG.MEDIA.HANDLE_SIZE * 2; // Larger hit area for easier grabbing

  // Convert screen coords to canvas coords
  const canvasX = (screenX / scale) + viewportOffset.x;
  const canvasY = (screenY / scale) + viewportOffset.y;

  const corners = [
    { name: 'nw', x: bbox.x, y: bbox.y },
    { name: 'ne', x: bbox.x + bbox.w, y: bbox.y },
    { name: 'sw', x: bbox.x, y: bbox.y + bbox.h },
    { name: 'se', x: bbox.x + bbox.w, y: bbox.y + bbox.h }
  ];

  for (const corner of corners) {
    const dx = Math.abs(canvasX - corner.x);
    const dy = Math.abs(canvasY - corner.y);
    if (dx <= handleSize / scale && dy <= handleSize / scale) {
      return corner.name;
    }
  }

  return null;
}

/**
 * Start resizing media
 */
function startMediaResize(handle, screenX, screenY) {
  if (!selectedMedia) return;

  isResizingMedia = true;
  resizeHandle = handle;
  resizeStartX = (screenX / scale) + viewportOffset.x;
  resizeStartY = (screenY / scale) + viewportOffset.y;
  resizeStartBbox = { ...selectedMedia.bbox };

  // Change cursor
  const cursors = { nw: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', se: 'nwse-resize' };
  canvasGroup.style.cursor = cursors[handle] || 'default';
}

/**
 * Handle media resize during drag
 */
function handleMediaResize(screenX, screenY) {
  if (!isResizingMedia || !selectedMedia || !resizeStartBbox) return;

  const canvasX = (screenX / scale) + viewportOffset.x;
  const canvasY = (screenY / scale) + viewportOffset.y;

  const dx = canvasX - resizeStartX;
  const dy = canvasY - resizeStartY;

  let newBbox = { ...resizeStartBbox };
  const aspectRatio = resizeStartBbox.w / resizeStartBbox.h;

  // Calculate new dimensions based on which handle is being dragged
  switch (resizeHandle) {
    case 'se': // Bottom-right
      newBbox.w = Math.max(CONFIG.MEDIA.MIN_SIZE, resizeStartBbox.w + dx);
      if (selectedMedia.aspectLocked) {
        newBbox.h = newBbox.w / aspectRatio;
      } else {
        newBbox.h = Math.max(CONFIG.MEDIA.MIN_SIZE, resizeStartBbox.h + dy);
      }
      break;

    case 'sw': // Bottom-left
      newBbox.w = Math.max(CONFIG.MEDIA.MIN_SIZE, resizeStartBbox.w - dx);
      newBbox.x = resizeStartBbox.x + resizeStartBbox.w - newBbox.w;
      if (selectedMedia.aspectLocked) {
        newBbox.h = newBbox.w / aspectRatio;
      } else {
        newBbox.h = Math.max(CONFIG.MEDIA.MIN_SIZE, resizeStartBbox.h + dy);
      }
      break;

    case 'ne': // Top-right
      newBbox.w = Math.max(CONFIG.MEDIA.MIN_SIZE, resizeStartBbox.w + dx);
      if (selectedMedia.aspectLocked) {
        const newH = newBbox.w / aspectRatio;
        newBbox.y = resizeStartBbox.y + resizeStartBbox.h - newH;
        newBbox.h = newH;
      } else {
        newBbox.h = Math.max(CONFIG.MEDIA.MIN_SIZE, resizeStartBbox.h - dy);
        newBbox.y = resizeStartBbox.y + resizeStartBbox.h - newBbox.h;
      }
      break;

    case 'nw': // Top-left
      newBbox.w = Math.max(CONFIG.MEDIA.MIN_SIZE, resizeStartBbox.w - dx);
      newBbox.x = resizeStartBbox.x + resizeStartBbox.w - newBbox.w;
      if (selectedMedia.aspectLocked) {
        const newH = newBbox.w / aspectRatio;
        newBbox.y = resizeStartBbox.y + resizeStartBbox.h - newH;
        newBbox.h = newH;
      } else {
        newBbox.h = Math.max(CONFIG.MEDIA.MIN_SIZE, resizeStartBbox.h - dy);
        newBbox.y = resizeStartBbox.y + resizeStartBbox.h - newBbox.h;
      }
      break;
  }

  selectedMedia.bbox = newBbox;

  // Update strokes for text blocks (for modifier compatibility)
  if (selectedMedia.type === 'text') {
    updateTextStrokes(selectedMedia);
  }

  // Update popup position to follow the media
  updateMediaEditPopupPosition();

  reDrawAll(drawCtx);
}

/**
 * End media resize
 */
function endMediaResize() {
  console.log('endMediaResize called', { isResizingMedia, hasSelectedMedia: !!selectedMedia });

  if (isResizingMedia && selectedMedia) {
    console.log('Media resized:', {
      type: selectedMedia.type,
      mediaType: selectedMedia.mediaType,
      hasPdfBase64: !!selectedMedia.pdfBase64,
      newSize: selectedMedia.bbox.w + 'x' + selectedMedia.bbox.h
    });

    // Re-render PDF at new size for crisp display
    if (selectedMedia.mediaType === 'pdf') {
      console.log('Triggering PDF re-render...');
      reRenderPdfMedia(selectedMedia);
    }
    if (title) saveNote(title, allGroups, null, { isSummaryNote: currentNoteIsSummary });
  }
  isResizingMedia = false;
  resizeHandle = null;
  resizeStartBbox = null;
  canvasGroup.style.cursor = 'default';
}

/**
 * Start dragging media
 */
function startMediaDrag(screenX, screenY) {
  if (!selectedMedia) return;

  isDraggingMedia = true;
  dragStartX = (screenX / scale) + viewportOffset.x;
  dragStartY = (screenY / scale) + viewportOffset.y;
  dragStartBbox = { ...selectedMedia.bbox };
  canvasGroup.style.cursor = 'move';
}

/**
 * Handle media drag
 */
function handleMediaDrag(screenX, screenY) {
  if (!isDraggingMedia || !selectedMedia || !dragStartBbox) return;

  const canvasX = (screenX / scale) + viewportOffset.x;
  const canvasY = (screenY / scale) + viewportOffset.y;

  const dx = canvasX - dragStartX;
  const dy = canvasY - dragStartY;

  selectedMedia.bbox.x = dragStartBbox.x + dx;
  selectedMedia.bbox.y = dragStartBbox.y + dy;

  // Update strokes for text blocks (for modifier compatibility)
  if (selectedMedia.type === 'text') {
    updateTextStrokes(selectedMedia);
  }

  // Update popup position to follow the media
  updateMediaEditPopupPosition();

  reDrawAll(drawCtx);
}

/**
 * Update the media edit popup position to follow the selected media
 */
function updateMediaEditPopupPosition() {
  const popup = document.getElementById('mediaEditPopup');
  if (!popup || !selectedMedia) return;

  // Calculate media top-left corner on screen
  const mediaScreenLeft = (selectedMedia.bbox.x - viewportOffset.x) * scale;
  const mediaScreenTop = (selectedMedia.bbox.y - viewportOffset.y) * scale;

  // Popup dimensions
  const popupWidth = 220;
  const popupHeight = 350;

  // Position popup at top-left corner of media with small offset
  let popupX = mediaScreenLeft + 10;
  let popupY = mediaScreenTop + 10;

  // Clamp to screen bounds so popup stays visible
  popupX = Math.max(10, Math.min(popupX, window.innerWidth - popupWidth - 10));
  popupY = Math.max(10, Math.min(popupY, window.innerHeight - popupHeight - 10));

  popup.style.left = popupX + 'px';
  popup.style.top = popupY + 'px';
}

/**
 * End media drag
 */
function endMediaDrag() {
  if (isDraggingMedia && selectedMedia) {
    if (title) saveNote(title, allGroups, null, { isSummaryNote: currentNoteIsSummary });
  }
  isDraggingMedia = false;
  dragStartBbox = null;
  canvasGroup.style.cursor = 'default';
}

////======== Floating Pointer Overlay (Pen Image, Top-Left Anchor, Scaled) ========
// (function () {
//   const penOverlay = document.createElement("img");
//   penOverlay.src = "cursor.png"; // your 945×1396 image
//   penOverlay.alt = "pen cursor";
//   penOverlay.style.position = "fixed";
//   penOverlay.style.height = "260px"; // scaled height
//   penOverlay.style.pointerEvents = "none";
//   penOverlay.style.zIndex = "999999";
//   penOverlay.style.display = "block";
//   penOverlay.style.transition = "transform 0.25s ease";
//   penOverlay.style.transformOrigin = "top left";
//   penOverlay.style.zIndex = "100000000";

//   // --- Top-left anchor: no transform needed ---
//   penOverlay.style.transform = "none";
//   document.body.appendChild(penOverlay);

//   // --- Update position on move ---
//   const updateCursorPos = (e) => {
//     penOverlay.style.left = `${e.clientX}px`;
//     penOverlay.style.top = `${e.clientY}px`;
//   };
//   window.addEventListener("pointermove", updateCursorPos);

//   // --- Optional press feedback ---
//   window.addEventListener("pointerdown", () => {
//     penOverlay.style.transform = "scale(0.85)";
//     //penOverlay.style.opacity = 1;
//   });
//   window.addEventListener("pointerup", () => {
//     penOverlay.style.transform = "scale(1) rotateY(30deg)";
//     //penOverlay.style.opacity = 0;
//   });
// })();