
//Default parameters 


//parametesr for scaling
let scale = 1; // default scale
const MIN_SCALE = 0.5;
const MAX_SCALE = 4.0;
//parameters for backgroundf
let backgroundColor = 'rgba(32,31,30, 1)';
let gridlineColor = 'rgba(21,59,87, 1)';
let viewportOffset = { x: 0, y: 0 }; // default viewport offset
let gridSize = 58; // default grid size
let currentStroke = []; 
let drawing = false;
let drawingLock = false;
let defaultPenColor = 'rgba(255, 255, 255, 1)'; // default pen color
let screenBox = {
    x: viewportOffset.x,
    y: viewportOffset.y,
    w: window.innerWidth,
    h: window.innerHeight
};
let id_count = 0; // Unique ID for each group
let normalHeight = 29;
let allGroups = [];
let pastGroups = [];
let redoGroups = [];

//parameters for moving
let movingToggle = false; // Toggle for moving mode
let dx_record = 0; 
let dy_record = 0;
let movingColor = null;

//parameters for scrollilng:
let panningLimit = {left: 0, right:-1, top: 0, bottom: -1}
let isPanning = false;
let panStart = { x: 0, y: 0 };
let isScrollingX = false;
let isScrollingY = false;
let lockedAxis = null; // 'x', 'y', or null

//parameters for toolbox
let isClosingToolbox = false;
const nav = document.querySelector("#penTools");
let isPointerInside = false;
const toggleBtn = nav.querySelector(".toggle-btn");

let toolLinks = nav.querySelectorAll("span a");
let pointerDownForToolbox = false;
let lastPointerX = null;
let lastPointerY = null;
let totalMovement = 0;
const MOVEMENT_THRESHOLD = 7;

//parameters for scrollbar
const scrollbar = document.getElementById("scrollbar");
const thumb = document.getElementById("thumb");
const viewportHeight = window.innerHeight;
let lockScroll = false; 
let maxHeightObj = null;
let contentHeight = null;
let thumbHeight = null;
let countdownSeconds = 1; // countdown duration
let remaining = countdownSeconds;
let timer = null;


//parameters for eraser
let eraserMode = false;
let erasedGroups = [];
let eraserSize = 20;
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
//paraemeters for pens
// -1: normal 
// 0: underline f
// 1: box 
// 2: curly 
// 3: delete
// 4: box shortcut 
// 5: curly shortcut 
// 6: circle shortcut
// 7: highlighter
// 8: move
// 10: nonedot
// 11: nonedaulon
//12: nonenhon

const indexToLabel = {
  0: 'underline',
  1: 'box',
  2: 'curly',
  3: 'delete',
  4: 'boxshortcut',
  5: 'curlyshortcut',
  6: 'circleshortcut',
  7: 'highlighter',
  8: 'move',
  9: 'normal',
  10: 'none', 
  11: 'none', 
  12: 'none'
};
let colors = [defaultPenColor, //underline 
            'rgba(255,182,255,1)', //box  
            'rgba(250,110,110,1)', //curly
            null, //delete
            'rgba(163,251,169,1)', //box shortcut
            'rgba(116, 232, 256,1)', //curly shortcut
            defaultPenColor,  //none
            null, //highlighter
            null, //move
            defaultPenColor]; //normal stroke
let shownModifiers = [true, //underline
            true, //box
            true, // curly
            true, // delete
            false, // box shortcut
            false, // curly shortcut
            true, // none
            true, // highlighter
            true, // move
            true]; // normal stroke

let modifiers = null;
let colorTools = null;
let underlineTools = null;
let boxTools = null; 

const accessToken = localStorage.getItem("accessToken");
const userEmail = localStorage.getItem("userEmail");
const userName = localStorage.getItem("userName");

//Check function 

function assignToolBox() {
    colorTools = [
        { icon: 'bx-eraser', label: 'eraser', color: 'rgba(237, 235, 233, 1)' },
        // { icon: 'bx-pen', label: 'pen2', color: titleText[0]},
        // { icon: 'bx-pen', label: 'pen3', color: shownBoxShortcut[0] },
        // { icon: 'bx-pen', label: 'pen4', color: shownCurlyBoxShortcut[0]},
        { icon: 'bx-pen', label: 'pen2', color: 'rgba(255, 255, 255, 1)'},
        { icon: 'bx-pen', label: 'pen3', color: modifiers.boxshortcut.color},
        { icon: 'bx-pen', label: 'pen4', color: modifiers.curly.color },
        { icon: 'bx-pen', label: 'pen5', color: modifiers.box.color},
        { icon: 'bx-pen', label: 'pen6', color: modifiers.curlyshortcut.color}, 
        { icon: 'bx-pen', label: 'pen7', color: modifiers.circleshortcut.color},
        { icon: 'bx-pen', label: 'pen8', color: "orange"},
    ];

    underlineTools = [
        { icon: 'bx-capitalize', label: 'title1', color: modifiers.title1.color},
        { icon: 'bx-capitalize', label: 'title2', color: modifiers.title2.color},
        { icon: 'bx-highlight', label: 'highlight2', color: hexToRgb(modifiers.highlight2.color)},
        { icon: 'bx-highlight', label: 'highlight3', color: hexToRgb(modifiers.highlight3.color) },
        { icon: 'bx-bold', label: 'bold'}
    ];

    boxTools = [
        { icon: 'bx-trash', label: 'delete' },
        { icon: 'bx-move', label: 'move' },
        { icon: 'bx-calculator', label: 'mathSolver' },
        { icon: 'bx-copy', label: 'copy' },
        { icon: 'bx-paste', label: 'paste' },
        { icon: 'bx-sticker', label: 'stickynote'}, 
        { icon: 'bx-link-break', label: 'link' }, 
        { icon: 'bx-bold', label: 'bold'}
    ];
}
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

function isInside(stroke, modifier) {
    const segmentBoxes = sliceStroke(modifier);

    return stroke.every(point => {
        return segmentBoxes.some(box => isPointInBox(point, box));
    });
}

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


function sliceStroke(stroke, sliceHeight=40) {
    box = getBoundingBox(stroke);

    const numSlices = Math.ceil(box.h/sliceHeight);

    const y1 = box.y; 

    const slices = [];
    for (let i = 0; i < numSlices; i++) {
        const top = y1 + i * sliceHeight;
        let bottom = top + sliceHeight;

        if (i+1 == numSlices) {
            bottom = box.y + box.h;
        }

        const slice = stroke.filter(p => p.y >= top && p.y < bottom);

        const xs = slice.map(p => p.x);
        const sliceBox = {
            x: Math.min(...xs), 
            y: top, 
            w: Math.max(...xs) - Math.min(...xs), 
            h: bottom - top,
        }

        slices.push(sliceBox);
        //drawBox(sliceBox, "gray", "", false, liveCtx);
    }

    console.log("slices", slices);

    return slices;
}

async function classifyStroke(stroke, hold = false) {
    let modifiedGroups = [];
    let intersectGroups = [];
    let intersectPointsCount = 0;
    let newGroups = [];
    let shownModifier = true;
    let tempVar = true;
    let predictedLabel = -1;

    const newBox = getBoundingBox(stroke);
    let maxY = 100000;
    let minY = newBox.y + newBox.h - normalHeight * 0.55;
    
    const wideenough = (newBox.w > 30) || (newBox.h > 52 );

    if (!wideenough) {
        const modifier = {
            id: id_count ++, // Unique ID for the group
            stroke: currentStroke, //strokes data
            bbox: newBox,
            color: defaultPenColor,
            predictedLabel: predictedLabel,
            visibility: shownModifier
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

    let activeGroupsCount = 0
    for (const group of allGroups) {
        if (!group.bbox || !intersect(group.bbox, screenBox) || !group?.stroke) continue;
        activeGroupsCount++;

        if (group.predictedLabel <= 7 && group.predictedLabel != 3) {
            const box = group.bbox;
            const isBBoxIntersecting = intersect(newBox, box);
            
            //console.log('strokecount', strokesIntersect(currentStroke, group.stroke));
            //const strokeIntersects = isBBoxIntersecting && strokesIntersect(currentStroke, group.stroke);

            if (isBBoxIntersecting) {
                intersectPointsCount += strokesIntersect(currentStroke, group.stroke);
                if (intersectPointsCount > 0) {
                    intersectGroups.push(group);
                }
            }

            // const inside = isBBoxIntersecting &&
            //     group.stroke.every(p =>
            //         p.x >= newBox.x && p.x <= newBox.x + newBox.w &&
            //         p.y >= newBox.y && p.y <= newBox.y + newBox.h
            //     );

            const inside = isInside(group.stroke, currentStroke);

            if (inside) {
                modifiedGroups.push(group);
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

    console.log('activeGroups',activeGroupsCount);
    console.log("intersect groups", intersectGroups);
    console.log("intersect count", intersectPointsCount);

    const continueCheck = modifiedGroups.length <= 2;

    if (continueCheck || intersectGroups.length >= 2) {
        const latestbox = {
            x: newBox.x - 16,
            y: maxY - 10,
            w: newBox.w + 16,
            h: minY - maxY + 20
        }
        //drawBox(latestbox, 'rgba(255, 0, 0, 0.5)', 'Modifier', true, drawCtx);
        for (const group of allGroups) {
            if (group.visibility == false || !group.bbox || !intersect(group.bbox, screenBox)) continue;
            if (tempVar) {
                const box = group.bbox;
                const insidelatestbox =
                    box.x >= latestbox.x &&
                    box.x + box.w <= latestbox.x + latestbox.w &&
                    box.y >= latestbox.y &&
                    box.y + box.h <= latestbox.y + latestbox.h;
                if (insidelatestbox && !modifiedGroups.some(element => element.bbox === group.bbox)){
                    modifiedGroups.push(group);
                }
            }
        }
    }

    if (modifiedGroups.length >= 3 || intersectPointsCount >= 4)  {
        imgData = extractImageData(stroke);
        // Preview
        const viewerCanvas = document.getElementById('viewer');
        const viewerCtx = viewerCanvas.getContext('2d');
        viewerCtx.clearRect(0, 0, 136, 136);
        viewerCtx.drawImage(imgData, 0, 0);

        predictedLabel = await predictImageFromCanvas(currentStroke, imgData, model);
        if (predictedLabel == 0 || predictedLabel >= 10 || predictedLabel ==  3) {
            color = defaultPenColor;
            shownModifier = true;   
        }
        else {
            console.log(indexToLabel[predictedLabel]);
            color = modifiers[indexToLabel[predictedLabel]].color || defaultPenColor;
            shownModifier = modifiers[indexToLabel[predictedLabel]].visibility;
        }

        if (predictedLabel == 3) {
            intersectGroups.forEach(group => {
                if (!modifiedGroups.some(element => element.stroke === group.stroke)){
                    modifiedGroups.push(group);
                }
            })
        } else if (predictedLabel == 4 || predictedLabel == 5 || predictedLabel == 6) {
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

    const modifier = {
        id: id_count ++, // Unique ID for the group
        stroke: currentStroke, //strokes data
        bbox: newBox,
        color: defaultPenColor,
        predictedLabel: predictedLabel,
        visibility: shownModifier
    };
    
    if (predictedLabel != 3) {
        allGroups.push(modifier);
        modifiedGroups.push(modifier);
    } else {
        newGroups.push(modifier);
    }

    //save changes to pastgroups
    if (predictedLabel == 1 || predictedLabel == 2 || predictedLabel == 4 || predictedLabel == 5 || predictedLabel == 6) {
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
    } else if (predictedLabel == -1) {
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
        if (predictedLabel === 3) {
            allGroups.splice(allGroups.indexOf(group), 1);
        } else if (predictedLabel == 1 || predictedLabel == 2 || predictedLabel == 4 || predictedLabel == 5 || predictedLabel == 6) {
            group.color = color; 
        }
    }

    console.log("predictedLabel:", predictedLabel);
    console.log("allGroups:", allGroups);
    console.log("pastGroups:", pastGroups);
    console.log("modifiergroup:", modifiedGroups);

    reDrawAll(drawCtx);
    return {
        modifiedGroups,
        predictedLabel,
        newGroups,
        modifier,
    }
}

const canvasGroup = document.querySelector(".canvasGroup");
const liveCanvas = document.getElementById("liveCanvas");
const drawCanvas = document.getElementById("drawCanvas");
const backgroundCanvas = document.getElementById("backgroundCanvas");

const holdController = detectPointerHold(canvasGroup, 400, async (e) => {
    if (e.pointerType == 'touch') return;
    assignToolBox();
    modifiedGroups = await classifyStroke(currentStroke, true);
    liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
    drawing = false; 
    console.log("Pointer hold detected! Classifying stroke...", modifiedGroups.modifiedGroups);


    //console.log("Pointer held for 0.7 seconds!", e);
    if (modifiedGroups.predictedLabel == -1 || modifiedGroups.predictedLabel == 4 || modifiedGroups.predictedLabel == 2 || modifiedGroups.predictedLabel == 6 || modifiedGroups.predictedLabel == 5) {
        showToolbox(e.offsetX, e.offsetY, colorTools);
    } else if (modifiedGroups.predictedLabel == 0 || modifiedGroups.predictedLabel >= 10) {
        showToolbox(e.offsetX, e.offsetY, underlineTools);
    } else if (modifiedGroups.predictedLabel == 1) {
        showToolbox(e.offsetX, e.offsetY, boxTools);
    }
    
    pointerDownForToolbox = true; 

    isPointerInside = true;

    shapeHoldTimer = setTimeout(() => {
        if (isPointerInside) {
            hideToolbox();
            toggleShape(e);
        // your hold logic here (e.g., show toolbox)
        }
    }, 700); // 0.5s hold
});

let title = null;

let drawCtx = setupHiDPICanvas(drawCanvas);
let liveCtx = setupHiDPICanvas(liveCanvas);
let backgroundCtx = setupHiDPICanvas(backgroundCanvas);

let velocity = { x: 0, y: 0 };
let lastPanPos = { x: 0, y: 0 };
let lastPanTime = 0;
let momentumActive = false;
const friction = 0.92;
const minVelocity = 0.3;


window.addEventListener('beforeunload', (event) => {
    // Your function or logic here
    if (title) {
        saveNote(title, allGroups);
    }

    // event.preventDefault();
    // event.returnValue = '';
});

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
        console.log(lastSaveNote?.path);
        console.log(lastSaveNote?.viewportOffset);
        console.log(lastSaveNote?.scale);
        if (lastSaveNote) {
            pathSegments = lastSaveNote.path.split('/');
            viewportOffset = lastSaveNote.viewportOffset;
            screenBox.x = viewportOffset.x;
            screenBox.y = viewportOffset.y;
            //scale = lastSaveNote.scale;
            title = lastSaveNote.path;
            
            console.log(pathSegments[0]);
            openFolder(pathSegments[0]);
            //loadNoteOnBtn(lastSaveNote.path, document.getElementById(lastSaveNote.path));
            loadNote(lastSaveNote.path, note => {
                if (note) {
                    if (note.content) {
                        allGroups = note.content;
                        id_count = allGroups.reduce((max, group) => Math.max(max, group.id ?? -Infinity), 0) + 1;
                        console.log("initial id", id_count);
                    } else {
                        allGroups = [];
                    }
                    console.log('loadAllgroups', allGroups); 
                    reDrawAll(drawCtx);
                }
            });
            setTimeout(() => {
                document.getElementById(lastSaveNote.path.replace('/','_').replace('.json','')).classList.toggle('noteSelected');
                drawingLock = true;

                //scrollbar
                maxHeightObj = allGroups.reduce((max, obj) => (obj?.bbox.y + obj?.bbox.h) > (max.bbox?.y + obj?.bbox.h) ? obj : max);
                contentHeight = maxHeightObj.bbox.y + maxHeightObj.bbox.h + 300;
                
                scrollbar.style.display = "block";
                console.log("maxheight", contentHeight);
                
                console.log("ratio", viewportHeight/contentHeight);
                console.log("scrollbarheight", viewportHeight);
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

    let selectedImage = null;
    let isImageDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    canvasGroup.addEventListener("pointerdown", (e) => {
        const pos = toCanvasCoords(e);

        currentStroke = [];
        e.preventDefault();
        // Reset movement tracking
        lastPointerX = e.offsetX/scale;
        lastPointerY = e.offsetY/scale;
        totalMovement = 0;

        // === 🟨 Sticky Note / 🔗 Link Click Detection ===
        {
        const worldX = (e.offsetX / scale) + viewportOffset.x;
        const worldY = (e.offsetY / scale) + viewportOffset.y;

        // One pass through allGroups for both link and stickynote
        const clicked = allGroups.find(
            (g) =>
            (g.type === "stickynote" || g.type === "link") &&
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
        }



        if (((e.shiftKey && e.pointerType === "mouse") || (e.pointerType === "touch"))) {
            isPanning = true;
            momentumActive = false; // Stop any ongoing momentum
            panStart.x = e.offsetX / scale;
            panStart.y = e.offsetY / scale;
            initialViewportOffset = { x: viewportOffset.x, y: viewportOffset.y };
            isScrollingX = false;
            isScrollingY = false;
            lockedAxis = null;
            canvasGroup.style.cursor = "grabbing";

            lastPanPos = { x: panStart.x, y: panStart.y };
            lastPanTime = performance.now();

            scrollbar.style.display = "block";
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
    console.log("movement:", moveEvent);

    canvasGroup.addEventListener(moveEvent, (e) => {
        if (isImageDragging && selectedImage) {
            const pos = toCanvasCoords(e);

            selectedImage.x = pos.x - dragOffsetX;
            selectedImage.y = pos.y - dragOffsetY;

            reDrawAll(drawCtx);
            e.preventDefault();
            return;
        }

        // Check if the pointer has moved significantly
        const movement_dx = e.offsetX/scale - lastPointerX;
        const movement_dy = e.offsetY/scale - lastPointerY;
        totalMovement += Math.sqrt(movement_dx * movement_dx + movement_dy * movement_dy);
        lastPointerX = e.offsetX/scale;
        lastPointerY = e.offsetY/scale;

        if (totalMovement > MOVEMENT_THRESHOLD) {
            holdController.cancel();
            totalMovement = 0;
        }

        if (isPanning) {
            //------------Scroll bar--------------
            //get contentHeight
            maxHeightObj = allGroups.reduce((max, obj) => (obj?.bbox.y + obj?.bbox.h) > (max.bbox?.y + obj?.bbox.h) ? obj : max);
            contentHeight = maxHeightObj.bbox.y + maxHeightObj.bbox.h + viewportHeight;
            
            console.log("maxheight", contentHeight);
            
            console.log("ratio", viewportHeight/contentHeight);
            console.log("scrollbarheight", viewportHeight);
            thumbHeight = Math.max((viewportHeight/contentHeight)*(viewportHeight*0.86), 0);
            thumb.style.height = thumbHeight + "px";

            drawing = false;
            let dx = -((e.offsetX / scale) - panStart.x);
            let dy = -((e.offsetY / scale) - panStart.y);
            
            const lockThreshold = 10/ scale;

            // Determine locked axis if not set yet
            if (!lockedAxis) {
                if (Math.abs(dx) > lockThreshold || Math.abs(dy) > lockThreshold) {
                    lockedAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
                } else {
                    return; // Don't scroll yet, too small movement
                }
            }

            if (lockedAxis === 'x') {
                dy = 0; // Lock vertical movement
            } else if (lockedAxis === 'y') {
                dx = 0; // Lock horizontal movement
            }

            if ((initialViewportOffset.y + dy) < panningLimit.top){
                dy = panningLimit.top - initialViewportOffset.y;
                return;
            }
            if ((initialViewportOffset.x + dx) < panningLimit.left){
                dx = panningLimit.left - initialViewportOffset.x;
                return;
            }

            if (dy<0) {
                lockScroll = false;
            }

            if (lockScroll == false) {
                viewportOffset.x = initialViewportOffset.x + dx;
                viewportOffset.y = initialViewportOffset.y + dy;
            }

            console.log("dy", dy);

            //momentum scrolling
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

            if (!isPointerInside) {
                clearTimeout(shapeHoldTimer);
                toggleBtn.classList.remove("countdown");
            }
        }
        else if (shapeMode) {
            drawShape(liveCtx, e);
        }
        else if (movingToggle) {
            // let moveStartX;
            // let moveStartY;
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
        

            dx_record += dx;
            dy_record += dy;

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
            drawStroke(liveCtx, currentStroke, defaultPenColor);
            liveCtx.restore();

            if (totalMovement == 0) {
                holdController.start(e); // Restart hold detection
            }
        }
    });

    canvasGroup.addEventListener("pointerup", (e) => {
        if (isImageDragging) {
            isImageDragging = false;
            selectedImage = null;
            e.preventDefault();
            return;
        }
        if (isPanning) {
            isPanning = false;

            if (Math.abs(velocity.x) > minVelocity || Math.abs(velocity.y) > minVelocity) {
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
                dx: dx_record,
                dy: dy_record,
                modifiedGroups: modifiedGroups.modifiedGroups,
            };
            pastGroups.push(change);

            modifiedGroups.modifiedGroups.forEach(group => {
                group.color = movingColor; // Set to white
            });

            dx_record = 0;
            dy_record = 0;  
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
            clearTimeout(shapeHoldTimer);
            isPointerInside = false;
            let selectedTool = null;

            toolLinks.forEach(link => {
            const rect = link.getBoundingClientRect();
                if (
                    e.clientX >= rect.left &&
                    e.clientX <= rect.right &&
                    e.clientY >= rect.top &&
                    e.clientY <= rect.bottom
                ) {
                    selectedTool = link.querySelector('i') ?.getAttribute('data-label') || 'Unknown tool';
                }
            });

            // Execute tools
            if (modifiedGroups.predictedLabel == -1) {
                allGroups.pop();
            }
            if (selectedTool) {
                let isShortcut = false;
                if (modifiedGroups.predictedLabel == 4 || modifiedGroups.predictedLabel == 2 || modifiedGroups.predictedLabel == 6 || modifiedGroups.predictedLabel == 5){
                    isShortcut = true;
                    if (modifiedGroups.predictedLabel == 2) {
                        allGroups.pop();
                    }
                }   
                
                console.log(`Selected tool: ${selectedTool}`);
                //delete tool
                executeTool(selectedTool, isShortcut);
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

    modifiers = {
        title1: {color: '#ffa052', visibility: false}, 
        title2: {color: '#f4c64a', visibility: true}, 
        highlight1: {color: '#ffff00', visibility: true}, // red
        highlight2: {color: '#ffff00', visibility: true}, // green
        highlight3: {color: '#00ffff', visibility: true}, // blue
        box: {color: '#ffb6ff', visibility: true},
        curly: {color: '#fa6e6e', visibility: true},
        boxshortcut: {color: '#a3fba9', visibility: false},
        curlyshortcut: {color: '#74e8ff', visibility: false}, 
        circleshortcut: {color: 'pink', visibility: false}, 
    }

    // modifiers = await loadModifiers();
    // if (modifiers == null) {
    //     modifiers = {
    //         title1: {color: '#ff6a00', visibility: true}, 
    //         title2: {color: '#f4c64a', visibility: true}, 
    //         highlight1: {color: '#ffff00', visibility: true}, // red
    //         highlight2: {color: '#ffff00', visibility: true}, // green
    //         highlight3: {color: '#00ffff', visibility: true}, // blue
    //         box: {color: '#ffb6ff', visibility: true},
    //         curly: {color: '#fa6e6e', visibility: true},
    //         boxshortcut: {color: '#a3fba9', visibility: false},
    //         curlyshortcut: {color: '#74e8ff', visibility: false}, 
    //         circleshortcut: {color: 'pink', visibility: false}, 
    //     }
    // }
    // document.querySelectorAll('.modifier-card').forEach(card => {
    //     const modifierName = card.getAttribute('data-modifier');
    //     const colorInput = card.querySelector('#colorInput');
    //     const checkbox = card.querySelector('.modifier-footer input[type="checkbox"]');
    //     const isVisible = checkbox.checked;

    //     // Initialize the object with default value from the input
    //     if (modifiers[modifierName]) {
    //         colorInput.value = modifiers[modifierName].color;
    //         checkbox.checked = modifiers[modifierName].visibility;
    //     }else {
    //         modifiers[modifierName] = {
    //             color: colorInput.value,
    //             visibility: isVisible
    //         };
    //     }
    //     // Listen to changes and update the object
    //     colorInput.addEventListener('input', () => {
    //     modifiers[modifierName].color = colorInput.value;
    //     console.log(`Updated ${modifierName}:`, modifiers);
    //     saveModifiers(modifiers);
    //     assignToolBox();
    //     });

    //     checkbox.addEventListener('change', () => {
    //     modifiers[modifierName].visibility = checkbox.checked;
    //     console.log(`Updated ${modifierName}:`, modifiers);
    //     saveModifiers(modifiers);
    //     assignToolBox();
    //     });
    // });  
}

function updateScaleIndicator() {
    const percent = Math.round(scale * 100);
    document.getElementById("scaleIndicator").textContent = `Zoom: ${percent}%`;
  }

function zoomCanvas(zoomDelta) {
    const newScale = Math.min(Math.max(scale + zoomDelta, MIN_SCALE), MAX_SCALE);
    if (newScale !== scale) {
        scale = newScale;
        console.log("🔍 Zoom scale:", scale.toFixed(2));

        // Re-setup canvases with new scale
        drawCtx = setupHiDPICanvas(drawCanvas);
        liveCtx = setupHiDPICanvas(liveCanvas);
        backgroundCtx = setupHiDPICanvas(backgroundCanvas);

        screenBox.w = window.innerWidth / scale;
        screenBox.h = window.innerHeight / scale;

        updateScaleIndicator();

        drawGrid(backgroundCtx);
        reDrawAll(drawCtx);
    }
}

function applyMomentum() {
    if (momentumActive) return;
    momentumActive = true;

    function step() {
        if (!momentumActive || lockScroll) return;

        velocity.x *= friction;
        velocity.y *= friction;

        if (Math.abs(velocity.x) < minVelocity && Math.abs(velocity.y) < minVelocity) {
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

        

        requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
}

function executeTool(selectedTool, isShortcut) {
    if (selectedTool.includes("pen")) {
        eraserMode = false; 
        liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);

        let lastChar = selectedTool.charAt(selectedTool.length - 1);
        let lastNum = parseInt(lastChar); 

        console.log(lastNum);

        if (isShortcut) {
            modifiedGroups.modifiedGroups.forEach(group => {
                group.color = colorTools[lastNum - 1].color;
            });
        }
        else {
            console.log(lastNum -1);
            defaultPenColor = colorTools[lastNum - 1].color;
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
    }else if (selectedTool == "highlight1") {
        selectHighlight(modifiers.highlight1.color);
    }  
    else if (selectedTool == "highlight2") {
        allGroups.pop();
        selectHighlight(modifiers.highlight2.color);
    } 
    else if (selectedTool == "highlight3") {
        allGroups.pop();
        selectHighlight(modifiers.highlight3.color);
    } 
    else if (selectedTool == "bold") {
        allGroups.pop();
        modifiedGroups.modifiedGroups.forEach(group => {
            group.titleStatus = true;
            //group.color = 'pink';
            group.color = alterRgbaBrightness(group.color);
        });
    }
    else if (selectedTool == "title1") {
        selectTitle(modifiers.title1.color, modifiers.title1.visibility, 2);
    }
    else if (selectedTool == "title2") {
        selectTitle(modifiers.title2.color, modifiers.title2.visibility, 1);
    }
    else if (selectedTool == "move") {
        allGroups.pop();
        modifiedGroups.modifiedGroups.pop();
        movingColor = modifiedGroups.modifiedGroups[0].color;
        modifiedGroups.modifiedGroups.forEach(group => {
            group.color = 'lightgray'; // Set to white
        });
        movingToggle = true;
    }
    else if (selectedTool == "eraser") {
        toggleEraser();
    }
    else if (selectedTool == "mathSolver") {
        console.log(modifiedGroups.modifiedGroups);
        modifiedGroups.modifiedGroups.pop();
        allGroups.pop();
        const canvas = extractImageDataFromStrokes(modifiedGroups.modifiedGroups);
        //downloadCanvasImage(canvas, "my_strokes.png");
        if (canvas !== -1) {
        // Send to backend for recognition
        canvas.toBlob(async (blob) => {
            const { latex, result } = await detectAndSolveMath(blob);
            console.log("Detected:", latex, "→", result);
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
            id: id_count++,
            type: "stickynote",
            bbox: groupBBox,
            stroke: modifiedGroups.modifiedGroups.flatMap(g => g.stroke),
            color: "#0077ff",
            visibility: true,
        };

        // Temporarily add it
        allGroups.push(stickynoteGroup);

        flashStickyNote(stickynoteGroup);
        showStickyPopup(stickynoteGroup); // open drawable popup
        return;
    }
    else if (selectedTool == "stickynote") {
        // Remove selection highlights
        allGroups.pop();
        modifiedGroups.modifiedGroups.pop();

        const groupBBox = getBoundingBox(modifiedGroups.modifiedGroups.flatMap(g => g.stroke));

        // Create the empty link group
        const stickynoteGroup = {
            id: id_count++,
            type: "stickynote",
            bbox: groupBBox,
            stroke: modifiedGroups.modifiedGroups.flatMap(g => g.stroke),
            color: "#0077ff",
            visibility: true,
        };

        // Temporarily add it
        allGroups.push(stickynoteGroup);

        flashStickyNote(stickynoteGroup);
        showStickyPopup(stickynoteGroup); // open drawable popup
        return;
    }
    else if (selectedTool == "link") {
        allGroups.pop();
        modifiedGroups.modifiedGroups.pop();

        const groupBBox = getBoundingBox(modifiedGroups.modifiedGroups.flatMap(g => g.stroke));

        // Create the empty link group
        const linkGroup = {
            id: id_count++,
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
          if (group.predictedLabel != 3) {
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
          if (group.predictedLabel != 3) {
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


//------scroll bar---------
function updateScrollbar() {
    const maxScroll = contentHeight - viewportHeight;
    const maxThumb = viewportHeight * 0.86 - thumbHeight;

    //convert viewportoffset.y to thumb position
    const scrollRatio = viewportOffset.y/maxScroll;

     console.log("thumb height top", scrollRatio * maxThumb+thumbHeight);

    if (((scrollRatio * maxThumb) + thumbHeight) >= viewportHeight * 0.86) {
        console.log('end of scroill');
        lockScroll = true;
    } else {
        lockScroll = false;
    }

    thumb.style.top = scrollRatio * maxThumb + "px";
}


function startScrollBarCountdown() {

    // Reset countdown
    remaining = countdownSeconds;


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
// =============== SMART SUMMARIZE FEATURE ===================
document.getElementById("sendToTotalBtn").onclick = () => {
  if (!selectedFolder) return alert("⚠️ Hãy chọn folder trước.");
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
      <button id="startSummarizeBtn" style="background:#007aff;color:white;border:none;padding:8px 20px;border-radius:8px;font-size:14px;cursor:pointer;">Start</button>
      <button id="cancelSummarizeBtn" style="margin-left:10px;background:#444;color:white;border:none;padding:8px 20px;border-radius:8px;font-size:14px;cursor:pointer;">Cancel</button>
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
            boxClone.id = id_count++;
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
                id: id_count++,
                type: "title",
                titleLevel,
                bbox: mergedBox,
                stroke: mergedStrokes,
                children: [
                  { id: id_count++, ...structuredClone(underline), visible: true, isUnderline: true },
                  ...relatedTexts.map(t => ({ id: id_count++, ...structuredClone(t) }))
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
        console.log("selectedfolder", selectedFolder);
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

function isPointInBox(point, box) {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.w &&
    point.y >= box.y &&
    point.y <= box.y + box.h
  );
}

function isInside(stroke, modifier) {
  const segmentBoxes = sliceStroke(modifier);
  return stroke.every(point =>
    segmentBoxes.some(box => isPointInBox(point, box))
  );
}

function sliceStroke(stroke, sliceHeight = 40) {
  const box = getBoundingBox(stroke);
  const numSlices = Math.ceil(box.h / sliceHeight);
  const slices = [];
  for (let i = 0; i < numSlices; i++) {
    const top = box.y + i * sliceHeight;
    const bottom = (i + 1 === numSlices) ? box.y + box.h : top + sliceHeight;
    const slicePoints = stroke.filter(p => p.y >= top && p.y < bottom);
    if (slicePoints.length === 0) continue;
    const xs = slicePoints.map(p => p.x);
    slices.push({ x: Math.min(...xs), y: top, w: Math.max(...xs) - Math.min(...xs), h: bottom - top });
  }
  return slices;
}

function showStatus(msg) {
  console.log("📢", msg);
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
// (function () {
//   const penOverlay = document.createElement("img");
//   penOverlay.src = "cursor.png"; // your 945×1396 image
//   penOverlay.alt = "pen cursor";
//   penOverlay.style.position = "fixed";
//   penOverlay.style.height = "130px"; // scaled height
//   penOverlay.style.pointerEvents = "none";
//   penOverlay.style.zIndex = "999999";
//   penOverlay.style.display = "block";

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
//     penOverlay.style.transform = "scale(0.9)";
//   });
//   window.addEventListener("pointerup", () => {
//     penOverlay.style.transform = "scale(1)";
//   });
// })();

// ======================= TOC BUTTON HANDLER ==========================
const tocBtn = document.getElementById("tocBtn");

tocBtn.onclick = () => {
  console.log("🟩 TOC button clicked");
  regroupTitles();

  if (!tocDropdown) {
    console.error("❌ tocDropdown element not found");
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
  console.log("🟩 Found anchors:", anchors);

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

    // === Scroll to anchor when clicked ===
    item.onclick = () => {
      console.log(`📜 Scroll to title: ${anchor.titleText}`);
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
  console.log("🟦 regroupTitles() started");

  if (!Array.isArray(allGroups) || allGroups.length === 0) {
    console.warn("⚠️ allGroups empty or invalid");
    return;
  }

  // Step 1️⃣: find all underline modifiers
  const underlineMods = allGroups.filter(
    g => g?.predictedLabel === 0 && g?.bbox
  );
  console.log("🟪 underline modifiers found:", underlineMods.length);

  if (underlineMods.length === 0) {
    console.warn("⚠️ No underline modifiers found");
    return;
  }

  // Step 2️⃣: remove any old anchors
  allGroups = allGroups.filter(g => !g.isTitleAnchor);

  // Step 3️⃣: for each underline, find groups directly above (with titleStatus)
  underlineMods.forEach((underline, i) => {
    const uBox = underline.bbox;
    console.log(`🔹 Processing underline #${i}:`, uBox);

    let maxY = 100000;
    let minY = uBox.y + uBox.h - normalHeight * 0.55;
    if (maxY >= minY - normalHeight * 0.55) maxY = Math.min(minY - 7, uBox.y);

    // Step 4️⃣: find possible title groups above
    const titleGroups = allGroups.filter(group => {
      if (!group?.bbox || !group?.titleStatus) return false;

      const box = group.bbox;
      const withinBand = (box.y + box.h) > maxY;
      const approxAboveLine =
        Math.abs(box.y + box.h - uBox.y - uBox.h) < normalHeight * 0.7;
      const overlapsX = box.x + box.w > uBox.x && box.x < uBox.x + uBox.w;
      const above = withinBand && approxAboveLine && overlapsX;

      return above;
    });

    if (titleGroups.length === 0) {
      console.log("⚠️ No title group above underline:", underline.id);
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
        id: id_count++,
        bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
        isTitleAnchor: true,
        titleLevel: level,
        titleText: `Title ${id_count} (Level ${level})`,
        underlineRef: underline.id,
      };
      allGroups.push(anchor);
      console.log("🟢 Created anchor:", anchor);
    };

    createAnchor(level1Groups, 1);
    createAnchor(level2Groups, 2);
  });

  console.log("✅ regroupTitles() finished, total anchors:", allGroups.filter(g => g.isTitleAnchor).length);
  reDrawAll?.(drawCtx);
}



// ======================= HIGH DPI THUMBNAIL RENDER ==========================
function renderTitleThumbnailFromAnchor(anchor, maxW = 280, maxH = 70) {
  const PAD = 12;
  const { x, y, w, h } = anchor.bbox;
  const dpr = window.devicePixelRatio || 1;
  console.log(`🖼️ Rendering thumbnail for ${anchor.titleText} (DPR=${dpr})`);

  // collect all strokes inside anchor
  const strokes = allGroups.filter(g =>
    g.titleStatus &&
    g.bbox &&
    g.bbox.x >= x - 2 &&
    g.bbox.y >= y - 2 &&
    (g.bbox.x + g.bbox.w) <= x + w + 2 &&
    (g.bbox.y + g.bbox.h) <= y + h + 2
  );

  if (strokes.length === 0) {
    console.warn("⚠️ No title strokes found for anchor", anchor);
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

