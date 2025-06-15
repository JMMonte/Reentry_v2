#!/usr/bin/env node

/**
 * Code Flow Audit Script
 * 
 * Generates comprehensive code flow maps and architectural diagrams for a target file.
 * Features:
 * - Maps function call chains and data flow
 * - Tracks dependencies up to root files (nth level)
 * - Detects circular dependencies with context
 * - Generates Mermaid architectural diagrams
 * - Shows directory tree structure
 * - Provides high-level view of code execution flow
 * - Extracts context around function calls and exports
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

class CodeFlowAnalyzer {
    constructor(targetFile, options = {}) {
        this.targetFile = targetFile;
        this.options = {
            maxDepth: 10,
            showContext: true,
            outputFormat: 'all', // all, mermaid, ascii, summary
            includeExternalDeps: false,
            showDirectoryTree: true,
            ...options
        };
        
        // Core data structures
        this.fileMap = new Map(); // filepath -> FileInfo
        this.dependencyGraph = new Map(); // file -> Set of dependencies
        this.reverseDependencyGraph = new Map(); // file -> Set of dependents
        this.functionCalls = new Map(); // file -> Map of function calls with context
        this.exportMap = new Map(); // file -> exported functions/classes
        this.callChains = []; // Array of call chain paths
        this.circularDeps = [];
        this.rootFiles = new Set(); // Files that have no dependents (entry points)
        
        // Architecture layers
        this.layers = {
            'app': ['App.jsx', 'App3D.js', 'main.jsx'],
            'ui': ['components/ui', 'hooks'],
            'managers': ['managers'],
            'physics': ['physics'],
            'services': ['services'],
            'utils': ['utils'],
            'three': ['components/planet', 'components/Satellite', 'components/orbit'],
            'workers': ['workers'],
            'setup': ['setup'],
            'simulation': ['simulation']
        };
    }

    async analyze() {
        console.log(`\n🔍 CODE FLOW ANALYSIS: ${this.targetFile}\n`);
        console.log('=' .repeat(80));
        
        try {
            // Phase 1: Build complete file map
            await this.buildFileMap();
            
            // Phase 2: Analyze target file and its dependencies
            await this.analyzeCodeFlow();
            
            // Phase 3: Build reverse dependency graph
            this.buildReverseDependencies();
            
            // Phase 4: Find root files (entry points)
            this.findRootFiles();
            
            // Phase 5: Detect circular dependencies
            this.detectCircularDependencies();
            
            // Phase 6: Extract function calls and context
            await this.extractFunctionCalls();
            
            // Phase 7: Generate outputs
            this.generateOutput();
            
        } catch (error) {
            console.error(`❌ Analysis failed: ${error.message}`);
            process.exit(1);
        }
    }

    async buildFileMap() {
        console.log('📁 Building complete file map...');
        const files = await this.scanDirectory(path.join(projectRoot, 'src'));
        
        for (const filePath of files) {
            const relativePath = path.relative(projectRoot, filePath);
            const fileInfo = await this.analyzeFile(filePath, relativePath);
            this.fileMap.set(relativePath, fileInfo);
        }
        
        console.log(`   Found ${files.length} source files\n`);
    }

    async scanDirectory(dir) {
        const files = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory() && !['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
                files.push(...await this.scanDirectory(fullPath));
            } else if (entry.isFile() && ['.js', '.jsx', '.ts', '.tsx'].includes(path.extname(entry.name))) {
                files.push(fullPath);
            }
        }
        
        return files;
    }

    async analyzeFile(filePath, relativePath) {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        
        const fileInfo = {
            path: filePath,
            relativePath,
            directory: path.dirname(relativePath),
            content,
            lines,
            size: content.length,
            imports: new Set(),
            exports: new Set(),
            functions: new Set(),
            classes: new Set(),
            layer: this.getFileLayer(relativePath),
            isEntryPoint: false
        };
        
        // Extract imports
        this.extractImports(content, fileInfo);
        
        // Extract exports
        this.extractExports(content, fileInfo);
        
        // Extract functions and classes
        this.extractFunctionsAndClasses(content, fileInfo);
        
        return fileInfo;
    }

    extractImports(content, fileInfo) {
        // ES6 imports
        const importRegex = /import\s+(?:[^'"]*\s+from\s+)?['"`]([^'"`]+)['"`]/g;
        let match;
        
        while ((match = importRegex.exec(content)) !== null) {
            const importPath = match[1];
            const resolvedPath = this.resolveImportPath(importPath, fileInfo.relativePath);
            if (resolvedPath) {
                fileInfo.imports.add(resolvedPath);
            }
        }
        
        // Dynamic imports
        const dynamicImportRegex = /(?:await\s+)?import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
        while ((match = dynamicImportRegex.exec(content)) !== null) {
            const resolvedPath = this.resolveImportPath(match[1], fileInfo.relativePath);
            if (resolvedPath) {
                fileInfo.imports.add(resolvedPath);
            }
        }
        
        // Worker imports
        const workerRegex = /new\s+Worker\s*\(\s*new\s+URL\s*\(\s*['"`]([^'"`]+)['"`]/g;
        while ((match = workerRegex.exec(content)) !== null) {
            const resolvedPath = this.resolveImportPath(match[1], fileInfo.relativePath);
            if (resolvedPath) {
                fileInfo.imports.add(resolvedPath);
            }
        }
    }

    extractExports(content, fileInfo) {
        // Named exports
        const namedExportRegex = /export\s+(?:const|let|var|function|class)\s+(\w+)/g;
        let match;
        while ((match = namedExportRegex.exec(content)) !== null) {
            fileInfo.exports.add(match[1]);
        }
        
        // Export destructuring
        const destructureExportRegex = /export\s+\{([^}]+)\}/g;
        while ((match = destructureExportRegex.exec(content)) !== null) {
            const exports = match[1].split(',').map(e => e.trim().split(' as ')[0]);
            exports.forEach(exp => fileInfo.exports.add(exp));
        }
        
        // Default exports
        const defaultExportRegex = /export\s+default\s+(?:class\s+)?(\w+)/g;
        while ((match = defaultExportRegex.exec(content)) !== null) {
            fileInfo.exports.add(`default(${match[1]})`);
        }
    }

    extractFunctionsAndClasses(content, fileInfo) {
        // Function declarations
        const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
        let match;
        while ((match = functionRegex.exec(content)) !== null) {
            fileInfo.functions.add(match[1]);
        }
        
        // Arrow functions assigned to variables
        const arrowFunctionRegex = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g;
        while ((match = arrowFunctionRegex.exec(content)) !== null) {
            fileInfo.functions.add(match[1]);
        }
        
        // Class declarations
        const classRegex = /(?:export\s+)?(?:default\s+)?class\s+(\w+)/g;
        while ((match = classRegex.exec(content)) !== null) {
            fileInfo.classes.add(match[1]);
        }
        
        // Methods inside classes
        const methodRegex = /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*{/gm;
        while ((match = methodRegex.exec(content)) !== null) {
            if (!['constructor', 'render'].includes(match[1])) {
                fileInfo.functions.add(match[1]);
            }
        }
    }

    resolveImportPath(importPath, fromFile) {
        // External dependencies
        if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
            return this.options.includeExternalDeps ? `external:${importPath}` : null;
        }
        
        // Relative imports
        if (importPath.startsWith('./') || importPath.startsWith('../')) {
            const fromDir = path.dirname(fromFile);
            let resolved = path.normalize(path.join(fromDir, importPath));
            
            // Try different extensions
            const exts = ['', '.js', '.jsx', '.ts', '.tsx'];
            for (const ext of exts) {
                const testPath = resolved + ext;
                if (this.fileMap.has(testPath) || fs.existsSync(path.join(projectRoot, testPath))) {
                    return testPath;
                }
            }
            
            // Try index files
            for (const ext of exts.slice(1)) {
                const indexPath = path.join(resolved, 'index' + ext);
                if (this.fileMap.has(indexPath) || fs.existsSync(path.join(projectRoot, indexPath))) {
                    return indexPath;
                }
            }
        }
        
        return null;
    }

    async analyzeCodeFlow() {
        console.log('🔄 Analyzing code flow dependencies...');
        
        const targetPath = path.normalize(this.targetFile);
        const visited = new Set();
        const queue = [targetPath];
        
        while (queue.length > 0) {
            const currentFile = queue.shift();
            if (visited.has(currentFile)) continue;
            visited.add(currentFile);
            
            const fileInfo = this.fileMap.get(currentFile);
            if (!fileInfo) continue;
            
            // Add dependencies to dependency graph
            this.dependencyGraph.set(currentFile, new Set(fileInfo.imports));
            
            // Queue dependencies for analysis
            fileInfo.imports.forEach(dep => {
                if (!dep.startsWith('external:') && !visited.has(dep)) {
                    queue.push(dep);
                }
            });
        }
        
        console.log(`   Analyzed ${visited.size} files in dependency chain\n`);
    }

    buildReverseDependencies() {
        console.log('🔗 Building reverse dependency map...');
        
        this.dependencyGraph.forEach((deps, file) => {
            deps.forEach(dep => {
                if (!dep.startsWith('external:')) {
                    if (!this.reverseDependencyGraph.has(dep)) {
                        this.reverseDependencyGraph.set(dep, new Set());
                    }
                    this.reverseDependencyGraph.get(dep).add(file);
                }
            });
        });
        
        console.log(`   Built reverse dependencies for ${this.reverseDependencyGraph.size} files\n`);
    }

    findRootFiles() {
        console.log('🌳 Finding root files (entry points)...');
        
        // A root file is one that has no dependents or is explicitly an entry point
        this.dependencyGraph.forEach((deps, file) => {
            const dependents = this.reverseDependencyGraph.get(file);
            if (!dependents || dependents.size === 0) {
                this.rootFiles.add(file);
            }
        });
        
        // Add known entry points
        const entryPoints = ['src/main.jsx', 'src/App.jsx', 'src/App3D.js'];
        entryPoints.forEach(entry => {
            if (this.fileMap.has(entry)) {
                this.rootFiles.add(entry);
            }
        });
        
        console.log(`   Found ${this.rootFiles.size} root files\n`);
    }

    detectCircularDependencies() {
        console.log('🔄 Detecting circular dependencies...');
        
        const visited = new Set();
        const recursionStack = new Set();
        const cycles = [];
        
        const dfs = (node, path = []) => {
            if (recursionStack.has(node)) {
                const cycleStart = path.indexOf(node);
                const cycle = path.slice(cycleStart).concat([node]);
                cycles.push(cycle);
                return;
            }
            
            if (visited.has(node)) return;
            
            visited.add(node);
            recursionStack.add(node);
            path.push(node);
            
            const deps = this.dependencyGraph.get(node) || new Set();
            deps.forEach(dep => {
                if (!dep.startsWith('external:')) {
                    dfs(dep, [...path]);
                }
            });
            
            recursionStack.delete(node);
            path.pop();
        };
        
        this.dependencyGraph.forEach((_, file) => {
            if (!visited.has(file)) {
                dfs(file);
            }
        });
        
        this.circularDeps = cycles;
        console.log(`   Found ${cycles.length} circular dependencies\n`);
    }

    async extractFunctionCalls() {
        console.log('🔧 Extracting function calls and context...');
        
        for (const [filePath, fileInfo] of this.fileMap.entries()) {
            if (!this.dependencyGraph.has(filePath)) continue;
            
            const callMap = new Map();
            const content = fileInfo.content;
            const lines = fileInfo.lines;
            
            // Extract function calls with context
            const functionCallRegex = /(\w+)\s*\(/g;
            let match;
            
            while ((match = functionCallRegex.exec(content)) !== null) {
                const functionName = match[1];
                const lineIndex = content.substring(0, match.index).split('\n').length - 1;
                const line = lines[lineIndex];
                
                // Skip common keywords and built-ins
                if (['if', 'for', 'while', 'switch', 'function', 'return', 'typeof', 'instanceof'].includes(functionName)) {
                    continue;
                }
                
                if (!callMap.has(functionName)) {
                    callMap.set(functionName, []);
                }
                
                callMap.get(functionName).push({
                    line: lineIndex + 1,
                    context: line.trim(),
                    surroundingLines: this.getSurroundingLines(lines, lineIndex, 2)
                });
            }
            
            this.functionCalls.set(filePath, callMap);
        }
        
        console.log(`   Extracted function calls from ${this.functionCalls.size} files\n`);
    }

    getSurroundingLines(lines, centerIndex, radius) {
        const start = Math.max(0, centerIndex - radius);
        const end = Math.min(lines.length, centerIndex + radius + 1);
        
        return lines.slice(start, end).map((line, index) => ({
            lineNumber: start + index + 1,
            content: line,
            isCenter: start + index === centerIndex
        }));
    }

    getFileLayer(filePath) {
        for (const [layer, patterns] of Object.entries(this.layers)) {
            if (patterns.some(pattern => filePath.includes(pattern))) {
                return layer;
            }
        }
        return 'other';
    }

    generateOutput() {
        console.log('📊 Generating outputs...\n');
        
        if (this.options.outputFormat === 'all' || this.options.outputFormat === 'summary') {
            this.generateSummaryReport();
        }
        
        if (this.options.outputFormat === 'all' || this.options.outputFormat === 'mermaid') {
            this.generateMermaidDiagram();
        }
        
        if (this.options.outputFormat === 'all' || this.options.outputFormat === 'ascii') {
            this.generateAsciiDiagram();
        }
        
        if (this.options.showDirectoryTree) {
            this.generateDirectoryTree();
        }
    }

    generateSummaryReport() {
        console.log('📊 CODE FLOW SUMMARY REPORT');
        console.log('══════════════════════════════════════════════════\n');
        
        const targetFile = path.normalize(this.targetFile);
        const targetInfo = this.fileMap.get(targetFile);
        
        if (!targetInfo) {
            console.log(`❌ Target file not found: ${targetFile}\n`);
            return;
        }
        
        // Target file info
        console.log('🎯 TARGET FILE ANALYSIS');
        console.log('------------------------');
        console.log(`File: ${targetFile}`);
        console.log(`Layer: ${targetInfo.layer}`);
        console.log(`Size: ${targetInfo.size} chars, ${targetInfo.lines.length} lines`);
        console.log(`Imports: ${targetInfo.imports.size}`);
        console.log(`Exports: ${targetInfo.exports.size}`);
        console.log(`Functions: ${targetInfo.functions.size}`);
        console.log(`Classes: ${targetInfo.classes.size}\n`);
        
        // Show exports with types
        if (targetInfo.exports.size > 0) {
            console.log('📤 EXPORTED INTERFACE');
            console.log('---------------------');
            Array.from(targetInfo.exports).forEach(exp => {
                const type = targetInfo.functions.has(exp) ? 'function' : 
                           targetInfo.classes.has(exp) ? 'class' : 'value';
                console.log(`  • ${exp} (${type})`);
            });
            console.log('');
        }
        
        // Dependency chain analysis
        console.log('🔗 DEPENDENCY CHAIN ANALYSIS');
        console.log('-----------------------------');
        
        const depChain = this.buildDependencyChain(targetFile);
        console.log(`Direct dependencies: ${depChain.direct.length}`);
        console.log(`Total dependency tree: ${depChain.all.length}`);
        console.log(`Maximum depth: ${depChain.maxDepth}`);
        
        if (depChain.direct.length > 0) {
            console.log('\nDirect dependencies:');
            depChain.direct.forEach(dep => {
                const depInfo = this.fileMap.get(dep);
                const layer = depInfo ? depInfo.layer : 'unknown';
                console.log(`  • ${dep} (${layer})`);
            });
        }
        
        // Reverse dependencies (who uses this file)
        const dependents = this.reverseDependencyGraph.get(targetFile);
        if (dependents && dependents.size > 0) {
            console.log(`\nFiles that depend on this file: ${dependents.size}`);
            Array.from(dependents).slice(0, 10).forEach(dep => {
                const depInfo = this.fileMap.get(dep);
                const layer = depInfo ? depInfo.layer : 'unknown';
                console.log(`  • ${dep} (${layer})`);
            });
            if (dependents.size > 10) {
                console.log(`  ... and ${dependents.size - 10} more`);
            }
        } else {
            console.log('\nNo files depend on this file (potential dead code or entry point)');
        }
        
        console.log('');
        
        // Function call analysis
        const callMap = this.functionCalls.get(targetFile);
        if (callMap && callMap.size > 0) {
            console.log('🔧 FUNCTION CALL ANALYSIS');
            console.log('--------------------------');
            
            const totalCalls = Array.from(callMap.values()).reduce((sum, calls) => sum + calls.length, 0);
            console.log(`Total function calls: ${totalCalls}`);
            console.log(`Unique functions called: ${callMap.size}\n`);
            
            console.log('Most frequently called functions:');
            const sortedCalls = Array.from(callMap.entries())
                .sort((a, b) => b[1].length - a[1].length)
                .slice(0, 10);
            
            sortedCalls.forEach(([func, calls]) => {
                console.log(`  • ${func}(): ${calls.length} calls`);
                if (this.options.showContext && calls.length > 0) {
                    console.log(`    Example: ${calls[0].context}`);
                }
            });
            console.log('');
        }
        
        // Root files analysis
        if (this.rootFiles.size > 0) {
            console.log('🌳 ROOT FILES (ENTRY POINTS)');
            console.log('-----------------------------');
            Array.from(this.rootFiles).forEach(root => {
                const rootInfo = this.fileMap.get(root);
                const layer = rootInfo ? rootInfo.layer : 'unknown';
                console.log(`  • ${root} (${layer})`);
            });
            console.log('');
        }
        
        // Circular dependencies
        if (this.circularDeps.length > 0) {
            console.log('🔄 CIRCULAR DEPENDENCIES');
            console.log('-------------------------');
            this.circularDeps.slice(0, 5).forEach((cycle, i) => {
                console.log(`${i + 1}. ${cycle.join(' → ')}`);
            });
            if (this.circularDeps.length > 5) {
                console.log(`... and ${this.circularDeps.length - 5} more cycles`);
            }
            console.log('');
        }
        
        // Layer analysis
        console.log('🏗️ ARCHITECTURAL LAYER ANALYSIS');
        console.log('--------------------------------');
        const layerStats = new Map();
        
        this.dependencyGraph.forEach((deps, file) => {
            const fileInfo = this.fileMap.get(file);
            if (fileInfo) {
                const layer = fileInfo.layer;
                if (!layerStats.has(layer)) {
                    layerStats.set(layer, { files: 0, dependencies: 0 });
                }
                layerStats.get(layer).files++;
                layerStats.get(layer).dependencies += deps.size;
            }
        });
        
        Array.from(layerStats.entries())
            .sort((a, b) => b[1].files - a[1].files)
            .forEach(([layer, stats]) => {
                const avgDeps = stats.files > 0 ? (stats.dependencies / stats.files).toFixed(1) : 0;
                console.log(`  • ${layer}: ${stats.files} files, ${avgDeps} avg deps`);
            });
        
        console.log('\n' + '=' .repeat(80));
    }

    buildDependencyChain(targetFile, visited = new Set(), depth = 0) {
        if (visited.has(targetFile) || depth > this.options.maxDepth) {
            return { direct: [], all: [], maxDepth: depth };
        }
        
        visited.add(targetFile);
        const deps = this.dependencyGraph.get(targetFile) || new Set();
        const directDeps = Array.from(deps).filter(dep => !dep.startsWith('external:'));
        
        let allDeps = [...directDeps];
        let maxDepth = depth;
        
        directDeps.forEach(dep => {
            const subChain = this.buildDependencyChain(dep, new Set(visited), depth + 1);
            allDeps.push(...subChain.all);
            maxDepth = Math.max(maxDepth, subChain.maxDepth);
        });
        
        return {
            direct: directDeps,
            all: [...new Set(allDeps)],
            maxDepth
        };
    }

    generateMermaidDiagram() {
        console.log('📊 Generating Mermaid diagram...');
        
        let mermaid = 'graph TD\n';
        mermaid += '  %% Code Flow Diagram\n';
        mermaid += '  %% Generated by audit-codeflow.js\n\n';
        
        // Add styling for different layers
        const layerColors = {
            'app': '#ff6b6b',
            'ui': '#4ecdc4',
            'managers': '#45b7d1',
            'physics': '#96ceb4',
            'services': '#feca57',
            'utils': '#ff9ff3',
            'three': '#54a0ff',
            'workers': '#5f27cd',
            'other': '#c8d6e5'
        };
        
        // Group nodes by layer
        const layerGroups = new Map();
        this.dependencyGraph.forEach((deps, file) => {
            const fileInfo = this.fileMap.get(file);
            const layer = fileInfo ? fileInfo.layer : 'other';
            
            if (!layerGroups.has(layer)) {
                layerGroups.set(layer, []);
            }
            layerGroups.get(layer).push(file);
        });
        
        // Add subgraphs for each layer
        layerGroups.forEach((files, layer) => {
            mermaid += `  subgraph ${layer}["${layer.toUpperCase()} Layer"]\n`;
            mermaid += `    direction TB\n`;
            
            files.forEach(file => {
                const nodeId = this.sanitizeNodeId(file);
                const fileName = path.basename(file);
                const fileInfo = this.fileMap.get(file);
                
                let nodeLabel = fileName;
                if (fileInfo) {
                    const stats = `${fileInfo.functions.size}f ${fileInfo.exports.size}e`;
                    nodeLabel += `\\n(${stats})`;
                }
                
                mermaid += `    ${nodeId}["${nodeLabel}"]\n`;
            });
            
            mermaid += '  end\n\n';
        });
        
        // Add dependencies
        mermaid += '  %% Dependencies\n';
        this.dependencyGraph.forEach((deps, file) => {
            const fromId = this.sanitizeNodeId(file);
            
            deps.forEach(dep => {
                if (!dep.startsWith('external:')) {
                    const toId = this.sanitizeNodeId(dep);
                    mermaid += `  ${fromId} --> ${toId}\n`;
                }
            });
        });
        
        // Highlight target file
        const targetId = this.sanitizeNodeId(path.normalize(this.targetFile));
        mermaid += `\n  %% Highlight target file\n`;
        mermaid += `  classDef target fill:#ff9999,stroke:#333,stroke-width:4px\n`;
        mermaid += `  class ${targetId} target\n`;
        
        // Highlight circular dependencies
        if (this.circularDeps.length > 0) {
            mermaid += '\n  %% Circular dependencies\n';
            this.circularDeps.forEach(cycle => {
                for (let i = 0; i < cycle.length - 1; i++) {
                    const fromId = this.sanitizeNodeId(cycle[i]);
                    const toId = this.sanitizeNodeId(cycle[i + 1]);
                    mermaid += `  ${fromId} -.->|cycle| ${toId}\n`;
                }
            });
            mermaid += '  classDef cycle stroke:#ff0000,stroke-width:3px,stroke-dasharray: 5 5\n';
        }
        
        // Save diagram
        const outputPath = './codeflow-diagram.mmd';
        fs.writeFileSync(outputPath, mermaid);
        console.log(`   Mermaid diagram saved to: ${outputPath}`);
        console.log('   Visualize at: https://mermaid.live/\n');
    }

    generateAsciiDiagram() {
        console.log('📊 Generating ASCII flow diagram...');
        
        const targetFile = path.normalize(this.targetFile);
        const lines = [];
        
        lines.push('CODE FLOW DIAGRAM');
        lines.push('═'.repeat(50));
        lines.push('');
        
        // Show target file at center
        lines.push(`🎯 TARGET: ${path.basename(targetFile)}`);
        lines.push('');
        
        // Show direct dependencies
        const deps = this.dependencyGraph.get(targetFile) || new Set();
        const directDeps = Array.from(deps).filter(dep => !dep.startsWith('external:'));
        
        if (directDeps.length > 0) {
            lines.push('📥 DEPENDENCIES:');
            directDeps.forEach((dep, index) => {
                const isLast = index === directDeps.length - 1;
                const prefix = isLast ? '└── ' : '├── ';
                const fileInfo = this.fileMap.get(dep);
                const layer = fileInfo ? `[${fileInfo.layer}]` : '';
                lines.push(`${prefix}${path.basename(dep)} ${layer}`);
            });
            lines.push('');
        }
        
        // Show dependents
        const dependents = this.reverseDependencyGraph.get(targetFile);
        if (dependents && dependents.size > 0) {
            lines.push('📤 USED BY:');
            const dependentArray = Array.from(dependents).slice(0, 10);
            dependentArray.forEach((dep, index) => {
                const isLast = index === dependentArray.length - 1;
                const prefix = isLast ? '└── ' : '├── ';
                const fileInfo = this.fileMap.get(dep);
                const layer = fileInfo ? `[${fileInfo.layer}]` : '';
                lines.push(`${prefix}${path.basename(dep)} ${layer}`);
            });
            if (dependents.size > 10) {
                lines.push(`└── ... and ${dependents.size - 10} more`);
            }
            lines.push('');
        }
        
        // Show layer flow
        lines.push('🏗️ LAYER FLOW:');
        const targetInfo = this.fileMap.get(targetFile);
        if (targetInfo) {
            const layerChain = this.buildLayerChain(targetFile);
            layerChain.forEach((layer, index) => {
                const arrow = index > 0 ? ' ──→ ' : '';
                lines.push(`${arrow}${layer.toUpperCase()}`);
            });
        }
        
        const asciiDiagram = lines.join('\n');
        console.log(asciiDiagram);
        console.log('');
    }

    buildLayerChain(targetFile, visited = new Set()) {
        if (visited.has(targetFile)) return [];
        visited.add(targetFile);
        
        const fileInfo = this.fileMap.get(targetFile);
        const currentLayer = fileInfo ? fileInfo.layer : 'other';
        const layers = [currentLayer];
        
        const deps = this.dependencyGraph.get(targetFile) || new Set();
        const layerSet = new Set();
        
        deps.forEach(dep => {
            if (!dep.startsWith('external:')) {
                const depChain = this.buildLayerChain(dep, new Set(visited));
                depChain.forEach(layer => layerSet.add(layer));
            }
        });
        
        return [currentLayer, ...Array.from(layerSet).filter(l => l !== currentLayer)];
    }

    generateDirectoryTree() {
        console.log('🌳 DIRECTORY TREE STRUCTURE');
        console.log('══════════════════════════════════════════════════\n');
        
        // Build tree structure
        const tree = new Map();
        
        this.dependencyGraph.forEach((deps, file) => {
            const parts = file.split('/');
            let current = tree;
            
            parts.forEach((part, index) => {
                if (!current.has(part)) {
                    current.set(part, new Map());
                }
                current = current.get(part);
                
                // Mark files vs directories
                if (index === parts.length - 1) {
                    current.set('__isFile', true);
                    const fileInfo = this.fileMap.get(file);
                    if (fileInfo) {
                        current.set('__info', {
                            exports: fileInfo.exports.size,
                            functions: fileInfo.functions.size,
                            layer: fileInfo.layer
                        });
                    }
                }
            });
        });
        
        // Print tree
        this.printTree(tree, '', true);
        console.log('');
    }

    printTree(node, prefix, isRoot) {
        const entries = Array.from(node.entries())
            .filter(([key]) => !key.startsWith('__'))
            .sort(([a], [b]) => {
                // Directories first, then files
                const aIsFile = node.get(a).has('__isFile');
                const bIsFile = node.get(b).has('__isFile');
                if (aIsFile && !bIsFile) return 1;
                if (!aIsFile && bIsFile) return -1;
                return a.localeCompare(b);
            });
        
        entries.forEach(([name, child], index) => {
            const isLast = index === entries.length - 1;
            const isFile = child.has('__isFile');
            const info = child.get('__info');
            
            let line = isRoot ? '' : prefix;
            line += isLast ? '└── ' : '├── ';
            line += name;
            
            if (isFile && info) {
                line += ` [${info.layer}] (${info.functions}f, ${info.exports}e)`;
            }
            
            console.log(line);
            
            if (!isFile) {
                const newPrefix = isRoot ? '' : prefix + (isLast ? '    ' : '│   ');
                this.printTree(child, newPrefix, false);
            }
        });
    }

    sanitizeNodeId(filePath) {
        return filePath.replace(/[^a-zA-Z0-9]/g, '_');
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.error('Usage: node scripts/audit-codeflow.js <target-file> [options]');
        console.error('');
        console.error('Options:');
        console.error('  --max-depth N       Maximum dependency depth to analyze (default: 10)');
        console.error('  --format FORMAT     Output format: all, mermaid, ascii, summary (default: all)');
        console.error('  --no-context        Disable context extraction around function calls');
        console.error('  --no-tree           Disable directory tree visualization');
        console.error('  --external          Include external dependencies');
        console.error('');
        console.error('Examples:');
        console.error('  node scripts/audit-codeflow.js src/physics/PhysicsEngine.js');
        console.error('  node scripts/audit-codeflow.js src/App.jsx --format mermaid');
        console.error('  node scripts/audit-codeflow.js src/managers/SatelliteManager.js --max-depth 5');
        process.exit(1);
    }
    
    const targetFile = args[0];
    const options = {};
    
    // Parse options
    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case '--max-depth':
                options.maxDepth = parseInt(args[++i]) || 10;
                break;
            case '--format':
                options.outputFormat = args[++i] || 'all';
                break;
            case '--no-context':
                options.showContext = false;
                break;
            case '--no-tree':
                options.showDirectoryTree = false;
                break;
            case '--external':
                options.includeExternalDeps = true;
                break;
        }
    }
    
    // Validate target file
    const fullPath = path.resolve(projectRoot, targetFile);
    if (!fs.existsSync(fullPath)) {
        console.error(`❌ File not found: ${targetFile}`);
        process.exit(1);
    }
    
    // Run analysis
    const analyzer = new CodeFlowAnalyzer(targetFile, options);
    analyzer.analyze().catch(error => {
        console.error(`❌ Analysis failed: ${error.message}`);
        process.exit(1);
    });
}

export default CodeFlowAnalyzer;