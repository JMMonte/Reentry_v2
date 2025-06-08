#!/usr/bin/env node

/**
 * Enhanced Codebase Audit Script
 * 
 * Comprehensive analysis for memory leaks, data flow, architectural patterns,
 * and separation of concerns in a Three.js/React/Physics simulation codebase.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

class EnhancedCodebaseAuditor {
    constructor(rootDir = './src', options = {}) {
        this.rootDir = rootDir;
        this.options = {
            outputFormat: 'console', // console, json, html
            focusArea: 'all', // all, memory, architecture, performance
            threshold: {
                fileSize: 40000, // bytes
                lines: 1000,
                complexity: 20,
                coupling: 10
            },
            ...options
        };
        
        this.analysis = {
            files: [],
            memoryLeaks: {
                eventListeners: [],
                animationFrames: [],
                workers: [],
                staticCollections: [],
                threeJsResources: []
            },
            dataFlow: {
                physicsToReact: [],
                reactToThreeJs: [],
                threeJsToPhysics: [],
                crossBoundaryViolations: []
            },
            architecture: {
                separationViolations: [],
                managerPatterns: [],
                circularDependencies: [],
                unusedExports: []
            },
            callGraph: {},
            metrics: {}
        };
    }

    /**
     * Run comprehensive audit
     */
    async audit() {
        this.log(`${colors.cyan}🔍 ENHANCED CODEBASE AUDIT${colors.reset}`);
        this.log(`${'═'.repeat(50)}`);
        this.log(`Target: ${colors.bright}${this.rootDir}${colors.reset}`);
        this.log(`Focus: ${colors.bright}${this.options.focusArea}${colors.reset}\n`);

        // Scan and analyze files
        await this.scanFiles();
        
        // Run focused analyses
        if (this.options.focusArea === 'all' || this.options.focusArea === 'memory') {
            await this.analyzeMemoryLeaks();
        }
        
        if (this.options.focusArea === 'all' || this.options.focusArea === 'architecture') {
            await this.analyzeDataFlow();
            await this.analyzeArchitecture();
        }
        
        await this.generateCallGraph();
        await this.calculateMetrics();
        await this.generateReport();
        
        return this.analysis;
    }

    /**
     * Scan and analyze all files
     */
    async scanFiles() {
        this.log(`${colors.blue}📁 Scanning files...${colors.reset}`);
        await this.scanDirectory(this.rootDir);
        this.log(`   Found ${colors.bright}${this.analysis.files.length}${colors.reset} source files\n`);
    }

    /**
     * Recursively scan directory
     */
    async scanDirectory(dirPath, level = 0) {
        if (!fs.existsSync(dirPath)) return;

        const entries = fs.readdirSync(dirPath);
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry);
            const stats = fs.statSync(fullPath);

            if (stats.isDirectory()) {
                if (!entry.startsWith('.') && entry !== 'node_modules') {
                    await this.scanDirectory(fullPath, level + 1);
                }
            } else if (this.isSourceFile(entry)) {
                const fileInfo = await this.analyzeFile(fullPath, stats);
                if (fileInfo) {
                    this.analysis.files.push(fileInfo);
                }
            }
        }
    }

    /**
     * Check if file is a source file we should analyze
     */
    isSourceFile(filename) {
        const extensions = ['.js', '.jsx', '.ts', '.tsx'];
        return extensions.some(ext => filename.endsWith(ext));
    }

    /**
     * Analyze individual file
     */
    async analyzeFile(filePath, stats) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            const relativePath = path.relative(this.rootDir, filePath);

            return {
                path: filePath,
                relativePath,
                name: path.basename(filePath),
                ext: path.extname(filePath),
                size: stats.size,
                lines: lines.length,
                content,
                domain: this.identifyDomain(relativePath),
                imports: this.extractImports(content),
                exports: this.extractExports(content),
                classes: this.extractClasses(content),
                functions: this.extractFunctions(content),
                complexity: this.calculateComplexity(content),
                memoryPatterns: this.analyzeMemoryPatterns(content),
                architecturalPatterns: this.analyzeArchitecturalPatterns(content, relativePath)
            };
        } catch (error) {
            this.log(`${colors.red}Error analyzing ${filePath}: ${error.message}${colors.reset}`);
            return null;
        }
    }

    /**
     * Identify the domain/layer this file belongs to
     */
    identifyDomain(relativePath) {
        if (relativePath.includes('physics/')) return 'physics';
        if (relativePath.includes('components/') && relativePath.includes('.jsx')) return 'react';
        if (relativePath.includes('components/') && !relativePath.includes('.jsx')) return 'threejs';
        if (relativePath.includes('managers/')) return 'managers';
        if (relativePath.includes('simulation/')) return 'simulation';
        if (relativePath.includes('hooks/')) return 'react';
        if (relativePath.includes('providers/')) return 'react';
        if (relativePath.includes('utils/')) return 'utils';
        if (relativePath.includes('services/')) return 'services';
        return 'unknown';
    }

    /**
     * Extract import statements with more detail
     */
    extractImports(content) {
        const imports = [];
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const importMatch = line.match(/import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)?\s*(?:,\s*(?:{[^}]*}|\w+))?\s*from\s+['"`]([^'"`]+)['"`]/);
            
            if (importMatch) {
                const source = importMatch[1];
                imports.push({
                    source,
                    line: i + 1,
                    isRelative: source.startsWith('.') || source.startsWith('../'),
                    isExternal: !source.startsWith('.') && !source.startsWith('../'),
                    isDynamic: line.includes('import('),
                    domain: this.categorizeImport(source)
                });
            }
        }
        
        return imports;
    }

    /**
     * Categorize import by domain
     */
    categorizeImport(source) {
        if (source.includes('three')) return 'threejs';
        if (source.includes('react')) return 'react';
        if (source.includes('physics')) return 'physics';
        if (source.startsWith('./') || source.startsWith('../')) return 'local';
        return 'external';
    }

    /**
     * Extract exports with more detail
     */
    extractExports(content) {
        const exports = [];
        
        // Named exports
        const namedExportRegex = /export\s+(?:const|let|var|function|class|async\s+function)\s+(\w+)/g;
        let match;
        while ((match = namedExportRegex.exec(content)) !== null) {
            exports.push({ name: match[1], type: 'named' });
        }

        // Default exports
        if (content.includes('export default')) {
            const defaultMatch = content.match(/export\s+default\s+(?:class\s+)?(\w+)?/);
            exports.push({ 
                name: defaultMatch?.[1] || 'anonymous', 
                type: 'default' 
            });
        }

        return exports;
    }

    /**
     * Extract class definitions with inheritance
     */
    extractClasses(content) {
        const classes = [];
        const classRegex = /class\s+(\w+)(?:\s+extends\s+(\w+))?/g;
        let match;

        while ((match = classRegex.exec(content)) !== null) {
            classes.push({
                name: match[1],
                extends: match[2] || null,
                methods: this.extractClassMethods(content, match[1])
            });
        }

        return classes;
    }

    /**
     * Extract methods from a class
     */
    extractClassMethods(content, className) {
        const methods = [];
        const classStart = content.indexOf(`class ${className}`);
        if (classStart === -1) return methods;

        // Find class body
        let braceCount = 0;
        let inClass = false;
        let classBody = '';
        
        for (let i = classStart; i < content.length; i++) {
            const char = content[i];
            if (char === '{') {
                braceCount++;
                inClass = true;
            } else if (char === '}') {
                braceCount--;
                if (braceCount === 0 && inClass) {
                    classBody = content.substring(classStart, i + 1);
                    break;
                }
            }
        }

        // Extract methods from class body
        const methodRegex = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*{/g;
        let match;
        while ((match = methodRegex.exec(classBody)) !== null) {
            if (match[1] !== className) { // Exclude constructor with same name as class
                methods.push(match[1]);
            }
        }

        return methods;
    }

    /**
     * Extract function definitions
     */
    extractFunctions(content) {
        const functions = [];
        
        // Regular functions
        const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
        let match;
        while ((match = funcRegex.exec(content)) !== null) {
            functions.push({ name: match[1], type: 'function' });
        }

        // Arrow functions
        const arrowRegex = /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/g;
        while ((match = arrowRegex.exec(content)) !== null) {
            functions.push({ name: match[1], type: 'arrow' });
        }

        return functions;
    }

    /**
     * Calculate complexity metrics
     */
    calculateComplexity(content) {
        const cyclomaticComplexity = (content.match(/\b(if|while|for|switch|catch|&&|\|\||case)\b/g) || []).length + 1;
        const lines = content.split('\n');
        const codeLines = lines.filter(line => 
            line.trim() && 
            !line.trim().startsWith('//') && 
            !line.trim().startsWith('/*') &&
            !line.trim().startsWith('*')
        ).length;
        
        return {
            cyclomaticComplexity,
            codeLines,
            commentRatio: (lines.length - codeLines) / lines.length,
            nestingLevel: this.calculateNestingLevel(content)
        };
    }

    /**
     * Calculate maximum nesting level
     */
    calculateNestingLevel(content) {
        let maxLevel = 0;
        let currentLevel = 0;
        
        for (const char of content) {
            if (char === '{') {
                currentLevel++;
                maxLevel = Math.max(maxLevel, currentLevel);
            } else if (char === '}') {
                currentLevel--;
            }
        }
        
        return maxLevel;
    }

    /**
     * Analyze memory leak patterns in file
     */
    analyzeMemoryPatterns(content) {
        const patterns = {
            eventListeners: [],
            animationFrames: [],
            workers: [],
            staticCollections: [],
            threeJsResources: [],
            timers: []
        };

        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            // Event listeners
            if (line.includes('addEventListener')) {
                const hasRemoval = this.findCorrespondingRemoval(lines, i, 'removeEventListener');
                patterns.eventListeners.push({
                    line: lineNum,
                    content: line.trim(),
                    hasCleanup: hasRemoval.found,
                    cleanupLine: hasRemoval.line,
                    severity: hasRemoval.found ? 'low' : 'high'
                });
            }

            // Animation frames
            if (line.includes('requestAnimationFrame')) {
                const hasCancel = this.findCorrespondingRemoval(lines, i, 'cancelAnimationFrame');
                patterns.animationFrames.push({
                    line: lineNum,
                    content: line.trim(),
                    hasCleanup: hasCancel.found,
                    cleanupLine: hasCancel.line,
                    severity: hasCancel.found ? 'low' : 'high'
                });
            }

            // Workers
            if (line.includes('new Worker') || line.includes('new SharedWorker')) {
                const hasTerminate = this.findCorrespondingRemoval(lines, i, 'terminate');
                patterns.workers.push({
                    line: lineNum,
                    content: line.trim(),
                    hasCleanup: hasTerminate.found,
                    cleanupLine: hasTerminate.line,
                    severity: hasTerminate.found ? 'low' : 'high'
                });
            }

            // Static collections
            if (line.includes('static') && (line.includes('Map') || line.includes('Set') || line.includes('Array'))) {
                patterns.staticCollections.push({
                    line: lineNum,
                    content: line.trim(),
                    severity: 'medium'
                });
            }

            // Three.js resources
            if (line.includes('new THREE.') && (line.includes('Geometry') || line.includes('Material') || line.includes('Texture'))) {
                const hasDispose = this.findCorrespondingRemoval(lines, i, 'dispose');
                patterns.threeJsResources.push({
                    line: lineNum,
                    content: line.trim(),
                    hasCleanup: hasDispose.found,
                    cleanupLine: hasDispose.line,
                    severity: hasDispose.found ? 'low' : 'high'
                });
            }

            // Timers
            if (line.includes('setTimeout') || line.includes('setInterval')) {
                const hasClear = this.findCorrespondingRemoval(lines, i, line.includes('setTimeout') ? 'clearTimeout' : 'clearInterval');
                patterns.timers.push({
                    line: lineNum,
                    content: line.trim(),
                    hasCleanup: hasClear.found,
                    cleanupLine: hasClear.line,
                    severity: hasClear.found ? 'low' : 'high'
                });
            }
        }

        return patterns;
    }

    /**
     * Find corresponding cleanup call for a resource
     */
    findCorrespondingRemoval(lines, startLine, cleanupKeyword) {
        // Look in the entire file for cleanup patterns
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes(cleanupKeyword)) {
                return { found: true, line: i + 1 };
            }
        }
        
        // Also check for dispose methods that handle cleanup
        const hasDisposeMethod = lines.some(line => 
            line.includes('dispose()') || 
            line.includes('dispose() {') ||
            line.includes('.dispose();') ||
            line.includes('.dispose()') ||
            line.includes('function dispose') ||
            line.includes('dispose:')
        );
        
        if (hasDisposeMethod) {
            return { found: true, line: 'dispose method' };
        }
        
        return { found: false, line: null };
    }

    /**
     * Analyze architectural patterns
     */
    analyzeArchitecturalPatterns(content, relativePath) {
        const patterns = {
            domainViolations: [],
            managerUsage: [],
            reactHookUsage: [],
            threeJsUsage: []
        };

        const domain = this.identifyDomain(relativePath);
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            // Check for domain violations
            if (domain === 'react' && line.includes('THREE.')) {
                patterns.domainViolations.push({
                    line: lineNum,
                    violation: 'Three.js usage in React component',
                    content: line.trim(),
                    severity: 'medium'
                });
            }

            if (domain === 'physics' && (line.includes('useState') || line.includes('useEffect'))) {
                patterns.domainViolations.push({
                    line: lineNum,
                    violation: 'React hooks in physics layer',
                    content: line.trim(),
                    severity: 'high'
                });
            }

            // Manager pattern usage
            if (line.includes('Manager') && (line.includes('new ') || line.includes('import'))) {
                patterns.managerUsage.push({
                    line: lineNum,
                    content: line.trim()
                });
            }

            // React hook usage
            if (line.includes('use') && (line.includes('useState') || line.includes('useEffect') || line.includes('useCallback'))) {
                patterns.reactHookUsage.push({
                    line: lineNum,
                    hook: line.match(/use\w+/)?.[0],
                    content: line.trim()
                });
            }

            // Three.js usage
            if (line.includes('THREE.')) {
                const threeClass = line.match(/THREE\.(\w+)/)?.[1];
                patterns.threeJsUsage.push({
                    line: lineNum,
                    class: threeClass,
                    content: line.trim()
                });
            }
        }

        return patterns;
    }

    /**
     * Analyze memory leak patterns across the codebase
     */
    async analyzeMemoryLeaks() {
        this.log(`${colors.yellow}🧠 Analyzing memory leak patterns...${colors.reset}`);

        for (const file of this.analysis.files) {
            const patterns = file.memoryPatterns;
            
            // Collect high-severity memory leaks
            patterns.eventListeners.filter(p => p.severity === 'high').forEach(pattern => {
                this.analysis.memoryLeaks.eventListeners.push({
                    file: file.relativePath,
                    ...pattern
                });
            });

            patterns.animationFrames.filter(p => p.severity === 'high').forEach(pattern => {
                this.analysis.memoryLeaks.animationFrames.push({
                    file: file.relativePath,
                    ...pattern
                });
            });

            patterns.workers.filter(p => p.severity === 'high').forEach(pattern => {
                this.analysis.memoryLeaks.workers.push({
                    file: file.relativePath,
                    ...pattern
                });
            });

            patterns.staticCollections.forEach(pattern => {
                this.analysis.memoryLeaks.staticCollections.push({
                    file: file.relativePath,
                    ...pattern
                });
            });

            patterns.threeJsResources.filter(p => p.severity === 'high').forEach(pattern => {
                this.analysis.memoryLeaks.threeJsResources.push({
                    file: file.relativePath,
                    ...pattern
                });
            });
        }

        const totalLeaks = Object.values(this.analysis.memoryLeaks).reduce((sum, arr) => sum + arr.length, 0);
        this.log(`   Found ${colors.bright}${totalLeaks}${colors.reset} potential memory leaks\n`);
    }

    /**
     * Analyze data flow between domains
     */
    async analyzeDataFlow() {
        this.log(`${colors.magenta}🔄 Analyzing data flow patterns...${colors.reset}`);

        for (const file of this.analysis.files) {
            const domain = file.domain;
            
            // Check for cross-boundary violations
            file.architecturalPatterns.domainViolations.forEach(violation => {
                this.analysis.dataFlow.crossBoundaryViolations.push({
                    file: file.relativePath,
                    domain,
                    ...violation
                });
            });

            // Track physics to React data flow
            if (domain === 'react' && file.imports.some(imp => imp.domain === 'physics')) {
                this.analysis.dataFlow.physicsToReact.push({
                    file: file.relativePath,
                    physicsImports: file.imports.filter(imp => imp.domain === 'physics')
                });
            }

            // Track React to Three.js integration
            if (domain === 'react' && file.architecturalPatterns.threeJsUsage.length > 0) {
                this.analysis.dataFlow.reactToThreeJs.push({
                    file: file.relativePath,
                    threeJsUsage: file.architecturalPatterns.threeJsUsage
                });
            }

            // Track Three.js to Physics integration
            if (domain === 'threejs' && file.imports.some(imp => imp.domain === 'physics')) {
                this.analysis.dataFlow.threeJsToPhysics.push({
                    file: file.relativePath,
                    physicsImports: file.imports.filter(imp => imp.domain === 'physics')
                });
            }
        }

        const violations = this.analysis.dataFlow.crossBoundaryViolations.length;
        this.log(`   Found ${colors.bright}${violations}${colors.reset} cross-boundary violations\n`);
    }

    /**
     * Analyze architectural patterns
     */
    async analyzeArchitecture() {
        this.log(`${colors.green}🏗️  Analyzing architectural patterns...${colors.reset}`);

        // Collect separation violations
        for (const file of this.analysis.files) {
            file.architecturalPatterns.domainViolations.forEach(violation => {
                this.analysis.architecture.separationViolations.push({
                    file: file.relativePath,
                    domain: file.domain,
                    ...violation
                });
            });

            // Collect manager patterns
            if (file.architecturalPatterns.managerUsage.length > 0) {
                this.analysis.architecture.managerPatterns.push({
                    file: file.relativePath,
                    domain: file.domain,
                    managers: file.architecturalPatterns.managerUsage
                });
            }
        }

        // Find unused exports
        this.findUnusedExports();

        const violations = this.analysis.architecture.separationViolations.length;
        const managers = this.analysis.architecture.managerPatterns.length;
        this.log(`   Found ${colors.bright}${violations}${colors.reset} architectural violations`);
        this.log(`   Found ${colors.bright}${managers}${colors.reset} manager pattern usages\n`);
    }

    /**
     * Find unused exports across the codebase
     */
    findUnusedExports() {
        const allExports = new Map();
        const allImports = new Set();

        // Collect all exports
        for (const file of this.analysis.files) {
            for (const exp of file.exports) {
                allExports.set(`${file.relativePath}:${exp.name}`, {
                    file: file.relativePath,
                    name: exp.name,
                    type: exp.type,
                    used: false
                });
            }
        }

        // Mark used exports
        for (const file of this.analysis.files) {
            for (const imp of file.imports) {
                if (imp.isRelative) {
                    // Try to resolve the import and mark exports as used
                    const resolvedPath = this.resolveImportPath(file.relativePath, imp.source);
                    allImports.add(resolvedPath);
                }
            }
        }

        // Find unused exports
        for (const [key, exportInfo] of allExports) {
            if (!allImports.has(exportInfo.file) && exportInfo.name !== 'default') {
                this.analysis.architecture.unusedExports.push(exportInfo);
            }
        }
    }

    /**
     * Resolve relative import path
     */
    resolveImportPath(fromFile, importPath) {
        const fromDir = path.dirname(fromFile);
        const resolved = path.resolve(fromDir, importPath);
        return path.relative('.', resolved);
    }

    /**
     * Generate call graph
     */
    async generateCallGraph() {
        this.log(`${colors.cyan}🗺️  Generating call graph...${colors.reset}`);

        for (const file of this.analysis.files) {
            const functions = [...file.functions, ...file.classes.flatMap(c => c.methods.map(m => ({ name: m, type: 'method' })))];
            
            this.analysis.callGraph[file.relativePath] = {
                domain: file.domain,
                exports: functions.map(f => f.name),
                imports: file.imports.map(i => i.source),
                complexity: file.complexity.cyclomaticComplexity,
                size: file.lines
            };
        }

        const totalFunctions = Object.values(this.analysis.callGraph)
            .reduce((sum, file) => sum + file.exports.length, 0);
        
        this.log(`   Mapped ${colors.bright}${totalFunctions}${colors.reset} functions and methods\n`);
    }

    /**
     * Calculate overall metrics
     */
    async calculateMetrics() {
        this.log(`${colors.blue}📊 Calculating metrics...${colors.reset}`);

        const files = this.analysis.files;
        const domains = {};
        
        // Group by domain
        for (const file of files) {
            if (!domains[file.domain]) {
                domains[file.domain] = { files: [], totalLines: 0, totalSize: 0 };
            }
            domains[file.domain].files.push(file);
            domains[file.domain].totalLines += file.lines;
            domains[file.domain].totalSize += file.size;
        }

        this.analysis.metrics = {
            totalFiles: files.length,
            totalLines: files.reduce((sum, f) => sum + f.lines, 0),
            totalSize: files.reduce((sum, f) => sum + f.size, 0),
            averageComplexity: files.reduce((sum, f) => sum + f.complexity.cyclomaticComplexity, 0) / files.length,
            domainDistribution: domains,
            memoryRisk: this.calculateMemoryRisk(),
            architecturalHealth: this.calculateArchitecturalHealth()
        };

        this.log(`   Processed ${colors.bright}${files.length}${colors.reset} files`);
        this.log(`   Total lines: ${colors.bright}${this.analysis.metrics.totalLines.toLocaleString()}${colors.reset}\n`);
    }

    /**
     * Calculate memory risk score
     */
    calculateMemoryRisk() {
        const leaks = this.analysis.memoryLeaks;
        const total = Object.values(leaks).reduce((sum, arr) => sum + arr.length, 0);
        
        if (total === 0) return 'low';
        if (total < 5) return 'medium';
        return 'high';
    }

    /**
     * Calculate architectural health score
     */
    calculateArchitecturalHealth() {
        const violations = this.analysis.architecture.separationViolations.length;
        const files = this.analysis.files.length;
        const ratio = violations / files;
        
        if (ratio < 0.1) return 'good';
        if (ratio < 0.3) return 'moderate';
        return 'poor';
    }

    /**
     * Generate comprehensive report
     */
    async generateReport() {
        if (this.options.outputFormat === 'json') {
            await this.generateJsonReport();
        } else if (this.options.outputFormat === 'html') {
            await this.generateHtmlReport();
        } else {
            this.generateConsoleReport();
        }
    }

    /**
     * Generate console report
     */
    generateConsoleReport() {
        this.log(`${colors.bright}📋 AUDIT REPORT${colors.reset}`);
        this.log(`${'═'.repeat(50)}\n`);

        this.printOverview();
        this.printMemoryLeaks();
        this.printDataFlow();
        this.printArchitecturalIssues();
        this.printRecommendations();
    }

    /**
     * Print overview section
     */
    printOverview() {
        const m = this.analysis.metrics;
        this.log(`${colors.blue}📈 OVERVIEW${colors.reset}`);
        this.log(`${'-'.repeat(20)}`);
        this.log(`Total Files: ${colors.bright}${m.totalFiles}${colors.reset}`);
        this.log(`Total Lines: ${colors.bright}${m.totalLines.toLocaleString()}${colors.reset}`);
        this.log(`Total Size: ${colors.bright}${(m.totalSize / 1024).toFixed(1)} KB${colors.reset}`);
        this.log(`Average Complexity: ${colors.bright}${m.averageComplexity.toFixed(1)}${colors.reset}`);
        this.log(`Memory Risk: ${this.colorizeRisk(m.memoryRisk)}`);
        this.log(`Architectural Health: ${this.colorizeHealth(m.architecturalHealth)}`);

        this.log(`\n${colors.cyan}Domain Distribution:${colors.reset}`);
        for (const [domain, data] of Object.entries(m.domainDistribution)) {
            this.log(`  ${domain}: ${colors.bright}${data.files.length}${colors.reset} files, ${colors.bright}${(data.totalSize / 1024).toFixed(1)} KB${colors.reset}`);
        }
        this.log('');
    }

    /**
     * Print memory leak analysis
     */
    printMemoryLeaks() {
        this.log(`${colors.red}🧠 MEMORY LEAK ANALYSIS${colors.reset}`);
        this.log(`${'-'.repeat(30)}`);

        const leaks = this.analysis.memoryLeaks;
        
        if (leaks.eventListeners.length > 0) {
            this.log(`\n${colors.yellow}⚠️  Event Listeners (${leaks.eventListeners.length}):${colors.reset}`);
            leaks.eventListeners.slice(0, 5).forEach(leak => {
                this.log(`  ${leak.file}:${leak.line} - ${leak.content}`);
            });
            if (leaks.eventListeners.length > 5) {
                this.log(`  ... and ${leaks.eventListeners.length - 5} more`);
            }
        }

        if (leaks.animationFrames.length > 0) {
            this.log(`\n${colors.yellow}🎬 Animation Frames (${leaks.animationFrames.length}):${colors.reset}`);
            leaks.animationFrames.slice(0, 3).forEach(leak => {
                this.log(`  ${leak.file}:${leak.line} - ${leak.content}`);
            });
        }

        if (leaks.workers.length > 0) {
            this.log(`\n${colors.yellow}👷 Workers (${leaks.workers.length}):${colors.reset}`);
            leaks.workers.forEach(leak => {
                this.log(`  ${leak.file}:${leak.line} - ${leak.content}`);
            });
        }

        if (leaks.threeJsResources.length > 0) {
            this.log(`\n${colors.yellow}🎨 Three.js Resources (${leaks.threeJsResources.length}):${colors.reset}`);
            leaks.threeJsResources.slice(0, 5).forEach(leak => {
                this.log(`  ${leak.file}:${leak.line} - ${leak.content}`);
            });
            if (leaks.threeJsResources.length > 5) {
                this.log(`  ... and ${leaks.threeJsResources.length - 5} more`);
            }
        }

        if (leaks.staticCollections.length > 0) {
            this.log(`\n${colors.yellow}📦 Static Collections (${leaks.staticCollections.length}):${colors.reset}`);
            leaks.staticCollections.forEach(leak => {
                this.log(`  ${leak.file}:${leak.line} - ${leak.content}`);
            });
        }

        this.log('');
    }

    /**
     * Print data flow analysis
     */
    printDataFlow() {
        this.log(`${colors.magenta}🔄 DATA FLOW ANALYSIS${colors.reset}`);
        this.log(`${'-'.repeat(25)}`);

        const flow = this.analysis.dataFlow;

        if (flow.crossBoundaryViolations.length > 0) {
            this.log(`\n${colors.red}❌ Cross-Boundary Violations (${flow.crossBoundaryViolations.length}):${colors.reset}`);
            flow.crossBoundaryViolations.slice(0, 5).forEach(violation => {
                this.log(`  ${violation.file}:${violation.line} - ${violation.violation}`);
            });
        }

        if (flow.physicsToReact.length > 0) {
            this.log(`\n${colors.cyan}⚛️  Physics → React (${flow.physicsToReact.length} files):${colors.reset}`);
            flow.physicsToReact.slice(0, 3).forEach(file => {
                this.log(`  ${file.file}`);
            });
        }

        if (flow.reactToThreeJs.length > 0) {
            this.log(`\n${colors.cyan}🎨 React → Three.js (${flow.reactToThreeJs.length} files):${colors.reset}`);
            flow.reactToThreeJs.slice(0, 3).forEach(file => {
                this.log(`  ${file.file}`);
            });
        }

        this.log('');
    }

    /**
     * Print architectural issues
     */
    printArchitecturalIssues() {
        this.log(`${colors.green}🏗️  ARCHITECTURAL ANALYSIS${colors.reset}`);
        this.log(`${'-'.repeat(30)}`);

        const arch = this.analysis.architecture;

        if (arch.separationViolations.length > 0) {
            this.log(`\n${colors.red}⚠️  Separation of Concerns Violations (${arch.separationViolations.length}):${colors.reset}`);
            arch.separationViolations.slice(0, 5).forEach(violation => {
                this.log(`  ${violation.file}:${violation.line} - ${violation.violation}`);
            });
        }

        if (arch.unusedExports.length > 0) {
            this.log(`\n${colors.yellow}🗑️  Unused Exports (${arch.unusedExports.length}):${colors.reset}`);
            arch.unusedExports.slice(0, 10).forEach(exp => {
                this.log(`  ${exp.file} - ${exp.name}`);
            });
        }

        if (arch.managerPatterns.length > 0) {
            this.log(`\n${colors.green}✅ Manager Patterns (${arch.managerPatterns.length} files):${colors.reset}`);
            arch.managerPatterns.slice(0, 5).forEach(pattern => {
                this.log(`  ${pattern.file} (${pattern.domain})`);
            });
        }

        this.log('');
    }

    /**
     * Print recommendations
     */
    printRecommendations() {
        this.log(`${colors.bright}💡 RECOMMENDATIONS${colors.reset}`);
        this.log(`${'-'.repeat(20)}`);

        const leaks = this.analysis.memoryLeaks;
        const arch = this.analysis.architecture;

        if (leaks.eventListeners.length > 0) {
            this.log(`${colors.red}🔴 CRITICAL:${colors.reset} Fix ${leaks.eventListeners.length} event listener leaks`);
        }

        if (leaks.animationFrames.length > 0) {
            this.log(`${colors.red}🔴 CRITICAL:${colors.reset} Fix ${leaks.animationFrames.length} animation frame leaks`);
        }

        if (leaks.workers.length > 0) {
            this.log(`${colors.red}🔴 CRITICAL:${colors.reset} Fix ${leaks.workers.length} worker termination issues`);
        }

        if (arch.separationViolations.length > 0) {
            this.log(`${colors.yellow}🟡 HIGH:${colors.reset} Address ${arch.separationViolations.length} architectural violations`);
        }

        if (leaks.threeJsResources.length > 0) {
            this.log(`${colors.yellow}🟡 HIGH:${colors.reset} Add disposal for ${leaks.threeJsResources.length} Three.js resources`);
        }

        if (arch.unusedExports.length > 5) {
            this.log(`${colors.blue}🔵 MEDIUM:${colors.reset} Clean up ${arch.unusedExports.length} unused exports`);
        }

        this.log(`\n${colors.green}✨ NEXT STEPS:${colors.reset}`);
        this.log(`1. Run: ${colors.cyan}pnpm audit:memory${colors.reset} for detailed memory analysis`);
        this.log(`2. Run: ${colors.cyan}pnpm audit:architecture${colors.reset} for architectural deep dive`);
        this.log(`3. Fix critical memory leaks first (event listeners, workers)`);
        this.log(`4. Address separation of concerns violations`);
        this.log(`5. Add comprehensive disposal patterns`);

        this.log('');
    }

    /**
     * Generate JSON report
     */
    async generateJsonReport() {
        const outputPath = './audit-report.json';
        fs.writeFileSync(outputPath, JSON.stringify(this.analysis, null, 2));
        this.log(`${colors.green}💾 JSON report saved to: ${outputPath}${colors.reset}`);
    }

    /**
     * Generate HTML report
     */
    async generateHtmlReport() {
        // Simplified HTML report generation
        const htmlContent = this.generateHtmlContent();
        const outputPath = './audit-report.html';
        fs.writeFileSync(outputPath, htmlContent);
        this.log(`${colors.green}📄 HTML report saved to: ${outputPath}${colors.reset}`);
    }

    /**
     * Generate HTML content
     */
    generateHtmlContent() {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Codebase Audit Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .metric { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 5px; }
        .critical { color: #d32f2f; }
        .warning { color: #f57c00; }
        .good { color: #388e3c; }
        .section { margin: 20px 0; }
        .leak-item { margin: 5px 0; padding: 5px; background: #ffebee; border-left: 3px solid #f44336; }
    </style>
</head>
<body>
    <h1>🔍 Codebase Audit Report</h1>
    
    <div class="section">
        <h2>📈 Overview</h2>
        <div class="metric">Total Files: ${this.analysis.metrics.totalFiles}</div>
        <div class="metric">Total Lines: ${this.analysis.metrics.totalLines.toLocaleString()}</div>
        <div class="metric">Memory Risk: <span class="${this.analysis.metrics.memoryRisk}">${this.analysis.metrics.memoryRisk}</span></div>
        <div class="metric">Architectural Health: <span class="${this.analysis.metrics.architecturalHealth}">${this.analysis.metrics.architecturalHealth}</span></div>
    </div>
    
    <div class="section">
        <h2>🧠 Memory Leaks</h2>
        ${Object.entries(this.analysis.memoryLeaks).map(([type, leaks]) => 
            leaks.length > 0 ? `
            <h3>${type.toUpperCase()} (${leaks.length})</h3>
            ${leaks.slice(0, 10).map(leak => 
                `<div class="leak-item">${leak.file}:${leak.line} - ${leak.content}</div>`
            ).join('')}
            ` : ''
        ).join('')}
    </div>
    
    <div class="section">
        <h2>🏗️ Architectural Issues</h2>
        <h3>Separation Violations (${this.analysis.architecture.separationViolations.length})</h3>
        ${this.analysis.architecture.separationViolations.slice(0, 10).map(violation => 
            `<div class="leak-item">${violation.file}:${violation.line} - ${violation.violation}</div>`
        ).join('')}
    </div>
    
    <script>
        // Add any interactive features here
        console.log('Audit report loaded');
    </script>
</body>
</html>`;
    }

    /**
     * Colorize risk levels
     */
    colorizeRisk(risk) {
        switch (risk) {
            case 'low': return `${colors.green}${risk}${colors.reset}`;
            case 'medium': return `${colors.yellow}${risk}${colors.reset}`;
            case 'high': return `${colors.red}${risk}${colors.reset}`;
            default: return risk;
        }
    }

    /**
     * Colorize health levels
     */
    colorizeHealth(health) {
        switch (health) {
            case 'good': return `${colors.green}${health}${colors.reset}`;
            case 'moderate': return `${colors.yellow}${health}${colors.reset}`;
            case 'poor': return `${colors.red}${health}${colors.reset}`;
            default: return health;
        }
    }

    /**
     * Log with optional formatting
     */
    log(message) {
        console.log(message);
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const rootDir = args.find(arg => !arg.startsWith('--')) || './src';
    
    const options = {
        outputFormat: args.includes('--json') ? 'json' : 
                     args.includes('--html') ? 'html' : 'console',
        focusArea: args.includes('--memory') ? 'memory' :
                  args.includes('--architecture') ? 'architecture' : 'all'
    };

    const auditor = new EnhancedCodebaseAuditor(rootDir, options);
    
    auditor.audit().catch(error => {
        console.error(`${colors.red}❌ Audit failed: ${error.message}${colors.reset}`);
        process.exit(1);
    });
}

export default EnhancedCodebaseAuditor;