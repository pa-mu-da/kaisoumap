class Renderer {
    constructor(canvas, graph) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.graph = graph;

        this.TILE_SIZE = 100; // Grid Unit Size
        this.scale = 1.0;

        this.offsetX = canvas.width / 2;
        this.offsetY = 100;

        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // Map<level, 'visible' | 'transparent' | 'hidden'>
        this.levelVisibility = new Map();

        // Grid visibility set
        this.visibleGridLevels = new Set();

        this.levelVisibility.set(0, 'visible');
        this.visibleGridLevels.add(0);

        // Visual Customization Properties
        this.levelScale = 200; // Distance between levels
        this.backgroundColor = '#1e1e1e'; // Default background
        this.gridColors = new Map(); // level -> hex color

        this.renderOptions = { drawGrid: true, drawLabels: true };

        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('wheel', this.onWheel.bind(this));
        this.canvas.addEventListener('dblclick', this.onDoubleClick.bind(this));

        this.render = this.render.bind(this);
        requestAnimationFrame(this.render);
    }

    project(x, y, z) {
        const isoX = (x - y) * this.scale;
        const isoY = ((x + y) / 2) * this.scale + (z * this.levelScale * this.scale);

        return {
            x: isoX + this.offsetX,
            y: isoY + this.offsetY
        };
    }

    unproject(screenX, screenY, z) {
        const isoX = screenX - this.offsetX;
        const isoY = screenY - this.offsetY;
        const zOffset = z * this.levelScale * this.scale;
        const isoY_base = isoY - zOffset;

        // isoX = (x - y) * scale
        // isoY_base = ((x + y) / 2) * scale
        // x - y = isoX / scale
        // x + y = 2 * isoY_base / scale

        const s = this.scale;
        const A = isoX / s;
        const B = 2 * isoY_base / s;

        const x = (A + B) / 2;
        const y = (B - A) / 2;

        return { x: x / this.TILE_SIZE, y: y / this.TILE_SIZE };
    }

    render() {
        try {
            // this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            // Draw background
            this.ctx.fillStyle = this.backgroundColor;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            this._drawScene();
        } catch (e) {
            console.error(e);
        }
        requestAnimationFrame(this.render);
    }

    /**
     * Renders the scene to a specific context with specific transform.
     * Swaps the internal state temporarily to reuse existing draw methods.
     */
    renderToContext(ctx, width, height, scale, offsetX, offsetY, bgColor = null, transparent = true, options = {}) {
        const originalCtx = this.ctx;
        const originalScale = this.scale;
        const originalOffsetX = this.offsetX;
        const originalOffsetY = this.offsetY;
        const originalOptions = this.renderOptions;

        try {
            this.ctx = ctx;
            this.scale = scale;
            this.offsetX = offsetX;
            this.offsetY = offsetY;
            this.renderOptions = { ...originalOptions, ...options };

            // Handle Background
            ctx.clearRect(0, 0, width, height);
            if (!transparent && bgColor) {
                ctx.fillStyle = bgColor;
                ctx.fillRect(0, 0, width, height);
            }

            this._drawScene();

        } finally {
            this.ctx = originalCtx;
            this.scale = originalScale;
            this.offsetX = originalOffsetX;
            this.offsetY = originalOffsetY;
            this.renderOptions = originalOptions;
        }
    }

    _drawScene() {
        // Draw Grids (Tiles)
        if (this.renderOptions.drawGrid !== false) {
            this.drawAllGrids();
        }

        const nodes = this.graph.getNodes();
        const edges = this.graph.getEdges();

        // Sort nodes for Z-buffer (Draw higher levels first so lower levels [0] are on top)
        const sortedNodes = [...nodes].sort((a, b) => {
            if (a.level !== b.level) return b.level - a.level;
            return (a.gridX + a.gridY) - (b.gridX + b.gridY);
        });

        edges.forEach(edge => this.drawEdge(edge));
        sortedNodes.forEach(node => this.drawNode(node));
    }

    getContentBounds() {
        const nodes = this.graph.getNodes();
        if (nodes.length === 0) return { minX: -500, maxX: 500, minY: -500, maxY: 500 }; // Default

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

        // Iterate nodes including their width/height
        nodes.forEach(n => {
            const x = n.gridX * this.TILE_SIZE;
            const y = n.gridY * this.TILE_SIZE;
            const w = (n.gridW || 1) * this.TILE_SIZE;
            const h = (n.gridH || 1) * this.TILE_SIZE;

            // For bounding box, we need the projected 2D coordinates of all corners?
            // Actually, we want to fit the "Iso view" into the rectangle.
            // So we need to project 4 corners of the node volume at its level.

            // Simplification: Just check the 4 corners of the base at current level.
            // Z-height (level) shifts Y. 
            // We need to look at projected coordinates.

            const corners = [
                this.project(x, y, n.level),
                this.project(x + w, y, n.level),
                this.project(x + w, y + h, n.level),
                this.project(x, y + h, n.level)
            ];

            corners.forEach(p => {
                // Determine bounding box in SCREEN space relative to CURRENT offset?
                // No, we want "World" bounds relative to offset (0,0).

                // project() adds this.offsetX, this.offsetY.
                // We should subtract them to get "Relative" position.
                const relX = p.x - this.offsetX;
                const relY = p.y - this.offsetY;

                if (relX < minX) minX = relX;
                if (relX > maxX) maxX = relX;
                if (relY < minY) minY = relY;
                if (relY > maxY) maxY = relY;
            });
        });

        // Add some padding
        const padding = 100 * this.scale;
        return {
            minX: minX - padding,
            maxX: maxX + padding,
            minY: minY - padding,
            maxY: maxY + padding,
            width: (maxX - minX) + padding * 2,
            height: (maxY - minY) + padding * 2
        };
    }


    drawAllGrids() {
        // Collect all levels involved (from nodes, visibility map, or grid set)
        const nodes = this.graph.getNodes();
        const levels = new Set(nodes.map(n => n.level));
        this.levelVisibility.forEach((val, key) => levels.add(key));
        this.visibleGridLevels.forEach(key => levels.add(key));

        // Sort descending (higher first -> lower last/top)
        const sortedLevels = Array.from(levels).sort((a, b) => b - a);

        sortedLevels.forEach(level => {
            this.drawGridForLevel(level);
        });
    }

    drawGridForLevel(level) {
        // Grid visibility is now independent
        if (!this.visibleGridLevels.has(level)) return;

        // Draw solid tiles for the active area
        const nodes = this.graph.getNodes();
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

        // Expand bounds based on nodes
        if (nodes.length > 0) {
            const xs = nodes.map(n => n.gridX);
            const ys = nodes.map(n => n.gridY);

            const contentMinX = Math.min(...xs);
            const contentMaxX = Math.max(...xs);
            const contentMinY = Math.min(...ys);
            const contentMaxY = Math.max(...ys);

            minX = Math.min(minX, contentMinX);
            maxX = Math.max(maxX, contentMaxX);
            minY = Math.min(minY, contentMinY);
            maxY = Math.max(maxY, contentMaxY);
        }

        // Expand bounds based on Viewport (Visible Area)
        const corners = [
            { x: 0, y: 0 },
            { x: this.canvas.width, y: 0 },
            { x: this.canvas.width, y: this.canvas.height },
            { x: 0, y: this.canvas.height }
        ];

        let vMinX = Infinity, vMaxX = -Infinity, vMinY = Infinity, vMaxY = -Infinity;
        corners.forEach(p => {
            const pt = this.unproject(p.x, p.y, level);
            if (pt.x < vMinX) vMinX = pt.x;
            if (pt.x > vMaxX) vMaxX = pt.x;
            if (pt.y < vMinY) vMinY = pt.y;
            if (pt.y > vMaxY) vMaxY = pt.y;
        });

        // Add padding to viewport bounds to avoid edge artifacts
        vMinX = Math.floor(vMinX) - 1;
        vMaxX = Math.ceil(vMaxX) + 1;
        vMinY = Math.floor(vMinY) - 1;
        vMaxY = Math.ceil(vMaxY) + 1;

        // If no nodes, initialize with viewport
        if (minX === Infinity) {
            minX = vMinX; maxX = vMaxX; minY = vMinY; maxY = vMaxY;
        } else {
            // Union
            minX = Math.min(minX, vMinX);
            maxX = Math.max(maxX, vMaxX);
            minY = Math.min(minY, vMinY);
            maxY = Math.max(maxY, vMaxY);
        }

        // Add margin for node editing comfort
        minX -= 2; maxX += 2; minY -= 2; maxY += 2;

        this.ctx.save();

        for (let gx = minX; gx <= maxX; gx++) {
            for (let gy = minY; gy <= maxY; gy++) {
                this.drawTile(gx, gy, level);
            }
        }

        // Label
        const labelPos = this.project(minX * this.TILE_SIZE, minY * this.TILE_SIZE, level);
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        this.ctx.font = '16px Inter, sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Level ${level}`, labelPos.x, labelPos.y - 10);

        this.ctx.restore();
    }

    drawTile(gx, gy, level) {
        const x = gx * this.TILE_SIZE;
        const y = gy * this.TILE_SIZE;
        const s = this.TILE_SIZE;

        const p1 = this.project(x, y, level);
        const p2 = this.project(x + s, y, level);
        const p3 = this.project(x + s, y + s, level);
        const p4 = this.project(x, y + s, level);

        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.lineTo(p3.x, p3.y);
        this.ctx.lineTo(p4.x, p4.y);
        this.ctx.closePath();

        const isChecker = (gx + gy) % 2 === 0;
        const customColor = this.gridColors.get(level);

        if (customColor) {
            const alpha = isChecker ? 0.1 : 0.2;
            this.ctx.fillStyle = this.hexToRgba(customColor, alpha);
            this.ctx.strokeStyle = this.hexToRgba(customColor, 0.3);
        } else {
            this.ctx.fillStyle = isChecker ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.06)';
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        }

        this.ctx.fill();
        this.ctx.stroke();
    }

    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    drawEdge(edge) {
        const source = this.graph.getNode(edge.sourceId);
        const target = this.graph.getNode(edge.targetId);
        if (!source || !target) return;

        const srcVis = this.levelVisibility.get(source.level) || 'visible';
        const tgtVis = this.levelVisibility.get(target.level) || 'visible';

        if (srcVis === 'hidden' || tgtVis === 'hidden') return;

        this.ctx.save();
        if (srcVis === 'transparent' || tgtVis === 'transparent') {
            this.ctx.globalAlpha = 0.25;
        }

        const sx = (source.gridX * this.TILE_SIZE) + (source.gridW * this.TILE_SIZE) / 2;
        const sy = (source.gridY * this.TILE_SIZE) + (source.gridH * this.TILE_SIZE) / 2;

        const tx = (target.gridX * this.TILE_SIZE) + (target.gridW * this.TILE_SIZE) / 2;
        const ty = (target.gridY * this.TILE_SIZE) + (target.gridH * this.TILE_SIZE) / 2;

        const p1 = this.project(sx, sy, source.level);
        const p2 = this.project(tx, ty, target.level);

        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);

        this.ctx.strokeStyle = edge.style.color;
        this.ctx.lineWidth = edge.style.width;

        const lineType = edge.style.type || 'solid';
        if (lineType === 'dashed') {
            this.ctx.setLineDash([10 * this.scale, 8 * this.scale]);
        } else if (lineType === 'dotted') {
            this.ctx.setLineDash([3 * this.scale, 5 * this.scale]);
        } else if (lineType === 'chain') {
            this.ctx.setLineDash([15 * this.scale, 5 * this.scale, 3 * this.scale, 5 * this.scale]);
        } else {
            this.ctx.setLineDash([]);
        }

        if (lineType === 'wavy') {
            this.drawWavyLine(p1, p2, edge.style.width, this.scale);
        } else {
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    drawWavyLine(p1, p2, width, scale) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);

        const frequency = 0.4 * scale;
        const amplitude = 5 * scale;
        const steps = Math.ceil(dist / 2);

        this.ctx.beginPath();
        for (let i = 0; i <= dist; i += 2) {
            const t = i / dist;
            // Sine wave offset perpendicular to line
            const forwardX = p1.x + dx * t;
            const forwardY = p1.y + dy * t;

            const sine = Math.sin(i * frequency) * amplitude;

            // Perpendicular vector (-dy, dx) normalized is (-Math.sin(angle), Math.cos(angle))?
            // Or just use rotation.
            const offsetX = -Math.sin(angle) * sine;
            const offsetY = Math.cos(angle) * sine;

            if (i === 0) this.ctx.moveTo(forwardX + offsetX, forwardY + offsetY);
            else this.ctx.lineTo(forwardX + offsetX, forwardY + offsetY);
        }
        this.ctx.stroke();
    }

    drawNode(node) {
        const visibility = this.levelVisibility.get(node.level) || 'visible';
        if (visibility === 'hidden') return;

        const gx = node.gridX;
        const gy = node.gridY;
        const gw = node.gridW || 1;
        const gh = node.gridH || 1;

        const x = gx * this.TILE_SIZE;
        const y = gy * this.TILE_SIZE;
        const w = gw * this.TILE_SIZE;
        const h = gh * this.TILE_SIZE;

        const p1 = this.project(x, y, node.level);
        const p2 = this.project(x + w, y, node.level);
        const p3 = this.project(x + w, y + h, node.level);
        const p4 = this.project(x, y + h, node.level);

        this.ctx.save();

        // Connect Mode Highlight
        if (node.id === this.connectSourceId) {
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = '#00aaff';
            this.ctx.strokeStyle = '#00aaff';
            this.ctx.lineWidth = 2;
        }

        if (visibility === 'transparent') {
            this.ctx.globalAlpha = 0.25;
        }

        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.lineTo(p3.x, p3.y);
        this.ctx.lineTo(p4.x, p4.y);
        this.ctx.closePath();

        this.ctx.fillStyle = node.style.fillColor;
        this.ctx.fill();

        if (node.style.patternType && node.style.patternType !== 'none') {
            this.drawPattern(node, [p1, p2, p3, p4]);
        }

        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.lineTo(p3.x, p3.y);
        this.ctx.lineTo(p4.x, p4.y);
        this.ctx.closePath();

        this.ctx.strokeStyle = node.style.borderColor;
        this.ctx.lineWidth = node.style.borderWidth;
        this.ctx.stroke();

        const center = this.project(x + w / 2, y + h / 2, node.level);

        if (this.renderOptions.drawLabels !== false) {
            this.drawText(node, center.x, center.y);
        }

        this.ctx.restore();
    }

    drawPattern(node, corners) {
        this.ctx.save();
        this.ctx.clip(); // Clip to the node polygon

        this.ctx.strokeStyle = node.style.patternColor;
        this.ctx.lineWidth = 1;

        const p0 = corners[0];
        const p1 = corners[1];
        const p2 = corners[2];
        const p3 = corners[3];

        if (node.style.patternType === 'stripes') {
            const steps = 8 * (node.gridW || 1);
            for (let i = 1; i < steps; i++) {
                const t = i / steps;
                const sx = p3.x + (p2.x - p3.x) * t;
                const sy = p3.y + (p2.y - p3.y) * t;
                const ex = p0.x + (p1.x - p0.x) * t;
                const ey = p0.y + (p1.y - p0.y) * t;
                this.ctx.beginPath(); this.ctx.moveTo(sx, sy); this.ctx.lineTo(ex, ey); this.ctx.stroke();
            }
        }
        else if (node.style.patternType === 'grid') {
            const steps = 4 * (node.gridW || 1);
            for (let i = 1; i < steps; i++) {
                const t = i / steps;
                const sx = p3.x + (p2.x - p3.x) * t;
                const sy = p3.y + (p2.y - p3.y) * t;
                const ex = p0.x + (p1.x - p0.x) * t;
                const ey = p0.y + (p1.y - p0.y) * t;
                this.ctx.beginPath(); this.ctx.moveTo(sx, sy); this.ctx.lineTo(ex, ey); this.ctx.stroke();
            }
            for (let i = 1; i < steps; i++) {
                const t = i / steps;
                const sx = p3.x + (p0.x - p3.x) * t;
                const sy = p3.y + (p0.y - p3.y) * t;
                const ex = p2.x + (p1.x - p2.x) * t;
                const ey = p2.y + (p1.y - p2.y) * t;
                this.ctx.beginPath(); this.ctx.moveTo(sx, sy); this.ctx.lineTo(ex, ey); this.ctx.stroke();
            }
        }
        else if (node.style.patternType === 'dots') {
            const steps = 8 * (node.gridW || 1);
            this.ctx.fillStyle = node.style.patternColor;

            // Vectors from p0 (Top)
            const v1x = p1.x - p0.x; // Top -> Right
            const v1y = p1.y - p0.y;
            const v2x = p3.x - p0.x; // Top -> Left
            const v2y = p3.y - p0.y;

            for (let i = 1; i < steps; i++) {
                for (let j = 1; j < steps; j++) {
                    const ti = i / steps; // Along v1 (Right)
                    const tj = j / steps; // Along v2 (Left)

                    const px = p0.x + v1x * ti + v2x * tj;
                    const py = p0.y + v1y * ti + v2y * tj;

                    this.ctx.beginPath();
                    this.ctx.arc(px, py, 3.0 * this.scale, 0, Math.PI * 2);
                    this.ctx.fill();
                }
            }
        }
        else if (node.style.patternType === 'gradient') {
            // Gradient from Top-Left (p0) to Bottom-Right (p2)
            const grad = this.ctx.createLinearGradient(p0.x, p0.y, p2.x, p2.y);
            grad.addColorStop(0, node.style.fillColor);
            grad.addColorStop(1, node.style.patternColor);

            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.moveTo(p0.x, p0.y);
            this.ctx.lineTo(p1.x, p1.y);
            this.ctx.lineTo(p2.x, p2.y);
            this.ctx.lineTo(p3.x, p3.y);
            this.ctx.fill();
        }

        this.ctx.restore();
    }

    drawText(node, x, y) {
        if (!node.label) return;

        this.ctx.font = '14px Inter, sans-serif';
        const metrics = this.ctx.measureText(node.label);
        const w = metrics.width + 16;
        const h = 24;

        const bx = x - w / 2;
        const by = y - 30;

        if (node.style.textBgColor !== 'transparent') {
            this.ctx.fillStyle = node.style.textBgColor;
            this.ctx.strokeStyle = node.style.textBorderColor;
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.roundRect(bx, by, w, h, 4);
            this.ctx.fill();
            if (node.style.textBorderColor && node.style.textBorderColor !== 'transparent') {
                this.ctx.stroke();
            }
        }

        this.ctx.fillStyle = node.style.textColor;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(node.label, x, y - 18); // Centered in the box (y-30 + 24/2)

        this.ctx.restore();
    }

    setConnectSourceId(id) {
        this.connectSourceId = id;
    }

    setLayerVisibility(level, state) {
        this.levelVisibility.set(level, state);
    }

    toggleGrid(level, isVisible) {
        if (isVisible) {
            this.visibleGridLevels.add(level);
        } else {
            this.visibleGridLevels.delete(level);
        }
    }

    onMouseDown(e) {
        let clicked = null;

        if (e.button === 1 || e.button === 2) {
            this.isDragging = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        }
        else if (e.button === 0) {
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const nodes = this.graph.getNodes();
            // Sort by Z (draw order) reversed -> Front first (Descending Level)
            const reverseNodes = [...nodes].sort((a, b) => {
                if (a.level !== b.level) return a.level - b.level; // Ascending = Top (Level 0) First
                return (b.gridX + b.gridY) - (a.gridX + a.gridY);
            });


            for (let n of reverseNodes) {
                const visibility = this.levelVisibility.get(n.level) || 'visible';
                if (visibility === 'hidden') continue;

                // Approximate center
                const cx = (n.gridX + (n.gridW || 1) / 2) * this.TILE_SIZE;
                const cy = (n.gridY + (n.gridH || 1) / 2) * this.TILE_SIZE;
                const center = this.project(cx, cy, n.level);

                // Hit Area based on size
                const size = Math.max(n.gridW || 1, n.gridH || 1);
                // Scale radius by projected scale * size
                const hitRadius = (this.TILE_SIZE * size / 2) * this.scale * 1.2;

                if (Math.hypot(center.x - mouseX, center.y - mouseY) < hitRadius) {
                    clicked = n;
                    break;
                }
            }

        }

        const event = new CustomEvent('node-selected', { detail: { node: clicked } });
        window.dispatchEvent(event);

        if (!clicked) {
            // Check for edges
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const edge = this.getEdgeAt(mouseX, mouseY);
            if (edge) {
                const edgeEvent = new CustomEvent('edge-selected', { detail: { edge: edge } });
                window.dispatchEvent(edgeEvent);
            } else {
                // Clear edge selection if nothing clicked
                const edgeEvent = new CustomEvent('edge-selected', { detail: { edge: null } });
                window.dispatchEvent(edgeEvent);
            }
        }
    }



    onDoubleClick(e) {
        if (e.button !== 0) return;

        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Check for edge clicks
        const edge = this.getEdgeAt(mouseX, mouseY);
        if (edge) {
            const event = new CustomEvent('edge-dblclick', { detail: { edge: edge } });
            window.dispatchEvent(event);
        }
    }


    getEdgeAt(x, y) {
        const edges = this.graph.getEdges();
        for (let edge of edges) {
            const source = this.graph.getNode(edge.sourceId);
            const target = this.graph.getNode(edge.targetId);
            if (!source || !target) continue;

            const visS = this.levelVisibility.get(source.level) || 'visible';
            const visT = this.levelVisibility.get(target.level) || 'visible';
            if (visS === 'hidden' || visT === 'hidden') continue;

            const sx = (source.gridX + source.gridW / 2) * this.TILE_SIZE;
            const sy = (source.gridY + source.gridH / 2) * this.TILE_SIZE;
            const tx = (target.gridX + target.gridW / 2) * this.TILE_SIZE;
            const ty = (target.gridY + target.gridH / 2) * this.TILE_SIZE;

            const p1 = this.project(sx, sy, source.level);
            const p2 = this.project(tx, ty, target.level);

            const dist = this.distanceToSegment({ x, y }, p1, p2);
            if (dist < 10) { // Hit determination threshold
                return edge;
            }
        }
        return null;
    }

    distanceToSegment(p, v, w) {
        const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
        if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        const projX = v.x + t * (w.x - v.x);
        const projY = v.y + t * (w.y - v.y);
        return Math.hypot(p.x - projX, p.y - projY);
    }

    onMouseMove(e) {
        if (this.isDragging) {
            const dx = e.clientX - this.lastMouseX;
            const dy = e.clientY - this.lastMouseY;
            this.offsetX += dx;
            this.offsetY += dy;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        }
    }

    onMouseUp(e) { this.isDragging = false; }
    onWheel(e) {
        e.preventDefault();
        const zoom = e.deltaY < 0 ? 1.1 : 0.9;
        this.scale *= zoom;
    }
}
