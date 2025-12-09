class LayoutEngine {
    constructor(graph) {
        this.graph = graph;
        this.spacing = 1; // Grid units between nodes
    }

    applyLayout() {
        const nodes = this.graph.getNodes();
        const roots = nodes.filter(n => !n.parentId);

        // Sort roots by ID to maintain stable order
        roots.sort((a, b) => a.id.localeCompare(b.id));

        let currentGridX = 0;

        roots.forEach(root => {
            let startGridX = currentGridX;

            // Allow manual override for root placement (in Grid Units)
            if (root.customX !== undefined && root.customX !== null && root.customX !== '') {
                startGridX = parseInt(root.customX);
                // Execute layout for this tree
                this.executeLayout(root, root.level, startGridX);
                // Do not update currentGridX, allowing manual placement to be independent
            } else {
                // Execute standard auto-layout
                const endGridX = this.executeLayout(root, root.level, startGridX);
                currentGridX = endGridX + this.spacing;
            }
        });
    }

    executeLayout(node, depth, gridXOffset) {
        if (!node) return gridXOffset;

        node.level = depth;
        if (node.customY !== undefined && node.customY !== null && node.customY !== '') {
            node.gridY = parseInt(node.customY);
        } else {
            node.gridY = 0; // Default to 0 if not specified (or perhaps use depth logic later?)
        }

        // Ensure grid dimensions exist
        if (node.gridW === undefined) node.gridW = 1;
        if (node.gridH === undefined) node.gridH = 1;

        if (node.childrenIds.length === 0) {
            node.gridX = gridXOffset;
            return gridXOffset + node.gridW + this.spacing;
        }

        let nextGridX = gridXOffset;
        const childXPositions = [];

        node.childrenIds.forEach(childId => {
            const child = this.graph.nodes.get(childId);
            const endGridX = this.executeLayout(child, depth + 1, nextGridX);
            childXPositions.push(child.gridX + (child.gridW - 1) / 2); // Center of child
            nextGridX = endGridX;
        });

        // Center parent over children
        const first = childXPositions[0];
        const last = childXPositions[childXPositions.length - 1];

        // Calculate centered position
        // We want the (gridX + width/2) to be at the average center
        const center = (first + last) / 2;

        // Check for Manual Override
        if (node.customX !== undefined && node.customX !== null && node.customX !== '') {
            node.gridX = parseInt(node.customX);
        } else {
            // gridX = center - halfWidth
            // Round to nearest integer to snap to grid
            node.gridX = Math.round(center - (node.gridW - 1) / 2);
        }

        // Ensure strictly integer
        node.gridX = Math.round(node.gridX);

        // Return the max X used by this subtree (which is nextGridX from children)
        return nextGridX;
    }
}
