#!/usr/bin/env node

/**
 * Orphaned Code Detector
 * Finds unused files, functions, methods, and exports in the codebase
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class OrphanedCodeDetector {
    constructor(rootDir = './src', options = {}) {
        this.rootDir = rootDir;
        this.options = {
            excludeDirs: ['node_modules', '.git', 'dist', 'build', 'coverage', 'tests', '__tests__'],
            includeExts: ['.js', '.jsx', '.ts', '.tsx'],
            ignorePatterns: [
                /\.test\./,
                /\.spec\./,
                /\.stories\./,
                /^index\./,
                /^main\./,
                /^App\./
            ],
            verbose: false,
            ...options
        };
        
        // Track all definitions and usages
        this.files = new Map(); // filepath -> file info
        this.exports = new Map(); // exportName -> { file, line, type, used }
        this.imports = new Map(); // importPath -> Set of imported names
        this.functions = new Map(); // functionName -> { file, line, type, used }
        this.classes = new Map(); // className -> { file, line, methods, used }
        this.usages = new Map(); // identifier -> Set of files using it
        
        // Results
        this.orphanedFiles = [];
        this.orphanedExports = [];
        this.orphanedFunctions = [];
        this.orphanedMethods = [];
        this.unusedImports = [];
    }

    async analyze() {
        console.log('🔍 Scanning for orphaned code...\n');
        
        // Phase 1: Collect all files and their exports/imports
        await this.collectDefinitions();
        
        // Phase 2: Analyze usage patterns
        this.analyzeUsages();
        
        // Phase 3: Detect orphaned code
        this.detectOrphans();
        
        // Phase 4: Generate report
        this.generateReport();
    }

    async collectDefinitions() {
        console.log('📁 Collecting definitions...');
        const files = await this.scanDirectory(this.rootDir);
        
        for (const file of files) {
            await this.analyzeFile(file);
        }
        
        // Count different import types
        let dynamicImports = 0;
        let workerImports = 0;
        let regularImports = 0;
        this.imports.forEach((importedNames, path) => {
            if (importedNames.has('__dynamic__')) dynamicImports++;
            else if (importedNames.has('__worker__')) workerImports++;
            else regularImports++;
        });
        
        console.log(`   Found ${files.length} source files`);
        console.log(`   Found ${this.exports.size} exports`);
        console.log(`   Found ${this.functions.size} functions/methods`);
        console.log(`   Found ${regularImports} regular imports, ${dynamicImports} dynamic imports, ${workerImports} worker imports\n`);
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
                if (this.options.includeExts.includes(ext) && 
                    !this.options.ignorePatterns.some(p => p.test(entry.name))) {
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
            
            const fileInfo = {
                path: filePath,
                relativePath,
                content,
                lines,
                imports: new Set(),
                exports: new Set(),
                functions: new Set(),
                classes: new Set(),
                usedIdentifiers: new Set(),
                isEntryPoint: this.isEntryPoint(relativePath),
                isTest: this.isTestFile(relativePath)
            };
            
            this.files.set(filePath, fileInfo);
            
            // Extract imports
            this.extractImports(content, lines, fileInfo);
            
            // Extract exports
            this.extractExports(content, lines, fileInfo);
            
            // Extract function/method definitions
            this.extractFunctions(content, lines, fileInfo);
            
            // Extract class definitions
            this.extractClasses(content, lines, fileInfo);
            
            // Extract all identifier usages
            this.extractUsages(content, lines, fileInfo);
            
        } catch (error) {
            console.error(`Error analyzing ${filePath}:`, error.message);
        }
    }

    extractImports(content, lines, fileInfo) {
        // ES6 imports
        const importRegex = /import\s+(?:(?:\*\s+as\s+(\w+))|(?:{([^}]+)})|(\w+))?\s*(?:,\s*(?:{([^}]+)}|(\w+)))?\s+from\s+['"`]([^'"`]+)['"`]/g;
        let match;
        
        while ((match = importRegex.exec(content)) !== null) {
            const importPath = match[6];
            const imports = new Set();
            
            // Handle different import types
            if (match[1]) imports.add(match[1]); // import * as name
            if (match[2]) match[2].split(',').forEach(i => imports.add(i.trim())); // import { a, b }
            if (match[3]) imports.add(match[3]); // import name
            if (match[4]) match[4].split(',').forEach(i => imports.add(i.trim())); // import name, { a, b }
            if (match[5]) imports.add(match[5]); // import name, other
            
            fileInfo.imports.add(importPath);
            
            // Track what's imported from where
            if (!this.imports.has(importPath)) {
                this.imports.set(importPath, new Set());
            }
            imports.forEach(name => {
                this.imports.get(importPath).add(name);
            });
        }
        
        // Dynamic imports - await import() or import()
        const dynamicImportRegex = /(?:await\s+)?import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
        while ((match = dynamicImportRegex.exec(content)) !== null) {
            const importPath = match[1];
            fileInfo.imports.add(importPath);
            
            // Mark as dynamically imported
            if (!this.imports.has(importPath)) {
                this.imports.set(importPath, new Set(['__dynamic__']));
            }
        }
        
        // Worker imports - new Worker(new URL(...))
        const workerRegex = /new\s+Worker\s*\(\s*new\s+URL\s*\(\s*['"`]([^'"`]+)['"`]/g;
        while ((match = workerRegex.exec(content)) !== null) {
            const workerPath = match[1];
            fileInfo.imports.add(workerPath);
            
            // Mark as worker import
            if (!this.imports.has(workerPath)) {
                this.imports.set(workerPath, new Set(['__worker__']));
            }
        }
        
        // CommonJS requires
        const requireRegex = /(?:const|let|var)\s+(?:{([^}]+)}|(\w+))\s*=\s*require\(['"`]([^'"`]+)['"`]\)/g;
        while ((match = requireRegex.exec(content)) !== null) {
            const importPath = match[3];
            fileInfo.imports.add(importPath);
        }
        
        // Re-exports - export { ... } from '...' or export * from '...'
        const reExportRegex = /export\s*(?:\*|{[^}]+})\s*from\s*['"`]([^'"`]+)['"`]/g;
        while ((match = reExportRegex.exec(content)) !== null) {
            const importPath = match[1];
            fileInfo.imports.add(importPath);
            fileInfo.hasReExports = true;
        }
    }

    extractExports(content, lines, fileInfo) {
        // Named exports
        const namedExportRegex = /export\s+(?:const|let|var|function|class|async\s+function)\s+(\w+)/g;
        let match;
        
        while ((match = namedExportRegex.exec(content)) !== null) {
            const name = match[1];
            const line = this.getLineNumber(content, match.index);
            
            this.exports.set(name, {
                file: fileInfo.relativePath,
                line,
                type: 'named',
                used: false
            });
            
            fileInfo.exports.add(name);
        }
        
        // Export statements
        const exportStmtRegex = /export\s*{([^}]+)}/g;
        while ((match = exportStmtRegex.exec(content)) !== null) {
            const exports = match[1].split(',').map(e => e.trim());
            exports.forEach(exp => {
                const name = exp.split(/\s+as\s+/)[0].trim();
                fileInfo.exports.add(name);
                
                this.exports.set(name, {
                    file: fileInfo.relativePath,
                    line: this.getLineNumber(content, match.index),
                    type: 'named',
                    used: false
                });
            });
        }
        
        // Default exports
        if (/export\s+default/.test(content)) {
            fileInfo.exports.add('default');
            this.exports.set(`${fileInfo.relativePath}:default`, {
                file: fileInfo.relativePath,
                line: 0,
                type: 'default',
                used: false
            });
        }
    }

    extractFunctions(content, lines, fileInfo) {
        // Function declarations
        const funcRegex = /(?:^|\s)(?:async\s+)?function\s+(\w+)\s*\(/gm;
        let match;
        
        while ((match = funcRegex.exec(content)) !== null) {
            const name = match[1];
            const line = this.getLineNumber(content, match.index);
            
            this.functions.set(`${fileInfo.relativePath}:${name}`, {
                name,
                file: fileInfo.relativePath,
                line,
                type: 'function',
                used: false,
                isExported: fileInfo.exports.has(name)
            });
            
            fileInfo.functions.add(name);
        }
        
        // Arrow functions assigned to variables
        const arrowRegex = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g;
        while ((match = arrowRegex.exec(content)) !== null) {
            const name = match[1];
            const line = this.getLineNumber(content, match.index);
            
            this.functions.set(`${fileInfo.relativePath}:${name}`, {
                name,
                file: fileInfo.relativePath,
                line,
                type: 'arrow',
                used: false,
                isExported: fileInfo.exports.has(name)
            });
            
            fileInfo.functions.add(name);
        }
    }

    extractClasses(content, lines, fileInfo) {
        // Class declarations
        const classRegex = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?\s*{/g;
        let match;
        
        while ((match = classRegex.exec(content)) !== null) {
            const className = match[1];
            const line = this.getLineNumber(content, match.index);
            
            // Extract methods from class
            const classBody = this.extractClassBody(content, match.index);
            const methods = this.extractClassMethods(classBody);
            
            this.classes.set(className, {
                name: className,
                file: fileInfo.relativePath,
                line,
                methods,
                used: false,
                isExported: fileInfo.exports.has(className)
            });
            
            fileInfo.classes.add(className);
            
            // Track each method
            methods.forEach(method => {
                this.functions.set(`${fileInfo.relativePath}:${className}.${method.name}`, {
                    name: `${className}.${method.name}`,
                    file: fileInfo.relativePath,
                    line: method.line,
                    type: 'method',
                    className,
                    used: false,
                    isExported: false
                });
            });
        }
    }

    extractClassBody(content, startIndex) {
        let braceCount = 0;
        let inClass = false;
        let classBody = '';
        
        for (let i = startIndex; i < content.length; i++) {
            const char = content[i];
            
            if (char === '{') {
                braceCount++;
                inClass = true;
            } else if (char === '}') {
                braceCount--;
                if (braceCount === 0) {
                    return classBody;
                }
            }
            
            if (inClass) {
                classBody += char;
            }
        }
        
        return classBody;
    }

    extractClassMethods(classBody) {
        const methods = [];
        const methodRegex = /(?:static\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)\s*{/g;
        let match;
        
        while ((match = methodRegex.exec(classBody)) !== null) {
            const name = match[1];
            if (name !== 'constructor') {
                methods.push({
                    name,
                    line: 0 // Would need proper line calculation
                });
            }
        }
        
        return methods;
    }

    extractUsages(content, lines, fileInfo) {
        // Extract all identifier usages
        const identifierRegex = /\b(\w+)\s*\(/g;
        let match;
        
        while ((match = identifierRegex.exec(content)) !== null) {
            const identifier = match[1];
            fileInfo.usedIdentifiers.add(identifier);
            
            // Track usage
            if (!this.usages.has(identifier)) {
                this.usages.set(identifier, new Set());
            }
            this.usages.get(identifier).add(fileInfo.relativePath);
        }
        
        // Also track property access
        const propAccessRegex = /\.(\w+)(?:\s*\()?/g;
        while ((match = propAccessRegex.exec(content)) !== null) {
            const prop = match[1];
            fileInfo.usedIdentifiers.add(prop);
            
            if (!this.usages.has(prop)) {
                this.usages.set(prop, new Set());
            }
            this.usages.get(prop).add(fileInfo.relativePath);
        }
    }

    analyzeUsages() {
        console.log('🔗 Analyzing usage patterns...');
        
        // Mark exports as used if they're imported
        this.exports.forEach((exportInfo, name) => {
            if (this.usages.has(name)) {
                exportInfo.used = true;
            }
        });
        
        // Mark functions as used if they're called
        this.functions.forEach((funcInfo, key) => {
            const funcName = funcInfo.name.split('.').pop(); // Handle methods
            if (this.usages.has(funcName)) {
                funcInfo.used = true;
            }
        });
        
        // Mark classes as used
        this.classes.forEach((classInfo, name) => {
            if (this.usages.has(name)) {
                classInfo.used = true;
            }
        });
        
        // Check file imports
        this.files.forEach((fileInfo, filePath) => {
            const relativePath = fileInfo.relativePath;
            
            // Check if file is imported anywhere
            let isImported = false;
            this.files.forEach((otherFile, otherPath) => {
                if (otherPath !== filePath) {
                    otherFile.imports.forEach(imp => {
                        if (this.isImportMatch(imp, relativePath, otherFile.relativePath)) {
                            isImported = true;
                        }
                    });
                }
            });
            
            fileInfo.isImported = isImported;
        });
    }

    detectOrphans() {
        console.log('🚨 Detecting orphaned code...\n');
        
        // Orphaned files
        this.files.forEach((fileInfo, filePath) => {
            if (!fileInfo.isEntryPoint && !fileInfo.isImported && !fileInfo.isTest) {
                // Special case: don't mark re-export files as orphaned (they're aggregators)
                const isReExportFile = fileInfo.hasReExports && 
                                      fileInfo.exports.size > 0 && 
                                      fileInfo.functions.size === 0;
                
                if (!isReExportFile) {
                    this.orphanedFiles.push({
                        file: fileInfo.relativePath,
                        exports: Array.from(fileInfo.exports),
                        functions: Array.from(fileInfo.functions),
                        classes: Array.from(fileInfo.classes),
                        reason: this._getOrphanReason(fileInfo)
                    });
                }
            }
        });
        
        // Orphaned exports
        this.exports.forEach((exportInfo, name) => {
            if (!exportInfo.used && exportInfo.type === 'named') {
                this.orphanedExports.push({
                    name,
                    file: exportInfo.file,
                    line: exportInfo.line
                });
            }
        });
        
        // Orphaned functions/methods
        this.functions.forEach((funcInfo, key) => {
            if (!funcInfo.used && !funcInfo.isExported) {
                if (funcInfo.className) {
                    this.orphanedMethods.push({
                        name: funcInfo.name,
                        file: funcInfo.file,
                        line: funcInfo.line,
                        className: funcInfo.className
                    });
                } else {
                    this.orphanedFunctions.push({
                        name: funcInfo.name,
                        file: funcInfo.file,
                        line: funcInfo.line,
                        type: funcInfo.type
                    });
                }
            }
        });
        
        // Unused imports
        this.files.forEach((fileInfo) => {
            fileInfo.imports.forEach(importPath => {
                const imported = this.imports.get(importPath);
                if (imported) {
                    const unused = Array.from(imported).filter(name => 
                        !fileInfo.usedIdentifiers.has(name)
                    );
                    
                    if (unused.length > 0) {
                        this.unusedImports.push({
                            file: fileInfo.relativePath,
                            from: importPath,
                            unused
                        });
                    }
                }
            });
        });
    }

    generateReport() {
        console.log('📊 ORPHANED CODE REPORT');
        console.log('══════════════════════════════════════════════════\n');
        
        console.log('📈 SUMMARY');
        console.log('--------------------');
        console.log(`Total Files: ${this.files.size}`);
        console.log(`Orphaned Files: ${this.orphanedFiles.length}`);
        console.log(`Orphaned Exports: ${this.orphanedExports.length}`);
        console.log(`Orphaned Functions: ${this.orphanedFunctions.length}`);
        console.log(`Orphaned Methods: ${this.orphanedMethods.length}`);
        console.log(`Unused Imports: ${this.unusedImports.length}\n`);
        
        // Orphaned files
        if (this.orphanedFiles.length > 0) {
            console.log('🗂️  ORPHANED FILES');
            console.log('------------------------------');
            this.orphanedFiles.forEach(file => {
                console.log(`📄 ${file.file}`);
                if (file.exports.length > 0) {
                    console.log(`   Exports: ${file.exports.join(', ')}`);
                }
                if (file.functions.length > 0) {
                    console.log(`   Functions: ${file.functions.join(', ')}`);
                }
                console.log('');
            });
        }
        
        // Orphaned exports
        if (this.orphanedExports.length > 0) {
            console.log('📤 ORPHANED EXPORTS');
            console.log('------------------------------');
            this.orphanedExports.slice(0, 20).forEach(exp => {
                console.log(`${exp.name} - ${exp.file}:${exp.line}`);
            });
            if (this.orphanedExports.length > 20) {
                console.log(`... and ${this.orphanedExports.length - 20} more\n`);
            } else {
                console.log('');
            }
        }
        
        // Orphaned functions
        if (this.orphanedFunctions.length > 0) {
            console.log('🔧 ORPHANED FUNCTIONS');
            console.log('------------------------------');
            this.orphanedFunctions.slice(0, 20).forEach(func => {
                console.log(`${func.name}() - ${func.file}:${func.line}`);
            });
            if (this.orphanedFunctions.length > 20) {
                console.log(`... and ${this.orphanedFunctions.length - 20} more\n`);
            } else {
                console.log('');
            }
        }
        
        // Orphaned methods
        if (this.orphanedMethods.length > 0) {
            console.log('🔨 ORPHANED METHODS');
            console.log('------------------------------');
            this.orphanedMethods.slice(0, 20).forEach(method => {
                console.log(`${method.name} - ${method.file}:${method.line}`);
            });
            if (this.orphanedMethods.length > 20) {
                console.log(`... and ${this.orphanedMethods.length - 20} more\n`);
            } else {
                console.log('');
            }
        }
        
        // Export JSON report
        if (this.options.json) {
            const report = {
                summary: {
                    totalFiles: this.files.size,
                    orphanedFiles: this.orphanedFiles.length,
                    orphanedExports: this.orphanedExports.length,
                    orphanedFunctions: this.orphanedFunctions.length,
                    orphanedMethods: this.orphanedMethods.length,
                    unusedImports: this.unusedImports.length
                },
                orphanedFiles: this.orphanedFiles,
                orphanedExports: this.orphanedExports,
                orphanedFunctions: this.orphanedFunctions,
                orphanedMethods: this.orphanedMethods,
                unusedImports: this.unusedImports
            };
            
            fs.writeFileSync('./orphaned-code-report.json', JSON.stringify(report, null, 2));
            console.log('📄 Report exported to: orphaned-code-report.json');
        }
    }

    // Helper methods
    getLineNumber(content, index) {
        return content.substring(0, index).split('\n').length;
    }

    isEntryPoint(relativePath) {
        const basename = path.basename(relativePath);
        const dirname = path.dirname(relativePath);
        
        // Main entry points
        if (/^(index|main|App)\.(js|jsx|ts|tsx)$/.test(basename)) {
            return true;
        }
        
        // Files commonly used as entry points
        if (/^(app3d|setup|init|bootstrap)\.(js|jsx|ts|tsx)$/i.test(basename)) {
            return true;
        }
        
        // Index files in any directory (re-export hubs)
        if (/^index\.(js|jsx|ts|tsx)$/.test(basename)) {
            return true;
        }
        
        // Workers are entry points for worker threads
        if (relativePath.includes('worker')) {
            return true;
        }
        
        return false;
    }

    isTestFile(relativePath) {
        return /\.(test|spec)\.(js|jsx|ts|tsx)$/.test(relativePath);
    }

    isImportMatch(importPath, filePath, importingFilePath = '') {
        // Normalize paths by removing extensions
        const normalizeForComparison = (p) => p.replace(/\.(js|jsx|ts|tsx)$/, '');
        
        // Handle relative imports
        if (importPath.startsWith('./') || importPath.startsWith('../')) {
            if (importingFilePath) {
                // Build relative path from importing file to target
                const importingDir = path.dirname(importingFilePath);
                const targetInImportingContext = path.join(importingDir, importPath);
                
                // Normalize and compare
                const normalizedTarget = normalizeForComparison(targetInImportingContext);
                const normalizedFile = normalizeForComparison(filePath);
                
                return normalizedTarget === normalizedFile ||
                       normalizedFile.endsWith(normalizedTarget) ||
                       normalizedTarget.endsWith(normalizedFile);
            }
            
            // Fallback for relative imports without context
            const normalizedImport = normalizeForComparison(importPath.replace(/^[./]+/, ''));
            const normalizedFile = normalizeForComparison(filePath);
            return normalizedFile.includes(normalizedImport);
        }
        
        // Handle absolute imports (from src/)
        const normalizedImport = importPath.replace(/^[./]+/, '').replace(/\.(js|jsx|ts|tsx)$/, '');
        const normalizedFile = filePath.replace(/\.(js|jsx|ts|tsx)$/, '');
        
        // More precise matching for absolute imports
        return normalizedFile === normalizedImport ||
               normalizedFile.endsWith('/' + normalizedImport) ||
               normalizedFile.endsWith(normalizedImport);
    }
    
    /**
     * Get reason why a file is considered orphaned
     */
    _getOrphanReason(fileInfo) {
        const reasons = [];
        
        if (!fileInfo.isImported) {
            reasons.push('not imported');
        }
        
        if (fileInfo.exports.size === 0) {
            reasons.push('no exports');
        }
        
        if (fileInfo.functions.size === 0) {
            reasons.push('no functions');
        }
        
        return reasons.join(', ');
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const jsonIndex = args.indexOf('--json');
    
    // Remove flags from args to get directory
    const nonFlagArgs = args.filter(arg => !arg.startsWith('--'));
    const rootDir = nonFlagArgs[0] || './src';
    
    const options = {
        json: jsonIndex !== -1
    };
    
    const detector = new OrphanedCodeDetector(rootDir, options);
    detector.analyze().catch(error => {
        console.error('❌ Analysis failed:', error.message);
        process.exit(1);
    });
}

export default OrphanedCodeDetector;