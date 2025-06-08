#!/usr/bin/env node

/**
 * Dependency Graph Analyzer
 * Creates visual dependency graphs and detects architectural violations
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DependencyGraphAnalyzer {
    constructor(rootDir = './src', options = {}) {
        this.rootDir = rootDir;
        this.options = {
            excludeDirs: ['node_modules', '.git', 'dist', 'build', 'coverage', 'tests', '__tests__'],
            includeExts: ['.js', '.jsx', '.ts', '.tsx'],
            outputFormat: 'mermaid', // mermaid, dot, json
            maxDepth: 10,
            showExternalDeps: false,
            clusterByDirectory: true,
            ...options
        };
        
        this.dependencies = new Map(); // file -> Set of dependencies
        this.reverseDependencies = new Map(); // file -> Set of dependents
        this.files = new Map();
        this.clusters = new Map(); // directory -> Set of files
        this.externalDependencies = new Set();
        
        // Architecture layers for violation detection
        this.layers = {
            'ui': ['components/ui', 'hooks'],
            'managers': ['managers'],
            'physics': ['physics'],
            'services': ['services'], 
            'utils': ['utils'],
            'three': ['components/planet', 'components/Satellite']
        };
    }

    async analyze() {
        console.log('🔍 Analyzing dependency graph...\n');
        
        // Phase 1: Collect all files and their dependencies
        await this.collectDependencies();
        
        // Phase 2: Build reverse dependency map
        this.buildReverseDependencies();
        
        // Phase 3: Cluster files by directory
        this.clusterFiles();
        
        // Phase 4: Detect circular dependencies
        this.detectCircularDependencies();
        
        // Phase 5: Detect layer violations
        this.detectLayerViolations();
        
        // Phase 6: Generate output
        this.generateOutput();
    }

    async collectDependencies() {
        console.log('📁 Collecting dependencies...');
        const files = await this.scanDirectory(this.rootDir);
        
        for (const file of files) {
            await this.analyzeFile(file);
        }
        
        console.log(`   Found ${files.length} source files`);
        console.log(`   Found ${this.dependencies.size} files with dependencies`);
        console.log(`   Found ${this.externalDependencies.size} external dependencies\n`);
    }

    async scanDirectory(dir) {
        const files = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory()) {
                if (!this.options.excludeDirs.includes(entry.name)) {
                    files.push(...await this.scanDirectory(fullPath));
                }
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name);
                if (this.options.includeExts.includes(ext)) {
                    files.push(fullPath);
                }
            }
        }
        
        return files;
    }

    async analyzeFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const relativePath = path.relative(this.rootDir, filePath);
            
            const fileInfo = {
                path: filePath,
                relativePath,
                directory: path.dirname(relativePath),
                dependencies: new Set()
            };
            
            this.files.set(relativePath, fileInfo);
            
            // Extract all import patterns
            this.extractImports(content, fileInfo);
            
            // Store dependencies
            this.dependencies.set(relativePath, fileInfo.dependencies);
            
        } catch (error) {
            console.error(`Error analyzing ${filePath}:`, error.message);
        }
    }

    extractImports(content, fileInfo) {
        const imports = new Set();
        
        // ES6 imports
        const importRegex = /import\s+(?:[^'"]*\s+from\s+)?['"`]([^'"`]+)['"`]/g;
        let match;
        
        while ((match = importRegex.exec(content)) !== null) {
            const importPath = match[1];
            imports.add(importPath);
        }
        
        // Dynamic imports
        const dynamicImportRegex = /(?:await\s+)?import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
        while ((match = dynamicImportRegex.exec(content)) !== null) {
            imports.add(match[1]);
        }
        
        // Worker imports
        const workerRegex = /new\s+Worker\s*\(\s*new\s+URL\s*\(\s*['"`]([^'"`]+)['"`]/g;
        while ((match = workerRegex.exec(content)) !== null) {
            imports.add(match[1]);
        }
        
        // CommonJS requires
        const requireRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
        while ((match = requireRegex.exec(content)) !== null) {
            imports.add(match[1]);
        }
        
        // Process each import
        imports.forEach(importPath => {
            const resolvedPath = this.resolveImportPath(importPath, fileInfo.relativePath);
            if (resolvedPath) {
                if (resolvedPath.startsWith('external:')) {
                    this.externalDependencies.add(resolvedPath.replace('external:', ''));
                } else {
                    fileInfo.dependencies.add(resolvedPath);
                }
            }
        });
    }

    resolveImportPath(importPath, fromFile) {
        // External dependencies (npm packages)
        if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
            if (this.options.showExternalDeps) {
                return `external:${importPath}`;
            }
            return null;
        }
        
        // Relative imports
        if (importPath.startsWith('./') || importPath.startsWith('../')) {
            const fromDir = path.dirname(fromFile);
            let resolved = path.normalize(path.join(fromDir, importPath));
            
            // Try different extensions
            const exts = ['.js', '.jsx', '.ts', '.tsx'];
            
            // Check if file exists as-is
            if (this.files.has(resolved)) {
                return resolved;
            }
            
            // Try adding extensions
            for (const ext of exts) {
                if (this.files.has(resolved + ext)) {
                    return resolved + ext;
                }
            }
            
            // Try index files
            for (const ext of exts) {
                const indexPath = path.join(resolved, 'index' + ext);
                if (this.files.has(indexPath)) {
                    return indexPath;
                }
            }
        }
        
        return null;
    }

    buildReverseDependencies() {
        console.log('🔗 Building reverse dependency map...');
        
        this.dependencies.forEach((deps, file) => {
            deps.forEach(dep => {
                if (!this.reverseDependencies.has(dep)) {
                    this.reverseDependencies.set(dep, new Set());
                }
                this.reverseDependencies.get(dep).add(file);
            });
        });
    }

    clusterFiles() {
        if (!this.options.clusterByDirectory) return;
        
        console.log('📂 Clustering files by directory...');
        
        this.files.forEach((fileInfo, file) => {
            const dir = fileInfo.directory;
            const topLevelDir = dir.split('/')[0];
            
            if (!this.clusters.has(topLevelDir)) {
                this.clusters.set(topLevelDir, new Set());
            }
            this.clusters.get(topLevelDir).add(file);
        });
    }

    detectCircularDependencies() {
        console.log('🔄 Detecting circular dependencies...');
        
        const visited = new Set();
        const recursionStack = new Set();
        const cycles = [];
        
        const dfs = (node, path = []) => {
            if (recursionStack.has(node)) {
                // Found a cycle
                const cycleStart = path.indexOf(node);
                const cycle = path.slice(cycleStart).concat([node]);
                cycles.push(cycle);
                return;
            }
            
            if (visited.has(node)) return;
            
            visited.add(node);
            recursionStack.add(node);
            path.push(node);
            
            const deps = this.dependencies.get(node) || new Set();
            deps.forEach(dep => {
                dfs(dep, [...path]);
            });
            
            recursionStack.delete(node);
            path.pop();
        };
        
        // Check all files for cycles
        this.files.forEach((_, file) => {
            if (!visited.has(file)) {
                dfs(file);
            }
        });
        
        this.circularDependencies = cycles;
        console.log(`   Found ${cycles.length} circular dependencies\n`);
    }

    detectLayerViolations() {
        console.log('🚧 Detecting architectural layer violations...');
        
        const violations = [];
        
        this.dependencies.forEach((deps, file) => {
            const fileLayer = this.getFileLayer(file);
            
            deps.forEach(dep => {
                const depLayer = this.getFileLayer(dep);
                
                if (fileLayer && depLayer && this.isLayerViolation(fileLayer, depLayer)) {
                    violations.push({
                        from: file,
                        to: dep,
                        fromLayer: fileLayer,
                        toLayer: depLayer,
                        severity: this.getViolationSeverity(fileLayer, depLayer)
                    });
                }
            });
        });
        
        this.layerViolations = violations;
        console.log(`   Found ${violations.length} layer violations\n`);
    }

    getFileLayer(file) {
        for (const [layer, patterns] of Object.entries(this.layers)) {
            if (patterns.some(pattern => file.startsWith(pattern))) {
                return layer;
            }
        }
        return null;
    }

    isLayerViolation(fromLayer, toLayer) {
        // Define allowed dependencies
        const allowedDeps = {
            'ui': ['utils', 'services', 'managers'],
            'three': ['physics', 'utils', 'services'],
            'physics': ['utils'],
            'managers': ['physics', 'utils', 'services', 'three'],
            'services': ['utils', 'physics'],
            'utils': []
        };
        
        const allowed = allowedDeps[fromLayer] || [];
        return !allowed.includes(toLayer) && fromLayer !== toLayer;
    }

    getViolationSeverity(fromLayer, toLayer) {
        // Critical violations
        if (fromLayer === 'ui' && toLayer === 'physics') return 'critical';
        if (fromLayer === 'utils' && toLayer !== 'utils') return 'critical';
        
        // High violations
        if (fromLayer === 'ui' && toLayer === 'three') return 'high';
        
        return 'medium';
    }

    generateOutput() {
        console.log('📊 Generating output...');
        
        switch (this.options.outputFormat) {
            case 'mermaid':
                this.generateMermaidDiagram();
                break;
            case 'dot':
                this.generateDotGraph();
                break;
            case 'json':
                this.generateJsonReport();
                // Always show summary even in JSON mode for consistency with other audit scripts
                this.generateSummaryReport();
                break;
            default:
                this.generateSummaryReport();
        }
    }

    generateMermaidDiagram() {
        let mermaid = 'graph TD\n';
        
        // Add nodes with clusters
        if (this.options.clusterByDirectory) {
            this.clusters.forEach((files, cluster) => {
                mermaid += `\n  subgraph ${cluster}["${cluster}/"]\n`;
                files.forEach(file => {
                    const nodeId = file.replace(/[^a-zA-Z0-9]/g, '_');
                    const fileName = path.basename(file);
                    mermaid += `    ${nodeId}["${fileName}"]\n`;
                });
                mermaid += '  end\n';
            });
        }
        
        // Add dependencies
        this.dependencies.forEach((deps, file) => {
            const fromId = file.replace(/[^a-zA-Z0-9]/g, '_');
            deps.forEach(dep => {
                const toId = dep.replace(/[^a-zA-Z0-9]/g, '_');
                mermaid += `  ${fromId} --> ${toId}\n`;
            });
        });
        
        // Highlight circular dependencies
        this.circularDependencies.forEach(cycle => {
            for (let i = 0; i < cycle.length - 1; i++) {
                const fromId = cycle[i].replace(/[^a-zA-Z0-9]/g, '_');
                const toId = cycle[i + 1].replace(/[^a-zA-Z0-9]/g, '_');
                mermaid += `  ${fromId} -.->|cycle| ${toId}\n`;
            }
        });
        
        fs.writeFileSync('./dependency-graph.mmd', mermaid);
        console.log('   Mermaid diagram saved to: dependency-graph.mmd');
    }

    generateDotGraph() {
        let dot = 'digraph Dependencies {\n';
        dot += '  rankdir=TB;\n';
        dot += '  node [shape=box];\n\n';
        
        // Add clusters
        if (this.options.clusterByDirectory) {
            let clusterIndex = 0;
            this.clusters.forEach((files, cluster) => {
                dot += `  subgraph cluster_${clusterIndex} {\n`;
                dot += `    label="${cluster}/";\n`;
                dot += '    style=filled;\n';
                dot += '    color=lightgrey;\n';
                
                files.forEach(file => {
                    const nodeId = file.replace(/[^a-zA-Z0-9]/g, '_');
                    const fileName = path.basename(file);
                    dot += `    "${nodeId}" [label="${fileName}"];\n`;
                });
                
                dot += '  }\n\n';
                clusterIndex++;
            });
        }
        
        // Add dependencies
        this.dependencies.forEach((deps, file) => {
            const fromId = file.replace(/[^a-zA-Z0-9]/g, '_');
            deps.forEach(dep => {
                const toId = dep.replace(/[^a-zA-Z0-9]/g, '_');
                dot += `  "${fromId}" -> "${toId}";\n`;
            });
        });
        
        dot += '}\n';
        
        fs.writeFileSync('./dependency-graph.dot', dot);
        console.log('   DOT graph saved to: dependency-graph.dot');
        console.log('   Generate SVG with: dot -Tsvg dependency-graph.dot -o dependency-graph.svg');
    }

    generateJsonReport() {
        const report = {
            summary: {
                totalFiles: this.files.size,
                totalDependencies: Array.from(this.dependencies.values()).reduce((sum, deps) => sum + deps.size, 0),
                circularDependencies: this.circularDependencies.length,
                layerViolations: this.layerViolations.length,
                externalDependencies: this.externalDependencies.size
            },
            dependencies: Object.fromEntries(
                Array.from(this.dependencies.entries()).map(([file, deps]) => [
                    file, Array.from(deps)
                ])
            ),
            reverseDependencies: Object.fromEntries(
                Array.from(this.reverseDependencies.entries()).map(([file, deps]) => [
                    file, Array.from(deps)
                ])
            ),
            circularDependencies: this.circularDependencies,
            layerViolations: this.layerViolations,
            clusters: Object.fromEntries(
                Array.from(this.clusters.entries()).map(([cluster, files]) => [
                    cluster, Array.from(files)
                ])
            ),
            externalDependencies: Array.from(this.externalDependencies)
        };
        
        fs.writeFileSync('./dependency-graph-report.json', JSON.stringify(report, null, 2));
        console.log('   JSON report saved to: dependency-graph-report.json');
    }

    generateSummaryReport() {
        console.log('📊 DEPENDENCY GRAPH ANALYSIS');
        console.log('══════════════════════════════════════════════════\n');
        
        console.log('📈 SUMMARY');
        console.log('--------------------');
        console.log(`Total Files: ${this.files.size}`);
        console.log(`Total Dependencies: ${Array.from(this.dependencies.values()).reduce((sum, deps) => sum + deps.size, 0)}`);
        console.log(`External Dependencies: ${this.externalDependencies.size}`);
        console.log(`Circular Dependencies: ${this.circularDependencies.length}`);
        console.log(`Layer Violations: ${this.layerViolations.length}\n`);
        
        // Show clusters
        if (this.clusters.size > 0) {
            console.log('📂 DIRECTORY CLUSTERS');
            console.log('--------------------');
            this.clusters.forEach((files, cluster) => {
                console.log(`${cluster}/: ${files.size} files`);
            });
            console.log('');
        }
        
        // Show circular dependencies
        if (this.circularDependencies.length > 0) {
            console.log('🔄 CIRCULAR DEPENDENCIES');
            console.log('--------------------');
            this.circularDependencies.slice(0, 10).forEach((cycle, i) => {
                console.log(`${i + 1}. ${cycle.join(' → ')}`);
            });
            if (this.circularDependencies.length > 10) {
                console.log(`... and ${this.circularDependencies.length - 10} more\n`);
            } else {
                console.log('');
            }
        }
        
        // Show layer violations
        if (this.layerViolations.length > 0) {
            console.log('🚧 LAYER VIOLATIONS');
            console.log('--------------------');
            const criticalViolations = this.layerViolations.filter(v => v.severity === 'critical');
            const highViolations = this.layerViolations.filter(v => v.severity === 'high');
            
            console.log(`Critical: ${criticalViolations.length}, High: ${highViolations.length}`);
            
            criticalViolations.slice(0, 5).forEach(violation => {
                console.log(`🔴 ${violation.from} → ${violation.to} (${violation.fromLayer} → ${violation.toLayer})`);
            });
            
            highViolations.slice(0, 5).forEach(violation => {
                console.log(`🟡 ${violation.from} → ${violation.to} (${violation.fromLayer} → ${violation.toLayer})`);
            });
            
            console.log('');
        }
        
        // Show most connected files
        const connectionCounts = new Map();
        this.dependencies.forEach((deps, file) => {
            const incoming = this.reverseDependencies.get(file)?.size || 0;
            const outgoing = deps.size;
            connectionCounts.set(file, incoming + outgoing);
        });
        
        const mostConnected = Array.from(connectionCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        if (mostConnected.length > 0) {
            console.log('🔗 MOST CONNECTED FILES');
            console.log('--------------------');
            mostConnected.forEach(([file, connections]) => {
                const incoming = this.reverseDependencies.get(file)?.size || 0;
                const outgoing = this.dependencies.get(file)?.size || 0;
                console.log(`${file}: ${connections} total (${incoming} in, ${outgoing} out)`);
            });
        }
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const options = {};
    
    // Parse flags
    if (args.includes('--mermaid')) options.outputFormat = 'mermaid';
    if (args.includes('--dot')) options.outputFormat = 'dot';
    if (args.includes('--json')) options.outputFormat = 'json';
    if (args.includes('--external')) options.showExternalDeps = true;
    if (args.includes('--no-cluster')) options.clusterByDirectory = false;
    
    // Get directory
    const nonFlagArgs = args.filter(arg => !arg.startsWith('--'));
    const rootDir = nonFlagArgs[0] || './src';
    
    const analyzer = new DependencyGraphAnalyzer(rootDir, options);
    analyzer.analyze().catch(error => {
        console.error('❌ Analysis failed:', error.message);
        process.exit(1);
    });
}

export default DependencyGraphAnalyzer;