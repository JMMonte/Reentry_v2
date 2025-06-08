#!/usr/bin/env node

/**
 * Code Complexity Analyzer
 * Analyzes code complexity, performance bottlenecks, and maintainability metrics
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ComplexityAnalyzer {
    constructor(rootDir = './src', options = {}) {
        this.rootDir = rootDir;
        this.options = {
            excludeDirs: ['node_modules', '.git', 'dist', 'build', 'coverage', 'tests', '__tests__'],
            includeExts: ['.js', '.jsx', '.ts', '.tsx'],
            thresholds: {
                fileSize: 30000, // bytes
                lineCount: 500,
                cyclomaticComplexity: 10,
                functionLength: 50,
                parameterCount: 5,
                nestedDepth: 4,
                importCount: 15
            },
            ...options
        };
        
        this.metrics = new Map();
        this.hotspots = [];
        this.performanceWarnings = [];
        this.maintainabilityIssues = [];
    }

    async analyze() {
        console.log('🔍 Analyzing code complexity...\n');
        
        // Phase 1: Collect complexity metrics
        await this.collectMetrics();
        
        // Phase 2: Identify complexity hotspots
        this.identifyHotspots();
        
        // Phase 3: Detect performance bottlenecks
        this.detectPerformanceBottlenecks();
        
        // Phase 4: Assess maintainability
        this.assessMaintainability();
        
        // Phase 5: Generate report
        this.generateReport();
    }

    async collectMetrics() {
        console.log('📊 Collecting complexity metrics...');
        const files = await this.scanDirectory(this.rootDir);
        
        for (const file of files) {
            await this.analyzeFile(file);
        }
        
        console.log(`   Analyzed ${files.length} source files\n`);
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
            const lines = content.split('\n');
            const relativePath = path.relative(this.rootDir, filePath);
            
            const metrics = {
                path: relativePath,
                size: Buffer.byteLength(content, 'utf8'),
                lineCount: lines.length,
                effectiveLineCount: this.countEffectiveLines(lines),
                imports: this.countImports(content),
                exports: this.countExports(content),
                functions: this.analyzeFunctions(content),
                classes: this.analyzeClasses(content),
                cyclomaticComplexity: this.calculateCyclomaticComplexity(content),
                nestedDepth: this.calculateMaxNestedDepth(content),
                duplicateLines: this.findDuplicateLines(lines),
                codeSmells: this.detectCodeSmells(content, lines),
                performanceMarkers: this.detectPerformanceMarkers(content),
                technicalDebt: this.assessTechnicalDebt(content, lines)
            };
            
            this.metrics.set(relativePath, metrics);
            
        } catch (error) {
            console.error(`Error analyzing ${filePath}:`, error.message);
        }
    }

    countEffectiveLines(lines) {
        // Count non-empty, non-comment lines
        return lines.filter(line => {
            const trimmed = line.trim();
            return trimmed.length > 0 && 
                   !trimmed.startsWith('//') && 
                   !trimmed.startsWith('/*') && 
                   !trimmed.startsWith('*');
        }).length;
    }

    countImports(content) {
        const importRegex = /^import\s+.*from\s+['"`]/gm;
        const requireRegex = /require\s*\(['"`]/g;
        const dynamicImportRegex = /import\s*\(/g;
        
        return (content.match(importRegex) || []).length +
               (content.match(requireRegex) || []).length +
               (content.match(dynamicImportRegex) || []).length;
    }

    countExports(content) {
        const exportRegex = /^export\s+/gm;
        const moduleExportRegex = /module\.exports\s*=/g;
        
        return (content.match(exportRegex) || []).length +
               (content.match(moduleExportRegex) || []).length;
    }

    analyzeFunctions(content) {
        const functions = [];
        
        // Regular function declarations
        const funcRegex = /(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*{/g;
        let match;
        
        while ((match = funcRegex.exec(content)) !== null) {
            const name = match[1];
            const params = match[2].split(',').filter(p => p.trim()).length;
            const body = this.extractFunctionBody(content, match.index);
            
            functions.push({
                name,
                type: 'function',
                parameterCount: params,
                lineCount: body.split('\n').length,
                complexity: this.calculateCyclomaticComplexity(body),
                nestedDepth: this.calculateMaxNestedDepth(body)
            });
        }
        
        // Arrow functions
        const arrowRegex = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/g;
        while ((match = arrowRegex.exec(content)) !== null) {
            const name = match[1];
            const params = match[2].split(',').filter(p => p.trim()).length;
            
            functions.push({
                name,
                type: 'arrow',
                parameterCount: params,
                lineCount: 1, // Arrow functions are typically shorter
                complexity: 1, // Basic complexity for arrows
                nestedDepth: 1
            });
        }
        
        // Method definitions
        const methodRegex = /(\w+)\s*\(([^)]*)\)\s*{/g;
        while ((match = methodRegex.exec(content)) !== null) {
            const name = match[1];
            if (!['if', 'for', 'while', 'switch'].includes(name)) {
                const params = match[2].split(',').filter(p => p.trim()).length;
                const body = this.extractFunctionBody(content, match.index);
                
                functions.push({
                    name,
                    type: 'method',
                    parameterCount: params,
                    lineCount: body.split('\n').length,
                    complexity: this.calculateCyclomaticComplexity(body),
                    nestedDepth: this.calculateMaxNestedDepth(body)
                });
            }
        }
        
        return functions;
    }

    extractFunctionBody(content, startIndex) {
        let braceCount = 0;
        let inFunction = false;
        let body = '';
        
        for (let i = startIndex; i < content.length; i++) {
            const char = content[i];
            
            if (char === '{') {
                braceCount++;
                inFunction = true;
            } else if (char === '}') {
                braceCount--;
                if (braceCount === 0) {
                    return body;
                }
            }
            
            if (inFunction) {
                body += char;
            }
        }
        
        return body;
    }

    analyzeClasses(content) {
        const classes = [];
        const classRegex = /class\s+(\w+)(?:\s+extends\s+\w+)?\s*{/g;
        let match;
        
        while ((match = classRegex.exec(content)) !== null) {
            const name = match[1];
            const body = this.extractFunctionBody(content, match.index);
            const methods = this.analyzeFunctions(body);
            
            classes.push({
                name,
                methodCount: methods.length,
                lineCount: body.split('\n').length,
                complexity: methods.reduce((sum, m) => sum + m.complexity, 0)
            });
        }
        
        return classes;
    }

    calculateCyclomaticComplexity(content) {
        // Count decision points: if, else, while, for, switch, case, catch, &&, ||, ?
        const decisionPoints = [
            /\bif\s*\(/g,
            /\belse\b/g,
            /\bwhile\s*\(/g,
            /\bfor\s*\(/g,
            /\bswitch\s*\(/g,
            /\bcase\s+/g,
            /\bcatch\s*\(/g,
            /&&/g,
            /\|\|/g,
            /\?/g
        ];
        
        let complexity = 1; // Base complexity
        
        decisionPoints.forEach(regex => {
            const matches = content.match(regex);
            if (matches) {
                complexity += matches.length;
            }
        });
        
        return complexity;
    }

    calculateMaxNestedDepth(content) {
        let maxDepth = 0;
        let currentDepth = 0;
        
        for (const char of content) {
            if (char === '{') {
                currentDepth++;
                maxDepth = Math.max(maxDepth, currentDepth);
            } else if (char === '}') {
                currentDepth--;
            }
        }
        
        return maxDepth;
    }

    findDuplicateLines(lines) {
        const lineMap = new Map();
        const duplicates = [];
        
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (trimmed.length > 10) { // Only check substantial lines
                if (lineMap.has(trimmed)) {
                    duplicates.push({
                        line: trimmed,
                        occurrences: [lineMap.get(trimmed), index + 1]
                    });
                } else {
                    lineMap.set(trimmed, index + 1);
                }
            }
        });
        
        return duplicates;
    }

    detectCodeSmells(content, lines) {
        const smells = [];
        
        // Long parameter lists
        const longParamRegex = /\(([^)]{50,})\)/g;
        const longParams = content.match(longParamRegex);
        if (longParams) {
            smells.push({ type: 'long-parameter-list', count: longParams.length });
        }
        
        // Magic numbers
        const magicNumberRegex = /\b(?<![\w.])\d{3,}\b/g;
        const magicNumbers = content.match(magicNumberRegex);
        if (magicNumbers) {
            smells.push({ type: 'magic-numbers', count: magicNumbers.length });
        }
        
        // Deeply nested code
        let maxNesting = 0;
        let currentNesting = 0;
        for (const char of content) {
            if (char === '{') {
                currentNesting++;
                maxNesting = Math.max(maxNesting, currentNesting);
            } else if (char === '}') {
                currentNesting--;
            }
        }
        if (maxNesting > 4) {
            smells.push({ type: 'deep-nesting', depth: maxNesting });
        }
        
        // Large blocks
        const largeBlockRegex = /{[^{}]{500,}}/g;
        const largeBlocks = content.match(largeBlockRegex);
        if (largeBlocks) {
            smells.push({ type: 'large-blocks', count: largeBlocks.length });
        }
        
        return smells;
    }

    detectPerformanceMarkers(content) {
        const markers = [];
        
        // Performance-sensitive patterns
        const patterns = [
            { pattern: /\.forEach\(/g, type: 'forEach-loop', severity: 'low' },
            { pattern: /setTimeout|setInterval/g, type: 'timer', severity: 'medium' },
            { pattern: /JSON\.parse|JSON\.stringify/g, type: 'json-operation', severity: 'medium' },
            { pattern: /querySelector|getElementById/g, type: 'dom-query', severity: 'medium' },
            { pattern: /new\s+\w+\(/g, type: 'object-creation', severity: 'low' },
            { pattern: /\.map\(.*\.map\(/g, type: 'nested-array-ops', severity: 'high' },
            { pattern: /for\s*\([^)]*in\s+/g, type: 'for-in-loop', severity: 'medium' }
        ];
        
        patterns.forEach(({ pattern, type, severity }) => {
            const matches = content.match(pattern);
            if (matches) {
                markers.push({ type, count: matches.length, severity });
            }
        });
        
        return markers;
    }

    assessTechnicalDebt(content, lines) {
        const debt = [];
        
        // TODO comments
        const todoRegex = /\/\/\s*TODO|\/\*\s*TODO|\*\s*TODO/gi;
        const todos = content.match(todoRegex);
        if (todos) {
            debt.push({ type: 'todo-comments', count: todos.length });
        }
        
        // FIXME comments
        const fixmeRegex = /\/\/\s*FIXME|\/\*\s*FIXME|\*\s*FIXME/gi;
        const fixmes = content.match(fixmeRegex);
        if (fixmes) {
            debt.push({ type: 'fixme-comments', count: fixmes.length });
        }
        
        // Commented out code
        const commentedCodeRegex = /\/\/.*(?:function|const|let|var|if|for|while)/g;
        const commentedCode = content.match(commentedCodeRegex);
        if (commentedCode) {
            debt.push({ type: 'commented-code', count: commentedCode.length });
        }
        
        // Empty catch blocks
        const emptyCatchRegex = /catch\s*\([^)]*\)\s*{\s*}/g;
        const emptyCatches = content.match(emptyCatchRegex);
        if (emptyCatches) {
            debt.push({ type: 'empty-catch', count: emptyCatches.length });
        }
        
        return debt;
    }

    identifyHotspots() {
        console.log('🔥 Identifying complexity hotspots...');
        
        this.metrics.forEach((metrics, file) => {
            let score = 0;
            const issues = [];
            
            // File size
            if (metrics.size > this.options.thresholds.fileSize) {
                score += 3;
                issues.push(`Large file (${Math.round(metrics.size / 1024)}KB)`);
            }
            
            // Line count
            if (metrics.lineCount > this.options.thresholds.lineCount) {
                score += 2;
                issues.push(`Long file (${metrics.lineCount} lines)`);
            }
            
            // Cyclomatic complexity
            if (metrics.cyclomaticComplexity > this.options.thresholds.cyclomaticComplexity) {
                score += 4;
                issues.push(`High complexity (${metrics.cyclomaticComplexity})`);
            }
            
            // Nested depth
            if (metrics.nestedDepth > this.options.thresholds.nestedDepth) {
                score += 3;
                issues.push(`Deep nesting (${metrics.nestedDepth} levels)`);
            }
            
            // Import count
            if (metrics.imports > this.options.thresholds.importCount) {
                score += 2;
                issues.push(`Many imports (${metrics.imports})`);
            }
            
            // Complex functions
            const complexFunctions = metrics.functions.filter(f => 
                f.complexity > this.options.thresholds.cyclomaticComplexity ||
                f.lineCount > this.options.thresholds.functionLength ||
                f.parameterCount > this.options.thresholds.parameterCount
            );
            
            if (complexFunctions.length > 0) {
                score += complexFunctions.length;
                issues.push(`${complexFunctions.length} complex functions`);
            }
            
            if (score >= 5) {
                this.hotspots.push({
                    file,
                    score,
                    issues,
                    metrics
                });
            }
        });
        
        // Sort by score descending
        this.hotspots.sort((a, b) => b.score - a.score);
    }

    detectPerformanceBottlenecks() {
        console.log('⚡ Detecting performance bottlenecks...');
        
        this.metrics.forEach((metrics, file) => {
            const warnings = [];
            
            // Check performance markers
            metrics.performanceMarkers.forEach(marker => {
                if (marker.severity === 'high' && marker.count > 2) {
                    warnings.push(`High-impact ${marker.type} (${marker.count} occurrences)`);
                } else if (marker.severity === 'medium' && marker.count > 5) {
                    warnings.push(`Medium-impact ${marker.type} (${marker.count} occurrences)`);
                } else if (marker.severity === 'low' && marker.count > 10) {
                    warnings.push(`Low-impact ${marker.type} (${marker.count} occurrences)`);
                }
            });
            
            // Large functions that might impact performance
            const largeFunctions = metrics.functions.filter(f => f.lineCount > 100);
            if (largeFunctions.length > 0) {
                warnings.push(`${largeFunctions.length} very large functions`);
            }
            
            if (warnings.length > 0) {
                this.performanceWarnings.push({
                    file,
                    warnings,
                    severity: this.calculatePerformanceSeverity(warnings)
                });
            }
        });
        
        // Sort by severity
        this.performanceWarnings.sort((a, b) => {
            const severityOrder = { 'critical': 3, 'high': 2, 'medium': 1, 'low': 0 };
            return severityOrder[b.severity] - severityOrder[a.severity];
        });
    }

    calculatePerformanceSeverity(warnings) {
        if (warnings.some(w => w.includes('High-impact'))) return 'critical';
        if (warnings.some(w => w.includes('Medium-impact')) && warnings.length > 2) return 'high';
        if (warnings.length > 3) return 'medium';
        return 'low';
    }

    assessMaintainability() {
        console.log('🔧 Assessing maintainability...');
        
        this.metrics.forEach((metrics, file) => {
            const issues = [];
            let maintainabilityScore = 100; // Start with perfect score
            
            // Technical debt
            metrics.technicalDebt.forEach(debt => {
                if (debt.type === 'todo-comments' && debt.count > 3) {
                    issues.push(`${debt.count} TODO comments`);
                    maintainabilityScore -= debt.count * 2;
                }
                if (debt.type === 'fixme-comments') {
                    issues.push(`${debt.count} FIXME comments`);
                    maintainabilityScore -= debt.count * 5;
                }
                if (debt.type === 'commented-code' && debt.count > 2) {
                    issues.push(`${debt.count} blocks of commented code`);
                    maintainabilityScore -= debt.count * 3;
                }
            });
            
            // Code smells
            metrics.codeSmells.forEach(smell => {
                if (smell.type === 'deep-nesting' && smell.depth > 5) {
                    issues.push(`Very deep nesting (${smell.depth} levels)`);
                    maintainabilityScore -= 15;
                } else if (smell.type === 'magic-numbers' && smell.count > 5) {
                    issues.push(`${smell.count} magic numbers`);
                    maintainabilityScore -= smell.count;
                }
            });
            
            // Duplicate code
            if (metrics.duplicateLines.length > 3) {
                issues.push(`${metrics.duplicateLines.length} duplicate lines`);
                maintainabilityScore -= metrics.duplicateLines.length * 2;
            }
            
            // Function complexity
            const veryComplexFunctions = metrics.functions.filter(f => f.complexity > 15);
            if (veryComplexFunctions.length > 0) {
                issues.push(`${veryComplexFunctions.length} very complex functions`);
                maintainabilityScore -= veryComplexFunctions.length * 10;
            }
            
            if (issues.length > 0 || maintainabilityScore < 70) {
                this.maintainabilityIssues.push({
                    file,
                    score: Math.max(0, maintainabilityScore),
                    issues,
                    grade: this.getMaintainabilityGrade(maintainabilityScore)
                });
            }
        });
        
        // Sort by score ascending (worst first)
        this.maintainabilityIssues.sort((a, b) => a.score - b.score);
    }

    getMaintainabilityGrade(score) {
        if (score >= 90) return 'A';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 60) return 'D';
        return 'F';
    }

    generateReport() {
        console.log('📊 CODE COMPLEXITY ANALYSIS');
        console.log('══════════════════════════════════════════════════\n');
        
        // Summary
        const totalFiles = this.metrics.size;
        const totalLines = Array.from(this.metrics.values()).reduce((sum, m) => sum + m.lineCount, 0);
        const totalEffectiveLines = Array.from(this.metrics.values()).reduce((sum, m) => sum + m.effectiveLineCount, 0);
        const avgComplexity = Array.from(this.metrics.values()).reduce((sum, m) => sum + m.cyclomaticComplexity, 0) / totalFiles;
        
        console.log('📈 SUMMARY');
        console.log('--------------------');
        console.log(`Total Files: ${totalFiles}`);
        console.log(`Total Lines: ${totalLines.toLocaleString()}`);
        console.log(`Effective Lines: ${totalEffectiveLines.toLocaleString()}`);
        console.log(`Average Complexity: ${avgComplexity.toFixed(2)}`);
        console.log(`Complexity Hotspots: ${this.hotspots.length}`);
        console.log(`Performance Warnings: ${this.performanceWarnings.length}`);
        console.log(`Maintainability Issues: ${this.maintainabilityIssues.length}\n`);
        
        // Complexity hotspots
        if (this.hotspots.length > 0) {
            console.log('🔥 COMPLEXITY HOTSPOTS');
            console.log('--------------------');
            this.hotspots.slice(0, 10).forEach((hotspot, i) => {
                console.log(`${i + 1}. ${hotspot.file} (score: ${hotspot.score})`);
                hotspot.issues.forEach(issue => {
                    console.log(`   • ${issue}`);
                });
                console.log('');
            });
        }
        
        // Performance warnings
        if (this.performanceWarnings.length > 0) {
            console.log('⚡ PERFORMANCE WARNINGS');
            console.log('--------------------');
            this.performanceWarnings.slice(0, 10).forEach((warning, i) => {
                const severityIcon = {
                    'critical': '🔴',
                    'high': '🟡', 
                    'medium': '🔵',
                    'low': '⚪'
                }[warning.severity];
                
                console.log(`${severityIcon} ${warning.file}`);
                warning.warnings.forEach(w => {
                    console.log(`   • ${w}`);
                });
                console.log('');
            });
        }
        
        // Maintainability issues
        if (this.maintainabilityIssues.length > 0) {
            console.log('🔧 MAINTAINABILITY ISSUES');
            console.log('--------------------');
            this.maintainabilityIssues.slice(0, 10).forEach((issue, i) => {
                console.log(`${issue.grade} ${issue.file} (${issue.score}/100)`);
                issue.issues.forEach(iss => {
                    console.log(`   • ${iss}`);
                });
                console.log('');
            });
        }
        
        // Export JSON report
        if (this.options.json) {
            const report = {
                summary: {
                    totalFiles,
                    totalLines,
                    totalEffectiveLines,
                    averageComplexity: avgComplexity,
                    hotspots: this.hotspots.length,
                    performanceWarnings: this.performanceWarnings.length,
                    maintainabilityIssues: this.maintainabilityIssues.length
                },
                hotspots: this.hotspots,
                performanceWarnings: this.performanceWarnings,
                maintainabilityIssues: this.maintainabilityIssues,
                fileMetrics: Object.fromEntries(this.metrics)
            };
            
            fs.writeFileSync('./complexity-report.json', JSON.stringify(report, null, 2));
            console.log('📄 Report exported to: complexity-report.json');
        }
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const options = {};
    
    // Parse flags
    if (args.includes('--json')) options.json = true;
    
    // Custom thresholds
    const thresholdArgs = args.filter(arg => arg.startsWith('--threshold-'));
    thresholdArgs.forEach(arg => {
        const [key, value] = arg.replace('--threshold-', '').split('=');
        if (!options.thresholds) options.thresholds = {};
        options.thresholds[key] = parseInt(value);
    });
    
    // Get directory
    const nonFlagArgs = args.filter(arg => !arg.startsWith('--'));
    const rootDir = nonFlagArgs[0] || './src';
    
    const analyzer = new ComplexityAnalyzer(rootDir, options);
    analyzer.analyze().catch(error => {
        console.error('❌ Analysis failed:', error.message);
        process.exit(1);
    });
}

export default ComplexityAnalyzer;