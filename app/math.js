/**
 * Detects math from an image and solves it using your Flask backend.
 *
 * @param {File|Blob} imageFile - The image file to process (from input or canvas blob).
 * @param {string} [serverUrl="http://127.0.0.1:8000/predict"] - Flask backend endpoint.
 * @returns {Promise<{latex: string, result: string, success: boolean}>}
 */
async function detectAndSolveMath(imageFile, serverUrl = "http://127.0.0.1:8000/predict") {
  if (!imageFile) {
    console.error("No image provided.");
    return { latex: "", result: "No image provided", success: false };
  }

  try {
    const formData = new FormData();
    formData.append("image", imageFile);

    const response = await fetch(serverUrl, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Server error:", data);
      return {
        latex: "",
        result: data.error || "Server returned error",
        success: false,
      };
    }

    return {
      latex: data.latex || "",
      result: data.result || "",
      success: true,
    };
  } catch (err) {
    console.error("Network or processing error:", err);
    return { latex: "", result: err.message, success: false };
  }
}

/**
 * Render strokes into a canvas without connecting separate pen paths.
 * Supports both multi-stroke arrays and a single long stroke list.
 * Automatically splits disconnected points by distance threshold.
 */
function extractImageDataFromStrokes(
  groups,
  { padding = 40, lineWidth = 3, strokeStyle = "black", debug = false } = {}
) {
  if (!groups || groups.length === 0) return -1;

  // Collect all points across all strokes to compute bounding box
  const allX = [], allY = [];
  for (const g of groups) {
    if (!g.stroke || g.stroke.length === 0) continue;
    for (const p of g.stroke) {
      allX.push(p.x);
      allY.push(p.y);
    }
  }

  if (allX.length === 0 || allY.length === 0) return -1;

  const minX = Math.min(...allX), maxX = Math.max(...allX);
  const minY = Math.min(...allY), maxY = Math.max(...allY);
  const width = (maxX - minX) + padding * 2;
  const height = (maxY - minY) + padding * 2;

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = lineWidth;

  // Draw each group.stroke separately
  for (let i = 0; i < groups.length; i++) {
    const stroke = groups[i].stroke;
    if (!stroke || stroke.length < 2) continue;

    ctx.beginPath();
    ctx.strokeStyle = debug ? `hsl(${(i * 55) % 360}, 80%, 40%)` : strokeStyle;

    for (let j = 0; j < stroke.length; j++) {
      const x = stroke[j].x - minX + padding;
      const y = stroke[j].y - minY + padding;
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  return canvas;
}

function downloadCanvasImage(canvas, filename = "strokes.png") {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png"); // converts to base64 PNG
  link.click();
}

function createMathResultGroup(originalGroup, resultText) {
  if (!originalGroup) return null;

  const baseBox =  bbox = getBoundingBox(originalGroup.flatMap(g => g.stroke));

  // --- Compute position ---d
  const textHeight = baseBox.h;              // match height of math bbox
  const padding = 10;                        // gap between equation and result
  const textWidth = textHeight * 0.8 * resultText.length * 0.5; // approximate width by char count

  const newBBox = {
    x: baseBox.x + baseBox.w + padding,      // place to the right
    y: baseBox.y,                            // same vertical alignment
    w: textWidth,
    h: textHeight,
  };

  //drawBox(bbox, "yellow", "test", false, backgroundCtx);

  // --- Fake stroke data (just a placeholder) ---
  // It can be a small dot so your hasStroke = true check passes
  const fakeStroke = [
    { x: newBBox.x + newBBox.w / 2, y: newBBox.y + newBBox.h / 2 },
  ];

  // --- Create group ---
  const resultGroup = {
    id: 100,              // unique id
    stroke: fakeStroke,          // fake stroke to pass the check
    bbox: newBBox,               // for erase detection
    color: defaultPenColor,      // default text color
    predictedLabel: -1,         // special label so you can detect it's math text
    visibility: true,              // not a shape
    type: "math_result",         // new property for identification
    text: resultText,            // the actual math text
  };

  return resultGroup;
}
