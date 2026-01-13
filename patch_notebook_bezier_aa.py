import nbformat
from nbformat.v4 import new_code_cell, new_markdown_cell
from pathlib import Path

notebook_path = Path("notebook_experiments") / "02_renderer exploration.ipynb"

# Read the notebook
with open(notebook_path, "r", encoding="utf-8") as f:
    nb = nbformat.read(f, as_version=4)

# Code for the new smoothing + AA renderer
render_func_code = """
def render_stroke_smooth_aa(
    stroke: list[dict],
    img_size: int = 136,
    line_width: int = 2,
    normalize: bool = False,
    scale_factor: int = 4
) -> np.ndarray:
    \"\"\"Render stroke with quadratic bezier smoothing AND supersampling anti-aliasing.\"\"\"
    if not stroke or len(stroke) < 2:
        return np.ones((img_size, img_size), dtype=np.uint8) * 255

    # Supersampling dimensions
    target_size = img_size
    super_size = img_size * scale_factor
    super_width = line_width * scale_factor
    
    # Create large white image
    img = Image.new("L", (super_size, super_size), color=255)
    draw = ImageDraw.Draw(img)
    
    # Determine margin (scaled)
    # Using slightly larger margin to ensure thick lines don't get clipped at edges if curves go out
    margin = super_width
    draw_size = super_size - 2 * margin
    
    # Normalize input points if needed, or assume raw dictionaries
    if normalize:
        xs = [pt["x"] for pt in stroke]
        ys = [pt["y"] for pt in stroke]
        if not xs: return np.ones((img_size, img_size), dtype=np.uint8) * 255
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        w = max(max_x - min_x, 1e-6)
        h = max(max_y - min_y, 1e-6)
        pts = []
        for p in stroke:
            pts.append(((p["x"] - min_x) / w, (p["y"] - min_y) / h))
    else:
        # Clip to [0,1] assuming input is already somewhat normalized or raw needing clip
        # Based on previous cells, input seems to be dictionaries with 'x','y'
        # The previous 'render_stroke_smooth' handled raw inputs by clipping.
        xs = np.clip([pt["x"] for pt in stroke], 0, 1)
        ys = np.clip([pt["y"] for pt in stroke], 0, 1)
        pts = list(zip(xs, ys))
            
    # Scale points to the supersampled canvas
    scaled_pts = [(margin + p[0] * draw_size, margin + p[1] * draw_size) for p in pts]
    
    # helper to get quadratic bezier points
    def get_quad_points(p0, p1, p2, steps=20):
        points = []
        # Increase steps based on scale factor to ensure smoothness at high res
        for t in np.linspace(0, 1, steps):
            x = (1-t)**2 * p0[0] + 2*(1-t)*t * p1[0] + t**2 * p2[0]
            y = (1-t)**2 * p0[1] + 2*(1-t)*t * p1[1] + t**2 * p2[1]
            points.append((x, y))
        return points

    if len(scaled_pts) < 3:
        # Not enough points for curves, just draw lines
        draw.line(scaled_pts, fill=0, width=super_width)
    else:
        # Build the full smoothed path
        full_path = [scaled_pts[0]]
        
        for i in range(1, len(scaled_pts) - 1):
            control = scaled_pts[i]
            next_pt = scaled_pts[i+1]
            
            # Midpoint is the end of the current quadratic curve
            end_x = (control[0] + next_pt[0]) / 2
            end_y = (control[1] + next_pt[1]) / 2
            end = (end_x, end_y)
            
            # Start of curve
            if i == 1:
                start = scaled_pts[0]
            else:
                prev_control = scaled_pts[i-1]
                start_x = (prev_control[0] + control[0]) / 2
                start_y = (prev_control[1] + control[1]) / 2
                start = (start_x, start_y)
                
            # Generate curve points
            # Scale steps by scale_factor for high resolution smoothness
            steps = max(10, int(10 * scale_factor)) 
            curve = get_quad_points(start, control, end, steps=steps)
            full_path.extend(curve)
            
        # Connect to the last point
        full_path.append(scaled_pts[-1])
        
        # Draw the smooth path
        draw.line(full_path, fill=0, width=super_width)
    
    # Downscale using LANCZOS for anti-aliasing
    if scale_factor > 1:
        import PIL
        resample_method = getattr(PIL.Image.Resampling, "LANCZOS", getattr(PIL.Image, "LANCZOS", PIL.Image.BICUBIC))
        img = img.resize((target_size, target_size), resample=resample_method)
        
    return np.array(img)
"""

# Comparison Visualization Code
viz_code = """
# Interactive Comparison of 4 Rendering States
# 1. Standard (Aliased) - Current Training
# 2. Anti-aliased (Straight) - Current Training + AA
# 3. Smoothed (Bezier) - Current Notebook Smooth
# 4. Smoothed + AA (Bezier + AA) - Proposed

import random

# Use a fixed sample for consistent comparison if needed, or random
sample_idx = random.randint(0, len(raw_data)-1)
sample = raw_data[sample_idx]
print(f"Visualizing Sample Index: {sample_idx}, Type: {sample['type']}")

stroke = sample['stroke']
img_sz = 200 # Larger size for better visualization
lw = 3

# 1. Standard (Aliased)
# Note: StrokeRenderer uses normalize_pixels=True by default which expects raw input and output [0,1] float
# But render_stroke_to_image returns [0,255] uint8. Let's use the function directly for raw comparison.
# 'render_stroke_to_image' as defined in notebook cell 5 (aliased)
img_std = render_stroke_to_image(stroke, img_size=img_sz, line_width=lw)

# 2. Anti-aliased (Straight Lines)
# Initialize renderer with AA enabled
renderer_aa = StrokeRenderer(img_size=img_sz, line_width=lw, antialiasing=True, scale_factor=4, normalize_pixels=False)
# We need to manually normalize for StrokeRenderer.render if passing raw dicts? 
# Wait, StrokeRenderer.render calls render_stroke_to_image. 
# In renderer.py, render_stroke_to_image takes stroke list.
# Let's trust the imported StrokeRenderer works with raw strokes if we pass them correctly.
# Ideally we use the class method .render(stroke)
# NOTE: The notebook imported StrokeRenderer in cell 2.
img_aa = renderer_aa.render(stroke) 
# If render returns float [0,1], convert to uint8 for display consistency if needed, 
# but imshow handles floats fine.

# 3. Smoothed (Bezier, Aliased)
# Defined in cell 7
img_smooth = render_stroke_smooth(stroke, img_size=img_sz, line_width=lw, normalize=False)

# 4. Smoothed + AA (Bezier + AA)
img_smooth_aa = render_stroke_smooth_aa(stroke, img_size=img_sz, line_width=lw, normalize=False, scale_factor=4)

# Plotting
fig, axes = plt.subplots(1, 4, figsize=(20, 6))

axes[0].imshow(img_std, cmap='gray', vmin=0, vmax=255)
axes[0].set_title("1. Standard (Aliased)\\n(Current Training)")

axes[1].imshow(img_aa, cmap='gray') # Might be float [0,1] or uint8 [0,255]
axes[1].set_title("2. Anti-aliased (Straight)\\n(Config: AA=True)")

axes[2].imshow(img_smooth, cmap='gray', vmin=0, vmax=255)
axes[2].set_title("3. Smoothed (Bezier)\\n(Notebook Impl)")

axes[3].imshow(img_smooth_aa, cmap='gray', vmin=0, vmax=255)
axes[3].set_title("4. Smooth + AA\\n(Proposed)")

for ax in axes:
    ax.axis('off')

plt.tight_layout()
plt.show()
"""

# Add cells
nb.cells.append(new_markdown_cell("# Smoothing + Anti-aliasing Investigation\nImplementing a renderer that combines Quadratic Bezier smoothing with Supersampling Anti-aliasing."))
nb.cells.append(new_code_cell(render_func_code))
nb.cells.append(new_code_cell(viz_code))

# Write back
with open(notebook_path, "w", encoding="utf-8") as f:
    nbformat.write(nb, f)

print(f"Successfully patched notebook: {notebook_path}")
