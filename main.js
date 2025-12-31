
//----Default parameters-----
// Scale and grid constants are defined in config.js (CONFIG.CONFIG.MIN_SCALE, CONFIG.CONFIG.MAX_SCALE, etc.)
let scale = CONFIG.DEFAULT_SCALE;

//parameters for background
let backgroundColor;
let gridLineColor;
let gridSize = Number(document.getElementById("gridWidth").value);
let penSize;
const backgroundColorPicker = document.getElementById("backgroundColorPicker");
const gridLineColorPicker = document.getElementById("gridLineColorPicker");

//parameters for live drawing
let currentStroke = []; 
let drawing = false;
let drawingLock = false;
let idCount = 0; // Unique ID for each group
// normalHeight is defined in config.js as CONFIG.NORMAL_HEIGHT
let normalHeight = CONFIG.NORMAL_HEIGHT;
let allGroups = [];
let pastGroups = [];
let redoGroups = [];
let title = null;

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

const shortcutGroup = [STROKE_TYPE.BOXS, STROKE_TYPE.CURLYS, STROKE_TYPE.CIRCLES];

//parameters for tools/colors setting
let defaultPenColor = CONFIG.DEFAULT_PEN_COLOR; // Can be changed at runtime

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

// -------------------- CONSTANTS (now in config.js) --------------------
// TOOL_ID, TOOL_REGISTRY, PEN_TYPES are defined in config.js

const DEFAULT_MODIFIERS = { 
    defaultPen: {label: "Default Pen", color: "#ffffff", penType: PEN_TYPES.NORMAL, size: 3, visibility: true},
    box: { label: "Box", color: "#ffb6ff", penType: PEN_TYPES.NORMAL, size: 2, visibility: true },
    curly: { label: "Curly", color: "#fa6e6e", penType: PEN_TYPES.NORMAL, size: 2, visibility: true }, 
    boxshortcut: { label: "Box Shortcut", color: "#a3fba9", penType: PEN_TYPES.NORMAL, size: 2, visibility: false},
    curlyshortcut: { label: "Curly Shortcut", color: "#74d8ff", penType: PEN_TYPES.NORMAL, size: 3, visibility: false},
    circleshortcut: { label: "Circle Shortcut", color: "#ffc5d3", penType: PEN_TYPES.NORMAL, size: 2, visibility: false},
    backgroundCanvas: {canvasSetting: true, backgroundColor: "#201f1e", gridLineColor: "#153b57", gridWidth: 58}
}; 

const DEFAULT_TOOLBOX_LAYOUT = {
  color: [
    { id: TOOL_ID.ERASER},
    { id: TOOL_ID.PEN, color: "#ffffff"},
    { id: TOOL_ID.PEN, color: "#f4c64a" },
    { id: TOOL_ID.PEN, color: "#ff6a00" },
    { id: TOOL_ID.PEN, color: "#ffff00" }, 
    { id: TOOL_ID.PEN, color: "#ffb6ff"},
    { id: TOOL_ID.PEN, color: "#ffff00"},
    { id: TOOL_ID.PEN, colorFrom: "#ffff00" },
  ],
  underline: [
    { id: TOOL_ID.TITLE1, color: "#f4c64a", visibility: true },
    { id: TOOL_ID.TITLE2, color: "#ff6a00", visibility: false },
    { id: TOOL_ID.TITLE3, color: "#ffb6ff", visibility: true },
    { id: TOOL_ID.HIGHLIGHT, color: "#ffff00" },
    { id: TOOL_ID.HIGHLIGHT, color: "#ffff00" },
    { id: TOOL_ID.BOLD, color: "none" },
    { id: TOOL_ID.BOLD, color: "purple", visibility: true },
    { id: TOOL_ID.PEN, color: "pink" }
  ],
  box: [
    { id: TOOL_ID.DELETE },
    { id: TOOL_ID.MOVE },
    { id: TOOL_ID.MATH },
    { id: TOOL_ID.COPY },
    { id: TOOL_ID.PASTE },
    { id: TOOL_ID.STICKY },
    { id: TOOL_ID.LINK },
    { id: TOOL_ID.BOLD }
  ], 
   curly: [
    { id: TOOL_ID.DELETE },
    { id: TOOL_ID.MOVE },
    { id: TOOL_ID.MATH },
    { id: TOOL_ID.COPY },
    { id: TOOL_ID.PASTE },
    { id: TOOL_ID.STICKY },
    { id: TOOL_ID.LINK },
    { id: TOOL_ID.BOLD }
  ]
};
// -------------------- GLOBAL STATE --------------------
let modifiers = {};
let toolboxLayout = {};
let colorTools = [];
let underlineTools = [];
let boxTools = [];

// -------------------- CREATE MODIFIER CARD --------------------
function createModifierCard(id, mod) {
  const card = document.createElement("div");
  card.className = "modifier-card";
  card.dataset.modifier = id;

  card.innerHTML = `
    <div class="modifier-title">${mod.label}</div>
    <label>Color:</label>
    <input type="color" class="modifier-color" value="${mod.color}">
    <label>Pen type:</label>
    <select class="modifier-penType">
      ${Object.values(PEN_TYPES).map(t => `
        <option value="${t}" ${t === mod.penType ? "selected" : ""}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>
      `).join("")}
    </select>
    <label>Stroke size:</label>
    <div class="range-row grid-range">
        <input
          type="range"
          id="penSize"
          min="0.4"
          max="15"
          step="0.2"
          value="2"
        />
        <input
          type="number"
          id="penSizeValue"
          min="0.4"
          max="15"
          step="0.2"
          value="2"
        />
    </div>
    <div class="modifier-footer">
      <label>Visibility:</label>
      <label class="toggle-switch">
        <input type="checkbox" ${mod.visibility ? "checked" : ""}>
        <span class="slider"></span>
      </label>
    </div>
  `;

  const btn = document.createElement('button');
  btn.textContent = '✕';
  btn.className = 'delete-modifier-btn';
  btn.style.position = 'absolute';
  btn.style.top = '5px';
  btn.style.right = '5px';
  btn.style.border = 'none';
  btn.style.background = 'transparent';
  btn.style.cursor = 'pointer';
  btn.style.color = '#ff4d4f';
  btn.title = 'Delete Modifier';
  btn.onclick = () => deleteModifier(id);
  card.appendChild(btn);

    if (mod.label == "Default Pen") {
        card.style.backgroundColor = "#142231ff"
        penSize = mod.size;
    }

    if (mod.label == "Default Pen"  || mod.label.includes("Shortcut")) {
        card.querySelector(".modifier-footer").style.display = "none";
    }

    const penSizeSlider = card.querySelector("#penSize");
    const penSizeInput  = card.querySelector("#penSizeValue");

    const MIN_penSize = Number(penSizeSlider.min);
    const MAX_penSize = Number(penSizeSlider.max);

    function clampPenSize(value) {
    return Math.min(MAX_penSize, Math.max(MIN_penSize, value));
    }

    function setPenSize(value) {
        const v = clampPenSize(Number(value) || MIN_penSize);
        penSizeSlider.value = v;
        penSizeInput.value = v;
        penSize = v;        // <-- your existing gridSize
    }

    setPenSize(mod?.size ?? 0);

    // Slider → number
    penSizeSlider.addEventListener("input", e => {
        setPenSize(e.target.value);
        mod.size = clampPenSize(Number(e.target.value) || MIN_penSize);
        updateTools();
    });

    // Number typing → slider
    penSizeInput.addEventListener("input", e => {
        setPenSize(e.target.value);
        mod.size = e.target.value; 
        updateTools();
    });

    // Commit on Enter
    penSizeInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
        e.target.blur();
    }
    });


  return card;
}

// -------------------- RENDER / BIND UI --------------------
function renderModifiers(mods = modifiers) {
  const grid = document.getElementById("modifierGrid");
  if (!grid) return console.warn("No modifier grid found");
  grid.innerHTML = "";
  Object.entries(mods).forEach(([id, mod]) => {
    if (!mod.canvasSetting) {
        grid.appendChild(createModifierCard(id, mod));
    } else {
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
    saveToolboxSettings({ modifiers, toolboxLayout });
}

// -------------------- ADD / DELETE --------------------
function addNewModifier({ id, name, type = "pen", color = "#ffffff", penType = PEN_TYPES.NORMAL, visible = true }) {
  const key = name || `${id}_${Date.now()}`;
  modifiers[key] = { label: name || id, color, penType, visibility: visible };
  if (!toolboxLayout[type]) toolboxLayout[type] = [];
  toolboxLayout[type].push({ id, modifier: key, color });
  renderModifiers();
  updateTools();
}

function deleteModifier(id) {
  if (!modifiers[id]) return console.warn(`Modifier "${id}" does not exist`);
  delete modifiers[id];
  for (const type in toolboxLayout) {
    toolboxLayout[type] = toolboxLayout[type].filter(tool => tool.modifier !== id);
  }
  renderModifiers();
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

async function renderTools() {
    Object.entries(toolboxLayout).forEach(([id, tools]) => {
        const dial = document.createElement("div");
        dial.className = "toolbox-dial";

        const title = document.createElement("div");
        title.className = "toolbox-title";
        title.innerText = id;
        dial.appendChild(title);

        const radius = 90;
        const center = 140;
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
            toolDiv.style.backgroundColor = tool.color || "#fff";
            
            const icon = document.createElement('i');
            icon.className = `bx ${TOOL_REGISTRY[tool.id]?.icon ?? ""}`;
            icon.setAttribute('data-label', tool.id);   
            toolDiv.appendChild(icon);

            const popup = document.createElement("div");
            popup.className = "tool-popup";

            toolDiv.appendChild(popup);

            toolDiv.addEventListener("click", function(e) {
                popup.innerHTML = `
                    <div class="modifier-title">Tool selection</div>
                    <label for"toolPicker">Tool:</label>
                    <select class="modifier-toolType" id="toolPicker">
                    ${Object.values(TOOL_ID).map(t => `
                        <option value="${t}" ${t === tool.id ? "selected" : ""}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    `).join("")}
                    </select>
                    <label for="colorPicker" id="colorLabel">Color:</label>
                    <input type="color" id="colorPicker" class="modifier-color" value="${tool.color}">
                    <label for="penPicker" id="penLabel">Pen type:</label>
                    <select class="modifier-penType" id="penPicker">
                    ${Object.values(PEN_TYPES).map(t => `
                        <option value="${t}" ${t === tool.penType ? "selected" : ""}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    `).join("")}
                    </select>
                    <div class="modifier-footer">
                    <label id="visibilityLabel">Visibility:</label>
                    <label class="toggle-switch">
                        <input type="checkbox" ${tool.visibility ? "checked" : ""}>
                        <span class="slider"></span>
                    </label>
                    </div>
                `;

                const btn = document.createElement('button');
                btn.textContent = '✕';
                btn.className = 'delete-modifier-btn';
                btn.style.position = 'absolute';
                btn.style.fontSize = "20px";
                btn.style.top = '5px';
                btn.style.right = '5px';
                btn.style.border = 'none';
                btn.style.background = 'transparent';
                btn.style.cursor = 'pointer';
                btn.style.color = '#ff4d4f';
                btn.title = 'Delete Modifier';
                btn.onclick = () => {popup.style.display = "none"};
                popup.appendChild(btn);

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
                    updateTools();
                    icon.className = `bx ${TOOL_REGISTRY[tool.id]?.icon ?? ""}`;
                    icon.setAttribute('data-label', tool.id);  
                    if (TOOL_REGISTRY[tool.id].customizable  == false) { 
                        popup.querySelector("#colorLabel").style.opacity = 0;
                        popup.querySelector("#colorPicker").style.opacity = 0; 
                        popup.querySelector("#penLabel").style.opacity = 0; 
                        popup.querySelector("#penPicker").style.opacity = 0; 
                        popup.querySelector("#visibilityLabel").style.opacity = 0; 
                        popup.querySelector(".toggle-switch").style.opacity = 0;
                        toolDiv.style.backgroundColor = "#fff";  
                    } 
                };
                if (colorInput) colorInput.oninput = () => { 
                    tool.color = colorInput.value; 
                    updateTools(); 
                    toolDiv.style.backgroundColor = tool.color || "#fff";
                };
                if (penTypeSelect) penTypeSelect.onchange = () => { tool.penType = penTypeSelect.value; updateTools(); };
                if (visibilityCheckbox) visibilityCheckbox.onchange = () => { tool.visibility = visibilityCheckbox.checked; updateTools(); };
            });

            dial.appendChild(toolDiv);
        });

        container.appendChild(dial);

    });
}



// -------------------- INIT --------------------
async function initModifiers() {
  const saved = await loadToolboxSettings(); // may return null
  //const saved = null;

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

  // Render UI and assign tools
  renderModifiers(modifiers);
  assignToolBox();
  renderTools();

  return modifiers;
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

function isInside(stroke, modifier) {
  const segmentBoxes = sliceStroke(modifier);
  return stroke.every(point =>
    segmentBoxes.some(box => isPointInBox(point, box))
  );
}

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
        //drawBox(sliceBox, 'rgba(255, 0, 0, 0.5)', "test", false, backgroundCtx);
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
            id: idCount ++, // Unique ID for the group
            stroke: currentStroke, //strokes data
            bbox: newBox,
            color: defaultPenColor,
            predictedLabel: predictedLabel,
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
            if (isInside(group.stroke, currentStroke)) {
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

    if (modifiedGroups.length >= 3 || intersectPointsCount >= 4)  {
        imgData = extractImageData(stroke, 136);
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
        id: idCount ++, // Unique ID for the group
        stroke: currentStroke, //strokes data
        bbox: newBox,
        color: defaultPenColor,
        predictedLabel: predictedLabel,
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
            if (!group.bbox || !intersect(group.bbox, screenBox)) continue;
            const box = group.bbox;
            const insideNewBox = isSBoxInLBox(box, newBox);
            if (insideNewBox || intersect(box, newBox)){
                modifiedGroups.push(group);
            }
        }
    } 

    //save changes to pastgroups
    if (predictedLabel == STROKE_TYPE.BOX || predictedLabel == STROKE_TYPE.CURLY || shortcutGroup.includes(predictedLabel)) {
        const idToColorMap = {};
            modifiedGroups.forEach(group => {
            idToColorMap[group.id] = group.color;
        });
        const change = {
            change: 'color',
            modifiedGroups: idToColorMap,
            groupToRemove: modifier
        }
        pastGroups.push(change);
        //console.log('sample', change.modifiedGroups['1'])
    } else if (predictedLabel == STROKE_TYPE.NONE) {
        const change = {
            change: 'normalStroke',
            modifiedGroups: modifier
        }
        pastGroups.push(change)
    }  else if (predictedLabel === 3) {
        change = {
            change: 'delete',
            modifiedGroups: modifiedGroups,
        }
        pastGroups.push(change);
    }

    //taking action
    for (const group of modifiedGroups) {
        if (hold) {
            continue;
        }
        if (predictedLabel === STROKE_TYPE.DELETE) {
            allGroups.filter(g => g.type != 'media').splice(allGroups.indexOf(group), 1);
        } else if (predictedLabel == STROKE_TYPE.BOX || predictedLabel == STROKE_TYPE.CURLY || shortcutGroup.includes(predictedLabel)) {
            if (group.predictedLabel != STROKE_TYPE.HIGHLIGHT) {
                group.color = color;    
            }
        }
    }

    reDrawAll(drawCtx);
    return {
        modifiedGroups,
        predictedLabel,
        modifier,
    }
}

const holdController = detectPointerHold(canvasGroup, 400, async (e) => {
    if (e.pointerType == 'touch') return;
    modifiedGroups = await classifyStroke(currentStroke, true);
    liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
    drawing = false;

    if (modifiedGroups.predictedLabel == STROKE_TYPE.NONE || modifiedGroups.predictedLabel == STROKE_TYPE.CURLY || shortcutGroup.includes(modifiedGroups.predictedLabel)) {
        showToolbox(e.offsetX, e.offsetY, toolboxLayout.color);
    } else if (modifiedGroups.predictedLabel == STROKE_TYPE.UNDERLINE || modifiedGroups.predictedLabel == STROKE_TYPE.NONE) {
        showToolbox(e.offsetX, e.offsetY, toolboxLayout.underline);
    } else if (modifiedGroups.predictedLabel == STROKE_TYPE.BOX) {
        showToolbox(e.offsetX, e.offsetY, toolboxLayout.box);
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

window.onload = async () => {
    if (!accessToken) {
        //document.querySelector('.twoButton').style.display = 'none';
        //document.getElementById('signin-btn').style.display = 'block';
        document.getElementById('signout-btn').style.display = 'none';
        document.querySelector('#userInfo h2').innerText = `Hi, `
        document.querySelector('#userInfo p').innerText = "You are not signed in yet, all notes will be saved locally, please don't delete browser data or all your notes will be deleted. You can sign in to sync/backup to google drive"
    } else {
        //document.querySelector('.twoButton').style.display = 'block';
        //document.getElementById('signin-btn').style.display = 'none';
        document.getElementById('signout-btn').style.display = 'block';
        document.querySelector('#userInfo h2').innerText = `Hi ${userName},`;
        document.querySelector('#userInfo p').innerText = "Google drive connection has been established, on 'Notes' side panel click sync to drive to save all current notes to drive, click restore from drive to import data from drive"
    }

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
                    if (note.content) {
                        allGroups = note.content;
                        idCount = allGroups.reduce((max, group) => Math.max(max, group.id ?? -Infinity), 0) + 1;
                    } else {
                        allGroups = [];
                    }
                    reDrawAll(drawCtx);
                }
            });
            setTimeout(() => {
                document.getElementById(lastSaveNote.path.replace('/','_').replace('.json','')).classList.toggle('noteSelected');
                drawingLock = true;

                maxHeightObj = allGroups.reduce((max, obj) => (obj?.bbox.y + obj?.bbox.h) > (max.bbox?.y + obj?.bbox.h) ? obj : max);
                contentHeight = maxHeightObj.bbox.y + maxHeightObj.bbox.h + 300;

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

    canvasGroup.addEventListener("pointerdown", (e) => {
        const pos = toCanvasCoords(e);

        currentStroke = [];
        e.preventDefault();

        // === Clean up panning state when pen input starts ===
        if (e.pointerType === "pen" && isPanning) {
            isPanning = false;
            canvasGroup.style.cursor = "default";
        }

        // Reset movement tracking
        lastPointerX = e.offsetX/scale;
        lastPointerY = e.offsetY/scale;
        totalMovement = 0;

        // === 🟨 Sticky Note / 🔗 Link Click Detection ===
        const worldX = (e.offsetX / scale) + viewportOffset.x;
        const worldY = (e.offsetY / scale) + viewportOffset.y;

        // One pass through allGroups for both link and stickynote
        const clicked = allGroups.find(
            (g) =>
            (g?.type === "stickynote" || g?.type === "link") &&
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
            flashStickyNote(clicked);
            showStickyPopup(clicked);
            }
            else if (clicked.type === "link") {
            flashLink(clicked);
            showLinkPopup(clicked);
            }

            return; // Prevents other canvas actions
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

        // === Media Drag Detection ===
        // If clicking inside selected media (not on handle), start drag
        if (selectedMedia && isPointInsideSelectedMedia(e.offsetX, e.offsetY)) {
            e.preventDefault();
            e.stopPropagation();
            startMediaDrag(e.offsetX, e.offsetY);
            return; // Prevents drawing
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
            eraserBox.x = (e.offsetX+viewportOffset.x)/scale - eraserSize / 2;
            eraserBox.y = (e.offsetY+viewportOffset.y)/scale - eraserSize / 2;
            eraseStrokes();
        }
        else {
            if (drawingLock) {
                drawing = true;
            }
            canvasGroup.setPointerCapture(e.pointerId);
            const pos = toCanvasCoords(e);
            currentStroke = [{ x: pos.x, y: pos.y }];
        }

    });

    const moveEvent = "onpointerrawupdate" in window ? "pointerrawupdate" : "pointermove";

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
                group.stroke.forEach(point => {
                    point.x += dx;
                    point.y += dy;
                });
            });

            moveStartX = e.offsetX/scale;
            moveStartY = e.offsetY/scale;
            reDrawMovement();        
        }
        else if (eraserMode) {
            eraserBox.x = (e.offsetX + viewportOffset.x)/scale - eraserSize / 2;
            eraserBox.y = (e.offsetY + viewportOffset.y)/scale - eraserSize / 2;

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
                let isShortcut = false;
                if (modifiedGroups.predictedLabel == STROKE_TYPE.CURLY || shortcutGroup.includes(modifiedGroups.predictedLabel)){
                    isShortcut = true;
                    if (modifiedGroups.predictedLabel == STROKE_TYPE.CURLY) {
                        allGroups.pop();
                    }
                }   
                
                toolColor = icon?.getAttribute('data-color') || null;
                toolVisibility = icon?.getAttribute('data-visibility') || null;

                //delete tool
                executeTool(selectedTool, toolColor, toolVisibility, isShortcut);
            } else {
                allGroups.pop();
            } 
            hideToolbox();
            reDrawAll(drawCtx);
            return;
        }
        else if (eraserMode) {
            erasing = false;
            recordEraser();
        }
        else if (e.pointerType !== "touch") {
            drawing = false;
            drawCanvas.releasePointerCapture(e.pointerId);
            // Draw the final stroke
            if (currentStroke.length > 1) {
                liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
                drawCtx.save();
                drawCtx.translate(-viewportOffset.x, -viewportOffset.y);
                drawStroke(drawCtx, currentStroke, defaultPenColor);
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
    // SIMPLE 2-FINGER TAP GESTURE DETECTION
    // 2 fingers single tap = undo, 2 fingers double tap = toggle AI
    // Does NOT interfere with normal touch panning
    // ═══════════════════════════════════════════════════════════════════════
    let twoFingerTap = {
        startTime: 0,
        startPositions: [],
        moved: false,
        lastTapTime: 0
    };

    const TAP_THRESHOLD = 300;      // Max duration for a tap
    const DOUBLE_TAP_GAP = 350;     // Max gap between double taps
    const MOVE_THRESHOLD = 25;      // Max movement for a tap

    canvasGroup.addEventListener("touchstart", function(e) {
        // Only track when exactly 2 fingers touch
        if (e.touches.length === 2) {
            twoFingerTap.startTime = Date.now();
            twoFingerTap.moved = false;
            twoFingerTap.startPositions = [
                { x: e.touches[0].clientX, y: e.touches[0].clientY },
                { x: e.touches[1].clientX, y: e.touches[1].clientY }
            ];
        } else {
            // More or fewer than 2 fingers - invalidate
            twoFingerTap.startTime = 0;
        }
    }, { passive: true });

    canvasGroup.addEventListener("touchmove", function(e) {
        // Check if 2-finger gesture moved too much
        if (twoFingerTap.startTime && e.touches.length === 2) {
            for (let i = 0; i < 2; i++) {
                const dx = Math.abs(e.touches[i].clientX - twoFingerTap.startPositions[i].x);
                const dy = Math.abs(e.touches[i].clientY - twoFingerTap.startPositions[i].y);
                if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
                    twoFingerTap.moved = true;
                    break;
                }
            }
        }
    }, { passive: true });

    canvasGroup.addEventListener("touchend", function(e) {
        // Fire gesture only when all fingers lift AND it was a valid 2-finger tap
        if (e.touches.length === 0 && twoFingerTap.startTime) {
            const duration = Date.now() - twoFingerTap.startTime;

            // Valid tap: quick and didn't move
            if (duration < TAP_THRESHOLD && !twoFingerTap.moved) {
                const now = Date.now();
                const timeSinceLastTap = now - twoFingerTap.lastTapTime;

                if (timeSinceLastTap < DOUBLE_TAP_GAP) {
                    // === DOUBLE TAP: toggle AI ===
                    toggleDetection();
                    document.getElementById('aiToggleInput').checked = isDetectionOn;
                    twoFingerTap.lastTapTime = 0;
                } else {
                    // First tap - wait for possible double tap
                    twoFingerTap.lastTapTime = now;

                    setTimeout(() => {
                        if (twoFingerTap.lastTapTime === now) {
                            // === SINGLE TAP: undo ===
                            undo();
                        }
                    }, DOUBLE_TAP_GAP);
                }
            }

            // Reset
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

    document.getElementById("scaleIndicator").addEventListener("click", () => {
        scale = 1.0;

        // Re-setup canvases with new scale
        drawCtx = setupHiDPICanvas(drawCanvas);
        liveCtx = setupHiDPICanvas(liveCanvas);
        backgroundCtx = setupHiDPICanvas(backgroundCanvas);

        screenBox.w = window.innerWidth / scale;
        screenBox.h = window.innerHeight / scale;

        //updateScaleIndicator();

        drawGrid(backgroundCtx);
        reDrawAll(drawCtx);
        updateScaleIndicator();
    });


    // modifiers = {
    //     title1: {color: '#ffa052', visibility: true}, 
    //     title2: {color: '#f4c64a', visibility: true}, 
    //     highlight1: {color: '#ffff00', visibility: true}, // red
    //     highlight2: {color: '#ffff00', visibility: true}, // green
    //     highlight3: {color: '#00ffff', visibility: true}, // blue
    //     box: {color: '#ffb6ff', visibility: true},
    //     curly: {color: '#fa6e6e', visibility: true},
    //     boxshortcut: {color: '#a3fba9', visibility: false},
    //     curlyshortcut: {color: '#74e8ff', visibility: false}, 
    //     circleshortcut: {color: 'pink', visibility: false}, 
    // }

    modifiers = await initModifiers();
}

//---UI update function---
function updateScaleIndicator() {
    const percent = Math.round(scale * 100);
    document.getElementById("scaleIndicator").textContent = `Zoom: ${percent}%`;
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

        updateScaleIndicator();

        drawGrid(backgroundCtx);
        reDrawAll(drawCtx);

        // Update popup position if media is selected
        updateMediaEditPopupPosition();
    }
}

function applyMomentum() {
    if (momentumActive) return;
    momentumActive = true;

    function step() {
        if (!momentumActive || lockScroll) return;

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

        viewportOffset.x += dx;
        viewportOffset.y += dy;

        screenBox.x = viewportOffset.x;
        screenBox.y = viewportOffset.y;

        //------------Scroll bar--------------
        //get contentHeight
        maxHeightObj = allGroups.reduce((max, obj) => (obj?.bbox.y + obj?.bbox.h) > (max.bbox?.y + obj?.bbox.h) ? obj : max);
        contentHeight = maxHeightObj.bbox.y + maxHeightObj.bbox.h + 300;
        
        console.log("maxheight", contentHeight);
        
        console.log("ratio", viewportHeight/contentHeight);
        console.log("scrollbarheight", viewportHeight);
        thumbHeight = Math.max((viewportHeight/contentHeight)*(viewportHeight*0.86), 0);
        thumb.style.height = thumbHeight + "px";

        updateScrollbar();

        drawGrid(backgroundCtx);
        reDrawAll(drawCtx);

        // Update popup position if media is selected
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

function executeTool(selectedTool, toolColor, toolVisibility, isShortcut) {
    if (selectedTool.includes("pen")) {
        allGroups.pop();
        eraserMode = false; 
        liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);

        if (isShortcut) {
            modifiedGroups.modifiedGroups.forEach(group => {
                group.color = toolColor;
            });
        }
        else {
            defaultPenColor = toolColor;
        }
    }
    else if (selectedTool == "delete") {
        //console.log("delete", modifiedGroups.groups);
        change = {
            change: 'delete',
            modifiedGroups: modifiedGroups.modifiedGroups,
        }
        for (const group of modifiedGroups.modifiedGroups) {
            allGroups.splice(allGroups.indexOf(group), 1);
        } 
        pastGroups.push(change);
        
    //highlighter tool
    }else if (selectedTool == "highlight") {
        selectHighlight(toolColor);
    }  
    else if (selectedTool.includes('bold')) {
        allGroups.pop();
        modifiedGroups.modifiedGroups.forEach(group => {
            group.thickness = 3;
            //group.color = 'pink';
            if (toolColor == 'none') {
                group.color = alterRgbaBrightness(group.color);
            } else {
                group.color = toolColor;
            }
        });
    }
    else if (selectedTool == "title1") {
        selectTitle(toolColor, toolVisibility, 1);
    }
    else if (selectedTool == "title2") {
        selectTitle(toolColor, toolVisibility, 2);
    }
    else if (selectedTool == "title3") {
        selectTitle(toolColor, toolVisibility, 3);
    }
    else if (selectedTool == "move") {
        allGroups.pop();
        modifiedGroups.modifiedGroups.pop();
        movingColor = modifiedGroups.modifiedGroups[0].color;
        // modifiedGroups.modifiedGroups.forEach(group => {
        //     group.color = 'lightgray'; // Set to white
        // });
        movingToggle = true;
    }
    else if (selectedTool == "eraser") {
        toggleEraser();
    }
    else if (selectedTool == "mathSolver") {
        modifiedGroups.modifiedGroups.pop();
        allGroups.pop();
        const canvas = extractImageDataFromStrokes(modifiedGroups.modifiedGroups);
        //downloadCanvasImage(canvas, "my_strokes.png");
        if (canvas !== -1) {
        // Send to backend for recognition
        canvas.toBlob(async (blob) => {
            const { latex, result } = await detectAndSolveMath(blob);
            if (result != 'no equation'){
                const resultGroup = createMathResultGroup(modifiedGroups.modifiedGroups, result);
                allGroups.push(resultGroup);
                reDrawAll(drawCtx);
            }
        });
        }
    } else if (selectedTool == "stickynote") {
        // Remove selection highlights
        allGroups.pop();
        modifiedGroups.modifiedGroups.pop();

        const groupBBox = getBoundingBox(modifiedGroups.modifiedGroups.flatMap(g => g.stroke));

        // Create the empty link group
        const stickynoteGroup = {
            id: idCount++,
            type: "stickynote",
            bbox: groupBBox,
            stroke: modifiedGroups.modifiedGroups.flatMap(g => g.stroke),
            color: "#0077ff",
            visibility: true,
        };

        // Temporarily add it
        allGroups.push(stickynoteGroup);

        flashStickyNote(stickynoteGroup);
        showStickyPopup(stickynoteGroup);
        return;
    }
    else if (selectedTool == "link") {
        allGroups.pop();
        modifiedGroups.modifiedGroups.pop();

        const groupBBox = getBoundingBox(modifiedGroups.modifiedGroups.flatMap(g => g.stroke));

        // Create the empty link group
        const linkGroup = {
            id: idCount++,
            type: "link",
            bbox: groupBBox,
            stroke: modifiedGroups.modifiedGroups.flatMap(g => g.stroke),
            color: "#0077ff",
            visibility: true,
        };

        allGroups.push(linkGroup);
    }
}

function undo() {
    if (pastGroups.length < 1) return;
    
    action = pastGroups.pop();

    if (action.change == 'color') {
        const redo = {
            change: 'color', 
            modifiedGroups: action.modifiedGroups, 
            titleStatus: action?.titleStatus,
            color: allGroups.find(g => g.id == Object.keys(action.modifiedGroups)[0]).color,
            groupToAdd: action.groupToRemove,
        }
       
        redoGroups.push(redo);

        for (const id in action.modifiedGroups) {
            const group = allGroups.find(g => g.id == id);
            group.color = action.modifiedGroups[id];
            if (action.titleStatus) {
                group.titleStatus = false; 
            }
        }

      
        if (action.groupToRemove) {
            allGroups.splice(allGroups.indexOf(action.groupToRemove), 1); // Removes 1 item at index
        }
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
          if (group.predictedLabel != STROKE_TYPE.DELETE) {
            group.stroke.forEach(p => {
              p.x -= dx;
              p.y -= dy;
            });
          }

          group.bbox.x += dx;
          group.bbox.y += dy;
        });
    }
    else if (action.change == "shape") {
        allGroups.splice(allGroups.indexOf(action.modifiedGroups), 1);
    }
    reDrawAll(drawCtx);
}

function redo() {
    if (redoGroups.length < 1) return;
    
    action = redoGroups.pop();

    if (action.change == 'color') {
        const change = {
            change: 'color', 
            titleStatus: action?.titleStatus,
            modifiedGroups: action.modifiedGroups, 
            groupToRemove: action.groupToAdd,

        }
        pastGroups.push(change);

        if (action.groupToAdd) {
            allGroups.push(action.groupToAdd); // Removes 1 item at index
        }
        for (const id in action.modifiedGroups) {
            const group = allGroups.find(g => g.id == id);
            group.color = action.color;
            if (action.titleStatus) {
                group.titleStatus = true; 
            }
        }
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
          if (group.predictedLabel != STROKE_TYPE.DELETE) {
            group.stroke.forEach(p => {
              p.x += dx;
              p.y += dy;
            });
          }

          group.bbox.x -= dx;
          group.bbox.y -= dy;
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

async function exportCanvasToPDF(allGroups, mode = "continuous", penColor = "#000") {
    const { jsPDF } = window.jspdf;

    // --- Compute full bounding box ---
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const group of allGroups) {
        if (group.stroke) {
            for (const pt of group.stroke) {
                minX = Math.min(minX, pt.x);
                minY = Math.min(minY, pt.y);
                maxX = Math.max(maxX, pt.x);
                maxY = Math.max(maxY, pt.y);
            }
        } else if (group.bbox) {
            minX = Math.min(minX, group.bbox.x);
            minY = Math.min(minY, group.bbox.y);
            maxX = Math.max(maxX, group.bbox.x + group.bbox.w);
            maxY = Math.max(maxY, group.bbox.y + group.bbox.h);
        }
    }

    const padding = 20;
    const contentWidth = maxX - minX + padding * 2;
    const contentHeight = maxY - minY + padding * 2;
    const dpr = window.devicePixelRatio || 1;

    // --- Create offscreen canvas ---
    const fullCanvas = document.createElement("canvas");
    fullCanvas.width = contentWidth * dpr;
    fullCanvas.height = contentHeight * dpr;
    const fullCtx = fullCanvas.getContext("2d");
    fullCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fullCtx.translate(-minX + padding, -minY + padding);

    // --- Optional background/grid ---
    drawGrid(fullCtx);

    // --- Draw all groups ---
    allGroups.forEach(group => {
        if (!group?.bbox || group?.visibility === false) return;
        const hasStroke = Array.isArray(group.stroke) && group.stroke.length > 0;

        if (hasStroke) {
            if (group.type === "math_result") {
                // Render math text
                const text = group.text || "?";
                const textHeight = group.bbox.h;
                const fontSize = Math.max(14, textHeight * 0.8);
                fullCtx.save();
                fullCtx.font = `200 ${fontSize}px Mali`;
                fullCtx.fillStyle = group.color || penColor;
                fullCtx.textBaseline = "top";
                fullCtx.fillText(text, group.bbox.x, group.bbox.y);
                fullCtx.restore();
            } 
            else if (group.predictedLabel === 7) {
                drawHighlight(group.bbox, group.color, fullCtx);
            }
            else if (group.titleStatus) {
                drawStroke(fullCtx, group.stroke, group.color, 3);
            }
            else if (group.predictedLabel <= 6) {
                drawStroke(fullCtx, group.stroke, group.color);
            }
        } 
        else {
            if (group.shape === 0) drawFinalLine(fullCtx, group.bbox, group.color, group.directX, group.directY);
            if (group.shape === 1) drawFinalRectangle(fullCtx, group.bbox, group.color);
            if (group.shape === 2) drawFinalCircle(fullCtx, group.bbox, group.color);
        }
    });

    // --- Convert to PDF ---
    const jpegQuality = 0.9;
    if (mode === "continuous") {
        const pdf = new jsPDF({
            orientation: "portrait",
            unit: "pt",
            format: [contentWidth, contentHeight],
            compress: true,
        });
        const imgData = fullCanvas.toDataURL("image/jpeg", jpegQuality);
        pdf.addImage(imgData, "JPEG", 0, 0, contentWidth, contentHeight, undefined, "FAST");
        pdf.save("canvas_continuous.pdf");
    } 
    else if (mode === "paginated") {
        const A4_WIDTH_PT = 595.28;
        const A4_HEIGHT_PT = 841.89;
        const scale = A4_WIDTH_PT / contentWidth;
        const scaledHeight = contentHeight * scale;
        const pageCount = Math.ceil(scaledHeight / A4_HEIGHT_PT);

        const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4", compress: true });

        for (let i = 0; i < pageCount; i++) {
            const pageCanvas = document.createElement("canvas");
            pageCanvas.width = fullCanvas.width;
            pageCanvas.height = Math.min(fullCanvas.height - i * (A4_HEIGHT_PT / scale) * dpr, A4_HEIGHT_PT / scale * dpr);
            const pageCtx = pageCanvas.getContext("2d");

            pageCtx.drawImage(
                fullCanvas,
                0,
                i * (A4_HEIGHT_PT / scale) * dpr,
                fullCanvas.width,
                pageCanvas.height,
                0,
                0,
                fullCanvas.width,
                pageCanvas.height
            );

            const imgData = pageCanvas.toDataURL("image/jpeg", jpegQuality);
            if (i > 0) pdf.addPage();
            pdf.addImage(imgData, "JPEG", 0, 0, A4_WIDTH_PT, A4_WIDTH_PT * (pageCanvas.height / fullCanvas.width), undefined, "FAST");
        }
        pdf.save("canvas_paginated_a4.pdf");
    } 
    else {
        alert("Invalid export mode. Use 'continuous' or 'paginated'.");
    }
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
  box.style.minWidth = "280px";

  box.innerHTML = `
    <h3 style="margin-top:0;font-size:18px;text-align:center">🧩 Summarize Options</h3>
    <label style="display:block;margin:8px 0;">
      <input id="chkTitle1" type="checkbox" checked style="transform:scale(1.3);margin-right:6px;"> Include Title 1
    </label>
    <label style="display:block;margin:8px 0;">
      <input id="chkTitle2" type="checkbox" checked style="transform:scale(1.3);margin-right:6px;"> Include Title 2
    </label>
    <label style="display:block;margin:8px 0 14px;">
      <input id="chkBox" type="checkbox" checked style="transform:scale(1.3);margin-right:6px;"> Include Boxes
    </label>
    <div style="text-align:center;margin-top:10px;">
      <button id="startSummarizeBtn" style="background:#007aff;color:white;border:none;padding:8px 20px;border-radius:8px;font-size:14px;">Start</button>
      <button id="cancelSummarizeBtn" style="margin-left:10px;background:#444;color:white;border:none;padding:8px 20px;border-radius:8px;font-size:14px;">Cancel</button>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  document.getElementById("cancelSummarizeBtn").onclick = () => overlay.remove();

  document.getElementById("startSummarizeBtn").onclick = () => {
    const includeTitle1 = document.getElementById("chkTitle1").checked;
    const includeTitle2 = document.getElementById("chkTitle2").checked;
    const includeBox = document.getElementById("chkBox").checked;
    overlay.remove();
    summarizeNotes({ includeTitle1, includeTitle2, includeBox });
  };
}

// =============== MAIN SUMMARIZE PROCESS ===================
function summarizeNotes({ includeTitle1, includeTitle2, includeBox }) {
  const totalPath = `${selectedFolder}/total.json`;

  listNotesInFolder(selectedFolder, (notePaths) => {
    const filteredPaths = notePaths
      .filter(p => p !== totalPath)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (filteredPaths.length === 0)
      return alert("⚠️ Folder chưa có note nào.");

    let allBoxes = [];
    let allTitles = [];
    let pending = filteredPaths.length;

    filteredPaths.forEach(path => {
      loadNote(path, (note) => {
        if (note?.content && Array.isArray(note.content)) {
          const groups = note.content;

          // === Keep existing BOX logic untouched ===
          const boxes = groups.filter(g => g.predictedLabel === 1 && g.bbox && Array.isArray(g.stroke));
          boxes.forEach(box => {
            const boxClone = structuredClone(box);
            boxClone.source = path;
            boxClone.id = idCount++;
            boxClone.children = [];
            groups.forEach(other => {
              if (other.id !== box.id && other.bbox && Array.isArray(other.stroke)) {
                if (isInside(other.stroke, box.stroke)) {
                  const c = structuredClone(other);
                  c.source = path;
                  c.parentBox = boxClone.id;
                  boxClone.children.push(c);
                }
              }
            });
            allBoxes.push(boxClone);
          });

          // === Keep existing TITLE logic untouched ===
          const underlineMods = groups.filter(g => g.predictedLabel === 0);
          underlineMods.forEach(underline => {
            const relatedTexts = [];
            const lineY = underline.bbox.y;
            groups.forEach(g => {
              if (g === underline || !g.bbox) return;
              const box = g.bbox;
              const overlapsX = box.x + box.w > underline.bbox.x && box.x < underline.bbox.x + underline.bbox.w;
              const withinBand = box.y + box.h > lineY - normalHeight * 1.6;
              const approxAboveLine = Math.abs((box.y + box.h) - lineY) < normalHeight * 1.2;
              const above = overlapsX && withinBand && approxAboveLine;
              if (above) relatedTexts.push(g);
            });

            if (relatedTexts.length > 0) {
              const allBboxes = [underline.bbox, ...relatedTexts.map(t => t.bbox)];
              const minX = Math.min(...allBboxes.map(b => b.x));
              const minY = Math.min(...allBboxes.map(b => b.y));
              const maxX = Math.max(...allBboxes.map(b => b.x + b.w));
              const maxY = Math.max(...allBboxes.map(b => b.y + b.h));
              const mergedBox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
              const mergedStrokes = [...underline.stroke, ...relatedTexts.flatMap(t => t.stroke)];
              const dy = underline.bbox.y - Math.min(...relatedTexts.map(t => t.bbox.y + t.bbox.h));
              const titleLevel = dy > normalHeight * 0.8 ? 1 : 2;

              const titleGroup = {
                id: idCount++,
                type: "title",
                titleLevel,
                bbox: mergedBox,
                stroke: mergedStrokes,
                children: [
                  { id: idCount++, ...structuredClone(underline), visible: true, isUnderline: true },
                  ...relatedTexts.map(t => ({ id: idCount++, ...structuredClone(t) }))
                ],
                predictedLabel: 100 + titleLevel,
                color: titleLevel === 1 ? "#ffcc33" : "#66ccff",
                source: path
              };
              allTitles.push(titleGroup);
            }
          });
        }
        if (--pending === 0) finalize();
      });
    });

    // ===== FINALIZE (layout + save) =====
    function finalize() {
      // Filter by user choices
      let combined = [];
      if (includeBox) combined.push(...allBoxes);
      if (includeTitle1) combined.push(...allTitles.filter(t => t.titleLevel === 1));
      if (includeTitle2) combined.push(...allTitles.filter(t => t.titleLevel === 2));

      if (combined.length === 0)
        return alert("⚠️ Không có nhóm nào để gửi (theo lựa chọn).");

      combined.sort((a, b) => {
        if (a.source !== b.source)
          return a.source.localeCompare(b.source, undefined, { numeric: true });
        return a.bbox.y - b.bbox.y;
      });

      // Ensure total.json exists
      fetch(totalPath)
        .then(res => res.ok ? res.json() : { content: [] })
        .then(note => saveCombined(note))
        .catch(() => saveCombined({ content: [] }));

      function saveCombined(note) {
        const base = Array.isArray(note?.content) ? note.content : [];
        let startID = base.length > 0
          ? Math.max(...base.map(g => g.id ?? 0)) + 1
          : 1;

        const leftMargin = 40;
        const baseSpacing = 20;
        const shortSpacing = 10; // tighter spacing between title2/box
        let currentY = 100;
        const newGroups = [];

        combined.forEach((item, i) => {
          const prev = combined[i - 1];
          const dx = leftMargin - item.bbox.x;
          const dy = currentY - item.bbox.y;

          translateGroup(item, dx, dy);
          item.id = startID++;

          if (item.children) {
            item.children.forEach(c => {
              translateGroup(c, dx, dy);
              c.id = startID++;
            });
            newGroups.push(item, ...item.children);
          } else {
            newGroups.push(item);
          }

            // === Dynamic spacing (ref to top-down)
        let spacing = baseSpacing;

        // Shorter gap for Title → Title2
        if (prev && prev.type === "title" && item.type === "title" && item.titleLevel === 2)
        spacing = shortSpacing;

        // Shorter gap for Title1 → Box or Title2 → Box
        if (
        prev &&
        prev.type === "title" &&
        item.type === "box" &&
        (prev.titleLevel === 1 || prev.titleLevel === 2)
        )
        spacing = shortSpacing;


          currentY = item.bbox.y + item.bbox.h + spacing;
        });

        saveNote(totalPath, base.concat(newGroups), () => {
          showStatus(`✅ Đã gửi ${combined.length} nhóm → total.json`);
          try { openFolder(selectedFolder); } catch {}
        });

        // loadNote(totalPath, note => {
        //     if (note) {
        //     if (note.content) {
        //         allGroups = note.content;
        //     } else {
        //         allGroups = [];
        //     }
        //     console.log('loadAllgroups', allGroups);

        //     if (note.created_at) {
        //         console.log("date created:"+ note.created_at);
        //     }

        //     reDrawAll(drawCtx);
        //     }
        // });
        openFolder(selectedFolder);
      }
    }
  });
}

// ================== HELPERS ===================
function translateGroup(group, dx, dy) {
  if (group.bbox) {
    group.bbox.x += dx;
    group.bbox.y += dy;
  }
  if (Array.isArray(group.stroke)) {
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


// ======================= TOC BUTTON HANDLER ==========================
const tocBtn = document.getElementById("tocBtn");

tocBtn.onclick = () => {
  regroupTitles();

  if (!tocDropdown) {
    return;
  }

  tocDropdown.style.display =
    tocDropdown.style.display === "block" ? "none" : "block";
  tocDropdown.innerHTML = "";

  // ✅ Add label at the top
const label = document.createElement("div");
label.textContent = "📑 Table of Contents";
label.style.fontWeight = "600";
label.style.fontSize = "14px";
label.style.padding = "6px 12px";
label.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
label.style.marginBottom = "6px";
tocDropdown.appendChild(label);

  const anchors = allGroups.filter(g => g.isTitleAnchor);

  if (anchors.length === 0) {
    tocDropdown.innerHTML = "<div style='opacity:0.6;padding:6px 12px;'>No title</div>";
    return;
  }

  // Sort from top to bottom
  anchors.sort((a, b) => a.bbox.y - b.bbox.y);

  // === Render all anchors ===
  anchors.forEach(anchor => {
    const item = document.createElement("div");
    item.className = "toc-item";
    const indent = anchor.titleLevel === 2 ? "28px" : "10px";
    item.style.paddingLeft = indent;

    const img = new Image();
    img.src = renderTitleThumbnailFromAnchor(anchor);
    img.style.height = "40px";
    img.style.margin = "4px 0";
    img.style.borderRadius = "6px";
    img.style.boxShadow = "0 0 4px rgba(255,255,255,0.1)";
    item.appendChild(img);

    // tocDropdown.style.display =
    // tocDropdown.style.display === "block" ? "none" : "block";
    // tocDropdown.innerHTML = "";

    item.onclick = () => {
      const targetY = anchor.bbox.y - 40;
      const duration = 400;
      const startY = viewportOffset.y;
      const deltaY = targetY - startY;
      const startTime = performance.now();

      const maxHeightObj = allGroups.reduce((max, obj) =>
        (obj?.bbox.y + obj?.bbox.h) > (max.bbox?.y + max.bbox?.h) ? obj : max
      );
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

      tocDropdown.style.display = "none";
    };

    
    tocDropdown.appendChild(item);
  });
};



// ======================= REGROUP TITLES ==========================
function regroupTitles() {
  if (!Array.isArray(allGroups) || allGroups.length === 0) {
    return;
  }

  const underlineMods = allGroups.filter(
    g => g?.predictedLabel === STROKE_TYPE.UNDERLINE && g?.bbox
  );

  if (underlineMods.length === 0) {
    return;
  }

  // Step 2️⃣: remove any old anchors
  allGroups = allGroups.filter(g => !g.isTitleAnchor);

  underlineMods.forEach((underline, i) => {
    const uBox = underline.bbox;
    let maxY = 100000;
    let minY = uBox.y + uBox.h - normalHeight * 0.55;
    //if (maxY >= minY - normalHeight * 0.55) maxY = Math.min(minY - 7, uBox.y);

    // Step 4️⃣: find possible title groups above
    for (const group of allGroups) {
        if (group.visibility == false || !group.bbox || !intersect(group.bbox, screenBox) || !group.titleStatus) continue;
        const box = group.bbox;

        if (maxY >= minY - normalHeight * 0.55) maxY = Math.min(minY - 7, uBox.y);
        const withinBand = (box.y + box.h) > maxY;
        const approxAboveLine = Math.abs(box.y + box.h - uBox.y - uBox.h) < normalHeight * 0.7;
        const overlapsX = box.x + box.w > uBox.x && box.x < uBox.x + uBox.w;
        const above = withinBand && approxAboveLine && overlapsX;
        if (above) {
            maxY = Math.min(maxY, box.y, uBox.y);
            minY = Math.max(minY, box.y + box.h, uBox.y + uBox.h)
        }
    }

    const latestbox = {
            x: uBox.x - 14,
            y: maxY - 8,
            w: uBox.w + 14,
            h: minY - maxY + 18
        }

    const titleGroups = allGroups.filter(group => {
        if (!group?.bbox || !group?.titleStatus) return false;

        const box = group.bbox;
        const insidelatestbox = isSBoxInLBox(box, latestbox);

        return insidelatestbox;
    });

    if (titleGroups.length === 0) {
      return;
    }

    // Step 5️⃣: separate level 1 and 2 titles
    const level1Groups = titleGroups.filter(g => g.titleLevel === 1);
    const level2Groups = titleGroups.filter(g => g.titleLevel === 2);

    const createAnchor = (groupSet, level) => {
      if (groupSet.length === 0) return;

      const minX = Math.min(...groupSet.map(g => g.bbox.x));
      const minY = Math.min(...groupSet.map(g => g.bbox.y));
      const maxX = Math.max(...groupSet.map(g => g.bbox.x + g.bbox.w));
      const maxY = Math.max(...groupSet.map(g => g.bbox.y + g.bbox.h));

      const anchor = {
        id: idCount++,
        bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
        isTitleAnchor: true,
        titleLevel: level,
        titleText: `Title ${idCount} (Level ${level})`,
        underlineRef: underline.id,
      };
      allGroups.push(anchor);
    };

    createAnchor(level1Groups, 1);
    createAnchor(level2Groups, 2);
  });

  reDrawAll?.(drawCtx);
}



// ======================= HIGH DPI THUMBNAIL RENDER ==========================
function renderTitleThumbnailFromAnchor(anchor, maxW = 280, maxH = 70) {
  const PAD = 12;
  const { x, y, w, h } = anchor.bbox;
  const dpr = window.devicePixelRatio || 1;

  const strokes = allGroups.filter(g =>
    g.titleStatus &&
    g.bbox &&
    g.bbox.x >= x - 2 &&
    g.bbox.y >= y - 2 &&
    (g.bbox.x + g.bbox.w) <= x + w + 2 &&
    (g.bbox.y + g.bbox.h) <= y + h + 2
  );

  if (strokes.length === 0) {
    return "";
  }

  const canvas = document.createElement("canvas");
  const baseW = w + PAD * 2;
  const baseH = h + PAD * 2;
  canvas.width = baseW * dpr;
  canvas.height = baseH * dpr;
  canvas.style.width = `${baseW}px`;
  canvas.style.height = `${baseH}px`;

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.translate(PAD - x, PAD - y);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  strokes.forEach(st => {
    ctx.strokeStyle = st.color || "#fff";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    st.stroke.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
  });

  const scale = Math.min(maxW / baseW, maxH / baseH, 1);
  if (scale < 1) {
    const scaled = document.createElement("canvas");
    scaled.width = baseW * scale * dpr;
    scaled.height = baseH * scale * dpr;
    scaled.style.width = `${maxW}px`;
    scaled.style.height = `${maxH}px`;

    const sctx = scaled.getContext("2d");
    sctx.scale(scale, scale);
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(canvas, 0, 0);
    return scaled.toDataURL("image/png");
  }

  return canvas.toDataURL("image/png");
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

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    console.log(`Processing PDF page ${pageNum} of ${totalPages}...`);
    const page = await pdf.getPage(pageNum);
    console.log(`Got page ${pageNum}, pageNumber:`, page.pageNumber);
    const pageData = await renderPdfPageHiDPI(page, pageNum, totalPages, dpr);
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
    if (title) saveNote(title, allGroups);

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
  const maxWidth = CONFIG.MEDIA.DEFAULT_INSERT_WIDTH;
  const aspectRatio = width / height;
  let displayWidth = Math.min(width, maxWidth);
  let displayHeight = displayWidth / aspectRatio;

  // Position at center of current viewport
  const centerX = viewportOffset.x + (window.innerWidth / scale) / 2;
  const centerY = viewportOffset.y + (window.innerHeight / scale) / 2;

  const mediaGroup = {
    id: 'media_' + Date.now() + '_' + idCount++,
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
  if (title) saveNote(title, allGroups);
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

  for (let i = 0; i < pagesData.length; i++) {
    const pageData = pagesData[i];
    const { dataUrl, width, height, displayWidth, mediaType, pdfPage, pdfTotalPages, pdfBase64 } = pageData;

    // Use the display width from render, calculate height from aspect ratio
    const aspectRatio = width / height;
    const finalWidth = displayWidth || 700;
    const finalHeight = finalWidth / aspectRatio;

    const mediaGroup = {
      id: 'media_' + Date.now() + '_' + idCount++,
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
  if (title) saveNote(title, allGroups);
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
 * Find media group at given canvas coordinates
 */
function findMediaGroupAt(canvasX, canvasY) {
  // Search in reverse order (top-most first) respecting z-index
  const mediaGroups = allGroups
    .filter(g => g.type === 'media' && g.visibility)
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
 * Start long press detection for media editing
 */
function startMediaLongPressDetection(screenX, screenY) {
  const canvasX = (screenX / scale) + viewportOffset.x;
  const canvasY = (screenY / scale) + viewportOffset.y;

  const mediaGroup = findMediaGroupAt(canvasX, canvasY);
  if (!mediaGroup) return false;

  mediaLongPressTarget = mediaGroup;
  mediaLongPressTimer = setTimeout(() => {
    showMediaEditPopup(mediaGroup);
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
    if (title) saveNote(title, allGroups);
  };

  document.getElementById('rotateCW').onclick = () => {
    group.rotation = (group.rotation + CONFIG.MEDIA.ROTATION_SNAP) % 360;
    document.getElementById('rotationValue').textContent = group.rotation + '°';
    reDrawAll(drawCtx);
    if (title) saveNote(title, allGroups);
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
    if (title) saveNote(title, allGroups);
  };

  // Layer (z-index)
  document.getElementById('layerDown').onclick = () => {
    group.zIndex = (group.zIndex || 0) - 1;
    document.getElementById('layerValue').textContent = group.zIndex;
    reDrawAll(drawCtx);
    if (title) saveNote(title, allGroups);
  };

  document.getElementById('layerUp').onclick = () => {
    group.zIndex = (group.zIndex || 0) + 1;
    document.getElementById('layerValue').textContent = group.zIndex;
    reDrawAll(drawCtx);
    if (title) saveNote(title, allGroups);
  };

  // Aspect lock
  document.getElementById('aspectLock').onchange = (e) => {
    group.aspectLocked = e.target.checked;
    if (title) saveNote(title, allGroups);
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
      if (title) saveNote(title, allGroups);
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
      if (title) saveNote(title, allGroups);
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
    if (title) saveNote(title, allGroups);
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
    if (title) saveNote(title, allGroups);
  }
  isDraggingMedia = false;
  dragStartBbox = null;
  canvasGroup.style.cursor = 'default';
}
