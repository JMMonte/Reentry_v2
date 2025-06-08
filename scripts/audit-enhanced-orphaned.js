#!/usr/bin/env node

/**
 * Enhanced Orphaned Code Detector
 * Significantly reduces false positives by understanding modern React/JS patterns
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EnhancedOrphanedCodeDetector {
    constructor(rootDir = './src', options = {}) {
        this.rootDir = rootDir;
        this.options = {
            excludeDirs: ['node_modules', '.git', 'dist', 'build', 'coverage', 'tests', '__tests__'],
            includeExts: ['.js', '.jsx', '.ts', '.tsx'],
            ignorePatterns: [
                /\.test\./,
                /\.spec\./,
                /\.stories\./
            ],
            verbose: false,
            ...options
        };
        
        this.files = new Map();
        this.usageMap = new Map(); // file -> Set of files that use it
        this.exportUsageMap = new Map(); // export -> Set of files that use it
        this.jsxComponentUsage = new Map(); // component -> Set of files using it in JSX
        this.hookUsage = new Map(); // hook -> Set of files using it
        this.barrelExports = new Map(); // index file -> exports it re-exports
        this.dynamicUsage = new Set(); // Files used dynamically
        
        // Pattern recognizers
        this.uiComponentPatterns = /^(components\/ui\/|\.\/ui\/|..\/ui\/)/;
        this.hookPatterns = /^use[A-Z]/;
        this.eventHandlerPatterns = /^(handle|on)[A-Z]/;
        this.providerPatterns = /(Provider|Context)$/;
        
        // Results
        this.orphanedFiles = [];
        this.orphanedExports = [];
        this.potentiallyOrphaned = []; // Files that might be orphaned but need manual review
    }

    async analyze() {
        console.log('🔍 Enhanced orphaned code analysis with false positive reduction...\n');
        
        await this.collectAllFiles();
        await this.analyzeImportExportPatterns();
        await this.analyzeJSXUsage();
        await this.analyzeHookUsage();
        await this.analyzeBarrelExports();
        await this.analyzeDynamicUsage();
        await this.analyzeEventHandlerUsage();
        
        this.detectOrphanedCode();
        this.generateReport();
    }

    async collectAllFiles() {
        console.log('📁 Collecting all files...');
        const files = await this.scanDirectory(this.rootDir);
        
        for (const file of files) {
            await this.analyzeFile(file);
        }
        
        console.log(`   Found ${files.length} source files`);
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
                content,
                directory: path.dirname(relativePath),
                basename: path.basename(relativePath, path.extname(relativePath)),
                isJSX: /\.(jsx|tsx)$/.test(relativePath),
                isIndex: /^index\.(js|jsx|ts|tsx)$/.test(path.basename(relativePath)),
                isTest: this.options.ignorePatterns.some(p => p.test(relativePath)),
                exports: new Set(),
                imports: new Set(),
                namedImports: new Map(), // import path -> Set of named imports
                defaultImports: new Map(), // import path -> default import name
                jsxComponents: new Set(),
                usedHooks: new Set(),
                eventHandlers: new Set(),
                isEntryPoint: this.isEntryPoint(relativePath)
            };
            
            this.extractImports(content, fileInfo);
            this.extractExports(content, fileInfo);
            this.extractJSXComponents(content, fileInfo);
            this.extractHookUsage(content, fileInfo);
            this.extractEventHandlers(content, fileInfo);
            
            this.files.set(relativePath, fileInfo);
            
        } catch (error) {
            console.error(`Error analyzing ${filePath}:`, error.message);
        }
    }

    extractImports(content, fileInfo) {
        // ES6 imports with detailed tracking
        const importRegex = /import\s+(?:(?:(\w+)(?:\s*,\s*)?)?(?:\{\s*([^}]+)\s*\})?(?:\s*,\s*(\w+))?|\*\s+as\s+(\w+))\s+from\s+['"`]([^'"`]+)['"`]/g;
        let match;
        
        while ((match = importRegex.exec(content)) !== null) {
            const [, defaultImport1, namedImports, defaultImport2, namespaceImport, modulePath] = match;
            const defaultImport = defaultImport1 || defaultImport2;
            
            fileInfo.imports.add(modulePath);
            
            if (defaultImport) {
                fileInfo.defaultImports.set(modulePath, defaultImport);
            }
            
            if (namespaceImport) {
                fileInfo.defaultImports.set(modulePath, namespaceImport);
            }
            
            if (namedImports) {
                const named = namedImports.split(',').map(imp => {
                    const parts = imp.trim().split(/\s+as\s+/);
                    return parts[parts.length - 1]; // Get the local name
                }).filter(Boolean);
                
                fileInfo.namedImports.set(modulePath, new Set(named));
            }
        }
        
        // Dynamic imports
        const dynamicImportRegex = /(?:await\s+)?import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
        while ((match = dynamicImportRegex.exec(content)) !== null) {
            fileInfo.imports.add(match[1]);
            this.dynamicUsage.add(match[1]);
        }
        
        // Worker imports
        const workerRegex = /new\s+Worker\s*\(\s*new\s+URL\s*\(\s*['"`]([^'"`]+)['"`]/g;
        while ((match = workerRegex.exec(content)) !== null) {
            fileInfo.imports.add(match[1]);
            this.dynamicUsage.add(match[1]);
        }
        
        // Require statements
        const requireRegex = /(?:const|let|var)\s+(?:\{\s*([^}]+)\s*\}|(\w+))\s*=\s*require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
        while ((match = requireRegex.exec(content)) !== null) {
            const [, destructured, variable, modulePath] = match;
            fileInfo.imports.add(modulePath);
            
            if (destructured) {
                const named = destructured.split(',').map(imp => imp.trim()).filter(Boolean);
                fileInfo.namedImports.set(modulePath, new Set(named));
            }
            
            if (variable) {
                fileInfo.defaultImports.set(modulePath, variable);
            }
        }
    }

    extractExports(content, fileInfo) {
        // Named exports
        const namedExportRegex = /export\s+(?:const|let|var|function|class|async\s+function)\s+(\w+)/g;
        let match;
        
        while ((match = namedExportRegex.exec(content)) !== null) {
            fileInfo.exports.add(match[1]);
        }
        
        // Export blocks
        const exportBlockRegex = /export\s*\{\s*([^}]+)\s*\}/g;
        while ((match = exportBlockRegex.exec(content)) !== null) {
            const exports = match[1].split(',').map(exp => {
                const parts = exp.trim().split(/\s+as\s+/);
                return parts[0].trim(); // Original name
            });
            exports.forEach(exp => fileInfo.exports.add(exp));
        }
        
        // Default exports
        if (/export\s+default/.test(content)) {
            fileInfo.exports.add('default');
        }
        
        // Re-exports
        const reExportRegex = /export\s*(?:\*|\{\s*[^}]+\s*\})\s+from\s+['"`]([^'"`]+)['"`]/g;
        while ((match = reExportRegex.exec(content)) !== null) {
            fileInfo.imports.add(match[1]);
            // Mark as barrel export
            if (fileInfo.isIndex) {
                if (!this.barrelExports.has(fileInfo.relativePath)) {
                    this.barrelExports.set(fileInfo.relativePath, new Set());
                }
                this.barrelExports.get(fileInfo.relativePath).add(match[1]);
            }
        }
    }

    extractJSXComponents(content, fileInfo) {
        if (!fileInfo.isJSX && !content.includes('jsx') && !content.includes('createElement')) {
            return;
        }
        
        // JSX component usage: <ComponentName or <ComponentName.SubComponent
        const jsxRegex = /<(\w+)(?:\.\w+)?[\s>]/g;
        let match;
        
        while ((match = jsxRegex.exec(content)) !== null) {
            const componentName = match[1];
            // Skip HTML elements
            if (componentName[0] === componentName[0].toLowerCase()) {
                continue;
            }
            fileInfo.jsxComponents.add(componentName);
        }
    }

    extractHookUsage(content, fileInfo) {
        // React hook usage: useHookName(
        const hookRegex = /(use[A-Z]\w*)\s*\(/g;
        let match;
        
        while ((match = hookRegex.exec(content)) !== null) {
            fileInfo.usedHooks.add(match[1]);
        }
    }

    extractEventHandlers(content, fileInfo) {
        // Event handler usage in JSX props: onClick={handler} or onClick={handleClick}
        const handlerRegex = /(?:on\w+|handle\w+)\s*[=:]\s*\{?\s*(\w+)/g;
        let match;
        
        while ((match = handlerRegex.exec(content)) !== null) {
            if (this.eventHandlerPatterns.test(match[1])) {
                fileInfo.eventHandlers.add(match[1]);
            }
        }
        
        // Also look for handler definitions being passed as props
        const handlerPropRegex = /(\w*[Hh]andler?\w*|\w*[Oo]n[A-Z]\w*)\s*[=:]/g;
        while ((match = handlerPropRegex.exec(content)) !== null) {
            fileInfo.eventHandlers.add(match[1]);
        }
    }

    async analyzeImportExportPatterns() {
        console.log('🔗 Analyzing import/export patterns...');
        
        this.files.forEach((fileInfo, filePath) => {
            fileInfo.imports.forEach(importPath => {
                const resolvedPath = this.resolveImportPath(importPath, filePath);
                if (resolvedPath && this.files.has(resolvedPath)) {
                    if (!this.usageMap.has(resolvedPath)) {
                        this.usageMap.set(resolvedPath, new Set());
                    }
                    this.usageMap.get(resolvedPath).add(filePath);
                    
                    // Track specific named imports
                    const namedImports = fileInfo.namedImports.get(importPath);
                    if (namedImports) {
                        namedImports.forEach(namedImport => {
                            const exportKey = `${resolvedPath}:${namedImport}`;
                            if (!this.exportUsageMap.has(exportKey)) {
                                this.exportUsageMap.set(exportKey, new Set());
                            }
                            this.exportUsageMap.get(exportKey).add(filePath);
                        });
                    }
                    
                    // Track default imports
                    const defaultImport = fileInfo.defaultImports.get(importPath);
                    if (defaultImport) {
                        const exportKey = `${resolvedPath}:default`;
                        if (!this.exportUsageMap.has(exportKey)) {
                            this.exportUsageMap.set(exportKey, new Set());
                        }
                        this.exportUsageMap.get(exportKey).add(filePath);
                    }
                }
            });
        });
    }

    async analyzeJSXUsage() {
        console.log('⚛️  Analyzing JSX component usage...');
        
        this.files.forEach((fileInfo, filePath) => {
            fileInfo.jsxComponents.forEach(componentName => {
                // Find which imports might provide this component
                fileInfo.namedImports.forEach((namedImports, importPath) => {
                    if (namedImports.has(componentName)) {
                        const resolvedPath = this.resolveImportPath(importPath, filePath);
                        if (resolvedPath) {
                            if (!this.jsxComponentUsage.has(componentName)) {
                                this.jsxComponentUsage.set(componentName, new Set());
                            }
                            this.jsxComponentUsage.get(componentName).add(resolvedPath);
                        }
                    }
                });
                
                // Check default imports
                fileInfo.defaultImports.forEach((defaultName, importPath) => {
                    if (defaultName === componentName) {
                        const resolvedPath = this.resolveImportPath(importPath, filePath);
                        if (resolvedPath) {
                            if (!this.jsxComponentUsage.has(componentName)) {
                                this.jsxComponentUsage.set(componentName, new Set());
                            }
                            this.jsxComponentUsage.get(componentName).add(resolvedPath);
                        }
                    }
                });
            });
        });
    }

    async analyzeHookUsage() {
        console.log('🪝 Analyzing React hook usage...');
        
        this.files.forEach((fileInfo, filePath) => {
            fileInfo.usedHooks.forEach(hookName => {
                // Find which imports might provide this hook
                fileInfo.namedImports.forEach((namedImports, importPath) => {
                    if (namedImports.has(hookName)) {
                        const resolvedPath = this.resolveImportPath(importPath, filePath);
                        if (resolvedPath) {
                            if (!this.hookUsage.has(hookName)) {
                                this.hookUsage.set(hookName, new Set());
                            }
                            this.hookUsage.get(hookName).add(resolvedPath);
                        }
                    }
                });
            });
        });
    }

    async analyzeBarrelExports() {
        console.log('📦 Analyzing barrel exports...');
        
        // Mark files exported by barrel files as used
        this.barrelExports.forEach((exportedPaths, barrelPath) => {
            exportedPaths.forEach(exportPath => {
                const resolvedPath = this.resolveImportPath(exportPath, barrelPath);
                if (resolvedPath && this.files.has(resolvedPath)) {
                    // If barrel is used, mark exported files as used
                    if (this.usageMap.has(barrelPath)) {
                        if (!this.usageMap.has(resolvedPath)) {
                            this.usageMap.set(resolvedPath, new Set());
                        }
                        // Inherit usage from barrel
                        this.usageMap.get(barrelPath).forEach(user => {
                            this.usageMap.get(resolvedPath).add(user);
                        });
                    }
                }
            });
        });
    }

    async analyzeDynamicUsage() {
        console.log('⚡ Analyzing dynamic usage patterns...');
        
        // Files used dynamically should not be marked as orphaned
        this.dynamicUsage.forEach(dynamicPath => {
            this.files.forEach((fileInfo, filePath) => {
                const resolvedPath = this.resolveImportPath(dynamicPath, filePath);
                if (resolvedPath && this.files.has(resolvedPath)) {
                    if (!this.usageMap.has(resolvedPath)) {
                        this.usageMap.set(resolvedPath, new Set());
                    }
                    this.usageMap.get(resolvedPath).add('__dynamic__');
                }
            });
        });
    }

    async analyzeEventHandlerUsage() {
        console.log('🎯 Analyzing event handler usage...');
        
        // Cross-reference event handlers with function definitions
        this.files.forEach((fileInfo, filePath) => {
            fileInfo.eventHandlers.forEach(handlerName => {
                // Mark functions with handler names as used
                this.files.forEach((otherFileInfo, otherFilePath) => {
                    if (otherFileInfo.exports.has(handlerName)) {
                        const exportKey = `${otherFilePath}:${handlerName}`;
                        if (!this.exportUsageMap.has(exportKey)) {
                            this.exportUsageMap.set(exportKey, new Set());
                        }
                        this.exportUsageMap.get(exportKey).add(filePath);
                    }
                });
            });
        });
    }

    resolveImportPath(importPath, fromFile) {
        // Skip external packages
        if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
            return null;
        }
        
        // Resolve relative paths
        if (importPath.startsWith('./') || importPath.startsWith('../')) {
            const fromDir = path.dirname(fromFile);
            const resolved = path.normalize(path.join(fromDir, importPath));
            
            // Try different extensions and index files
            const candidates = [
                resolved,
                resolved + '.js',
                resolved + '.jsx',
                resolved + '.ts',
                resolved + '.tsx',
                path.join(resolved, 'index.js'),
                path.join(resolved, 'index.jsx'),
                path.join(resolved, 'index.ts'),
                path.join(resolved, 'index.tsx')
            ];
            
            for (const candidate of candidates) {
                if (this.files.has(candidate)) {
                    return candidate;
                }
            }
        }
        
        return null;
    }

    detectOrphanedCode() {
        console.log('🚨 Detecting truly orphaned code...\n');
        
        // Detect orphaned files
        this.files.forEach((fileInfo, filePath) => {
            if (fileInfo.isTest || fileInfo.isEntryPoint) {
                return; // Skip tests and entry points
            }
            
            const isUsed = this.usageMap.has(filePath);
            const hasJSXUsage = Array.from(this.jsxComponentUsage.values()).some(usageSet => 
                usageSet.has(filePath)
            );
            const hasHookUsage = Array.from(this.hookUsage.values()).some(usageSet => 
                usageSet.has(filePath)
            );
            const isDynamicallyUsed = this.dynamicUsage.has(filePath);
            
            // Special patterns that are often used but hard to detect
            const isUIComponent = this.uiComponentPatterns.test(filePath);
            const isProvider = this.providerPatterns.test(fileInfo.basename);
            const isMessageComponent = filePath.includes('messages/');
            const hasExports = fileInfo.exports.size > 0;
            
            if (!isUsed && !hasJSXUsage && !hasHookUsage && !isDynamicallyUsed) {
                // Check if it's a special pattern that might be used
                if (isUIComponent || isProvider || isMessageComponent) {
                    this.potentiallyOrphaned.push({
                        file: filePath,
                        reason: 'Possible false positive - review manually',
                        category: isUIComponent ? 'UI Component' : 
                                 isProvider ? 'Provider/Context' : 'Message Component',
                        exports: Array.from(fileInfo.exports),
                        confidence: 'low'
                    });
                } else {
                    this.orphanedFiles.push({
                        file: filePath,
                        reason: 'Not imported or used anywhere',
                        exports: Array.from(fileInfo.exports),
                        confidence: 'high'
                    });
                }
            }
        });
        
        // Detect orphaned exports
        this.files.forEach((fileInfo, filePath) => {
            if (this.usageMap.has(filePath)) { // Only check exports from used files
                fileInfo.exports.forEach(exportName => {
                    const exportKey = `${filePath}:${exportName}`;
                    const isUsed = this.exportUsageMap.has(exportKey);
                    const isJSXUsed = this.jsxComponentUsage.has(exportName);
                    const isHookUsed = this.hookUsage.has(exportName);
                    
                    if (!isUsed && !isJSXUsed && !isHookUsed && exportName !== 'default') {
                        // Check special patterns
                        const isEventHandler = this.eventHandlerPatterns.test(exportName);
                        const isUIExport = this.uiComponentPatterns.test(filePath);
                        
                        if (isEventHandler || (isUIExport && exportName && exportName[0] === exportName[0].toUpperCase())) {
                            // Likely used in JSX or as event handler - skip
                            return;
                        }
                        
                        this.orphanedExports.push({
                            name: exportName,
                            file: filePath,
                            reason: 'Exported but never imported or used'
                        });
                    }
                });
            }
        });
    }

    isEntryPoint(relativePath) {
        const basename = path.basename(relativePath);
        const dirname = path.dirname(relativePath);
        
        // Main entry points
        if (/^(index|main|App)\.(js|jsx|ts|tsx)$/.test(basename)) {
            return true;
        }
        
        // Root level files
        if (dirname === '.' && !/\.test\.|\.spec\./.test(basename)) {
            return true;
        }
        
        return false;
    }

    generateReport() {
        console.log('📊 ENHANCED ORPHANED CODE ANALYSIS');
        console.log('══════════════════════════════════════════════════\n');
        
        console.log('📈 SUMMARY');
        console.log('--------------------');
        console.log(`Total Files: ${this.files.size}`);
        console.log(`High Confidence Orphaned Files: ${this.orphanedFiles.length}`);
        console.log(`Potentially Orphaned (Review Needed): ${this.potentiallyOrphaned.length}`);
        console.log(`Orphaned Exports: ${this.orphanedExports.length}`);
        console.log(`JSX Components Detected: ${this.jsxComponentUsage.size}`);
        console.log(`React Hooks Detected: ${this.hookUsage.size}`);
        console.log(`Dynamic Imports: ${this.dynamicUsage.size}\n`);
        
        // High confidence orphaned files
        if (this.orphanedFiles.length > 0) {
            console.log('🔴 HIGH CONFIDENCE ORPHANED FILES');
            console.log('--------------------');
            this.orphanedFiles.forEach(file => {
                console.log(`📄 ${file.file}`);
                console.log(`   Reason: ${file.reason}`);
                if (file.exports.length > 0) {
                    console.log(`   Exports: ${file.exports.join(', ')}`);
                }
                console.log('');
            });
        }
        
        // Potentially orphaned (needs review)
        if (this.potentiallyOrphaned.length > 0) {
            console.log('🟡 POTENTIALLY ORPHANED (MANUAL REVIEW NEEDED)');
            console.log('--------------------');
            this.potentiallyOrphaned.forEach(file => {
                console.log(`📄 ${file.file} (${file.category})`);
                console.log(`   Reason: ${file.reason}`);
                if (file.exports.length > 0) {
                    console.log(`   Exports: ${file.exports.join(', ')}`);
                }
                console.log('');
            });
        }
        
        // Orphaned exports (reduced list)
        if (this.orphanedExports.length > 0) {
            console.log('📤 ORPHANED EXPORTS (HIGH CONFIDENCE)');
            console.log('--------------------');
            this.orphanedExports.slice(0, 15).forEach(exp => {
                console.log(`${exp.name} - ${exp.file}`);
            });
            
            if (this.orphanedExports.length > 15) {
                console.log(`... and ${this.orphanedExports.length - 15} more\n`);
            } else {
                console.log('');
            }
        }
        
        // Success metrics
        console.log('✅ FALSE POSITIVE REDUCTION METRICS');
        console.log('--------------------');
        console.log(`UI Components Protected: ${Array.from(this.jsxComponentUsage.keys()).length}`);
        console.log(`React Hooks Protected: ${Array.from(this.hookUsage.keys()).length}`);
        console.log(`Dynamic Imports Protected: ${this.dynamicUsage.size}`);
        console.log(`Barrel Exports Resolved: ${this.barrelExports.size}`);
        
        // Export JSON report
        if (this.options.json) {
            const report = {
                summary: {
                    totalFiles: this.files.size,
                    highConfidenceOrphaned: this.orphanedFiles.length,
                    potentiallyOrphaned: this.potentiallyOrphaned.length,
                    orphanedExports: this.orphanedExports.length,
                    jsxComponents: this.jsxComponentUsage.size,
                    hooks: this.hookUsage.size,
                    dynamicImports: this.dynamicUsage.size
                },
                orphanedFiles: this.orphanedFiles,
                potentiallyOrphaned: this.potentiallyOrphaned,
                orphanedExports: this.orphanedExports,
                protectedComponents: Array.from(this.jsxComponentUsage.keys()),
                protectedHooks: Array.from(this.hookUsage.keys())
            };
            
            fs.writeFileSync('./enhanced-orphaned-report.json', JSON.stringify(report, null, 2));
            console.log('\n📄 Report exported to: enhanced-orphaned-report.json');
        }
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const options = {};
    
    // Parse flags
    if (args.includes('--json')) options.json = true;
    if (args.includes('--verbose')) options.verbose = true;
    
    // Get directory
    const nonFlagArgs = args.filter(arg => !arg.startsWith('--'));
    const rootDir = nonFlagArgs[0] || './src';
    
    const detector = new EnhancedOrphanedCodeDetector(rootDir, options);
    detector.analyze().catch(error => {
        console.error('❌ Analysis failed:', error.message);
        process.exit(1);
    });
}

export default EnhancedOrphanedCodeDetector;