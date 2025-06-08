#!/usr/bin/env node

/**
 * Memory Leak Detection Script
 * 
 * Specialized script for detecting memory leaks in Three.js/React/Physics simulation
 * Focuses on event listeners, animation frames, workers, and resource disposal patterns
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

class MemoryLeakDetector {
    constructor(rootDir = './src') {
        this.rootDir = rootDir;
        this.leaks = {
            critical: [], // Definitely will cause memory leaks
            high: [],     // Very likely to cause memory leaks
            medium: [],   // Potentially problematic
            low: []       // Best practices violations
        };
        this.files = [];
        this.patterns = this.initializePatterns();
    }

    /**
     * Initialize memory leak patterns to detect
     */
    initializePatterns() {
        return {
            eventListeners: {
                add: /addEventListener\s*\(\s*['"`]([^'"`]+)['"`]/g,
                remove: /removeEventListener\s*\(\s*['"`]([^'"`]+)['"`]/g,
                severity: 'critical'
            },
            animationFrames: {
                add: /requestAnimationFrame\s*\(/g,
                remove: /cancelAnimationFrame\s*\(/g,
                severity: 'critical'
            },
            timers: {
                setTimeout: /setTimeout\s*\(/g,
                setInterval: /setInterval\s*\(/g,
                clearTimeout: /clearTimeout\s*\(/g,
                clearInterval: /clearInterval\s*\(/g,
                severity: 'high'
            },
            workers: {
                create: /new\s+(?:Worker|SharedWorker)\s*\(/g,
                terminate: /\.terminate\s*\(\s*\)/g,
                severity: 'critical'
            },
            threeJsGeometry: {
                create: /new\s+THREE\.(?:\w+)?Geometry\s*\(/g,
                dispose: /\.dispose\s*\(\s*\)/g,
                severity: 'high'
            },
            threeJsMaterial: {
                create: /new\s+THREE\.(?:\w+)?Material\s*\(/g,
                dispose: /\.dispose\s*\(\s*\)/g,
                severity: 'high'
            },
            threeJsTexture: {
                create: /new\s+THREE\.(?:Texture|TextureLoader)\s*\(/g,
                dispose: /\.dispose\s*\(\s*\)/g,
                severity: 'high'
            },
            staticCollections: {
                create: /static\s+\w+\s*=\s*new\s+(?:Map|Set|Array)\s*\(/g,
                clear: /\.(?:clear|delete)\s*\(/g,
                severity: 'medium'
            },
            windowGlobals: {
                create: /window\.\w+\s*=/g,
                cleanup: /delete\s+window\./g,
                severity: 'medium'
            },
            domElements: {
                create: /(?:document\.createElement|document\.getElementById)/g,
                remove: /\.remove\s*\(\s*\)|removeChild/g,
                severity: 'low'
            },
            reactRefs: {
                create: /useRef\s*\(|createRef\s*\(/g,
                cleanup: /\.current\s*=\s*null/g,
                severity: 'low'
            }
        };
    }

    /**
     * Run memory leak detection
     */
    async detect() {
        console.log(`${colors.red}🧠 MEMORY LEAK DETECTOR${colors.reset}`);
        console.log(`${'═'.repeat(50)}`);
        console.log(`Scanning: ${colors.bright}${this.rootDir}${colors.reset}\n`);

        await this.scanFiles();
        await this.analyzeLeaks();
        this.generateReport();
        
        return this.leaks;
    }

    /**
     * Scan all source files
     */
    async scanFiles() {
        console.log(`${colors.blue}📁 Scanning files...${colors.reset}`);
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
                    this.files.push({
                        path: fullPath,
                        relativePath: path.relative(this.rootDir, fullPath),
                        name: entry,
                        content,
                        lines: content.split('\n')
                    });
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
     * Analyze memory leak patterns
     */
    async analyzeLeaks() {
        console.log(`${colors.magenta}🔍 Analyzing leak patterns...${colors.reset}`);

        for (const file of this.files) {
            await this.analyzeFile(file);
        }

        // Categorize leaks by severity
        const allLeaks = [...this.leaks.critical, ...this.leaks.high, ...this.leaks.medium, ...this.leaks.low];
        console.log(`   Found ${colors.bright}${allLeaks.length}${colors.reset} potential memory leaks\n`);
    }

    /**
     * Analyze individual file for memory leaks
     */
    async analyzeFile(file) {
        const context = this.buildFileContext(file);
        
        // Check each pattern type
        for (const [patternName, pattern] of Object.entries(this.patterns)) {
            const leaks = await this.detectPattern(file, patternName, pattern, context);
            
            // Categorize by severity
            for (const leak of leaks) {
                this.leaks[leak.severity].push(leak);
            }
        }

        // Special analysis for specific patterns
        await this.analyzeReactHooks(file, context);
        await this.analyzeWorkerUsage(file, context);
        await this.analyzeThreeJsUsage(file, context);
    }

    /**
     * Build context for file analysis
     */
    buildFileContext(file) {
        const isReactComponent = file.content.includes('useEffect') || file.content.includes('useState');
        const isThreeJsFile = file.content.includes('THREE.') || file.relativePath.includes('three');
        const isPhysicsFile = file.relativePath.includes('physics/');
        const isManagerFile = file.relativePath.includes('managers/') || file.name.includes('Manager');
        const isWorkerFile = file.content.includes('postMessage') || file.name.includes('worker');
        
        return {
            isReactComponent,
            isThreeJsFile,
            isPhysicsFile,
            isManagerFile,
            isWorkerFile,
            hasUseEffect: file.content.includes('useEffect'),
            hasCleanupFunctions: file.content.includes('return () =>') || file.content.includes('return function'),
            importsThree: file.content.includes("from 'three'") || file.content.includes('import * as THREE'),
            exportsClass: file.content.includes('export class') || file.content.includes('export default class')
        };
    }

    /**
     * Detect specific pattern in file
     */
    async detectPattern(file, patternName, pattern, context) {
        const leaks = [];
        const lines = file.lines;

        // Handle different pattern types
        if (patternName === 'eventListeners') {
            leaks.push(...this.detectEventListenerLeaks(file, lines, context));
        } else if (patternName === 'animationFrames') {
            leaks.push(...this.detectAnimationFrameLeaks(file, lines, context));
        } else if (patternName === 'timers') {
            leaks.push(...this.detectTimerLeaks(file, lines, context));
        } else if (patternName === 'workers') {
            leaks.push(...this.detectWorkerLeaks(file, lines, context));
        } else if (patternName.startsWith('threeJs')) {
            leaks.push(...this.detectThreeJsLeaks(file, lines, context, patternName));
        } else if (patternName === 'staticCollections') {
            leaks.push(...this.detectStaticCollectionLeaks(file, lines, context));
        } else {
            // Generic pattern detection
            leaks.push(...this.detectGenericPattern(file, lines, pattern, patternName));
        }

        return leaks;
    }

    /**
     * Detect event listener leaks
     */
    detectEventListenerLeaks(file, lines, context) {
        const leaks = [];
        const eventListeners = new Map(); // Track event type -> line numbers
        const removals = new Set(); // Track removal calls

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            // Find addEventListener calls
            const addMatch = line.match(/addEventListener\s*\(\s*['"`]([^'"`]+)['"`]/);
            if (addMatch) {
                const eventType = addMatch[1];
                if (!eventListeners.has(eventType)) {
                    eventListeners.set(eventType, []);
                }
                eventListeners.get(eventType).push({
                    line: lineNum,
                    content: line.trim(),
                    context: this.getLineContext(lines, i)
                });
            }

            // Find removeEventListener calls
            const removeMatch = line.match(/removeEventListener\s*\(\s*['"`]([^'"`]+)['"`]/);
            if (removeMatch) {
                removals.add(removeMatch[1]);
            }
        }

        // Check for missing cleanup
        for (const [eventType, instances] of eventListeners) {
            if (!removals.has(eventType)) {
                for (const instance of instances) {
                    const severity = context.isReactComponent ? 'critical' : 'high';
                    leaks.push({
                        type: 'eventListener',
                        severity,
                        file: file.relativePath,
                        line: instance.line,
                        content: instance.content,
                        context: instance.context,
                        issue: `Event listener '${eventType}' added but never removed`,
                        suggestion: `Add removeEventListener('${eventType}', handler) in cleanup function`
                    });
                }
            }
        }

        return leaks;
    }

    /**
     * Detect animation frame leaks
     */
    detectAnimationFrameLeaks(file, lines, context) {
        const leaks = [];
        const rafCalls = [];
        let hasCancelCall = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            if (line.includes('requestAnimationFrame')) {
                rafCalls.push({
                    line: lineNum,
                    content: line.trim(),
                    context: this.getLineContext(lines, i)
                });
            }

            if (line.includes('cancelAnimationFrame')) {
                hasCancelCall = true;
            }
        }

        // If RAF calls exist but no cancel calls, it's a potential leak
        if (rafCalls.length > 0 && !hasCancelCall) {
            for (const rafCall of rafCalls) {
                leaks.push({
                    type: 'animationFrame',
                    severity: 'critical',
                    file: file.relativePath,
                    line: rafCall.line,
                    content: rafCall.content,
                    context: rafCall.context,
                    issue: 'requestAnimationFrame called but no cancelAnimationFrame found',
                    suggestion: 'Store RAF ID and call cancelAnimationFrame in cleanup'
                });
            }
        }

        return leaks;
    }

    /**
     * Detect timer leaks
     */
    detectTimerLeaks(file, lines, context) {
        const leaks = [];
        const timers = { timeout: [], interval: [] };
        const clears = { timeout: false, interval: false };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            if (line.includes('setTimeout')) {
                timers.timeout.push({
                    line: lineNum,
                    content: line.trim(),
                    context: this.getLineContext(lines, i)
                });
            }

            if (line.includes('setInterval')) {
                timers.interval.push({
                    line: lineNum,
                    content: line.trim(),
                    context: this.getLineContext(lines, i)
                });
            }

            if (line.includes('clearTimeout')) {
                clears.timeout = true;
            }

            if (line.includes('clearInterval')) {
                clears.interval = true;
            }
        }

        // Check for missing clears
        if (timers.timeout.length > 0 && !clears.timeout) {
            for (const timer of timers.timeout) {
                leaks.push({
                    type: 'timer',
                    severity: 'high',
                    file: file.relativePath,
                    line: timer.line,
                    content: timer.content,
                    context: timer.context,
                    issue: 'setTimeout used but no clearTimeout found',
                    suggestion: 'Store timeout ID and call clearTimeout in cleanup'
                });
            }
        }

        if (timers.interval.length > 0 && !clears.interval) {
            for (const timer of timers.interval) {
                leaks.push({
                    type: 'timer',
                    severity: 'critical',
                    file: file.relativePath,
                    line: timer.line,
                    content: timer.content,
                    context: timer.context,
                    issue: 'setInterval used but no clearInterval found',
                    suggestion: 'Store interval ID and call clearInterval in cleanup'
                });
            }
        }

        return leaks;
    }

    /**
     * Detect worker leaks
     */
    detectWorkerLeaks(file, lines, context) {
        const leaks = [];
        const workers = [];
        let hasTerminate = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            if (line.match(/new\s+(?:Worker|SharedWorker)/)) {
                workers.push({
                    line: lineNum,
                    content: line.trim(),
                    context: this.getLineContext(lines, i)
                });
            }

            if (line.includes('.terminate(')) {
                hasTerminate = true;
            }
        }

        if (workers.length > 0 && !hasTerminate) {
            for (const worker of workers) {
                leaks.push({
                    type: 'worker',
                    severity: 'critical',
                    file: file.relativePath,
                    line: worker.line,
                    content: worker.content,
                    context: worker.context,
                    issue: 'Worker created but never terminated',
                    suggestion: 'Call worker.terminate() in cleanup function'
                });
            }
        }

        return leaks;
    }

    /**
     * Detect Three.js resource leaks
     */
    detectThreeJsLeaks(file, lines, context, patternName) {
        const leaks = [];
        const resources = [];
        let hasDispose = false;

        const resourceRegex = patternName === 'threeJsGeometry' ? /new\s+THREE\.(?:\w+)?Geometry/ :
                             patternName === 'threeJsMaterial' ? /new\s+THREE\.(?:\w+)?Material/ :
                             /new\s+THREE\.(?:Texture|TextureLoader)/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            if (line.match(resourceRegex)) {
                resources.push({
                    line: lineNum,
                    content: line.trim(),
                    context: this.getLineContext(lines, i),
                    type: patternName.replace('threeJs', '')
                });
            }

            if (line.includes('.dispose()')) {
                hasDispose = true;
            }
        }

        // Check if class has dispose method
        const hasDisposeMethod = file.content.includes('dispose()') && 
                                (file.content.includes('class ') || context.exportsClass);

        if (resources.length > 0 && !hasDispose && !hasDisposeMethod) {
            for (const resource of resources) {
                leaks.push({
                    type: 'threeJsResource',
                    severity: 'high',
                    file: file.relativePath,
                    line: resource.line,
                    content: resource.content,
                    context: resource.context,
                    issue: `Three.js ${resource.type} created but never disposed`,
                    suggestion: `Call .dispose() on ${resource.type} to free GPU memory`
                });
            }
        }

        return leaks;
    }

    /**
     * Detect static collection leaks
     */
    detectStaticCollectionLeaks(file, lines, context) {
        const leaks = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            if (line.match(/static\s+\w+\s*=\s*new\s+(?:Map|Set|Array)/)) {
                // Check if there's any size management or clearing
                const hasClearing = file.content.includes('.clear()') || 
                                   file.content.includes('.delete(') ||
                                   file.content.includes('= new Map') ||
                                   file.content.includes('= new Set') ||
                                   file.content.includes('.length = 0');

                if (!hasClearing) {
                    leaks.push({
                        type: 'staticCollection',
                        severity: 'medium',
                        file: file.relativePath,
                        line: lineNum,
                        content: line.trim(),
                        context: this.getLineContext(lines, i),
                        issue: 'Static collection may grow indefinitely',
                        suggestion: 'Add size limits or periodic cleanup'
                    });
                }
            }
        }

        return leaks;
    }

    /**
     * Generic pattern detection
     */
    detectGenericPattern(file, lines, pattern, patternName) {
        const leaks = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            if (pattern.create && line.match(pattern.create)) {
                // Check if cleanup pattern exists in the file
                const hasCleanup = pattern.cleanup ? file.content.match(pattern.cleanup) : false;
                
                if (!hasCleanup) {
                    leaks.push({
                        type: patternName,
                        severity: pattern.severity || 'medium',
                        file: file.relativePath,
                        line: lineNum,
                        content: line.trim(),
                        context: this.getLineContext(lines, i),
                        issue: `${patternName} pattern detected without cleanup`,
                        suggestion: 'Add appropriate cleanup code'
                    });
                }
            }
        }

        return leaks;
    }

    /**
     * Analyze React hooks for cleanup patterns
     */
    async analyzeReactHooks(file, context) {
        if (!context.isReactComponent) return;

        const lines = file.lines;
        const useEffects = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes('useEffect')) {
                const effectContext = this.extractUseEffectContext(lines, i);
                if (effectContext.hasAsyncOperations && !effectContext.hasCleanup) {
                    this.leaks.medium.push({
                        type: 'reactHook',
                        severity: 'medium',
                        file: file.relativePath,
                        line: i + 1,
                        content: line.trim(),
                        context: effectContext,
                        issue: 'useEffect with async operations lacks cleanup',
                        suggestion: 'Return cleanup function to cancel ongoing operations'
                    });
                }
            }
        }
    }

    /**
     * Extract useEffect context
     */
    extractUseEffectContext(lines, startIndex) {
        let braceCount = 0;
        let hasCleanup = false;
        let hasAsyncOperations = false;
        let effectEnd = startIndex;

        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i];
            
            for (const char of line) {
                if (char === '{') braceCount++;
                if (char === '}') braceCount--;
            }

            if (line.includes('return () =>') || line.includes('return function')) {
                hasCleanup = true;
            }

            if (line.includes('fetch(') || line.includes('setTimeout') || line.includes('setInterval') || line.includes('addEventListener')) {
                hasAsyncOperations = true;
            }

            if (braceCount === 0 && i > startIndex) {
                effectEnd = i;
                break;
            }
        }

        return {
            hasCleanup,
            hasAsyncOperations,
            lines: effectEnd - startIndex
        };
    }

    /**
     * Analyze worker usage patterns
     */
    async analyzeWorkerUsage(file, context) {
        if (!context.isWorkerFile) return;

        // Check for proper message handler cleanup in workers
        if (file.content.includes('onmessage') && !file.content.includes('terminate')) {
            this.leaks.high.push({
                type: 'workerMessage',
                severity: 'high',
                file: file.relativePath,
                line: 1,
                content: 'Worker file',
                context: 'Worker message handlers',
                issue: 'Worker message handlers without termination handling',
                suggestion: 'Add proper cleanup for message handlers'
            });
        }
    }

    /**
     * Analyze Three.js usage patterns
     */
    async analyzeThreeJsUsage(file, context) {
        if (!context.isThreeJsFile) return;

        // Check for scenes without disposal
        if (file.content.includes('new THREE.Scene') && !file.content.includes('dispose')) {
            this.leaks.high.push({
                type: 'threeJsScene',
                severity: 'high',
                file: file.relativePath,
                line: 1,
                content: 'Three.js Scene',
                context: 'Scene management',
                issue: 'Three.js Scene created without disposal pattern',
                suggestion: 'Implement dispose method to clean up scene resources'
            });
        }
    }

    /**
     * Get context lines around a specific line
     */
    getLineContext(lines, lineIndex, contextSize = 2) {
        const start = Math.max(0, lineIndex - contextSize);
        const end = Math.min(lines.length, lineIndex + contextSize + 1);
        
        return {
            before: lines.slice(start, lineIndex),
            current: lines[lineIndex],
            after: lines.slice(lineIndex + 1, end)
        };
    }

    /**
     * Generate comprehensive report
     */
    generateReport() {
        console.log(`${colors.bright}📋 MEMORY LEAK REPORT${colors.reset}`);
        console.log(`${'═'.repeat(50)}\n`);

        this.printSummary();
        this.printCriticalLeaks();
        this.printHighPriorityLeaks();
        this.printMediumPriorityLeaks();
        this.printRecommendations();
        this.printNextSteps();
    }

    /**
     * Print summary
     */
    printSummary() {
        console.log(`${colors.blue}📈 SUMMARY${colors.reset}`);
        console.log(`${'-'.repeat(20)}`);
        console.log(`Files Scanned: ${colors.bright}${this.files.length}${colors.reset}`);
        console.log(`Critical Leaks: ${colors.red}${this.leaks.critical.length}${colors.reset}`);
        console.log(`High Priority: ${colors.yellow}${this.leaks.high.length}${colors.reset}`);
        console.log(`Medium Priority: ${colors.cyan}${this.leaks.medium.length}${colors.reset}`);
        console.log(`Low Priority: ${colors.blue}${this.leaks.low.length}${colors.reset}`);
        
        const total = Object.values(this.leaks).reduce((sum, arr) => sum + arr.length, 0);
        console.log(`Total Issues: ${colors.bright}${total}${colors.reset}\n`);
    }

    /**
     * Print critical leaks
     */
    printCriticalLeaks() {
        if (this.leaks.critical.length === 0) return;

        console.log(`${colors.red}🔴 CRITICAL MEMORY LEAKS (${this.leaks.critical.length})${colors.reset}`);
        console.log(`${'-'.repeat(35)}`);
        
        this.leaks.critical.forEach((leak, index) => {
            console.log(`${colors.red}${index + 1}.${colors.reset} ${colors.bright}${leak.file}:${leak.line}${colors.reset}`);
            console.log(`   Type: ${leak.type}`);
            console.log(`   Issue: ${leak.issue}`);
            console.log(`   Code: ${colors.yellow}${leak.content}${colors.reset}`);
            console.log(`   Fix: ${colors.green}${leak.suggestion}${colors.reset}\n`);
        });
    }

    /**
     * Print high priority leaks
     */
    printHighPriorityLeaks() {
        if (this.leaks.high.length === 0) return;

        console.log(`${colors.yellow}🟡 HIGH PRIORITY LEAKS (${this.leaks.high.length})${colors.reset}`);
        console.log(`${'-'.repeat(30)}`);
        
        this.leaks.high.slice(0, 10).forEach((leak, index) => {
            console.log(`${colors.yellow}${index + 1}.${colors.reset} ${leak.file}:${leak.line} - ${leak.issue}`);
            console.log(`   ${colors.cyan}${leak.suggestion}${colors.reset}`);
        });
        
        if (this.leaks.high.length > 10) {
            console.log(`   ... and ${this.leaks.high.length - 10} more high priority issues\n`);
        } else {
            console.log('');
        }
    }

    /**
     * Print medium priority leaks
     */
    printMediumPriorityLeaks() {
        if (this.leaks.medium.length === 0) return;

        console.log(`${colors.cyan}🔵 MEDIUM PRIORITY ISSUES (${this.leaks.medium.length})${colors.reset}`);
        console.log(`${'-'.repeat(35)}`);
        
        // Group by type
        const grouped = {};
        this.leaks.medium.forEach(leak => {
            if (!grouped[leak.type]) grouped[leak.type] = [];
            grouped[leak.type].push(leak);
        });

        Object.entries(grouped).forEach(([type, leaks]) => {
            console.log(`   ${type}: ${leaks.length} issues`);
        });
        console.log('');
    }

    /**
     * Print recommendations
     */
    printRecommendations() {
        console.log(`${colors.bright}💡 RECOMMENDATIONS${colors.reset}`);
        console.log(`${'-'.repeat(20)}`);

        if (this.leaks.critical.length > 0) {
            console.log(`${colors.red}🚨 IMMEDIATE ACTION REQUIRED:${colors.reset}`);
            console.log(`   • Fix ${this.leaks.critical.length} critical memory leaks immediately`);
            console.log(`   • Focus on event listeners and animation frames first`);
        }

        if (this.leaks.high.length > 0) {
            console.log(`${colors.yellow}⚠️  HIGH PRIORITY:${colors.reset}`);
            console.log(`   • Address ${this.leaks.high.length} high-priority issues`);
            console.log(`   • Add disposal patterns for Three.js resources`);
            console.log(`   • Implement proper timer cleanup`);
        }

        if (this.leaks.medium.length > 5) {
            console.log(`${colors.cyan}📋 MEDIUM PRIORITY:${colors.reset}`);
            console.log(`   • Review ${this.leaks.medium.length} medium-priority issues`);
            console.log(`   • Implement size limits for static collections`);
            console.log(`   • Add React hook cleanup patterns`);
        }

        console.log('');
    }

    /**
     * Print next steps
     */
    printNextSteps() {
        console.log(`${colors.green}✨ NEXT STEPS${colors.reset}`);
        console.log(`${'-'.repeat(15)}`);
        
        if (this.leaks.critical.length > 0) {
            console.log(`1. ${colors.red}Fix critical leaks in this order:${colors.reset}`);
            const criticalByType = {};
            this.leaks.critical.forEach(leak => {
                if (!criticalByType[leak.type]) criticalByType[leak.type] = [];
                criticalByType[leak.type].push(leak);
            });
            
            Object.entries(criticalByType).forEach(([type, leaks]) => {
                console.log(`   • ${type}: ${leaks.length} files`);
            });
        }

        console.log(`2. ${colors.yellow}Run full audit:${colors.reset} ${colors.cyan}pnpm audit${colors.reset}`);
        console.log(`3. ${colors.yellow}Check architecture:${colors.reset} ${colors.cyan}pnpm audit:architecture${colors.reset}`);
        console.log(`4. ${colors.yellow}Set up monitoring${colors.reset} for memory usage in development`);
        console.log(`5. ${colors.yellow}Add tests${colors.reset} to verify cleanup functions work correctly`);
        
        console.log('');
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const rootDir = process.argv[2] || './src';
    const detector = new MemoryLeakDetector(rootDir);
    
    detector.detect().catch(error => {
        console.error(`${colors.red}❌ Memory leak detection failed: ${error.message}${colors.reset}`);
        process.exit(1);
    });
}

export default MemoryLeakDetector;