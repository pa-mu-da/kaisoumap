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

    // Initialize Systems (Globals expected)
    const graph = new Graph();
    const layoutEngine = new LayoutEngine(graph);
    const renderer = new Renderer(canvas, graph);
    new UIManager(graph, renderer);

    // Initial Data
    const root = graph.addNode({ label: 'メインサーバー / Main' });
    const c1 = graph.addNode({ parentId: root.id, label: 'DBクラスタ / DB', style: { fillColor: '#1c1c1e', patternType: 'stripes' } });
    const c2 = graph.addNode({ parentId: root.id, label: 'キャッシュ / Cache', style: { fillColor: '#1c1c1e', patternType: 'dots' } });
    const c3 = graph.addNode({ parentId: root.id, label: 'ワーカー / Worker' });

    // Grandchildren
    graph.addNode({ parentId: c1.id, label: 'シャード1 / Shard' });
    graph.addNode({ parentId: c1.id, label: 'シャード2 / Shard' });

    // Hook layout update
    graph.subscribe(() => {
        layoutEngine.applyLayout();
    });

    // Initial Layout & Render
    layoutEngine.applyLayout();
});
