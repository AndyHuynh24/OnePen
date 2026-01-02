//Draw function
//increase hiDPI canvas support
const dpr = window.devicePixelRatio || 1;
function setupHiDPICanvas(canvas) {
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0); // apply scale
    return ctx;
};

//get draw coordinates according to viewport offset and scale
function toCanvasCoords(e) {
    return {
        x: (e.offsetX + viewportOffset.x) / scale,
        y: (e.offsetY + viewportOffset.y) / scale,
    };
}
//Drawgrid grid
function drawGrid(ctx) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;

  ctx.save();

  // Clear
  ctx.clearRect(0, 0, width, height);

  // Background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  // Grid style
  ctx.strokeStyle = gridLineColor;
  ctx.lineWidth = 1;

  // Offset-aware start positions
  const startX = (-viewportOffset.x % gridSize + gridSize) % gridSize;
  const startY = (-viewportOffset.y % gridSize + gridSize) % gridSize;

  // Vertical lines (only for square grid style)
  if (gridStyle === 'square') {
    for (let x = startX; x <= width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }

  // Horizontal lines (always drawn)
  for (let y = startY; y <= height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.restore();
}

// Draw tape (flashcard cover) with pattern tiling and zigzag edges
function drawTapeGroup(ctx, group) {
  const { x, y, w, h } = group.bbox;
  const revealed = group.revealed || false;
  const fadeProgress = group.fadeProgress ?? 1;
  const preset = group.preset || 'polkadot';

  // Add padding to fully cover strokes
  const padding = 6;
  const tx = x - padding;
  const ty = y - padding;
  const tw = w + padding * 2;
  const th = h + padding * 2;

  ctx.save();

  // First draw the strokes underneath
  if (Array.isArray(group.stroke) && group.stroke.length > 0) {
    group.stroke.forEach(st => {
      if (!st.path || st.path.length < 2) return;

      ctx.save();
      ctx.beginPath();

      for (let i = 0; i < st.path.length; i++) {
        const point = st.path[i];
        if (i === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      }

      ctx.strokeStyle = st.color || '#ffffff';
      ctx.lineWidth = st.size || 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    });
  }

  // Calculate opacity based on reveal state and fade progress
  let tapeOpacity;
  if (revealed) {
    tapeOpacity = 1 - fadeProgress;
  } else {
    tapeOpacity = fadeProgress;
  }

  // Draw the tape pattern if not fully revealed
  if (tapeOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = tapeOpacity;

    // Get or create pattern
    let patternCanvas = tapePatternCache.get(preset);
    if (!patternCanvas) {
      patternCanvas = generateTapePattern(preset);
      tapePatternCache.set(preset, patternCanvas);
    }

    // Create repeating pattern
    const pattern = ctx.createPattern(patternCanvas, 'repeat');

    // Draw tape shape with zigzag/torn edges
    const zigzagSize = 8;
    const zigzagDepth = 6;
    const zigzagCount = Math.ceil(tw / zigzagSize);

    ctx.beginPath();

    // Top edge - zigzag (starts above to cover fully)
    ctx.moveTo(tx, ty + zigzagDepth);
    for (let i = 0; i <= zigzagCount; i++) {
      const px = tx + (i * zigzagSize);
      const py = ty + (i % 2 === 0 ? zigzagDepth : 0);
      ctx.lineTo(Math.min(px, tx + tw), py);
    }

    // Right edge
    ctx.lineTo(tx + tw, ty + th - zigzagDepth);

    // Bottom edge - zigzag (reversed, extends below)
    for (let i = zigzagCount; i >= 0; i--) {
      const px = tx + (i * zigzagSize);
      const py = ty + th + (i % 2 === 0 ? -zigzagDepth : 0);
      ctx.lineTo(Math.max(px, tx), py);
    }

    // Left edge
    ctx.lineTo(tx, ty + zigzagDepth);
    ctx.closePath();

    // Fill with pattern
    ctx.fillStyle = pattern;
    ctx.fill();

    // Add semi-transparent overlay for tape look
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fill();

    // Add subtle shadow/depth on edges
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }

  // Draw border when revealed (flashing indicator)
  if (revealed && fadeProgress >= 1) {
    ctx.strokeStyle = group.borderColor || CONFIG.COLORS.FLASH_TAPE;
    ctx.lineWidth = CONFIG.TAPE.BORDER_WIDTH;
    ctx.setLineDash([8, 4]);
    ctx.strokeRect(tx, ty, tw, th);
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function drawBox(box, color, label, dashed = false, drawctx = drawCtx) {
    drawctx.save();
    //liveCtx.clearRect(0, 0, canvas.width, canvas.height);
    //drawctx.translate(-viewportOffset.x, -viewportOffset.y);
    drawctx.strokeStyle = color;
    drawctx.setLineDash(dashed ? [6, 3] : []);
    drawctx.strokeRect(box.x, box.y, box.w, box.h);
    drawctx.setLineDash([]);
    drawctx.fillStyle = color;
    drawctx.font = '200 18px "Mali"'; // Weight 700
    drawctx.fillText(label, box.x, box.y - 6);
    drawctx.restore();
}

function detectEdgeOfPointInBBox(shapeStartX, shapeStartY, bbox) {
    const { x, y, width, height } = bbox;

    // Clamp the point to the box boundaries to create a projection
    const clampedX = Math.max(x, Math.min(shapeStartX, x + width));
    const clampedY = Math.max(y, Math.min(shapeStartY, y + height));

    // Distances to each edge
    const distLeft = Math.abs(shapeStartX - x);
    const distRight = Math.abs(shapeStartX - (x + width));
    const distTop = Math.abs(shapeStartY - y);
    const distBottom = Math.abs(shapeStartY - (y + height));

    const distances = {
        left: distLeft,
        right: distRight,
        top: distTop,
        bottom: distBottom,
    };

    // Find edge with minimum distance
    let closest = "left";
    let minDist = distances.left;

    for (const side in distances) {
        if (distances[side] < minDist) {
            closest = side;
            minDist = distances[side];
        }
    }
    return closest;
}
function getDistance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}
// ------shape-----------------
async function toggleShape(e) {
    modifiedGroups.modifiedGroups.pop();
    allGroups.pop();
    shapeMode = !shapeMode;
    imgData = extractImageData(currentStroke);

    const viewerCanvas = document.getElementById('viewer');
    const viewerCtx = viewerCanvas.getContext('2d');
    viewerCtx.clearRect(0, 0, 136, 136);
    viewerCtx.drawImage(imgData, 0, 0);

    predictedShape = await predictShapeFromCanvas(imgData, autoShapeModel);
    
    shapeStartX = (currentStroke[0].x);
    shapeStartY = (currentStroke[0].y);
    reDrawAll(drawCtx);
    drawShape(liveCtx, e);
}
function drawCircle(ctx, x, y, color, lineWidth = 1.7) {
    ctx.save();
    ctx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
    ctx.translate(-viewportOffset.x, -viewportOffset.y); 
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;

    const dx = x - shapeStartX;
    const dy = y - shapeStartY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const radius = distance / 2;

    // Direction vector from anchor to pointer
    const dirX = dx / distance;
    const dirY = dy / distance;

    // Center is 1 radius away from anchor in drag direction
    const centerX = shapeStartX + dirX * radius;
    const centerY = shapeStartY + dirY * radius ;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return {
        id: id_count ++,
        shape: 2,
        color: color,
        bbox: { x: centerX - radius, y: centerY - radius, w: radius*2, h: radius*2}
    };
}
function drawRectangle(ctx, x, y, color, lineWidth = 1.7) {
    ctx.save();
    ctx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
    ctx.translate(-viewportOffset.x, -viewportOffset.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;

    const dx = x - shapeStartX;
    const dy = y - shapeStartY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const dirX = dx / distance;
    const dirY = dy / distance;

    // Midpoint between start and current (center of rect)
    const centerX = shapeStartX + dirX * (distance / 2);
    const centerY = shapeStartY + dirY * (distance / 2);

    // Width and height are 2 * radius components (to cover full distance)
    const halfWidth = Math.abs(centerX - shapeStartX);
    const halfHeight = Math.abs(centerY - shapeStartY);

    // Top-left of rectangle from center and half sizes
    const rectX = centerX - halfWidth;
    const rectY = centerY - halfHeight;
    const rectW = halfWidth * 2;
    const rectH = halfHeight * 2;

    ctx.beginPath();
    ctx.rect(rectX, rectY, rectW, rectH);
    ctx.stroke();
    ctx.restore();
    return {
        id: id_count ++,
        shape: 1,
        color: color,
        bbox: { x: rectX, y: rectY, w: rectW, h: rectH }
    };
}
function drawLine(ctx, x, y, color, lineWidth = 1.7) {
    ctx.save();
    ctx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
    ctx.translate(-viewportOffset.x, -viewportOffset.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;

    ctx.beginPath();
    ctx.moveTo(shapeStartX, shapeStartY);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.restore();
    
    let bbox = {x: 0, y: 0, w: 0, h: 0};
    let directX = 1;
    let directY = 1;

    if (x >= shapeStartX) {
        bbox.x = shapeStartX;
        bbox.w = x - shapeStartX; 
        directX = 1;
    } else {
        bbox.x = x;
        bbox.w = shapeStartX - x; 
        directX = -1;
    }
    if (y >= shapeStartY) {
        bbox.y = shapeStartY;
        bbox.h = y - shapeStartY;
        directY = 1;
    } else {
        bbox.y = y;
        bbox.h = shapeStartY - y;
        directY = -1;
    }
    
    return {
        id: id_count ++,
        shape: 0,
        color: color,
        bbox: bbox,
        directX: directX,
        directY: directY
    }
}
function drawShape(ctx, e) {
    let shape;
    x = (e.offsetX + viewportOffset.x) /scale;
    y = (e.offsetY + viewportOffset.y) /scale
    if (predictedShape == 0) {
        shape = drawLine(ctx, x,y, defaultPenColor);
    } else if (predictedShape == 1) {
        shape = drawRectangle(ctx, x, y, defaultPenColor);
        //console.log("shape", shape);
    } else if (predictedShape == 2) {
        shape = drawCircle(ctx, x, y, defaultPenColor);
    }

    return shape;
}

function drawFinalRectangle(ctx,  bbox, color, lineWidth = 1.7) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.rect(bbox.x, bbox.y, bbox.w, bbox.h);
    ctx.stroke();
}
function drawFinalCircle(ctx, bbox, color, lineWidth = 1.7) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    
    const radius = bbox.w/2;
    const centerX = bbox.x + radius; 
    const centerY = bbox.y + radius; 

    //drawBox(bbox, 'gray', '');

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
}
function drawFinalLine(ctx, bbox, color, directX, directY, lineWidth = 1.7) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    
    let pos = {x: 0, y: 0, x1: 0, y1: 0};

    if (directX == 1) {
        pos.x = bbox.x;
        pos.x1 = bbox.x + bbox.w;
    } else {
        pos.x = bbox.x + bbox.w;
        pos.x1 = bbox.x;
    }

    if (directY == 1) {
        pos.y = bbox.y;
        pos.y1 = bbox.y + bbox.h;
    } else {
        pos.y = bbox.y + bbox.h;
        pos.y1 = bbox.y;
    }

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x1, pos.y1);
    ctx.stroke();
}

// --------draw stroke --------------------
function drawStroke(ctx, stroke, color=defaultPenColor, widthFactor = 1.7, dash = false) {
    if (stroke.length < 2) return;

    ctx.save();
    //ctx.translate(-viewportOffset.x, -viewportOffset.y); // for viewport offset

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = widthFactor;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (dash) {
        ctx.setLineDash([2, 5]);
    }

    ctx.moveTo(stroke[0].x, stroke[0].y);

    for (let i = 1; i < stroke.length - 1; i++) {
        const curr = stroke[i];
        const next = stroke[i + 1];
        const midX = (curr.x + next.x) / 2;
        const midY = (curr.y + next.y) / 2;
        ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
    }

    const last = stroke[stroke.length - 1];
    ctx.lineTo(last.x, last.y);

    ctx.stroke();
    ctx.setLineDash([]); // Clear dash style
    ctx.restore();
}

function drawHighlight(bbox, color, drawctx = drawCtx) {
    const waveAmplitude = 0.4; // Small wave height
    const waveFrequency = 0.06; // Gentle wave frequency
    const horizontalPadding = bbox.h * 0.1; // Extra width
    const verticalPadding = bbox.h * 0.1; // Extra height
    const shiftUp = bbox.h * 0.025; // Shift highlight upwards by 10px (adjust as needed)

    //drawBox(bbox, color, "highlighter", true, drawctx);
    drawctx.save();
    //drawctx.translate(-viewportOffset.x, -viewportOffset.y);

    drawctx.fillStyle = color; // Yellow highlight
    drawctx.beginPath();

    // Adjusted bbox.y with vertical padding and shiftUp
    const topY = bbox.y;
    //const topY = bbox.y - verticalPadding - shiftUp;
    const bottomY = bbox.y + bbox.h;
    //const bottomY = bbox.y + bbox.h + verticalPadding - shiftUp;

    // Top wave (shift left and upward)
    drawctx.moveTo(bbox.x, topY + waveAmplitude * Math.sin(bbox.x * waveFrequency));
    //drawctx.moveTo(bbox.x - horizontalPadding, topY + waveAmplitude * Math.sin((bbox.x - horizontalPadding) * waveFrequency));
    for (let x = bbox.x; x <= bbox.x + bbox.w; x += 2) {
        const y = topY + waveAmplitude * Math.sin(x * waveFrequency);
        drawctx.lineTo(x, y);
    }

    // Right edge
    drawctx.lineTo(bbox.x + bbox.w, bottomY);

    // Bottom wave (reverse sine)
    for (let x = bbox.x + bbox.w; x >= bbox.x; x -= 2) {
        const y = bottomY + waveAmplitude * Math.sin(x * waveFrequency + Math.PI);
        drawctx.lineTo(x, y);
    }

    // Left edge
    drawctx.lineTo(bbox.x, topY);
    drawctx.closePath();
    drawctx.fill();
    drawctx.restore();
}

function alterRgbaBrightness(rgba, percent = 7) {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d\.]+)?\)/);
  if (!match) return rgba; // Fallback if invalid

  let [_, r, g, b, a] = match;
  r = parseInt(r);
  g = parseInt(g);
  b = parseInt(b);
  a = a !== undefined ? parseFloat(a) : 1;

  const adjust = (value) => {
    const newVal = value + (value * percent / 100);
    return Math.max(0, Math.min(255, Math.round(newVal)));
  };

  const newR = adjust(r);
  const newG = adjust(g);
  const newB = adjust(b);

  return `rgba(${newR}, ${newG}, ${newB}, ${a})`;
}

// Draw eraser circle indicator on liveCanvas
function drawEraserIndicator() {
    const centerX = eraserBox.x + eraserSize / 2;
    const centerY = eraserBox.y + eraserSize / 2;
    const radius = eraserSize / 2;

    liveCtx.save();
    liveCtx.beginPath();
    liveCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);

    // White circle with black outline for visibility on any background
    liveCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    liveCtx.lineWidth = 2;
    liveCtx.stroke();

    liveCtx.beginPath();
    liveCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    liveCtx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    liveCtx.lineWidth = 1;
    liveCtx.stroke();

    liveCtx.restore();
}

function toggleEraser() {
    eraserMode = !eraserMode;
    liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
}

function eraseStrokes() {
    for (const group of allGroups) {
        if (group.visibility == false || !group.bbox || !intersect(group.bbox, screenBox) || group.type == 'media') continue;
    
        // Check if any stroke intersects
        if (intersect(group.bbox, eraserBox)) {
            console.log('erase');
            // Save intersecting strokes as a new "deleted" group
            erasedGroups.push(group);
            allGroups.splice(allGroups.indexOf(group), 1);
        }
    }
    reDrawAll(drawCtx);
}

function recordEraser() {
    if (erasedGroups.length > 0) {
        const change = {
            change: 'delete',
            modifiedGroups: erasedGroups,
        }
        pastGroups.push(change)
    }
    erasedGroups = [];
}

function reDrawMovement() {
    liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
    liveCtx.save();
    liveCtx.translate(-viewportOffset.x, -viewportOffset.y);
    if (movingToggle) {
        moveBBox = getBoundingBox(modifiedGroups.modifiedGroups.flatMap(g => g.stroke));
        drawBox(moveBBox, 'lightgray', '', true, liveCtx);
        for (const group of modifiedGroups.modifiedGroups) {
            if (group.predictedLabel === STROKE_TYPE.HIGHLIGHT) { //highlighter
                drawHighlight(liveCtx, group.bbox, group.color)
            } else {
                drawStroke(liveCtx, group.stroke, group.color, 2);
            }
        }
    } else if (eraserMode) {
        drawEraserIndicator();
    }
    liveCtx.restore();
}
function showLinkPopup(link) {
  // Remove any existing popup
  const old = document.getElementById("linkPopup");
  if (old) old.remove();

  const popupWidth = 240;
  const popupHeight = 100;

  // Convert world → screen
  const screenX = link.bbox.x - viewportOffset.x;
  const screenY = link.bbox.y - viewportOffset.y;

  // Try above first
  let popupTop = screenY - popupHeight - 24;
  let popupLeft = screenX + link.bbox.w / 2 - popupWidth / 2;

  // If above is offscreen, go below
  if (popupTop < 0) popupTop = screenY + link.bbox.h + 8;

  // Clamp horizontally
  popupLeft = Math.max(8, Math.min(window.innerWidth - popupWidth - 8, popupLeft));

  // === Create popup ===
  const popup = document.createElement("div");
  popup.id = "linkPopup";
  popup.style.position = "fixed";
  popup.style.left = `${popupLeft}px`;
  popup.style.top = `${popupTop}px`;
  popup.style.width = `${popupWidth}px`;
  popup.style.height = `${popupHeight}px`;
  popup.style.background = "rgba(230,245,255,0.98)";
  popup.style.border = "2px solid #0077ff";
  popup.style.borderRadius = "10px";
  popup.style.boxShadow = "0 4px 16px rgba(0,0,0,0.25)";
  popup.style.padding = "12px";
  popup.style.display = "flex";
  popup.style.flexDirection = "column";
  popup.style.alignItems = "center";
  popup.style.justifyContent = "center";
  popup.style.zIndex = 999999;

  // === Input field ===
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Enter or edit URL...";
  input.value = link.url || "";
  input.style.width = "90%";
  input.style.height = "30px";
  input.style.border = "1px solid #aaa";
  input.style.borderRadius = "6px";
  input.style.padding = "4px 8px";
  input.style.marginBottom = "10px";
  input.style.fontSize = "14px";

  // === Buttons ===
  const btnContainer = document.createElement("div");
  btnContainer.style.display = "flex";
  btnContainer.style.gap = "10px";

  const goBtn = document.createElement("button");
  goBtn.textContent = "🌐 Go";
  goBtn.style.padding = "4px 12px";
  goBtn.style.border = "none";
  goBtn.style.borderRadius = "6px";
  goBtn.style.background = "#0077ff";
  goBtn.style.color = "white";
  goBtn.style.cursor = "pointer";
  goBtn.onclick = () => {
    let url = input.value.trim();
    if (!url) return;

    // ✅ Ensure proper protocol so it doesn't open as a relative path
    if (!/^https?:\/\//i.test(url)) {
        url = "https://" + url;
    }

    window.open(url, "_blank", "noopener,noreferrer");
    };


  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.padding = "4px 10px";
  closeBtn.style.border = "none";
  closeBtn.style.borderRadius = "6px";
  closeBtn.style.background = "#ccc";
  closeBtn.style.cursor = "pointer";
  closeBtn.onclick = () => popup.remove();

  btnContainer.appendChild(goBtn);
  btnContainer.appendChild(closeBtn);

  // === Auto-save on input ===
  input.addEventListener("input", () => {
    link.url = input.value;
  });

  popup.appendChild(input);
  popup.appendChild(btnContainer);
  document.body.appendChild(popup);
}


function showStickyPopup(note) {
  // remove old popup if any
  const old = document.getElementById("stickyPopup");
  if (old) old.remove();

  const popupWidth = 240;
  const popupHeight = 180;
  const canvasHeight = popupHeight - 28;
  const stickyDpr = window.devicePixelRatio || 1;

  // convert world → screen
  const screenX = note.bbox.x - viewportOffset.x;
  const screenY = note.bbox.y - viewportOffset.y;

  let popupTop = screenY - popupHeight - 8;
  let popupLeft = screenX + note.bbox.w / 2 - popupWidth / 2;
  if (popupTop < 0) popupTop = screenY + note.bbox.h + 8;
  popupLeft = Math.max(8, Math.min(window.innerWidth - popupWidth - 8, popupLeft));

  // === popup shell ===
  const popup = document.createElement("div");
  popup.id = "stickyPopup";
  popup.dataset.noteId = String(note.id); // Store note id for toggle detection
  popup.style.position = "fixed";
  popup.style.left = `${popupLeft}px`;
  popup.style.top = `${popupTop}px`;
  popup.style.width = `${popupWidth}px`;
  popup.style.height = `${popupHeight}px`;
  popup.style.background = "rgba(255, 255, 200, 0.98)";
  popup.style.border = "2px solid #ffd700"; // Yellow border
  popup.style.borderRadius = "12px";
  popup.style.boxShadow = "0 4px 16px rgba(0,0,0,0.25)";
  popup.style.zIndex = 999999;
  popup.style.overflow = "hidden";
  popup.style.touchAction = "none";

  // === toolbar ===
  const toolbar = document.createElement("div");
  toolbar.style.display = "flex";
  toolbar.style.justifyContent = "space-between";
  toolbar.style.alignItems = "center";
  toolbar.style.height = "28px";
  toolbar.style.background = "rgba(0,0,0,0.05)";
  toolbar.style.padding = "0 8px";

  const eraseBtn = document.createElement("button");
  eraseBtn.textContent = "🩹 Erase";
  eraseBtn.style.border = "none";
  eraseBtn.style.background = "transparent";
  eraseBtn.style.cursor = "pointer";
  eraseBtn.style.fontFamily = "'Mali', sans-serif";
  eraseBtn.style.fontSize = "13px";

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.border = "none";
  closeBtn.style.background = "transparent";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.fontSize = "16px";
  closeBtn.addEventListener("click", () => popup.remove());

  toolbar.appendChild(eraseBtn);
  toolbar.appendChild(closeBtn);

  // === High DPI canvas (same pattern as main canvas setupHiDPICanvas) ===
  const miniCanvas = document.createElement("canvas");
  // Set CSS size
  miniCanvas.style.width = `${popupWidth}px`;
  miniCanvas.style.height = `${canvasHeight}px`;
  // Set actual canvas size scaled by devicePixelRatio
  miniCanvas.width = popupWidth * stickyDpr;
  miniCanvas.height = canvasHeight * stickyDpr;
  miniCanvas.style.background = "rgba(255,255,230,0.95)";
  miniCanvas.style.cursor = "default";
  miniCanvas.style.display = "block";

  popup.appendChild(toolbar);
  popup.appendChild(miniCanvas);
  document.body.appendChild(popup);

  const ctx = miniCanvas.getContext("2d");
  // Apply transform like main canvas: setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.setTransform(stickyDpr, 0, 0, stickyDpr, 0, 0);

  // === state ===
  let drawing = false;
  let erasing = false;
  let erasingActive = false;
  let currentStroke = [];
  let eraseRadius = 12;

  // Generate eraser cursor for sticky note
  function generateStickyEraserCursor(size) {
    const cursorCanvas = document.createElement('canvas');
    cursorCanvas.width = size + 4;
    cursorCanvas.height = size + 4;
    const cursorCtx = cursorCanvas.getContext('2d');

    // Outer circle (dark for visibility on light background)
    cursorCtx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    cursorCtx.lineWidth = 2;
    cursorCtx.beginPath();
    cursorCtx.arc(cursorCanvas.width / 2, cursorCanvas.height / 2, size / 2, 0, Math.PI * 2);
    cursorCtx.stroke();

    // Inner circle
    cursorCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    cursorCtx.lineWidth = 1;
    cursorCtx.beginPath();
    cursorCtx.arc(cursorCanvas.width / 2, cursorCanvas.height / 2, size / 2 - 1, 0, Math.PI * 2);
    cursorCtx.stroke();

    return cursorCanvas.toDataURL();
  }

  // Update cursor based on mode
  function updateCursor() {
    if (erasing) {
      const cursorSize = eraseRadius * 2;
      const cursorUrl = generateStickyEraserCursor(cursorSize);
      const hotspot = Math.floor((cursorSize + 4) / 2);
      miniCanvas.style.cursor = `url('${cursorUrl}') ${hotspot} ${hotspot}, crosshair`;
    } else {
      miniCanvas.style.cursor = "default";
    }
  }

  // Draw a single stroke with smooth curves (same as main canvas drawStroke)
  function drawStickyStroke(stroke, color = "#222", widthFactor = 1.7) {
    if (stroke.length < 2) return;

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = widthFactor;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.moveTo(stroke[0].x, stroke[0].y);

    // Use quadraticCurveTo for smooth curves like main canvas
    for (let i = 1; i < stroke.length - 1; i++) {
      const curr = stroke[i];
      const next = stroke[i + 1];
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;
      ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
    }

    const last = stroke[stroke.length - 1];
    ctx.lineTo(last.x, last.y);

    ctx.stroke();
    ctx.restore();
  }

  // toggle mode
  eraseBtn.addEventListener("click", () => {
    erasing = !erasing;
    eraseBtn.textContent = erasing ? "✏️ Draw" : "🩹 Erase";
    updateCursor();
  });

  // pointer down
  miniCanvas.addEventListener("pointerdown", (e) => {
    const rect = miniCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (erasing) {
      erasingActive = true;
      eraseStrokeAt(x, y);
      return;
    }

    drawing = true;
    currentStroke = [{ x, y }];
  });

  // pointer move
  miniCanvas.addEventListener("pointermove", (e) => {
    const rect = miniCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (erasing && erasingActive) {
      eraseStrokeAt(x, y);
      return;
    }

    if (!drawing) return;
    currentStroke.push({ x, y });

    // Redraw all strokes + current stroke for smooth rendering
    redrawAll();
    if (currentStroke.length >= 2) {
      drawStickyStroke(currentStroke, "#222", 1.7);
    }
  });

  // pointer up
  miniCanvas.addEventListener("pointerup", () => {
    if (drawing) {
      drawing = false;
      if (currentStroke.length > 1) {
        if (!note.strokes) note.strokes = [];
        note.strokes.push([...currentStroke]);
      }
      currentStroke = [];
      redrawAll();
    }

    if (erasingActive) {
      erasingActive = false;
    }
  });

  // pointer leave
  miniCanvas.addEventListener("pointerleave", () => {
    if (drawing && currentStroke.length > 1) {
      if (!note.strokes) note.strokes = [];
      note.strokes.push([...currentStroke]);
    }
    drawing = false;
    erasingActive = false;
    currentStroke = [];
    redrawAll();
  });

  // === restore old drawing with high DPI and smooth curves ===
  function redrawAll() {
    // Clear using CSS dimensions (transform handles scaling)
    ctx.clearRect(0, 0, popupWidth, canvasHeight);

    if (note.strokes && note.strokes.length > 0) {
      for (const stroke of note.strokes) {
        if (stroke.length === 0) continue;
        drawStickyStroke(stroke, "#222", 1.7);
      }
    }
  }

  function eraseStrokeAt(x, y) {
    if (!note.strokes) return;
    const beforeCount = note.strokes.length;
    note.strokes = note.strokes.filter((stroke) => {
      return !stroke.some(pt => {
        const dx = pt.x - x;
        const dy = pt.y - y;
        return Math.sqrt(dx * dx + dy * dy) < eraseRadius;
      });
    });
    if (note.strokes.length !== beforeCount) {
      redrawAll();
    }
  }

  redrawAll();
}


function reDrawAll(ctx) {
    liveCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    ctx.save();
    ctx.translate(-viewportOffset.x, -viewportOffset.y);

    let drawCount = 0;

    // First pass: draw media groups (so they appear behind strokes)
    allGroups.forEach((group) => {
        if (!group?.bbox || group?.visibility == false || !intersect(group?.bbox, screenBox)) return;
        if (group.type === "media") {
            drawCount++;
            drawMediaGroup(ctx, group);
        }
    });

    // Second pass: draw all other groups
    allGroups.forEach((group) => {
        if (!group?.bbox || group?.visibility == false || !intersect(group?.bbox, screenBox)) return;
        if (group.type === "media") return; // Skip media, already drawn

        drawCount ++;

        const hasStroke = Array.isArray(group.stroke) && group.stroke.length > 0;

        if (group.type === "stickynote") {
            const { x, y, w, h } = group.bbox;
            ctx.save();

            ctx.strokeStyle = group.color || "#FFD700";
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 3]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);

            ctx.restore();
            return;
        } else if (group.type === "link") {
            const { x, y, w, h } = group.bbox;
            ctx.save();

            // --- Clickable dashed box (blue)
            ctx.strokeStyle = group.color || "#0077ff";
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 3]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);

            // --- Optional: draw small link icon
            ctx.font = "16px sans-serif";
            ctx.fillStyle = "#0077ff";
            ctx.fillText("🔗", x + w / 2 - 8, y + h / 2 + 6);

            ctx.restore();
            return;
        } else if (group.type === "tape") {
            // Render tape (flashcard cover)
            drawTapeGroup(ctx, group);
            return;
        }



        if (hasStroke) {
            if (group.type === "math_result") {
                // draw text instead of line
                // Debug: show that we detect the group
                console.log("Rendering math_result:", group.text);

                const baseBox = group.bbox;
                const text = group.text || "??";
                const textHeight = baseBox.h;
                const fontSize = Math.max(14, textHeight * 0.8);
                const textX = baseBox.x;
                const textY = baseBox.y+10;

                ctx.save();
                ctx.font = `300 ${fontSize}px Mali`;
                ctx.fillStyle = group.color || "red";
                ctx.textBaseline = "top";

                // ✅ Draw text to the right of the original group
                ctx.fillText(text, textX, textY);

                // Optional visual debug: show the bounding box
                // ctx.strokeStyle = "rgba(255,0,0,0.3)";
                // ctx.strokeRect(baseBox.x, baseBox.y, baseBox.w, baseBox.h);

                ctx.restore();
                // ctx.save();
                // ctx.font = `${group.bbox.h * 0.8}px Arial`;
                // ctx.fillStyle = group.color || "black";
                // ctx.textBaseline = "top";
                // ctx.fillText(group.text, group.bbox.x, group.bbox.y);
                // ctx.restore();
            } 
            else if (group.titleStatus) {
                const size  = group?.size ?? 3;
                drawStroke(drawCtx, group.stroke, group.color, size);
            } 
            else if (group.type === STROKE_TYPE.HIGHLIGHT) {
                console.log("highlight");
                drawHighlight(group.bbox, group.color);
            }
            else if ((group.predictedLabel != STROKE_TYPE.NONE || group.predictedLabel != STROKE_TYPE.MOVE)) {
                const size  = group?.size ?? 2;
                drawStroke(drawCtx, group.stroke, group.color, size);
            } 
        }
        else {
            if (group.shape == 0) {
                drawFinalLine(ctx, group.bbox, group.color, group.directX, group.directY);
            }
            else if (group.shape == 1) {
                drawFinalRectangle(ctx, group.bbox, group.color);
            } 
            else if (group.shape == 2) {
                drawFinalCircle(ctx, group.bbox, group.color);
            }
        }
    });

    // Third pass: draw media selection handles on top of everything
    if (selectedMedia) {
        allGroups.forEach((group) => {
            if (group.type === "media" && group.id === selectedMedia.id) {
                drawMediaSelection(ctx, group);
            }
        });
    }

    ctx.restore();
}

// Function to show toolbox at pointer position
function hideToolbox() {
    nav.classList.remove("show");
    nav.classList.remove("open");    
    nav.querySelectorAll(':scope > * span').forEach(span => span.remove());
    toggleBtn.classList.add("hidden"); // Optional: hide toggle icon
    toggleBtn.classList.remove("countdown");
    pointerDownForToolbox = false; 
}

function showToolbox(x, y, toolBox) {
    if (isClosingToolbox) return;

    const tools = toolboxLayout[toolBox];

    // Get the nav-content div
    const navContent = document.querySelector('#penTools .nav-content');

    // Only add spans if they don't already exist (e.g., no bx-trash)
    if (!navContent.querySelector('.bx-trash')) {
    tools.forEach((tool, index) => {
        const span = document.createElement('span');
        span.style = `--i:${index + 1};`;

        const a = document.createElement('a');
        a.href = '#';
        // Inner border with thickness based on pen size (0.4-30 → 1.5-11px, sqrt curve, capped at 11px)
        const borderThickness = Math.min(Math.sqrt(tool.size || 2) * 2.46, 11);
        // Use gradient for tape tool, solid color for others
        if (tool.id === "tape") {
            const presetData = CONFIG.TAPE.PRESETS.find(p => p.id === currentTapePreset) || CONFIG.TAPE.PRESETS[0];
            a.style = `background: linear-gradient(135deg, ${presetData.color1}, ${presetData.color2}); box-shadow: inset 0 0 0 ${borderThickness}px rgba(0, 0, 0, 0.35);`;
        } else {
            a.style = `background-color: ${tool.color || '#fff'}; box-shadow: inset 0 0 0 ${borderThickness}px rgba(0, 0, 0, 0.35);`;
        }

        const icon = document.createElement('i');
        icon.className = `bx ${TOOL_REGISTRY[tool.id]?.icon ?? ""}`;
        icon.setAttribute('data-label', tool.id);            // base tool ID
        icon.setAttribute('data-color', tool.color);
        icon.setAttribute('data-size', tool?.size ?? 0);
        icon.setAttribute('data-visibility', tool.visibility);
        icon.setAttribute('data-toolBox', toolBox);

        // Build DOM
        a.appendChild(icon);
        span.appendChild(a);
        navContent.appendChild(span);
    });
}


    toolLinks = nav.querySelectorAll("span a");

    // Reset position to CSS default before calculating to prevent drift
    nav.style.left = '';
    nav.style.top = '';

    // Get nav and toggle button sizes
    const navRect = nav.getBoundingClientRect();
    const toggleRect = toggleBtn.getBoundingClientRect();

    // Calculate center of toggle button relative to nav
    const toggleCenterX = toggleRect.left + toggleRect.width / 2 - navRect.left;
    const toggleCenterY = toggleRect.top + toggleRect.height / 2 - navRect.top;

    // Calculate desired position (center of toolbox at pointer)
    let posX = x - toggleCenterX;
    let posY = y - toggleCenterY;

    // Toolbox radius when open (90px translate + 25px half button size + padding)
    const toolboxRadius = 120;

    // Clamp position to keep toolbox within viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Ensure the toolbox center + radius stays within bounds
    const centerX = x;
    const centerY = y;

    // Calculate clamped center position
    const clampedCenterX = Math.max(toolboxRadius, Math.min(viewportWidth - toolboxRadius, centerX));
    const clampedCenterY = Math.max(toolboxRadius, Math.min(viewportHeight - toolboxRadius, centerY));

    // Adjust position based on clamped center
    posX = clampedCenterX - toggleCenterX;
    posY = clampedCenterY - toggleCenterY;

    nav.style.left = `${posX}px`;
    nav.style.top = `${posY}px`;

    nav.classList.add("show");
    nav.classList.add("open");
    toggleBtn.classList.remove("hidden");

    pointerDownForToolbox = true;
}
function extractImageData(inputStroke, imgSize = 136) {
  if (!inputStroke || inputStroke.length <= 0) {
    return -1;
  }

  const lineWidth = 3;
  const margin = lineWidth; // ✅ same as Python version

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = imgSize;
  tempCanvas.height = imgSize;
  const tempCtx = tempCanvas.getContext('2d');

  // --- Background ---
  tempCtx.fillStyle = 'white';
  tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

  // --- Stroke style ---
  tempCtx.strokeStyle = 'black';
  tempCtx.lineWidth = lineWidth;
  tempCtx.lineCap = 'round';
  tempCtx.lineJoin = 'round';

  // --- Bounding box ---
  const xs = inputStroke.map(p => p.x);
  const ys = inputStroke.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  // --- Scale using the same formula, just applying margin ---
  const scaleX = (imgSize - margin * 2) / (maxX - minX + 1e-5);
  const scaleY = (imgSize - margin * 2) / (maxY - minY + 1e-5);

  // --- Draw stroke ---
  tempCtx.beginPath();
  inputStroke.forEach((p, idx) => {
    const x = (p.x - minX) * scaleX + margin;
    const y = (p.y - minY) * scaleY + margin;
    if (idx === 0) tempCtx.moveTo(x, y);
    else tempCtx.lineTo(x, y);
  });
  tempCtx.stroke();

  return tempCanvas;
}

function hexToRgb(hex) {
  // Remove '#' if present
  hex = hex.replace(/^#/, '');

  // Support shorthand format (#f00 → #ff0000)
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }

  if (hex.length !== 6) return null;

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, 0.15)`;
}

function selectTitle(titleColor, visibility, level=0, size) {
    if (visibility == 'false') {
        const lastGroup = allGroups[allGroups.length - 1];
        console.log('lastGroup', lastGroup);
        if (lastGroup) lastGroup.visibility = false;
    } 
    const idToColorMap = {};
    modifiedGroups.modifiedGroups.forEach(group => {
      idToColorMap[group.id] = group.color;
    });
    modifiedGroups.modifiedGroups.forEach(group => {
        group.titleStatus = true;
        group.titleLevel = level;
        group.color = titleColor;
        group.size = size;
    });

    const change = {
      change: 'color',
      titleStatus: true,
      modifiedGroups: idToColorMap,
      groupToRemove: modifiedGroups.modifier,
    }
    pastGroups.push(change);
}

function selectHighlight(highlightColor){
    allGroups.pop();
    modifiedGroups.modifiedGroups.pop();
    highlightColor = hexToRgb(highlightColor);
  
    let bbox = getBoundingBox(modifiedGroups.modifiedGroups.flatMap(g => g.stroke));
    const horizontalPadding = bbox.h * 0.1; // Extra width
    const verticalPadding = bbox.h * 0.1; // Extra height
    const shiftUp = bbox.h * 0.025; // Shift highlight upwards by 10px (adjust as needed)

    // bbox.x += viewportOffset.x;
    // bbox.y += viewportOffset.y; // Adjust for viewport offset

    bbox.x -= horizontalPadding;
    bbox.y = bbox.y - verticalPadding - shiftUp;
    bbox.w += horizontalPadding * 2;
    bbox.h += ((verticalPadding+shiftUp)*2);

    //drawBox(bbox, "yellow", "highlighter");
    //drawBox(sliceBox, 'rgba(255, 0, 0, 0.5)', "test", false, backgroundCtx);

    newgroup = {
      id: idCount++, 
      stroke: [...modifiedGroups.modifiedGroups[0].stroke, ...modifiedGroups.modifiedGroups[modifiedGroups.modifiedGroups.length-1].stroke],
      bbox: bbox,
      color: highlightColor,
      predictedLabel: STROKE_TYPE.NONE,
      type: TOOL_ID.HIGHLIGHT,
      titleStatus: false,
    };
    //modifiedGroups.groupsToDraw.push(newgroup);
    allGroups.push(newgroup);
    const change = {
      change: 'normalStroke',
      modifiedGroups: newgroup.id,
    }
    pastGroups.push(change)
    //highlightGroups.push(newgroup);
}

// ═══════════════════════════════════════════════════════════════════════════
// MEDIA RENDERING (Images & PDFs)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Draw a media group (image or PDF) on the canvas
 */
function drawMediaGroup(ctx, group) {
  if (!group.visibility || group.type !== 'media') return;

  // Get cached image or trigger loading
  const img = mediaCache.get(group.id);
  if (!img || !img.complete) {
    // Image not loaded yet, trigger load
    loadMediaImage(group);
    return;
  }

  const { x, y, w, h } = group.bbox;

  ctx.save();
  ctx.globalAlpha = group.opacity !== undefined ? group.opacity : 1.0;

  // High quality smoothing for downscaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Apply rotation around center
  if (group.rotation && group.rotation !== 0) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((group.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  // Draw the image
  ctx.drawImage(img, x, y, w, h);

  ctx.restore();
}

/**
 * Draw selection border and handles for selected media (called separately to appear on top)
 */
function drawMediaSelection(ctx, group) {
  if (!selectedMedia || selectedMedia.id !== group.id) return;

  const { x, y, w, h } = group.bbox;

  ctx.save();

  // Draw selection border
  ctx.strokeStyle = '#007aff';
  ctx.lineWidth = 2 / scale;
  ctx.setLineDash([6 / scale, 4 / scale]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  // Draw resize handles at corners
  drawMediaHandles(ctx, group);

  ctx.restore();
}

/**
 * Draw resize handles for media group
 */
function drawMediaHandles(ctx, group) {
  const { x, y, w, h } = group.bbox;
  const handleSize = CONFIG.MEDIA.HANDLE_SIZE / scale;

  const corners = [
    { cx: x, cy: y },           // top-left
    { cx: x + w, cy: y },       // top-right
    { cx: x, cy: y + h },       // bottom-left
    { cx: x + w, cy: y + h }    // bottom-right
  ];

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#007aff';
  ctx.lineWidth = 1 / scale;

  for (const corner of corners) {
    const hx = corner.cx - handleSize / 2;
    const hy = corner.cy - handleSize / 2;
    ctx.fillRect(hx, hy, handleSize, handleSize);
    ctx.strokeRect(hx, hy, handleSize, handleSize);
  }
}


// ---------------- Mouse Events ----------------

// Click or drag image

