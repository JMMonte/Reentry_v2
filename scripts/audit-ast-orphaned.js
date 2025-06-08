#!/usr/bin/env node

/**
 * AST-Based Orphaned Code Detector
 * Uses Abstract Syntax Tree parsing for more accurate detection
 * 
 * This is a simplified AST parser focused on JavaScript import/export patterns
 * For production use, consider using @babel/parser or typescript compiler API
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ASTOrphanedCodeDetector {
    constructor(rootDir = './src', options = {}) {
        this.rootDir = rootDir;
        this.options = {
            excludeDirs: ['node_modules', '.git', 'dist', 'build', 'coverage', 'tests', '__tests__'],
            includeExts: ['.js', '.jsx', '.ts', '.tsx'],
            entryPoints: ['index.js', 'index.jsx', 'main.js', 'App.js', 'App.jsx'],
            ...options
        };
        
        this.files = new Map();
        this.dependencyGraph = new Map();
        this.exportMap = new Map(); // export name -> file that exports it
        this.importMap = new Map(); // file -> Set of imports
        this.reachableFiles = new Set();
        
        // Results
        this.orphanedFiles = [];
        this.orphanedExports = [];
        this.unusedImports = [];
        this.deadCodeBlocks = [];
    }

    async analyze() {
        console.log('🔍 AST-based orphaned code analysis...\n');
        
        // Phase 1: Parse all files and build AST-like structures
        await this.parseAllFiles();
        
        // Phase 2: Build dependency graph
        this.buildDependencyGraph();
        
        // Phase 3: Find reachable files from entry points
        this.findReachableFiles();
        
        // Phase 4: Detect orphaned code
        this.detectOrphanedCode();
        
        // Phase 5: Generate report
        this.generateReport();
    }

    async parseAllFiles() {
        console.log('📄 Parsing files...');
        const files = await this.scanDirectory(this.rootDir);
        
        for (const file of files) {
            await this.parseFile(file);
        }
        
        console.log(`   Parsed ${files.length} files\n`);
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

    async parseFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const relativePath = path.relative(this.rootDir, filePath);
            
            const ast = this.parseToSimpleAST(content);
            
            const fileInfo = {
                path: filePath,
                relativePath,
                ast,
                exports: new Set(),
                imports: new Set(),
                dynamicImports: new Set(),
                reExports: new Set(),
                isEntryPoint: this.isEntryPoint(relativePath),
                usedIdentifiers: new Set(),
                definedIdentifiers: new Set()
            };
            
            // Extract import/export information from AST
            this.extractImportsExports(ast, fileInfo);
            
            // Extract identifier usage
            this.extractIdentifierUsage(ast, fileInfo);
            
            this.files.set(relativePath, fileInfo);
            
        } catch (error) {
            console.error(`Error parsing ${filePath}:`, error.message);
        }
    }

    parseToSimpleAST(content) {
        // Simple tokenizer for JavaScript imports/exports
        // This is a simplified approach - for production, use a real parser
        
        const tokens = [];
        const lines = content.split('\n');
        
        lines.forEach((line, lineNum) => {
            const trimmed = line.trim();
            
            // Skip comments and empty lines
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
                return;
            }
            
            // Import statements
            const importMatch = this.parseImportStatement(trimmed);
            if (importMatch) {
                tokens.push({
                    type: 'import',
                    line: lineNum + 1,
                    ...importMatch
                });
            }
            
            // Export statements
            const exportMatch = this.parseExportStatement(trimmed);
            if (exportMatch) {
                tokens.push({
                    type: 'export',
                    line: lineNum + 1,
                    ...exportMatch
                });
            }
            
            // Function/class definitions
            const definitionMatch = this.parseDefinition(trimmed);
            if (definitionMatch) {
                tokens.push({
                    type: 'definition',
                    line: lineNum + 1,
                    ...definitionMatch
                });
            }
            
            // Identifier usage
            const usageMatches = this.parseIdentifierUsage(trimmed);
            usageMatches.forEach(usage => {
                tokens.push({
                    type: 'usage',
                    line: lineNum + 1,
                    ...usage
                });
            });
        });
        
        return tokens;
    }

    parseImportStatement(line) {
        // ES6 imports
        const esImportRegex = /^import\s+(.+?)\s+from\s+['"`]([^'"`]+)['"`]/;
        const esMatch = line.match(esImportRegex);
        if (esMatch) {
            return {
                importType: 'es6',
                specifiers: this.parseImportSpecifiers(esMatch[1]),
                source: esMatch[2]
            };
        }
        
        // Dynamic imports
        const dynamicRegex = /(?:await\s+)?import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/;
        const dynamicMatch = line.match(dynamicRegex);
        if (dynamicMatch) {
            return {
                importType: 'dynamic',
                source: dynamicMatch[1]
            };
        }
        
        // CommonJS require
        const requireRegex = /(?:const|let|var)\s+(.+?)\s*=\s*require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/;
        const requireMatch = line.match(requireRegex);
        if (requireMatch) {
            return {
                importType: 'commonjs',
                specifiers: this.parseRequireSpecifiers(requireMatch[1]),
                source: requireMatch[2]
            };
        }
        
        return null;
    }

    parseImportSpecifiers(specifierString) {
        const specifiers = [];
        
        // Default import: import name from '...'
        if (!/[{}*]/.test(specifierString)) {
            specifiers.push({ type: 'default', name: specifierString.trim() });
            return specifiers;
        }
        
        // Namespace import: import * as name from '...'
        const namespaceMatch = specifierString.match(/\*\s+as\s+(\w+)/);
        if (namespaceMatch) {
            specifiers.push({ type: 'namespace', name: namespaceMatch[1] });
            return specifiers;
        }
        
        // Named imports: import { a, b as c } from '...'
        const namedMatch = specifierString.match(/{([^}]+)}/);
        if (namedMatch) {
            const named = namedMatch[1].split(',').map(spec => {
                const parts = spec.trim().split(/\s+as\s+/);
                return {
                    type: 'named',
                    name: parts[1] || parts[0],
                    imported: parts[0]
                };
            });
            specifiers.push(...named);
        }
        
        return specifiers;
    }

    parseRequireSpecifiers(specifierString) {
        // Destructuring: const { a, b } = require('...')
        const destructMatch = specifierString.match(/{([^}]+)}/);
        if (destructMatch) {
            return destructMatch[1].split(',').map(name => ({
                type: 'named',
                name: name.trim()
            }));
        }
        
        // Direct assignment: const name = require('...')
        return [{ type: 'default', name: specifierString.trim() }];
    }

    parseExportStatement(line) {
        // Named export: export const/function/class name
        const namedExportRegex = /^export\s+(?:const|let|var|function|class|async\s+function)\s+(\w+)/;
        const namedMatch = line.match(namedExportRegex);
        if (namedMatch) {
            return {
                exportType: 'named',
                name: namedMatch[1]
            };
        }
        
        // Export block: export { a, b }
        const blockExportRegex = /^export\s*{([^}]+)}/;
        const blockMatch = line.match(blockExportRegex);
        if (blockMatch) {
            const names = blockMatch[1].split(',').map(name => name.trim());
            return {
                exportType: 'block',
                names
            };
        }
        
        // Re-export: export * from '...' or export { a } from '...'
        const reExportRegex = /^export\s+(?:\*|{[^}]+})\s+from\s+['"`]([^'"`]+)['"`]/;
        const reExportMatch = line.match(reExportRegex);
        if (reExportMatch) {
            return {
                exportType: 'reexport',
                source: reExportMatch[1]
            };
        }
        
        // Default export
        if (line.startsWith('export default')) {
            return {
                exportType: 'default'
            };
        }
        
        return null;
    }

    parseDefinition(line) {
        // Function definitions
        const funcRegex = /(?:function|async\s+function)\s+(\w+)/;
        const funcMatch = line.match(funcRegex);
        if (funcMatch) {
            return { definitionType: 'function', name: funcMatch[1] };
        }
        
        // Class definitions
        const classRegex = /class\s+(\w+)/;
        const classMatch = line.match(classRegex);
        if (classMatch) {
            return { definitionType: 'class', name: classMatch[1] };
        }
        
        // Variable definitions
        const varRegex = /(?:const|let|var)\s+(\w+)/;
        const varMatch = line.match(varRegex);
        if (varMatch) {
            return { definitionType: 'variable', name: varMatch[1] };
        }
        
        return null;
    }

    parseIdentifierUsage(line) {
        // Find function calls and property access
        const identifiers = [];
        
        // Function calls: identifier(
        const callRegex = /(\w+)\s*\(/g;
        let match;
        while ((match = callRegex.exec(line)) !== null) {
            identifiers.push({ identifier: match[1], usageType: 'call' });
        }
        
        // Property access: identifier.prop
        const propRegex = /(\w+)\.\w+/g;
        while ((match = propRegex.exec(line)) !== null) {
            identifiers.push({ identifier: match[1], usageType: 'property' });
        }
        
        return identifiers;
    }

    extractImportsExports(ast, fileInfo) {
        ast.forEach(token => {
            if (token.type === 'import') {
                if (token.importType === 'dynamic') {
                    fileInfo.dynamicImports.add(token.source);
                } else {
                    fileInfo.imports.add(token.source);
                    
                    // Track what's imported
                    if (token.specifiers) {
                        token.specifiers.forEach(spec => {
                            fileInfo.usedIdentifiers.add(spec.name);
                        });
                    }
                }
            } else if (token.type === 'export') {
                if (token.exportType === 'reexport') {
                    fileInfo.reExports.add(token.source);
                } else if (token.exportType === 'named') {
                    fileInfo.exports.add(token.name);
                    this.exportMap.set(token.name, fileInfo.relativePath);
                } else if (token.exportType === 'block') {
                    token.names.forEach(name => {
                        fileInfo.exports.add(name);
                        this.exportMap.set(name, fileInfo.relativePath);
                    });
                } else if (token.exportType === 'default') {
                    fileInfo.exports.add('default');
                    this.exportMap.set(`${fileInfo.relativePath}:default`, fileInfo.relativePath);
                }
            } else if (token.type === 'definition') {
                fileInfo.definedIdentifiers.add(token.name);
            } else if (token.type === 'usage') {
                fileInfo.usedIdentifiers.add(token.identifier);
            }
        });
    }

    extractIdentifierUsage(ast, fileInfo) {
        // This was already done in extractImportsExports
        // but could be extended for more sophisticated usage tracking
    }

    buildDependencyGraph() {
        console.log('🔗 Building dependency graph...');
        
        this.files.forEach((fileInfo, filePath) => {
            const dependencies = new Set();
            
            // Regular imports
            fileInfo.imports.forEach(importPath => {
                const resolved = this.resolveImportPath(importPath, filePath);
                if (resolved) {
                    dependencies.add(resolved);
                }
            });
            
            // Dynamic imports
            fileInfo.dynamicImports.forEach(importPath => {
                const resolved = this.resolveImportPath(importPath, filePath);
                if (resolved) {
                    dependencies.add(resolved);
                }
            });
            
            // Re-exports
            fileInfo.reExports.forEach(importPath => {
                const resolved = this.resolveImportPath(importPath, filePath);
                if (resolved) {
                    dependencies.add(resolved);
                }
            });
            
            this.dependencyGraph.set(filePath, dependencies);
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

    findReachableFiles() {
        console.log('🎯 Finding reachable files from entry points...');
        
        // Find entry points
        const entryPoints = new Set();
        this.files.forEach((fileInfo, filePath) => {
            if (fileInfo.isEntryPoint) {
                entryPoints.add(filePath);
            }
        });
        
        // If no explicit entry points found, use common patterns
        if (entryPoints.size === 0) {
            this.files.forEach((fileInfo, filePath) => {
                const fileName = path.basename(filePath);
                if (this.options.entryPoints.includes(fileName)) {
                    entryPoints.add(filePath);
                }
            });
        }
        
        // DFS from entry points to find all reachable files
        const visited = new Set();
        
        const dfs = (filePath) => {
            if (visited.has(filePath)) return;
            visited.add(filePath);
            this.reachableFiles.add(filePath);
            
            const dependencies = this.dependencyGraph.get(filePath) || new Set();
            dependencies.forEach(dep => dfs(dep));
        };
        
        entryPoints.forEach(entry => dfs(entry));
        
        console.log(`   Found ${entryPoints.size} entry points`);
        console.log(`   ${this.reachableFiles.size} files are reachable\n`);
    }

    detectOrphanedCode() {
        console.log('🚨 Detecting orphaned code...');
        
        // Orphaned files
        this.files.forEach((fileInfo, filePath) => {
            if (!this.reachableFiles.has(filePath) && !fileInfo.isEntryPoint) {
                this.orphanedFiles.push({
                    file: filePath,
                    reason: 'not reachable from entry points',
                    exports: Array.from(fileInfo.exports),
                    hasDefinitions: fileInfo.definedIdentifiers.size > 0
                });
            }
        });
        
        // Orphaned exports
        this.exportMap.forEach((filePath, exportName) => {
            if (this.reachableFiles.has(filePath)) {
                // Check if this export is actually used
                let isUsed = false;
                
                this.files.forEach((fileInfo, importingFile) => {
                    if (importingFile !== filePath && this.reachableFiles.has(importingFile)) {
                        if (fileInfo.usedIdentifiers.has(exportName)) {
                            isUsed = true;
                        }
                    }
                });
                
                if (!isUsed && !exportName.includes(':default')) {
                    this.orphanedExports.push({
                        name: exportName,
                        file: filePath,
                        reason: 'exported but never imported'
                    });
                }
            }
        });
        
        // Unused imports
        this.files.forEach((fileInfo, filePath) => {
            if (this.reachableFiles.has(filePath)) {
                // Check each import to see if it's actually used
                fileInfo.imports.forEach(importPath => {
                    const resolved = this.resolveImportPath(importPath, filePath);
                    if (resolved && this.files.has(resolved)) {
                        const importedFile = this.files.get(resolved);
                        
                        // Check if any exports from the imported file are used
                        let isUsed = false;
                        importedFile.exports.forEach(exportName => {
                            if (fileInfo.usedIdentifiers.has(exportName)) {
                                isUsed = true;
                            }
                        });
                        
                        if (!isUsed) {
                            this.unusedImports.push({
                                file: filePath,
                                importPath,
                                resolvedPath: resolved,
                                reason: 'imported but never used'
                            });
                        }
                    }
                });
            }
        });
    }

    isEntryPoint(relativePath) {
        const fileName = path.basename(relativePath);
        return this.options.entryPoints.includes(fileName) ||
               relativePath.includes('index.') ||
               relativePath.includes('main.') ||
               relativePath.includes('App.');
    }

    generateReport() {
        console.log('📊 AST-BASED ORPHANED CODE ANALYSIS');
        console.log('══════════════════════════════════════════════════\n');
        
        console.log('📈 SUMMARY');
        console.log('--------------------');
        console.log(`Total Files: ${this.files.size}`);
        console.log(`Reachable Files: ${this.reachableFiles.size}`);
        console.log(`Orphaned Files: ${this.orphanedFiles.length}`);
        console.log(`Orphaned Exports: ${this.orphanedExports.length}`);
        console.log(`Unused Imports: ${this.unusedImports.length}\n`);
        
        // Orphaned files
        if (this.orphanedFiles.length > 0) {
            console.log('🗂️  ORPHANED FILES');
            console.log('------------------------------');
            this.orphanedFiles.slice(0, 15).forEach(file => {
                console.log(`📄 ${file.file}`);
                console.log(`   Reason: ${file.reason}`);
                if (file.exports.length > 0) {
                    console.log(`   Exports: ${file.exports.join(', ')}`);
                }
                console.log('');
            });
            
            if (this.orphanedFiles.length > 15) {
                console.log(`... and ${this.orphanedFiles.length - 15} more\n`);
            }
        }
        
        // Orphaned exports
        if (this.orphanedExports.length > 0) {
            console.log('📤 ORPHANED EXPORTS');
            console.log('------------------------------');
            this.orphanedExports.slice(0, 20).forEach(exp => {
                console.log(`${exp.name} - ${exp.file}`);
                console.log(`   Reason: ${exp.reason}`);
            });
            
            if (this.orphanedExports.length > 20) {
                console.log(`... and ${this.orphanedExports.length - 20} more\n`);
            } else {
                console.log('');
            }
        }
        
        // Unused imports
        if (this.unusedImports.length > 0) {
            console.log('📥 UNUSED IMPORTS');
            console.log('------------------------------');
            this.unusedImports.slice(0, 15).forEach(imp => {
                console.log(`${imp.file}`);
                console.log(`   Import: "${imp.importPath}"`);
                console.log(`   Reason: ${imp.reason}`);
                console.log('');
            });
            
            if (this.unusedImports.length > 15) {
                console.log(`... and ${this.unusedImports.length - 15} more\n`);
            }
        }
        
        // Export JSON report
        if (this.options.json) {
            const report = {
                summary: {
                    totalFiles: this.files.size,
                    reachableFiles: this.reachableFiles.size,
                    orphanedFiles: this.orphanedFiles.length,
                    orphanedExports: this.orphanedExports.length,
                    unusedImports: this.unusedImports.length
                },
                orphanedFiles: this.orphanedFiles,
                orphanedExports: this.orphanedExports,
                unusedImports: this.unusedImports,
                dependencyGraph: Object.fromEntries(
                    Array.from(this.dependencyGraph.entries()).map(([file, deps]) => [
                        file, Array.from(deps)
                    ])
                )
            };
            
            fs.writeFileSync('./ast-orphaned-report.json', JSON.stringify(report, null, 2));
            console.log('📄 Report exported to: ast-orphaned-report.json');
        }
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const options = {};
    
    // Parse flags
    if (args.includes('--json')) options.json = true;
    
    // Get directory
    const nonFlagArgs = args.filter(arg => !arg.startsWith('--'));
    const rootDir = nonFlagArgs[0] || './src';
    
    const detector = new ASTOrphanedCodeDetector(rootDir, options);
    detector.analyze().catch(error => {
        console.error('❌ Analysis failed:', error.message);
        process.exit(1);
    });
}

export default ASTOrphanedCodeDetector;