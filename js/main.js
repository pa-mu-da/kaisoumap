document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('map-canvas');

    // Resize canvas
    function resize() {
        if (canvas.style.width) return;
        const container = document.getElementById('canvas-container');
        if (container) {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
        }
    }
    window.addEventListener('resize', resize);
    resize();

    // UI Enhancements
    // 1. Drag Hint Dismissal
    const hint = document.getElementById('drag-hint');
    if (hint) {
        hint.addEventListener('click', () => {
            hint.style.display = 'none';
        });
        // Also hide on first drag? 
        // Maybe better to let user click it to dismiss so they definitely saw it.
        // Let's stick to click-to-dismiss as requested.
    }

    // 2. Disable Context Menu on Canvas
    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    });

    // Initialize Systems (Globals expected)
    const graph = new Graph();
    const layoutEngine = new LayoutEngine(graph);
    const renderer = new Renderer(canvas, graph);
    new UIManager(graph, renderer);

    // Initial Data
    // Initial Data
    // Level 0: Main Floor
    const mainHall = graph.addNode({ label: 'メインホール', style: { fillColor: '#4a90e2' } });
    const reception = graph.addNode({ parentId: mainHall.id, label: '応接室' });
    const dining = graph.addNode({ parentId: mainHall.id, label: '食堂' });

    // Kitchen Chain
    const kitchen = graph.addNode({ parentId: dining.id, label: '厨房' });
    const pantry = graph.addNode({ parentId: kitchen.id, label: 'パントリー' });
    const wine = graph.addNode({ parentId: pantry.id, label: 'ワイン保管庫' });

    // Level 1: Guest Floor (Connected from Main Hall)
    const guestHall = graph.addNode({
        parentId: mainHall.id,
        label: '客室ホール',
        level: 1, // Explicitly set level for clarity, though LayoutEngine might override if strict tree
        style: { fillColor: '#4a90e2', patternType: 'grid' }
    });

    const roomA = graph.addNode({ parentId: guestHall.id, label: '客室A' });
    const roomB = graph.addNode({ parentId: guestHall.id, label: '客室B' });
    const roomC = graph.addNode({ parentId: guestHall.id, label: '客室C' });

    // Update Edges for specific styles
    // Guest Rooms -> Dashed
    [roomA, roomB, roomC].forEach(room => {
        graph.updateEdgeStyle(guestHall.id, room.id, { type: 'dashed' });
    });
    // Pantry chain -> Dotted (Looks dotted/small in screenshot for some path? 
    // Actually screenshot shows dotted for Kitchen->Pantry->Wine)
    graph.updateEdgeStyle(kitchen.id, pantry.id, { type: 'dotted' });
    graph.updateEdgeStyle(pantry.id, wine.id, { type: 'dotted' });

    // Main -> Guest Hall connection might need to be bold or specific? 
    // Default is usually fine.

    // Hook layout update
    graph.subscribe(() => {
        layoutEngine.applyLayout();
    });

    // Initial Layout & Render
    layoutEngine.applyLayout();
});
