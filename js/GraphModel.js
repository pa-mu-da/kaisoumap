class Node {
    constructor(id, data = {}) {
        this.id = id;
        this.parentId = data.parentId || null;
        this.childrenIds = [];
        this.level = data.level !== undefined ? data.level : 0;

        this.gridX = data.gridX !== undefined ? data.gridX : 0;
        this.gridY = data.gridY !== undefined ? data.gridY : 0;

        // Dimensions (Grid Units)
        this.gridW = data.gridW !== undefined ? data.gridW : 1;
        this.gridH = data.gridH !== undefined ? data.gridH : 1;

        // Pixel coordinates (Calculated from grid later, but initialized here for safety)
        this.x = this.gridX * 100;
        this.y = this.gridY * 100;

        this.label = data.label || `Node ${id}`;

        this.style = {
            width: 80, // Deprecated? Kept for internal render scaling if needed
            height: 80,
            fillColor: data.style?.fillColor || '#2c2c2e',
            borderColor: data.style?.borderColor || '#ffffff',
            borderWidth: data.style?.borderWidth || 2,
            patternType: data.style?.patternType || 'none',
            patternColor: data.style?.patternColor || '#3a3a3c',

            textColor: data.style?.textColor || '#d1d1d6',
            textBgColor: data.style?.textBgColor || '#1c1c1e',
            textBorderColor: data.style?.textBorderColor || 'transparent'
        };
    }
}

class Edge {
    constructor(sourceId, targetId, style = {}) {
        this.sourceId = sourceId;
        this.targetId = targetId;

        this.style = {
            type: style.type || 'dashed',
            color: style.color || '#ffffff',
            width: style.width || 2
        };
    }
}

class Graph {
    constructor() {
        this.nodes = new Map();
        this.edges = [];
        this.rootId = null; // Kept for legacy reference if needed, but layout handles multiple
        this.listeners = [];
    }

    addNode(data) {
        const id = data.id || Math.random().toString(36).substr(2, 9);
        const node = new Node(id, data);

        // If it's the very first node, mark it as a "primary" root for convenience
        if (this.nodes.size === 0) {
            this.rootId = id;
        }

        this.nodes.set(id, node);

        if (node.parentId && this.nodes.has(node.parentId)) {
            const parent = this.nodes.get(node.parentId);
            parent.childrenIds.push(id);
            // Default tree edge
            this.edges.push(new Edge(node.parentId, id));
        }

        this.notify();
        return node;
    }

    // Add an arbitrary edge between any two nodes
    addEdge(sourceId, targetId, style = {}) {
        if (!this.nodes.has(sourceId) || !this.nodes.has(targetId)) return;
        // Avoid duplicates
        const exists = this.edges.some(e => e.sourceId === sourceId && e.targetId === targetId);
        if (!exists) {
            this.edges.push(new Edge(sourceId, targetId, style));
            this.notify();
        }
    }

    removeEdge(sourceId, targetId) {
        this.edges = this.edges.filter(e => !(e.sourceId === sourceId && e.targetId === targetId));
        this.notify();
    }

    removeNode(id) {
        if (!this.nodes.has(id)) return;

        // Remove ALL edges connected to this node (both tree and arbitrary)
        this.edges = this.edges.filter(e => e.sourceId !== id && e.targetId !== id);

        const node = this.nodes.get(id);
        // Remove from parent's children list
        if (node.parentId && this.nodes.has(node.parentId)) {
            const parent = this.nodes.get(node.parentId);
            parent.childrenIds = parent.childrenIds.filter(cid => cid !== id);
        }

        // Recursively remove children (Tree logic)
        // Note: Floating nodes attached via arbitrary edges won't be auto-removed, which is correct.
        const children = [...node.childrenIds];
        children.forEach(childId => this.removeNode(childId));

        this.nodes.delete(id);
        if (this.rootId === id) this.rootId = null;

        this.notify();
    }

    getEdges() {
        return this.edges;
    }

    getNodes() {
        return Array.from(this.nodes.values());
    }

    getNode(id) {
        return this.nodes.get(id);
    }

    updateNodeStyle(id, styleUpdate) {
        const node = this.nodes.get(id);
        if (node) {
            Object.assign(node.style, styleUpdate);
            this.notify();
        }
    }

    updateNodeProperties(id, propUpdate) {
        const node = this.nodes.get(id);
        if (node) {
            Object.assign(node, propUpdate);
            this.notify();
        }
    }

    updateEdgeStyle(sourceId, targetId, styleUpdate) {
        const edge = this.edges.find(e => e.sourceId === sourceId && e.targetId === targetId);
        if (edge) {
            Object.assign(edge.style, styleUpdate);
            this.notify();
        }
    }

    import(json) {
        this.nodes.clear();
        this.edges = [];
        this.rootId = json.rootId;

        json.nodes.forEach(nData => {
            const node = new Node(nData.id, nData);
            Object.assign(node, nData); // Restore properties including level
            this.nodes.set(node.id, node);
        });

        json.edges.forEach(eData => {
            const edge = new Edge(eData.sourceId, eData.targetId, eData.style);
            this.edges.push(edge);
        });

        this.notify();
    }

    export() {
        return {
            rootId: this.rootId,
            nodes: Array.from(this.nodes.values()),
            edges: this.edges
        };
    }

    subscribe(callback) {
        this.listeners.push(callback);
    }

    notify() {
        this.listeners.forEach(cb => cb(this));
    }
}
