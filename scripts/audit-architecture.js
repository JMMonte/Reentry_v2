#!/usr/bin/env node

/**
 * Architecture Analysis Script
 * 
 * Analyzes separation of concerns, data flow patterns, and architectural compliance
 * in a Three.js/React/Physics simulation codebase
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
    cyan: '\x1b[36m'
};

class ArchitectureAnalyzer {
    constructor(rootDir = './src') {
        this.rootDir = rootDir;
        this.analysis = {
            domains: {
                physics: { files: [], boundaries: [] },
                react: { files: [], boundaries: [] },
                threejs: { files: [], boundaries: [] },
                managers: { files: [], boundaries: [] },
                utils: { files: [], boundaries: [] },
                services: { files: [], boundaries: [] }
            },
            violations: {
                separationOfConcerns: [],
                dataFlow: [],
                layering: [],
                coupling: []
            },
            patterns: {
                managers: [],
                providers: [],
                hooks: [],
                components: []
            },
            dependencies: {
                graph: {},
                circular: [],
                external: {},
                internal: {}
            },
            metrics: {
                complexity: {},
                coupling: {},
                cohesion: {}
            }
        };
        this.files = [];
    }

    /**
     * Run architecture analysis
     */
    async analyze() {
        console.log(`${colors.magenta}🏗️  ARCHITECTURE ANALYZER${colors.reset}`);
        console.log(`${'═'.repeat(50)}`);
        console.log(`Analyzing: ${colors.bright}${this.rootDir}${colors.reset}\n`);

        await this.scanFiles();
        await this.classifyDomains();
        await this.analyzeBoundaries();
        await this.analyzePatterns();
        await this.analyzeDependencies();
        await this.calculateMetrics();
        this.generateReport();
        
        return this.analysis;
    }

    /**
     * Scan all source files
     */
    async scanFiles() {
        console.log(`${colors.blue}📁 Scanning architecture...${colors.reset}`);
        await this.scanDirectory(this.rootDir);
        console.log(`   Found ${colors.bright}${this.files.length}${colors.reset} source files\n`);
    }

    /**
     * Recursively scan directory
     */
    async scanDirectory(dirPath) {
        if (!fs.existsSync(dirPath)) return;

        const entries = fs.readdirSync(dirPath);
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry);
            const stats = fs.statSync(fullPath);

            if (stats.isDirectory()) {
                if (!entry.startsWith('.') && entry !== 'node_modules') {
                    await this.scanDirectory(fullPath);
                }
            } else if (this.isSourceFile(entry)) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const fileInfo = this.analyzeFile(fullPath, content);
                    this.files.push(fileInfo);
                } catch (error) {
                    console.log(`${colors.yellow}⚠️  Could not read ${fullPath}: ${error.message}${colors.reset}`);
                }
            }
        }
    }

    /**
     * Check if file is a source file
     */
    isSourceFile(filename) {
        return ['.js', '.jsx', '.ts', '.tsx'].some(ext => filename.endsWith(ext));
    }

    /**
     * Analyze individual file
     */
    analyzeFile(filePath, content) {
        const relativePath = path.relative(this.rootDir, filePath);
        const lines = content.split('\n');
        
        return {
            path: filePath,
            relativePath,
            name: path.basename(filePath),
            directory: path.dirname(relativePath),
            ext: path.extname(filePath),
            content,
            lines,
            size: content.length,
            lineCount: lines.length,
            imports: this.extractImports(content),
            exports: this.extractExports(content),
            classes: this.extractClasses(content),
            functions: this.extractFunctions(content),
            patterns: this.detectPatterns(content, relativePath),
            domain: this.identifyDomain(relativePath, content),
            complexity: this.calculateFileComplexity(content)
        };
    }

    /**
     * Identify the architectural domain of a file
     */
    identifyDomain(relativePath, content) {
        // Physics domain
        if (relativePath.includes('physics/')) {
            return 'physics';
        }
        
        // React domain (components, hooks, providers)
        if (relativePath.includes('components/') && relativePath.endsWith('.jsx')) {
            return 'react';
        }
        if (relativePath.includes('hooks/') || relativePath.includes('providers/')) {
            return 'react';
        }
        if (content.includes('useState') || content.includes('useEffect') || content.includes('React')) {
            return 'react';
        }
        
        // Three.js domain
        if (relativePath.includes('components/') && !relativePath.endsWith('.jsx')) {
            return 'threejs';
        }
        if (content.includes('THREE.') || content.includes("from 'three'")) {
            return 'threejs';
        }
        
        // Managers domain
        if (relativePath.includes('managers/') || relativePath.includes('Manager')) {
            return 'managers';
        }
        
        // Services domain
        if (relativePath.includes('services/') || relativePath.includes('Service')) {
            return 'services';
        }
        
        // Utils domain
        if (relativePath.includes('utils/') || relativePath.includes('helpers/')) {
            return 'utils';
        }
        
        return 'unknown';
    }

    /**
     * Extract imports with domain classification
     */
    extractImports(content) {
        const imports = [];
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const match = line.match(/import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)?\s*(?:,\s*(?:{[^}]*}|\w+))?\s*from\s+['"`]([^'"`]+)['"`]/);
            
            if (match) {
                const source = match[1];
                imports.push({
                    source,
                    line: i + 1,
                    isRelative: source.startsWith('.') || source.startsWith('../'),
                    isExternal: !source.startsWith('.') && !source.startsWith('../'),
                    domain: this.classifyImportDomain(source),
                    type: this.classifyImportType(line)
                });
            }
        }
        
        return imports;
    }

    /**
     * Classify import domain
     */
    classifyImportDomain(source) {
        if (source.includes('three')) return 'threejs';
        if (source.includes('react')) return 'react';
        if (source.includes('physics')) return 'physics';
        if (source.includes('managers')) return 'managers';
        if (source.includes('services')) return 'services';
        if (source.includes('utils')) return 'utils';
        if (source.startsWith('./') || source.startsWith('../')) return 'local';
        return 'external';
    }

    /**
     * Classify import type
     */
    classifyImportType(line) {
        if (line.includes('import type') || line.includes('import { type')) return 'type';
        if (line.includes('import(')) return 'dynamic';
        if (line.includes('import *')) return 'namespace';
        if (line.includes('import {')) return 'named';
        return 'default';
    }

    /**
     * Extract exports
     */
    extractExports(content) {
        const exports = [];
        
        // Named exports
        const namedRegex = /export\s+(?:const|let|var|function|class|async\s+function)\s+(\w+)/g;
        let match;
        while ((match = namedRegex.exec(content)) !== null) {
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

        // Re-exports
        const reexportRegex = /export\s*\*?\s*(?:{[^}]*})?\s*from\s+['"`]([^'"`]+)['"`]/g;
        while ((match = reexportRegex.exec(content)) !== null) {
            exports.push({ name: match[1], type: 'reexport' });
        }

        return exports;
    }

    /**
     * Extract classes
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
     * Extract class methods
     */
    extractClassMethods(content, className) {
        const methods = [];
        const classMatch = content.match(new RegExp(`class\\s+${className}[^{]*{([^}]+(?:{[^}]*}[^}]*)*)}`, 's'));
        
        if (classMatch) {
            const classBody = classMatch[1];
            const methodRegex = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*{/g;
            let match;
            
            while ((match = methodRegex.exec(classBody)) !== null) {
                if (match[1] !== className && match[1] !== 'constructor') {
                    methods.push({
                        name: match[1],
                        isAsync: classBody.includes(`async ${match[1]}`)
                    });
                }
            }
        }

        return methods;
    }

    /**
     * Extract functions
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
     * Detect architectural patterns
     */
    detectPatterns(content, relativePath) {
        const patterns = {
            manager: false,
            provider: false,
            hook: false,
            component: false,
            service: false,
            singleton: false,
            factory: false,
            observer: false
        };

        // Manager pattern
        if (relativePath.includes('Manager') || content.includes('class ') && content.includes('Manager')) {
            patterns.manager = true;
        }

        // Provider pattern
        if (content.includes('Provider') || content.includes('Context')) {
            patterns.provider = true;
        }

        // Hook pattern
        if (relativePath.includes('use') && content.includes('function use')) {
            patterns.hook = true;
        }

        // Component pattern
        if (relativePath.endsWith('.jsx') || content.includes('return (') && content.includes('React')) {
            patterns.component = true;
        }

        // Service pattern
        if (relativePath.includes('Service') || content.includes('class ') && content.includes('Service')) {
            patterns.service = true;
        }

        // Singleton pattern
        if (content.includes('static instance') || content.includes('getInstance')) {
            patterns.singleton = true;
        }

        // Factory pattern
        if (content.includes('create') && content.includes('Factory')) {
            patterns.factory = true;
        }

        // Observer pattern
        if (content.includes('addEventListener') || content.includes('on(') || content.includes('emit(')) {
            patterns.observer = true;
        }

        return patterns;
    }

    /**
     * Calculate file complexity
     */
    calculateFileComplexity(content) {
        const lines = content.split('\n');
        const codeLines = lines.filter(line => {
            const trimmed = line.trim();
            return trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*');
        });

        return {
            cyclomaticComplexity: (content.match(/\b(if|while|for|switch|catch|&&|\|\|)\b/g) || []).length + 1,
            linesOfCode: codeLines.length,
            totalLines: lines.length,
            commentRatio: (lines.length - codeLines.length) / lines.length,
            functionCount: (content.match(/function\s+\w+/g) || []).length + (content.match(/\w+\s*=\s*\(/g) || []).length
        };
    }

    /**
     * Classify files into architectural domains
     */
    async classifyDomains() {
        console.log(`${colors.cyan}🎯 Classifying domains...${colors.reset}`);

        for (const file of this.files) {
            const domain = file.domain;
            if (!this.analysis.domains[domain]) {
                this.analysis.domains[domain] = { files: [], boundaries: [] };
            }
            this.analysis.domains[domain].files.push(file);
        }

        // Log domain distribution
        for (const [domain, data] of Object.entries(this.analysis.domains)) {
            if (data.files.length > 0) {
                console.log(`   ${domain}: ${colors.bright}${data.files.length}${colors.reset} files`);
            }
        }
        console.log('');
    }

    /**
     * Analyze domain boundaries and violations
     */
    async analyzeBoundaries() {
        console.log(`${colors.yellow}🚧 Analyzing boundaries...${colors.reset}`);

        let violations = 0;

        for (const file of this.files) {
            const fileDomain = file.domain;
            
            for (const imp of file.imports) {
                const crossBoundary = this.checkBoundaryViolation(fileDomain, imp, file);
                if (crossBoundary) {
                    this.analysis.violations.separationOfConcerns.push(crossBoundary);
                    violations++;
                }
            }

            // Check for specific anti-patterns
            const antiPatterns = this.detectAntiPatterns(file);
            this.analysis.violations.separationOfConcerns.push(...antiPatterns);
            violations += antiPatterns.length;
        }

        console.log(`   Found ${colors.bright}${violations}${colors.reset} boundary violations\n`);
    }

    /**
     * Check for boundary violations
     */
    checkBoundaryViolation(fileDomain, importInfo, file) {
        const importDomain = importInfo.domain;
        
        // Define allowed cross-domain imports
        const allowedCrossBoundary = {
            react: ['utils', 'services', 'managers'], // React can use utils, services, managers but not physics/threejs directly
            threejs: ['physics', 'utils', 'services'], // Three.js can use physics, utils, services
            physics: ['utils'], // Physics should be isolated, only utils allowed
            managers: ['physics', 'threejs', 'utils', 'services'], // Managers can coordinate all domains
            services: ['utils', 'physics'], // Services can use utils and physics
            utils: [] // Utils should be pure, no domain dependencies
        };

        // Check if import violates boundaries
        if (importDomain !== 'local' && importDomain !== 'external' && importDomain !== fileDomain) {
            const allowed = allowedCrossBoundary[fileDomain] || [];
            
            if (!allowed.includes(importDomain)) {
                return {
                    type: 'boundaryViolation',
                    severity: this.getBoundaryViolationSeverity(fileDomain, importDomain),
                    file: file.relativePath,
                    line: importInfo.line,
                    fileDomain,
                    importDomain,
                    import: importInfo.source,
                    message: `${fileDomain} domain importing from ${importDomain} domain`
                };
            }
        }

        return null;
    }

    /**
     * Get severity of boundary violation
     */
    getBoundaryViolationSeverity(fileDomain, importDomain) {
        // Critical violations
        if (fileDomain === 'physics' && (importDomain === 'react' || importDomain === 'threejs')) {
            return 'critical';
        }
        if (fileDomain === 'react' && (importDomain === 'physics' || importDomain === 'threejs')) {
            return 'critical';
        }
        if (fileDomain === 'utils' && importDomain !== 'external') {
            return 'critical';
        }

        // High severity violations
        if (fileDomain === 'threejs' && importDomain === 'react') {
            return 'high';
        }

        return 'medium';
    }

    /**
     * Detect architectural anti-patterns
     */
    detectAntiPatterns(file) {
        const antiPatterns = [];
        const content = file.content;
        const domain = file.domain;

        // God class anti-pattern
        if (file.classes.length > 0 && file.complexity.linesOfCode > 500) {
            antiPatterns.push({
                type: 'godClass',
                severity: 'high',
                file: file.relativePath,
                line: 1,
                message: `Large class with ${file.complexity.linesOfCode} lines of code`,
                suggestion: 'Consider breaking into smaller, focused classes'
            });
        }

        // React components with Three.js logic
        if (domain === 'react' && content.includes('THREE.')) {
            antiPatterns.push({
                type: 'mixedConcerns',
                severity: 'high',
                file: file.relativePath,
                line: 1,
                message: 'React component contains Three.js logic',
                suggestion: 'Move Three.js logic to separate Three.js components'
            });
        }

        // Physics logic in UI components
        if (domain === 'react' && (content.includes('physics') || content.includes('orbital'))) {
            antiPatterns.push({
                type: 'businessLogicInUI',
                severity: 'medium',
                file: file.relativePath,
                line: 1,
                message: 'UI component contains physics logic',
                suggestion: 'Move physics logic to services or managers'
            });
        }

        // Utils with side effects
        if (domain === 'utils' && (content.includes('localStorage') || content.includes('fetch') || content.includes('document.'))) {
            antiPatterns.push({
                type: 'impureUtils',
                severity: 'medium',
                file: file.relativePath,
                line: 1,
                message: 'Utility function has side effects',
                suggestion: 'Keep utilities pure, move side effects to services'
            });
        }

        return antiPatterns;
    }

    /**
     * Analyze architectural patterns
     */
    async analyzePatterns() {
        console.log(`${colors.green}🎨 Analyzing patterns...${colors.reset}`);

        for (const file of this.files) {
            // Collect pattern usage
            for (const [pattern, isUsed] of Object.entries(file.patterns)) {
                if (isUsed) {
                    if (!this.analysis.patterns[pattern]) {
                        this.analysis.patterns[pattern] = [];
                    }
                    this.analysis.patterns[pattern].push({
                        file: file.relativePath,
                        domain: file.domain,
                        classes: file.classes.map(c => c.name),
                        functions: file.functions.map(f => f.name)
                    });
                }
            }
        }

        // Analyze manager pattern usage
        const managerFiles = this.files.filter(f => f.patterns.manager);
        console.log(`   Manager pattern: ${colors.bright}${managerFiles.length}${colors.reset} files`);

        // Analyze provider pattern usage
        const providerFiles = this.files.filter(f => f.patterns.provider);
        console.log(`   Provider pattern: ${colors.bright}${providerFiles.length}${colors.reset} files`);

        // Analyze hook pattern usage
        const hookFiles = this.files.filter(f => f.patterns.hook);
        console.log(`   Hook pattern: ${colors.bright}${hookFiles.length}${colors.reset} files`);

        console.log('');
    }

    /**
     * Analyze dependencies
     */
    async analyzeDependencies() {
        console.log(`${colors.magenta}🔗 Analyzing dependencies...${colors.reset}`);

        // Build dependency graph
        for (const file of this.files) {
            const deps = file.imports
                .filter(imp => imp.isRelative)
                .map(imp => this.resolveImport(file.relativePath, imp.source));

            this.analysis.dependencies.graph[file.relativePath] = {
                domain: file.domain,
                imports: deps,
                exports: file.exports.map(e => e.name),
                complexity: file.complexity.cyclomaticComplexity
            };
        }

        // Find circular dependencies
        this.analysis.dependencies.circular = this.findCircularDependencies();

        // Analyze external dependencies
        this.analyzeExternalDependencies();

        console.log(`   Circular dependencies: ${colors.bright}${this.analysis.dependencies.circular.length}${colors.reset}`);
        
        const totalDeps = Object.keys(this.analysis.dependencies.graph).length;
        console.log(`   Total internal dependencies: ${colors.bright}${totalDeps}${colors.reset}\n`);
    }

    /**
     * Resolve relative import path
     */
    resolveImport(fromFile, importPath) {
        const fromDir = path.dirname(fromFile);
        let resolved = path.resolve(fromDir, importPath);
        resolved = path.relative('.', resolved);
        
        // Try different extensions
        const extensions = ['.js', '.jsx', '.ts', '.tsx'];
        for (const ext of extensions) {
            if (fs.existsSync(path.join(this.rootDir, resolved + ext))) {
                return resolved + ext;
            }
        }
        
        return resolved;
    }

    /**
     * Find circular dependencies
     */
    findCircularDependencies() {
        const visited = new Set();
        const recursionStack = new Set();
        const cycles = [];

        const dfs = (node, path = []) => {
            if (recursionStack.has(node)) {
                const cycleStart = path.indexOf(node);
                cycles.push(path.slice(cycleStart).concat(node));
                return;
            }

            if (visited.has(node)) return;

            visited.add(node);
            recursionStack.add(node);

            const deps = this.analysis.dependencies.graph[node]?.imports || [];
            for (const dep of deps) {
                if (this.analysis.dependencies.graph[dep]) {
                    dfs(dep, [...path, node]);
                }
            }

            recursionStack.delete(node);
        };

        for (const file of Object.keys(this.analysis.dependencies.graph)) {
            if (!visited.has(file)) {
                dfs(file);
            }
        }

        return cycles;
    }

    /**
     * Analyze external dependencies
     */
    analyzeExternalDependencies() {
        const external = {};
        
        for (const file of this.files) {
            for (const imp of file.imports) {
                if (imp.isExternal) {
                    const pkg = imp.source.split('/')[0];
                    if (!external[pkg]) {
                        external[pkg] = { count: 0, files: [], domains: new Set() };
                    }
                    external[pkg].count++;
                    external[pkg].files.push(file.relativePath);
                    external[pkg].domains.add(file.domain);
                }
            }
        }

        this.analysis.dependencies.external = external;
    }

    /**
     * Calculate architectural metrics
     */
    async calculateMetrics() {
        console.log(`${colors.blue}📊 Calculating metrics...${colors.reset}`);

        // Domain complexity
        this.analysis.metrics.complexity = {};
        for (const [domain, data] of Object.entries(this.analysis.domains)) {
            if (data.files.length > 0) {
                const totalComplexity = data.files.reduce((sum, f) => sum + f.complexity.cyclomaticComplexity, 0);
                const avgComplexity = totalComplexity / data.files.length;
                
                this.analysis.metrics.complexity[domain] = {
                    total: totalComplexity,
                    average: avgComplexity,
                    files: data.files.length
                };
            }
        }

        // Coupling metrics
        this.analysis.metrics.coupling = this.calculateCouplingMetrics();

        // Cohesion metrics
        this.analysis.metrics.cohesion = this.calculateCohesionMetrics();

        console.log(`   Complexity calculated for ${colors.bright}${Object.keys(this.analysis.metrics.complexity).length}${colors.reset} domains\n`);
    }

    /**
     * Calculate coupling metrics
     */
    calculateCouplingMetrics() {
        const coupling = {};
        
        for (const [domain, data] of Object.entries(this.analysis.domains)) {
            if (data.files.length === 0) continue;
            
            let totalCoupling = 0;
            let crossDomainCoupling = 0;
            
            for (const file of data.files) {
                const externalImports = file.imports.filter(imp => imp.isExternal || imp.domain !== domain);
                totalCoupling += externalImports.length;
                
                const crossDomain = file.imports.filter(imp => 
                    imp.domain !== domain && imp.domain !== 'local' && imp.domain !== 'external'
                );
                crossDomainCoupling += crossDomain.length;
            }
            
            coupling[domain] = {
                afferent: 0, // Will be calculated in second pass
                efferent: totalCoupling,
                crossDomain: crossDomainCoupling,
                instability: 0 // Will be calculated after afferent
            };
        }

        // Calculate afferent coupling (how many other modules depend on this one)
        for (const file of this.files) {
            for (const imp of file.imports) {
                if (imp.domain !== 'local' && imp.domain !== 'external') {
                    if (coupling[imp.domain]) {
                        coupling[imp.domain].afferent++;
                    }
                }
            }
        }

        // Calculate instability (efferent / (afferent + efferent))
        for (const metrics of Object.values(coupling)) {
            const total = metrics.afferent + metrics.efferent;
            metrics.instability = total > 0 ? metrics.efferent / total : 0;
        }

        return coupling;
    }

    /**
     * Calculate cohesion metrics
     */
    calculateCohesionMetrics() {
        const cohesion = {};
        
        for (const [domain, data] of Object.entries(this.analysis.domains)) {
            if (data.files.length === 0) continue;
            
            let totalFunctions = 0;
            let totalClasses = 0;
            let avgFileSize = 0;
            
            for (const file of data.files) {
                totalFunctions += file.functions.length;
                totalClasses += file.classes.length;
                avgFileSize += file.complexity.linesOfCode;
            }
            
            cohesion[domain] = {
                avgFunctionsPerFile: data.files.length > 0 ? totalFunctions / data.files.length : 0,
                avgClassesPerFile: data.files.length > 0 ? totalClasses / data.files.length : 0,
                avgFileSize: data.files.length > 0 ? avgFileSize / data.files.length : 0,
                files: data.files.length
            };
        }
        
        return cohesion;
    }

    /**
     * Generate comprehensive report
     */
    generateReport() {
        console.log(`${colors.bright}📋 ARCHITECTURE REPORT${colors.reset}`);
        console.log(`${'═'.repeat(50)}\n`);

        this.printDomainOverview();
        this.printBoundaryViolations();
        this.printPatternAnalysis();
        this.printDependencyAnalysis();
        this.printMetrics();
        this.printRecommendations();
    }

    /**
     * Print domain overview
     */
    printDomainOverview() {
        console.log(`${colors.blue}🎯 DOMAIN OVERVIEW${colors.reset}`);
        console.log(`${'-'.repeat(25)}`);
        
        for (const [domain, data] of Object.entries(this.analysis.domains)) {
            if (data.files.length > 0) {
                const complexity = this.analysis.metrics.complexity[domain];
                console.log(`${domain.toUpperCase().padEnd(10)}: ${colors.bright}${data.files.length.toString().padStart(3)}${colors.reset} files, avg complexity: ${colors.bright}${complexity.average.toFixed(1)}${colors.reset}`);
            }
        }
        console.log('');
    }

    /**
     * Print boundary violations
     */
    printBoundaryViolations() {
        const violations = this.analysis.violations.separationOfConcerns;
        
        console.log(`${colors.red}🚧 BOUNDARY VIOLATIONS (${violations.length})${colors.reset}`);
        console.log(`${'-'.repeat(35)}`);
        
        // Group by severity
        const bySeverity = {};
        violations.forEach(v => {
            if (!bySeverity[v.severity]) bySeverity[v.severity] = [];
            bySeverity[v.severity].push(v);
        });

        for (const [severity, items] of Object.entries(bySeverity)) {
            const color = severity === 'critical' ? colors.red : 
                         severity === 'high' ? colors.yellow : colors.cyan;
            
            console.log(`\n${color}${severity.toUpperCase()} (${items.length}):${colors.reset}`);
            items.slice(0, 5).forEach(violation => {
                console.log(`  ${violation.file}:${violation.line} - ${violation.message}`);
            });
            
            if (items.length > 5) {
                console.log(`  ... and ${items.length - 5} more`);
            }
        }
        console.log('');
    }

    /**
     * Print pattern analysis
     */
    printPatternAnalysis() {
        console.log(`${colors.green}🎨 PATTERN ANALYSIS${colors.reset}`);
        console.log(`${'-'.repeat(25)}`);
        
        const patternCounts = {};
        for (const file of this.files) {
            for (const [pattern, isUsed] of Object.entries(file.patterns)) {
                if (isUsed) {
                    patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
                }
            }
        }

        for (const [pattern, count] of Object.entries(patternCounts)) {
            console.log(`${pattern.padEnd(15)}: ${colors.bright}${count.toString().padStart(3)}${colors.reset} files`);
        }
        console.log('');
    }

    /**
     * Print dependency analysis
     */
    printDependencyAnalysis() {
        console.log(`${colors.magenta}🔗 DEPENDENCY ANALYSIS${colors.reset}`);
        console.log(`${'-'.repeat(30)}`);
        
        // Circular dependencies
        if (this.analysis.dependencies.circular.length > 0) {
            console.log(`\n${colors.red}🔄 Circular Dependencies (${this.analysis.dependencies.circular.length}):${colors.reset}`);
            this.analysis.dependencies.circular.slice(0, 3).forEach(cycle => {
                console.log(`  ${cycle.join(' → ')}`);
            });
        }

        // External dependencies by domain
        console.log(`\n${colors.cyan}📦 External Dependencies:${colors.reset}`);
        const extDeps = Object.entries(this.analysis.dependencies.external)
            .sort(([,a], [,b]) => b.count - a.count)
            .slice(0, 10);
            
        extDeps.forEach(([pkg, data]) => {
            const domains = Array.from(data.domains).join(', ');
            console.log(`  ${pkg.padEnd(20)}: ${colors.bright}${data.count.toString().padStart(3)}${colors.reset} imports (${domains})`);
        });
        
        console.log('');
    }

    /**
     * Print metrics
     */
    printMetrics() {
        console.log(`${colors.blue}📊 ARCHITECTURAL METRICS${colors.reset}`);
        console.log(`${'-'.repeat(30)}`);
        
        // Coupling metrics
        console.log(`\n${colors.cyan}Coupling Metrics:${colors.reset}`);
        for (const [domain, metrics] of Object.entries(this.analysis.metrics.coupling)) {
            console.log(`  ${domain.padEnd(10)}: Instability ${metrics.instability.toFixed(2)}, Cross-domain ${metrics.crossDomain}`);
        }

        // Cohesion metrics
        console.log(`\n${colors.cyan}Cohesion Metrics:${colors.reset}`);
        for (const [domain, metrics] of Object.entries(this.analysis.metrics.cohesion)) {
            console.log(`  ${domain.padEnd(10)}: Avg file size ${metrics.avgFileSize.toFixed(0)} lines, ${metrics.avgFunctionsPerFile.toFixed(1)} functions/file`);
        }
        
        console.log('');
    }

    /**
     * Print recommendations
     */
    printRecommendations() {
        console.log(`${colors.bright}💡 RECOMMENDATIONS${colors.reset}`);
        console.log(`${'-'.repeat(20)}`);

        const violations = this.analysis.violations.separationOfConcerns;
        const criticalViolations = violations.filter(v => v.severity === 'critical');
        const circularDeps = this.analysis.dependencies.circular;

        if (criticalViolations.length > 0) {
            console.log(`${colors.red}🚨 CRITICAL ISSUES:${colors.reset}`);
            console.log(`   • Fix ${criticalViolations.length} critical boundary violations`);
            console.log(`   • Enforce strict domain separation`);
        }

        if (circularDeps.length > 0) {
            console.log(`${colors.yellow}⚠️  HIGH PRIORITY:${colors.reset}`);
            console.log(`   • Resolve ${circularDeps.length} circular dependencies`);
            console.log(`   • Consider dependency injection patterns`);
        }

        console.log(`\n${colors.green}✨ ARCHITECTURE IMPROVEMENTS:${colors.reset}`);
        console.log(`1. Create clear interfaces between domains`);
        console.log(`2. Implement dependency injection for managers`);
        console.log(`3. Add architectural testing to prevent regressions`);
        console.log(`4. Consider using facade patterns for complex integrations`);
        console.log(`5. Establish coding standards for each domain`);

        console.log(`\n${colors.cyan}🛠️  TOOLS:${colors.reset}`);
        console.log(`• Run: ${colors.bright}pnpm audit:memory${colors.reset} to check memory management`);
        console.log(`• Run: ${colors.bright}pnpm audit --json${colors.reset} for CI/CD integration`);
        console.log(`• Consider using ESLint rules to enforce architectural boundaries`);
        
        console.log('');
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const rootDir = process.argv[2] || './src';
    const analyzer = new ArchitectureAnalyzer(rootDir);
    
    analyzer.analyze().catch(error => {
        console.error(`${colors.red}❌ Architecture analysis failed: ${error.message}${colors.reset}`);
        process.exit(1);
    });
}

export default ArchitectureAnalyzer;