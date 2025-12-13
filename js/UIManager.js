class UIManager {
    constructor(graph, renderer) {
        this.graph = graph;
        this.renderer = renderer;
        this.selectedNodeId = null;

        // Connect Mode State
        this.isConnectMode = false;
        this.connectSourceId = null;

        this.setupEventListeners();
        this.setupGlobalEvents();
    }

    setupEventListeners() {
        const safeClick = (id, fn) => {
            const el = document.getElementById(id);
            if (el) {
                el.onclick = (e) => {
                    try { fn(e); }
                    catch (err) { alert('Error: ' + err.message); console.error(err); }
                };
            }
        };

        // --- Tabs ---
        this.setupTabs();

        // --- Export UI ---
        this.setupExportUI();

        // --- Mobile UI ---
        safeClick('mobile-menu-btn', () => {
            const items = document.getElementById('toolbar-items');
            if (items) items.classList.toggle('show');
        });

        safeClick('mobile-sidebar-toggle', (e) => {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar) sidebar.classList.toggle('open');
            // Update text? e.target.textContent = sidebar.classList.contains('open') ? '閉じる' : '設定';
            // Keep it simple "設定" is fine, or switch icon if I had one.
        });

        // Close mobile menu when clicking outside?
        document.addEventListener('click', (e) => {
            const items = document.getElementById('toolbar-items');
            const btn = document.getElementById('mobile-menu-btn');
            if (items && items.classList.contains('show')) {
                if (!items.contains(e.target) && !btn.contains(e.target)) {
                    items.classList.remove('show');
                }
            }

            // Close sidebar when clicking canvas?
            const sidebar = document.querySelector('.sidebar');
            const toggle = document.getElementById('mobile-sidebar-toggle');
            if (sidebar && sidebar.classList.contains('open') && window.innerWidth <= 768) {
                // If clicked canvas
                if (e.target.id === 'map-canvas' || e.target.id === 'canvas-container') {
                    sidebar.classList.remove('open');
                }
            }
        });

        // --- Toolbar Buttons ---
        safeClick('add-root-btn', () => {
            if (this.graph.nodes.size > 0 && !confirm('現在のマップはクリアされます。続行しますか？')) return;
            this.graph.import({ nodes: [], edges: [], rootId: null });
            const node = this.graph.addNode({ label: 'Main Root' });
            this.selectNode(node);
            this.renderViewSettings();
        });

        safeClick('add-independent-btn', () => {
            const levelStr = prompt('追加する階層レベルを入力してください (0=ルート, 1=子, ...):', '0');
            if (levelStr === null) return;
            const level = parseInt(levelStr);
            if (isNaN(level)) return alert('数値を入力してください');

            const node = this.graph.addNode({
                label: 'Node',
                level: level
            });
            this.selectNode(node);
            this.renderViewSettings();
        });

        safeClick('connect-mode-btn', () => {
            this.isConnectMode = !this.isConnectMode;
            this.connectSourceId = null;
            this.updateConnectModeUI();
        });

        safeClick('add-child-btn', () => {
            if (!this.selectedNodeId) return;
            this.graph.addNode({ parentId: this.selectedNodeId, label: 'Child' });
            this.renderViewSettings();
        });

        safeClick('delete-btn', () => {
            if (!this.selectedNodeId) return;
            if (confirm('このノードとその配下を削除しますか？')) {
                this.graph.removeNode(this.selectedNodeId);
                this.selectNode(null);
                this.renderViewSettings();
            }
        });

        safeClick('duplicate-btn', () => {
            this.duplicateNode();
        });

        // --- Export / Import ---
        safeClick('export-json-btn', () => this.downloadJSON());
        safeClick('import-json-btn', () => document.getElementById('json-file-input').click());
        document.getElementById('json-file-input').onchange = (e) => this.loadJSON(e.target.files[0]);

        // Export Image (In Tab)
        safeClick('confirm-export-btn', () => {
            const scale = parseInt(document.getElementById('export-scale').value);
            const bgColor = document.getElementById('export-bg-color').value;
            const isTransparent = document.getElementById('export-transparent').checked;
            this.downloadPNG(scale, bgColor, isTransparent);
        });
    }

    setupTabs() {
        const tabs = document.querySelectorAll('.tab-btn');
        const panes = document.querySelectorAll('.tab-pane');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Deactivate all
                tabs.forEach(t => t.classList.remove('active'));
                panes.forEach(p => p.classList.remove('active'));

                // Activate clicked
                tab.classList.add('active');
                const targetId = tab.getAttribute('data-tab');
                const targetPane = document.getElementById(targetId);
                if (targetPane) targetPane.classList.add('active');

                // NEW: Hook for Export Tab
                if (targetId === 'tab-export') {
                    // Update Minimap when tab becomes visible
                    setTimeout(() => this.updateMinimap(), 150);
                }
            });
        });
    }

    setupGlobalEvents() {
        window.addEventListener('node-selected', (e) => {
            this.handleNodeClick(e.detail.node);
            // If a node is selected, switch to properties tab if not already there?
            // User didn't strictly request auto-switch, but it's good UX.
            // Let's stick to just updating content for now to avoid jumping if user is in "Display" tab.
        });

        window.addEventListener('edge-selected', (e) => {
            this.handleEdgeClick(e.detail.edge);
        });

        window.addEventListener('edge-dblclick', (e) => {
            // Turn off connect mode
            this.isConnectMode = false;
            this.updateConnectModeUI();

            // Select the edge (visualization)
            this.handleEdgeClick(e.detail.edge);

            // Switch to Connect tab
            this.switchTab('tab-connect');
        });

        // Initial render
        setTimeout(() => this.renderViewSettings(), 100);
    }

    renderViewSettings() {
        const panel = document.getElementById('view-settings-content');
        if (!panel) return;
        panel.innerHTML = '';

        const nodes = this.graph.getNodes();
        if (nodes.length === 0) {
            panel.innerHTML = '<span style="color:#888; font-size:0.8rem;">ノードがありません</span>';
            return;
        }

        const levels = new Set(nodes.map(n => n.level));
        const sortedLevels = Array.from(levels).sort((a, b) => a - b);

        const header = document.createElement('div');
        header.textContent = '階層表示・透過設定';
        header.style.marginBottom = '8px';
        header.style.fontSize = '0.85rem';
        header.style.color = '#ccc';
        panel.appendChild(header);

        // --- Global Settings ---
        const globalSettings = document.createElement('div');
        globalSettings.style.marginBottom = '12px';
        globalSettings.style.padding = '8px';
        globalSettings.style.backgroundColor = 'rgba(0,0,0,0.2)';
        globalSettings.style.borderRadius = '4px';

        // BG Color
        const bgRow = document.createElement('div');
        bgRow.style.display = 'flex';
        bgRow.style.justifyContent = 'space-between';
        bgRow.style.alignItems = 'center';
        bgRow.style.marginBottom = '8px';

        const bgLabel = document.createElement('label');
        bgLabel.textContent = '背景色:';
        bgLabel.style.fontSize = '0.8rem';
        bgLabel.style.color = '#ccc';

        const bgInput = document.createElement('input');
        bgInput.type = 'color';
        bgInput.value = this.renderer.backgroundColor;
        bgInput.style.border = 'none';
        bgInput.style.width = '40px';
        bgInput.style.height = '20px';
        bgInput.style.cursor = 'pointer';
        bgInput.oninput = (e) => {
            this.renderer.backgroundColor = e.target.value;
        };

        bgRow.appendChild(bgLabel);
        bgRow.appendChild(bgInput);

        // Distance
        const distRow = document.createElement('div');
        distRow.style.display = 'flex';
        distRow.style.justifyContent = 'space-between';
        distRow.style.alignItems = 'center';

        const distLabel = document.createElement('label');
        distLabel.textContent = '階層距離:';
        distLabel.style.fontSize = '0.8rem';
        distLabel.style.color = '#ccc';

        const distInput = document.createElement('input');
        distInput.type = 'range';
        distInput.min = '50';
        distInput.max = '500';
        distInput.value = this.renderer.levelScale;
        distInput.style.width = '80px';
        distInput.oninput = (e) => {
            this.renderer.levelScale = parseInt(e.target.value);
        };

        distRow.appendChild(distLabel);
        distRow.appendChild(distInput);

        globalSettings.appendChild(bgRow);
        globalSettings.appendChild(distRow);
        panel.appendChild(globalSettings);


        sortedLevels.forEach(lvl => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.justifyContent = 'space-between';
            row.style.marginBottom = '6px';
            row.style.backgroundColor = 'rgba(255,255,255,0.05)';
            row.style.padding = '4px 8px';
            row.style.borderRadius = '4px';

            const leftGroup = document.createElement('div');
            leftGroup.style.display = 'flex';
            leftGroup.style.alignItems = 'center';
            leftGroup.style.gap = '8px';

            // --- Grid Toggle ---
            const gridLabel = document.createElement('label');
            gridLabel.style.display = 'flex';
            gridLabel.style.alignItems = 'center';
            gridLabel.style.gap = '4px';
            gridLabel.style.cursor = 'pointer';
            gridLabel.style.fontSize = '0.8rem';
            gridLabel.style.color = '#aaa';

            const gridChk = document.createElement('input');
            gridChk.type = 'checkbox';
            gridChk.checked = this.renderer.visibleGridLevels.has(lvl);
            gridChk.onchange = (e) => {
                this.renderer.toggleGrid(lvl, e.target.checked);
            };

            gridLabel.appendChild(gridChk);
            gridLabel.appendChild(document.createTextNode('Grid'));

            // Grid Color Picker
            const gridColor = document.createElement('input');
            gridColor.type = 'color';
            gridColor.value = this.renderer.gridColors.get(lvl) || '#ffffff';
            gridColor.style.border = 'none';
            gridColor.style.width = '20px';
            gridColor.style.height = '20px';
            gridColor.style.padding = '0';
            gridColor.style.marginLeft = '4px';
            gridColor.style.cursor = 'pointer';
            gridColor.title = 'グリッド色を変更';
            gridColor.oninput = (e) => {
                this.renderer.gridColors.set(lvl, e.target.value);
            };
            gridLabel.appendChild(gridColor);

            // --- Level Title ---
            const label = document.createElement('span');
            label.textContent = `Level ${lvl}`;
            label.style.fontSize = '0.9rem';
            label.style.fontWeight = 'bold';

            leftGroup.appendChild(label);
            leftGroup.appendChild(gridLabel);

            // --- Content Controls ---
            const controls = document.createElement('div');
            controls.style.display = 'flex';
            controls.style.gap = '2px';

            const currentVis = this.renderer.levelVisibility.get(lvl) || 'visible';

            // Helper to create toggle buttons
            const createBtn = (text, value, color) => {
                const btn = document.createElement('button');
                btn.textContent = text;
                btn.style.fontSize = '0.7rem';
                btn.style.padding = '2px 6px';
                btn.style.border = '1px solid #444';
                btn.style.cursor = 'pointer';

                if (currentVis === value) {
                    btn.style.backgroundColor = color;
                    btn.style.color = '#fff';
                    btn.style.borderColor = color;
                } else {
                    btn.style.backgroundColor = 'transparent';
                    btn.style.color = '#888';
                }

                btn.onclick = () => {
                    this.renderer.setLayerVisibility(lvl, value);
                    this.renderViewSettings(); // Re-render to update active state
                };
                return btn;
            };

            const btnShow = createBtn('表示', 'visible', '#28a745');
            const btnTrans = createBtn('半透過', 'transparent', '#ffc107');
            const btnHide = createBtn('非表示', 'hidden', '#dc3545');

            // Radius adjustments for group look
            btnShow.style.borderTopLeftRadius = '4px';
            btnShow.style.borderBottomLeftRadius = '4px';
            btnHide.style.borderTopRightRadius = '4px';
            btnHide.style.borderBottomRightRadius = '4px';

            controls.appendChild(btnShow);
            controls.appendChild(btnTrans);
            controls.appendChild(btnHide);

            row.appendChild(leftGroup);
            row.appendChild(controls);
            panel.appendChild(row);
        });
    }

    updateConnectModeUI() {
        const btn = document.getElementById('connect-mode-btn');
        if (!btn) return;
        if (this.isConnectMode) {
            btn.textContent = '接続モード: ON (始点を選択)';
            btn.style.backgroundColor = 'rgba(100, 108, 255, 0.2)';
            btn.style.borderColor = '#646cff';
            btn.style.color = '#fff';
        } else {
            btn.textContent = '接続モード: OFF';
            btn.style.backgroundColor = '';
            btn.style.borderColor = '';
            btn.style.color = '';
        }
        if (this.renderer && this.renderer.setConnectSourceId) {
            this.renderer.setConnectSourceId(this.isConnectMode ? this.connectSourceId : null);
        }
    }

    handleNodeClick(node) {
        if (!this.isConnectMode) {
            this.selectNode(node);
            return;
        }

        if (!node) {
            // Clicked empty space in connect mode -> Logic handled in Renderer (selects nothing)
            // But we might want to reset source if we clicked empty space?
            // Existing logic:
            this.connectSourceId = null;
            this.updateConnectModeUI();
            return;
        }

        if (!this.connectSourceId) {
            this.connectSourceId = node.id;
            if (this.renderer && this.renderer.setConnectSourceId) {
                this.renderer.setConnectSourceId(this.connectSourceId);
            }
            const btn = document.getElementById('connect-mode-btn');
            if (btn) btn.textContent = '接続モード: ON (終点を選択)';
        } else {
            if (this.connectSourceId !== node.id) {
                this.graph.addEdge(this.connectSourceId, node.id, { type: 'dashed' });
                this.connectSourceId = null;
                if (this.renderer && this.renderer.setConnectSourceId) {
                    this.renderer.setConnectSourceId(null);
                }
                const btn = document.getElementById('connect-mode-btn');
                if (btn) btn.textContent = '接続モード: ON (始点を選択)';
            }
        }
    }

    handleEdgeClick(edge) {
        if (this.isConnectMode) return; // Ignore edge selection in connect mode

        const placeholder = document.getElementById('edge-placeholder');
        const settings = document.getElementById('edge-settings');

        if (!edge) {
            placeholder.style.display = 'block';
            settings.style.display = 'none';
            return;
        }

        placeholder.style.display = 'none';
        settings.style.display = 'block';
        this.renderEdgeSettings(edge);

        // Mobile: Auto-open sidebar
        if (window.innerWidth <= 768) {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar) sidebar.classList.add('open');
            this.switchTab('tab-connect'); // Ensure connect tab is active
        }
    }

    renderEdgeSettings(edge) {
        const container = document.getElementById('edge-settings');
        container.innerHTML = '';

        const controls = this.createEdgeControls(edge, true);
        controls.forEach(c => container.appendChild(c));
    }

    // --- Helper to switch tabs programmatically ---
    switchTab(tabId) {
        const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        if (tabBtn) {
            tabBtn.click();
        }
    }

    selectNode(node) {
        this.selectedNodeId = node ? node.id : null;
        this.updateButtons();
        this.renderPropertiesPanel(node);

        // Auto-switch to properties tab if a node is selected
        if (node) {
            this.switchTab('tab-props');
            // Mobile: Auto-open sidebar
            if (window.innerWidth <= 768) {
                const sidebar = document.querySelector('.sidebar');
                if (sidebar) sidebar.classList.add('open');
            }
        }
    }

    updateButtons() {
        const hasSelection = !!this.selectedNodeId;
        document.getElementById('add-child-btn').disabled = !hasSelection;
        document.getElementById('delete-btn').disabled = !hasSelection;
        document.getElementById('duplicate-btn').disabled = !hasSelection;
    }

    renderPropertiesPanel(node) {
        const panel = document.getElementById('properties-content');
        if (!node) {
            panel.innerHTML = '<p class="placeholder-text">ノードを選択すると設定が表示されます。</p>';
            return;
        }

        panel.innerHTML = '';

        // --- Content Section ---
        this.createSection(panel, '基本設定', [
            this.createInput('ラベル', 'text', node.label, (val) => {
                node.label = val;
                this.graph.notify();
            })
        ]);

        // --- Layout Section ---
        // Always show for Manual Override
        this.createSection(panel, '配置設定', [
            this.createInput('X座標 (自動レイアウト基準: 0)', 'number', node.customX !== undefined ? node.customX : '', (val) => {
                node.customX = val === '' ? undefined : parseInt(val);
                this.graph.notify();
            }),
            this.createInput('Y座標 (自動レイアウト基準: 0)', 'number', node.customY !== undefined ? node.customY : '', (val) => {
                node.customY = val === '' ? undefined : parseInt(val);
                this.graph.notify();
            })
        ]);

        // --- Size Section ---
        this.createSection(panel, 'サイズ (グリッド単位)', [
            this.createInput('幅', 'number', node.gridW || 1, (val) => {
                const w = parseInt(val);
                if (w > 0) this.graph.updateNodeProperties(node.id, { gridW: w });
            }),
            this.createInput('奥行き', 'number', node.gridH || 1, (val) => {
                const h = parseInt(val);
                if (h > 0) this.graph.updateNodeProperties(node.id, { gridH: h });
            })
        ]);


        // --- Style Section ---
        this.createSection(panel, '外観', [
            this.createColorInput('背景色', node.style.fillColor, (val) => this.graph.updateNodeStyle(node.id, { fillColor: val })),
            this.createColorInput('枠線色', node.style.borderColor, (val) => this.graph.updateNodeStyle(node.id, { borderColor: val })),
            this.createInput('枠線の太さ', 'number', node.style.borderWidth, (val) => this.graph.updateNodeStyle(node.id, { borderWidth: parseInt(val) })),
            this.createSelect('パターン', node.style.patternType,
                [
                    { val: 'none', label: 'なし' },
                    { val: 'stripes', label: 'ストライプ' },
                    { val: 'grid', label: 'グリッド' },
                    { val: 'dots', label: 'ドット' },
                    { val: 'gradient', label: 'グラデーション' }
                ],
                (val) => this.graph.updateNodeStyle(node.id, { patternType: val }),
                true
            ),
            this.createColorInput('パターン色', node.style.patternColor, (val) => this.graph.updateNodeStyle(node.id, { patternColor: val }))
        ]);

        // --- Connection Section (Tree Parent) ---
        if (node.parentId) {
            const edge = this.graph.edges.find(e => e.sourceId === node.parentId && e.targetId === node.id);
            if (edge) {
                if (edge) {
                    this.createSection(panel, '親ノードとの接続', this.createEdgeControls(edge, false));
                }
            }
        }

        // --- Text Style Section with Toggle ---
        this.createSection(panel, 'テキストスタイル', [
            this.createColorInput('文字色', node.style.textColor, (val) => this.graph.updateNodeStyle(node.id, { textColor: val })),
            this.createColorWithNone('テキスト背景', node.style.textBgColor,
                (val) => this.graph.updateNodeStyle(node.id, { textBgColor: val })
            ),
            this.createColorWithNone('テキスト枠線', node.style.textBorderColor,
                (val) => this.graph.updateNodeStyle(node.id, { textBorderColor: val })
            )
        ]);
    }

    createEdgeControls(edge, allowDelete = true) {
        const controls = [
            this.createSelect('線種', edge.style.type,
                [
                    { val: 'solid', label: '実線' },
                    { val: 'dashed', label: '破線' },
                    { val: 'dotted', label: '点線' },
                    { val: 'chain', label: '鎖線' },
                    { val: 'wavy', label: '波線' }
                ],
                (val) => this.graph.updateEdgeStyle(edge.sourceId, edge.targetId, { type: val }),
                true
            ),
            this.createColorInput('線の色', edge.style.color, (val) => this.graph.updateEdgeStyle(edge.sourceId, edge.targetId, { color: val })),
            this.createInput('線の太さ', 'number', edge.style.width, (val) => this.graph.updateEdgeStyle(edge.sourceId, edge.targetId, { width: parseInt(val) }))
        ];

        if (allowDelete) {
            // Delete Button
            const btn = document.createElement('button');
            btn.textContent = '削除';
            btn.className = 'btn danger';
            btn.style.marginTop = '10px';
            btn.style.width = '100%';
            btn.onclick = () => {
                this.graph.removeEdge(edge.sourceId, edge.targetId);
                this.switchTab('tab-view');
                document.getElementById('edge-settings').innerHTML = '';
                document.getElementById('edge-settings').style.display = 'none';
                document.getElementById('edge-placeholder').style.display = 'block';
            };
            controls.push(btn);
        }

        return controls;
    }

    // --- Helper UI Creators ---
    createSection(parent, title, elements) {
        const header = document.createElement('h4');
        header.textContent = title;
        header.style.marginBottom = '10px';
        header.style.marginTop = '10px';
        header.style.fontSize = '0.9rem';
        header.style.color = '#fff';
        parent.appendChild(header);
        elements.forEach(el => parent.appendChild(el));
        parent.appendChild(document.createElement('hr'));
    }

    createInput(label, type, value, onChange) {
        const div = document.createElement('div');
        div.className = 'form-group';

        const lbl = document.createElement('label');
        lbl.textContent = label;

        const inp = document.createElement('input');
        inp.type = type;
        inp.value = value;
        inp.oninput = (e) => onChange(e.target.value);

        div.appendChild(lbl);
        div.appendChild(inp);
        return div;
    }

    createSelect(label, value, options, onChange, isObjectOption = false) {
        const div = document.createElement('div');
        div.className = 'form-group';

        const lbl = document.createElement('label');
        lbl.textContent = label;

        const sel = document.createElement('select');
        options.forEach(opt => {
            const el = document.createElement('option');
            if (isObjectOption) {
                el.value = opt.val;
                el.textContent = opt.label;
                if (opt.val === value) el.selected = true;
            } else {
                el.value = opt;
                el.textContent = opt;
                if (opt === value) el.selected = true;
            }
            sel.appendChild(el);
        });
        sel.onchange = (e) => onChange(e.target.value);

        div.appendChild(lbl);
        div.appendChild(sel);
        return div;
    }

    createColorInput(label, value, onChange) {
        const div = document.createElement('div');
        div.className = 'form-group';

        const lbl = document.createElement('label');
        lbl.textContent = label;

        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '8px';

        const colorInp = document.createElement('input');
        colorInp.type = 'color';
        let safeVal = (value === 'transparent') ? '#000000' : value;
        if (!safeVal.startsWith('#')) safeVal = '#000000'; // Fallback
        colorInp.value = safeVal;
        colorInp.style.width = '40px';

        const textInp = document.createElement('input');
        textInp.type = 'text';
        textInp.value = value;
        textInp.style.flex = 1;

        colorInp.oninput = (e) => {
            textInp.value = e.target.value;
            onChange(e.target.value);
        };
        textInp.onchange = (e) => {
            colorInp.value = e.target.value;
            onChange(e.target.value);
        };

        row.appendChild(colorInp);
        row.appendChild(textInp);
        div.appendChild(lbl);
        div.appendChild(row);
        return div;
    }

    createColorWithNone(label, currentValue, onChange) {
        const div = document.createElement('div');
        div.className = 'form-group';

        const headerRow = document.createElement('div');
        headerRow.style.display = 'flex';
        headerRow.style.justifyContent = 'space-between';

        const lbl = document.createElement('label');
        lbl.textContent = label;
        lbl.style.marginBottom = '0';

        const checkLabel = document.createElement('label');
        checkLabel.style.fontSize = '0.8rem';
        checkLabel.style.display = 'flex';
        checkLabel.style.alignItems = 'center';
        checkLabel.style.gap = '4px';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        const isTransparent = currentValue === 'transparent' || !currentValue;
        checkbox.checked = !isTransparent;

        checkLabel.appendChild(checkbox);
        checkLabel.appendChild(document.createTextNode('あり'));

        headerRow.appendChild(lbl);
        headerRow.appendChild(checkLabel);
        div.appendChild(headerRow);

        const inputContainer = document.createElement('div');
        inputContainer.style.display = isTransparent ? 'none' : 'flex';
        inputContainer.style.marginTop = '6px';
        inputContainer.style.gap = '8px';

        const colorInp = document.createElement('input');
        colorInp.type = 'color';
        let safeColor = isTransparent ? '#ffffff' : currentValue;
        if (!safeColor.startsWith('#')) safeColor = '#ffffff';
        colorInp.value = safeColor;
        colorInp.style.width = '40px';

        const textInp = document.createElement('input');
        textInp.type = 'text';
        textInp.value = safeColor;
        textInp.style.flex = 1;

        const handleUpdate = (val) => {
            colorInp.value = val;
            textInp.value = val;
            onChange(val);
        };

        colorInp.oninput = (e) => handleUpdate(e.target.value);
        textInp.onchange = (e) => handleUpdate(e.target.value);

        checkbox.onchange = (e) => {
            if (e.target.checked) {
                inputContainer.style.display = 'flex';
                onChange(colorInp.value);
            } else {
                inputContainer.style.display = 'none';
                onChange('transparent');
            }
        };

        inputContainer.appendChild(colorInp);
        inputContainer.appendChild(textInp);
        div.appendChild(inputContainer);

        return div;
    }

    downloadJSON() {
        const data = this.graph.export();
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'map_data.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    loadJSON(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target.result);
                this.graph.import(json);
                this.renderViewSettings();
                // alert('マップを読み込みました');
            } catch (err) {
                console.error(err);
                alert('JSON読み込みエラー: ' + err.message);
            }
        };
        reader.readAsText(file);
    }

    duplicateNode() {
        if (!this.selectedNodeId) return;
        const original = this.graph.nodes.get(this.selectedNodeId);
        if (!original) return;

        // 1. Generate Name
        const baseLabel = original.label;
        let newLabel = baseLabel;
        const match = baseLabel.match(/^(.*?)(\d+)$/);

        let prefix = baseLabel;
        let number = 2;

        if (match) {
            prefix = match[1];
            number = parseInt(match[2]) + 1;
        } else {
            // If no number, append space if needed? User said "Name + Number (start from 2)"
            // Example: "Room" -> "Room 2"
            // But if it's "RoomA", maybe "RoomA 2"?
            // Let's assume just append " 2" if no number exists, or just "2" if user prefers tightly packed?
            // Screenshot had "Guest Room A", "Guest Room B".
            // User request: "同じ名前+数字(最初の複製は2から始まります。2があれば3...)"
            // If label is "Room", next is "Room 2".
            prefix = baseLabel + ' '; // Add space for separation? standard behavior usually.
        }

        // Find unique name
        while (true) {
            newLabel = prefix.trim() + ' ' + number; // trimming to avoid double spaces
            // Check existence
            const exists = Array.from(this.graph.nodes.values()).some(n => n.label === newLabel);
            if (!exists) break;
            number++;
        }

        // 2. Clone Properties
        const newData = {
            label: newLabel,
            level: original.level,
            gridW: original.gridW,
            gridH: original.gridH,
            style: JSON.parse(JSON.stringify(original.style)) // Deep copy style
        };

        // 3. Placement
        if (original.parentId) {
            newData.parentId = original.parentId;
            // LayoutEngine will handle X/Y automatically for children
        } else {
            // Root Node: Place neighbor in Y direction
            // Copy X, Shift Y
            newData.customX = original.customX; // Keep alignment

            // Calculate new Y. 
            // If original has customY, use it + height + spacing (1)
            // If not, it's 0.
            const baseY = (original.customY !== undefined) ? original.customY : 0;
            newData.customY = baseY + original.gridH + 1;
        }

        // 4. Create Node
        const newNode = this.graph.addNode(newData);

        // 5. Select New Node
        this.selectNode(newNode);
        this.renderViewSettings();
    }

    setupExportUI() {
        const previewContainer = document.getElementById('export-preview-container');
        const cropBox = document.getElementById('crop-box');
        const overlay = document.getElementById('crop-overlay');
        const ratioW = document.getElementById('crop-ratio-w');
        const ratioH = document.getElementById('crop-ratio-h');
        const fixedRatio = document.getElementById('crop-aspect-fixed');

        // State for interaction
        let interactMode = null; // 'create', 'move', 'nw', 'ne', 'sw', 'se'
        let startPos = { x: 0, y: 0 };
        let startRect = { x: 0, y: 0, w: 0, h: 0 };

        // Helper to get mouse pos relative to overlay (0..width, 0..height)
        const getPos = (e) => {
            const rect = overlay.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        };

        const updateCropFromInput = (rect) => {
            // Apply Aspect Ratio Constraint if needed
            if (fixedRatio.checked) {
                const rw = parseFloat(ratioW.value) || 16;
                const rh = parseFloat(ratioH.value) || 9;
                const ratio = rw / rh;

                // Adjust height based on width for simplicity in creation/move
                // For resizing, it depends on handle.
                if (interactMode === 'create' || !interactMode) {
                    rect.h = rect.w / ratio;
                }
            }
            return rect;
        };

        // --- Event Handlers ---
        overlay.onmousedown = (e) => {
            if (e.target.classList.contains('resize-handle')) {
                interactMode = e.target.getAttribute('data-handle');
            } else if (e.target.id === 'crop-box') {
                interactMode = 'move';
            } else {
                interactMode = 'create';
                const p = getPos(e);
                this.cropRect = { x: p.x, y: p.y, w: 0, h: 0 };
                // Convert screen rect to world rect later
            }
            startPos = getPos(e);
            // Deep copy current crop rect (in screen pixels for this interaction)
            const box = cropBox;
            startRect = {
                x: parseFloat(box.style.left) || 0,
                y: parseFloat(box.style.top) || 0,
                w: parseFloat(box.style.width) || 0,
                h: parseFloat(box.style.height) || 0
            };

            // For create, startRect is just the point
            if (interactMode === 'create') {
                startRect = { x: startPos.x, y: startPos.y, w: 0, h: 0 };
            }

            e.preventDefault();
            e.stopPropagation();
        };

        window.addEventListener('mousemove', (e) => {
            if (!interactMode) return;
            const p = getPos(e); // Mouse pos in overlay
            const dx = p.x - startPos.x;
            const dy = p.y - startPos.y;

            let newRect = { ...startRect };
            const containerW = overlay.clientWidth;
            const containerH = overlay.clientHeight;

            // Aspect Ratio
            const getRatio = () => {
                const w = parseFloat(ratioW.value) || 16;
                const h = parseFloat(ratioH.value) || 9;
                return w / h;
            };

            if (interactMode === 'move') {
                newRect.x += dx;
                newRect.y += dy;
                // Clamp
                newRect.x = Math.max(0, Math.min(newRect.x, containerW - newRect.w));
                newRect.y = Math.max(0, Math.min(newRect.y, containerH - newRect.h));
            } else if (interactMode === 'create') {
                // Dragging to create
                newRect.w = Math.abs(dx);
                newRect.h = Math.abs(dy);
                newRect.x = dx < 0 ? startRect.x + dx : startRect.x;
                newRect.y = dy < 0 ? startRect.y + dy : startRect.y;

                if (fixedRatio.checked) {
                    const ratio = getRatio();
                    // Expand based on larger delta? Or just width?
                    // Let's constrain height to width
                    newRect.h = newRect.w / ratio;
                    if (dy < 0) newRect.y = startRect.y - newRect.h; // Fix origin flip
                }
            } else {
                // Resizing
                // Simple implementation: Update width/height based on corner
                if (interactMode.includes('w')) { newRect.x += dx; newRect.w -= dx; } // West
                if (interactMode.includes('e')) { newRect.w += dx; } // East
                if (interactMode.includes('n')) { newRect.y += dy; newRect.h -= dy; } // North
                if (interactMode.includes('s')) { newRect.h += dy; } // South

                if (fixedRatio.checked) {
                    const ratio = getRatio();
                    // Force height based on width (simplest behavior)
                    const oldH = newRect.h;
                    newRect.h = newRect.w / ratio;
                    // If North, we need to adjust Y as well because H changed
                    if (interactMode.includes('n')) {
                        // The delta in H caused by aspect lock
                        // We already moved Y by dy. 
                        // It gets complicated. 
                        // Simple approach: Recalculate based on dominant axis.
                        // If dx is larger, use W.
                    }
                }
            }

            // Apply visual update
            cropBox.style.left = newRect.x + 'px';
            cropBox.style.top = newRect.y + 'px';
            cropBox.style.width = newRect.w + 'px';
            cropBox.style.height = newRect.h + 'px';
            cropBox.style.display = 'block';

            // Update internal state (World Coords)
            this.updateWorldCropFromDOM();
        });

        window.addEventListener('mouseup', () => {
            interactMode = null;
        });

        document.getElementById('crop-reset-btn').onclick = () => {
            // Select All
            const canvas = document.getElementById('minimap-canvas');
            cropBox.style.left = '0';
            cropBox.style.top = '0';
            cropBox.style.width = canvas.clientWidth + 'px';
            cropBox.style.height = canvas.clientHeight + 'px';
            cropBox.style.display = 'block';
            this.updateWorldCropFromDOM();
        };

        // Export Button moved logic
        const btn = document.getElementById('confirm-export-btn');
        // Remove old listener (hacky way: clone node?) 
        // Or simply overwrite logic if I can find where I added it.
        // Actually, setupEventListeners is called once. The old handler is there. 
        // I should just change what 'confirm-export-btn' does in setupEventListeners or here.
        // Since setupExportUI is called IN setupEventListeners, I can just overwrite onclick if I use standard property.
        // But safeClick uses addEventListener? No, safeClick uses `.onclick =`. Good.
        btn.onclick = () => this.exportImage();
    }

    updateWorldCropFromDOM() {
        const cropBox = document.getElementById('crop-box');
        const domRect = {
            x: parseFloat(cropBox.style.left) || 0,
            y: parseFloat(cropBox.style.top) || 0,
            w: parseFloat(cropBox.style.width) || 0,
            h: parseFloat(cropBox.style.height) || 0
        };

        // Convert DOM (Minimap) coords to World coords
        // minimapX = (worldX - bounds.minX) * scale
        // worldX = minimapX / scale + bounds.minX
        if (!this.minimapMetadata) return;

        const md = this.minimapMetadata;
        this.cropRectWorld = {
            x: (domRect.x - md.offsetX) / md.scale,
            y: (domRect.y - md.offsetY) / md.scale,
            w: domRect.w / md.scale,
            h: domRect.h / md.scale
        };

        // Update Info Text
        const info = document.getElementById('crop-info-text');
        info.textContent = `Size: ${Math.round(this.cropRectWorld.w)} x ${Math.round(this.cropRectWorld.h)}`;
    }

    updateMinimap() {
        const canvas = document.getElementById('minimap-canvas');
        const container = document.getElementById('export-preview-container');
        if (!canvas || !container) return;

        // Size canvas to container
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;

        // Get Graph Bounds
        const bounds = this.renderer.getContentBounds();
        // Calculate Scale to Fit
        const scaleX = canvas.width / bounds.width;
        const scaleY = canvas.height / bounds.height;
        const scale = Math.min(scaleX, scaleY) * 0.95; // 5% margin

        // Center it
        const contentW = bounds.width * scale;
        const contentH = bounds.height * scale;
        const offsetX = (canvas.width - contentW) / 2;
        const offsetY = (canvas.height - contentH) / 2;

        // Renderer expects offsetX/Y to be the translation applied.
        // World 0,0 -> Projected 0,0.
        // We want Bounds.minX, bounds.minY to be at offsetX, offsetY.
        // project(x) = (x - y)*scale ...
        // Wait, renderToContext expects 'offsetX'/'offsetY' to be the center of screen usually?
        // Renderer.project: 
        // x: isoX + this.offsetX
        // We want project(bounds.minX..?) to map to canvas pixels.

        // We need to calculate what 'offsetX' (translation) makes the bounds center line up with canvas center.
        // Bounds center in world (iso projected but unshifted):
        // We can't easily reverse 'iso' projection blindly. 
        // But getContentBounds returned 'Screen Space' bounds relative to implicit (0,0) offset.

        // So:
        // Center of bounds (relative to 0,0 offset)
        const bCX = (bounds.minX + bounds.maxX) / 2; // This is raw projected coord
        const bCY = (bounds.minY + bounds.maxY) / 2;

        // We want bCX * scale + FinalOffset = CanvasCenter
        // FinalOffset = CanvasCenter - bCX * scale

        const finalOfsX = (canvas.width / 2) - (bCX * scale); // Wait, getContentBounds used THIS.scale. 
        // We need bounds in 'Unscaled projected space'? 
        // getContentBounds uses 'current scale'. That's messy.
        // Let's assume default scale 1 for bounds calculation?
        // Renderer.getContentBounds accesses this.scale?
        // Yes, project() uses this.scale.

        // Let's temporarily set renderer scale to 1 before getting bounds?
        // Or refactor getContentBounds to take scale.
        // Let's refactor getContentBounds quickly in my head: It pads by 100*scale.
        // The projected points depend on scale.

        // Hack: Just leverage the fact we can render to context.
        // Use a heuristic or just try to center 0,0 if bounds are tricky?
        // No, we need to fit it.

        // Correct approach:
        // 1. Get bounds at Scale 1.
        // 2. Determine necessary scale.
        // 3. Render.

        // I will trust existing bounds logic but I need to know what context it was calculated in.
        // It was calculated with CURRENT renderer.scale.
        // So:
        // trueWidth = bounds.width / renderer.scale
        // trueHeight = bounds.height / renderer.scale

        const currentScale = this.renderer.scale;
        const rawW = bounds.width / currentScale;
        const rawH = bounds.height / currentScale;

        // Target Scale
        const mmScale = Math.min(canvas.width / rawW, canvas.height / rawH) * 0.9;

        // Centering
        // The bounds.minX is relative to renderer.offsetX.
        // trueMinX = (bounds.minX - renderer.offsetX) / currentScale; (approx?)
        // Renderer.project: returns isoX + offsetX.
        // So isoX = px - offsetX.
        // bounds.minX is the min(isoX) + offsetX?
        // bounds.minX is min(projectedX).
        // So minIsoX = bounds.minX - renderer.offsetX.

        // We want newOffsetX such that:
        // minIsoX * mmScale + newOffsetX = (canvas.width - rawW * mmScale) / 2 (Left margin)

        const minIsoX = (bounds.minX - 100 * currentScale) - this.renderer.offsetX; // removing padding hack
        // Actually getContentBounds subtracts offsetX.
        // "const relX = p.x - this.offsetX;" 
        // So getContentBounds returns coordinates relative to Offset (0,0). Great!

        // So bounds.minX IS the minIsoX (at current scale).
        // We need minIsoXAtScale1 = bounds.minX / currentScale.

        // NO, getContentBounds returns:
        // const relX = p.x - this.offsetX;
        // p.x = isoX * scale + offsetX
        // relX = isoX * scale.
        // So bounds.minX is (IsoX * CurrentScale).

        const trueMinIsoX = bounds.minX / currentScale;
        const trueMinIsoY = bounds.minY / currentScale;

        // We want to render at mmScale.
        // CanvasX = TrueIsoX * mmScale + NewOffsetX
        // We want TrueMinIsoX * mmScale + NewOffsetX = MarginX

        const marginX = (canvas.width - rawW * mmScale) / 2;
        const marginY = (canvas.height - rawH * mmScale) / 2;

        const newOffsetX = marginX - (trueMinIsoX * mmScale);
        const newOffsetY = marginY - (trueMinIsoY * mmScale);

        // Draw
        const ctx = canvas.getContext('2d');
        // Render with options: NO Grid, NO Labels for minimap
        this.renderer.renderToContext(ctx, canvas.width, canvas.height, mmScale, newOffsetX, newOffsetY, '#000000', false, { drawGrid: false, drawLabels: false });

        // Store metadata for crop conversion
        this.minimapMetadata = {
            scale: mmScale,
            // We need to map World (Iso) coords to Canvas coords.
            // X_canvas = X_world_iso * scale + newOffsetX
            // But our crop logic converts DOM rect (Canvas Coords) to "World Rect".
            // "World Rect" here effectively means "Iso space coords".
            // If we store 'bounds.minX' as base? 
            // Simpler: Store the transform parameters.
            offsetX: newOffsetX,
            offsetY: newOffsetY,
            bounds: { minX: trueMinIsoX, minY: trueMinIsoY, width: rawW, height: rawH }
        };

        // Reset Crop Box to full view if not set
        const cropBox = document.getElementById('crop-box');
        cropBox.style.display = 'block';
        cropBox.style.left = marginX + 'px';
        cropBox.style.top = marginY + 'px';
        cropBox.style.width = (rawW * mmScale) + 'px';
        cropBox.style.height = (rawH * mmScale) + 'px';

        this.updateWorldCropFromDOM();
    }

    exportImage() {
        if (!this.cropRectWorld) {
            alert('Please select an export area.');
            return;
        }

        const scaleVal = parseInt(document.getElementById('export-scale').value);
        const bgColor = document.getElementById('export-bg-color').value;
        const isTransparent = document.getElementById('export-transparent').checked;

        // Create canvas of appropriate size
        // Size = cropRectWorld size * scaleVal
        // cropRectWorld is in Unscaled Iso Units.
        // So pixels = size * scaleVal.

        const w = Math.ceil(this.cropRectWorld.w * scaleVal);
        const h = Math.ceil(this.cropRectWorld.h * scaleVal);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        // We need to render such that cropRectWorld.x,y is at 0,0.
        // X_screen = X_iso * scale + offset
        // 0 = cropRectWorld.x * scaleVal + offset
        // offset = -cropRectWorld.x * scaleVal

        const offX = -this.cropRectWorld.x * scaleVal;
        const offY = -this.cropRectWorld.y * scaleVal;

        // Get Text Option
        const textOpt = document.querySelector('input[name="export-text-opt"]:checked').value;
        const drawLabels = (textOpt === 'on');

        this.renderer.renderToContext(ctx, w, h, scaleVal, offX, offY, bgColor, isTransparent, { drawLabels: drawLabels });

        const link = document.createElement('a');
        link.download = `map_export.png`;
        link.href = canvas.toDataURL();
        link.click();
    }

    downloadPNG(scale, bg, transparent) {
        // Legacy/Fallback wrapper just in case
        this.exportImage();
    }

}

