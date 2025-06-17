#!/usr/bin/env node

/**
 * Consolidated Orphaned Code Detector
 * 
 * Combines the best features from all orphaned detection scripts with fixes for:
 * - JSX component usage detection
 * - Proper import path resolution
 * - Barrel export handling
 * - Dynamic import support
 * - Reduced false positives
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

class OrphanedCodeDetector {
    constructor(rootDir = './src', options = {}) {
        this.rootDir = path.resolve(projectRoot, rootDir);
        this.options = {
            excludeDirs: ['node_modules', '.git', 'dist', 'build', 'coverage', 'tests', '__tests__', '.next'],
            includeExts: ['.js', '.jsx', '.ts', '.tsx'],
            ignorePatterns: [
                /\.test\./,
                /\.spec\./,
                /\.stories\./,
                /\.d\.ts$/
            ],
            // Entry points and always-used patterns
            entryPointPatterns: [
                /^index\./,
                /^main\./,
                /^App\./,
                /^app\./,
                /worker\./i,
                /Worker\./,
                /setup/i,
                /config/i,
                /routes?\./i,
                /layout\./i
            ],
            verbose: false,
            showPotentialFalsePositives: false,
            ...options
        };

        // Core tracking maps
        this.files = new Map(); // filepath -> FileInfo
        this.imports = new Map(); // importPath -> Set of importing files
        this.exports = new Map(); // filepath -> Set of export names
        this.jsxComponents = new Map(); // component name -> Set of files using it
        this.functionCalls = new Map(); // function name -> Set of files calling it
        this.dynamicImports = new Map(); // filepath -> Set of files dynamically importing it
        this.workerImports = new Map(); // filepath -> Set of files using it as worker
        
        // Results
        this.orphanedFiles = [];
        this.orphanedExports = [];
        this.potentialFalsePositives = [];
        this.statistics = {
            totalFiles: 0,
            totalImports: 0,
            totalExports: 0,
            jsxComponentsFound: 0,
            dynamicImportsFound: 0,
            workerImportsFound: 0
        };
    }

    async analyze() {
        console.log('🔍 Analyzing codebase for orphaned code...\n');
        
        // Phase 1: Collect all files and build initial maps
        console.log('📁 Phase 1: Collecting files and building maps...');
        await this.collectFiles();
        
        // Phase 2: Analyze all files for imports/exports/usage
        console.log('🔗 Phase 2: Analyzing imports, exports, and usage patterns...');
        await this.analyzeAllFiles();
        
        // Phase 3: Resolve all import paths and build dependency graph
        console.log('🎯 Phase 3: Resolving import paths and dependencies...');
        this.resolveAllImports();
        
        // Phase 4: Detect orphaned code
        console.log('🚨 Phase 4: Detecting orphaned code...');
        this.detectOrphaned();
        
        // Phase 5: Generate report
        console.log('📊 Phase 5: Generating report...\n');
        this.generateReport();
    }

    async collectFiles() {
        const files = await this.scanDirectory(this.rootDir);
        this.statistics.totalFiles = files.length;
        
        for (const filePath of files) {
            const relativePath = path.relative(projectRoot, filePath);
            this.files.set(filePath, {
                absolutePath: filePath,
                relativePath,
                content: '',
                imports: new Set(),
                exports: new Set(),
                jsxComponents: new Set(),
                functionCalls: new Set(),
                isEntryPoint: this.isEntryPoint(relativePath),
                isUsed: false,
                usedBy: new Set()
            });
        }
    }

    async scanDirectory(dir) {
        const files = [];
        
        try {
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
                        !this.options.ignorePatterns.some(pattern => pattern.test(entry.name))) {
                        files.push(fullPath);
                    }
                }
            }
        } catch (error) {
            console.error(`Error scanning directory ${dir}:`, error.message);
        }
        
        return files;
    }

    async analyzeAllFiles() {
        // First check HTML files for script references
        await this.checkHTMLEntryPoints();
        
        for (const [filePath, fileInfo] of this.files) {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                fileInfo.content = content;
                
                // Extract imports
                this.extractImports(content, fileInfo);
                
                // Extract exports
                this.extractExports(content, fileInfo);
                
                // Extract JSX component usage
                this.extractJSXComponents(content, fileInfo);
                
                // Extract function calls
                this.extractFunctionCalls(content, fileInfo);
                
            } catch (error) {
                console.error(`Error analyzing ${fileInfo.relativePath}:`, error.message);
            }
        }
    }
    
    async checkHTMLEntryPoints() {
        // Check for HTML files that reference JS entry points
        const htmlFiles = [
            path.join(projectRoot, 'index.html'),
            path.join(this.rootDir, 'index.html')
        ];
        
        for (const htmlPath of htmlFiles) {
            if (fs.existsSync(htmlPath)) {
                try {
                    const content = fs.readFileSync(htmlPath, 'utf8');
                    
                    // Look for script tags
                    const scriptRegex = /<script[^>]+src=["']([^"']+)["']/g;
                    let match;
                    
                    while ((match = scriptRegex.exec(content)) !== null) {
                        const scriptPath = match[1];
                        // Resolve relative to HTML file location
                        const resolvedPath = path.resolve(path.dirname(htmlPath), scriptPath);
                        
                        const fileInfo = this.files.get(resolvedPath);
                        if (fileInfo) {
                            fileInfo.isEntryPoint = true;
                            fileInfo.isUsed = true;
                        }
                    }
                } catch (error) {
                    // Ignore HTML parsing errors
                }
            }
        }
    }

    extractImports(content, fileInfo) {
        // ES6 imports: import X from 'Y'
        const es6ImportRegex = /import\s+(?:(?:\*\s+as\s+)?(?:{[^}]*}|[\w$]+)(?:\s*,\s*(?:{[^}]*}|[\w$]+))?)\s+from\s+['"`]([^'"`]+)['"`]/g;
        let match;
        
        while ((match = es6ImportRegex.exec(content)) !== null) {
            const importPath = match[1];
            fileInfo.imports.add(importPath);
            this.statistics.totalImports++;
            
            // Track what imports this file
            if (!this.imports.has(importPath)) {
                this.imports.set(importPath, new Set());
            }
            this.imports.get(importPath).add(fileInfo.absolutePath);
        }
        
        // Side-effect imports: import 'Y'
        const sideEffectImportRegex = /import\s+['"`]([^'"`]+)['"`]/g;
        while ((match = sideEffectImportRegex.exec(content)) !== null) {
            const importPath = match[1];
            fileInfo.imports.add(importPath);
            
            if (!this.imports.has(importPath)) {
                this.imports.set(importPath, new Set());
            }
            this.imports.get(importPath).add(fileInfo.absolutePath);
        }
        
        // Dynamic imports: import('X') or await import('X')
        const dynamicImportRegex = /(?:await\s+)?import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
        while ((match = dynamicImportRegex.exec(content)) !== null) {
            const importPath = match[1];
            fileInfo.imports.add(importPath);
            this.statistics.dynamicImportsFound++;
            
            if (!this.dynamicImports.has(importPath)) {
                this.dynamicImports.set(importPath, new Set());
            }
            this.dynamicImports.get(importPath).add(fileInfo.absolutePath);
        }
        
        // Worker imports: new Worker(new URL('X', import.meta.url))
        const workerRegex = /new\s+Worker\s*\(\s*new\s+URL\s*\(\s*['"`]([^'"`]+)['"`]/g;
        while ((match = workerRegex.exec(content)) !== null) {
            const workerPath = match[1];
            fileInfo.imports.add(workerPath);
            this.statistics.workerImportsFound++;
            
            if (!this.workerImports.has(workerPath)) {
                this.workerImports.set(workerPath, new Set());
            }
            this.workerImports.get(workerPath).add(fileInfo.absolutePath);
        }
        
        // CommonJS requires (for completeness)
        const requireRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
        while ((match = requireRegex.exec(content)) !== null) {
            const importPath = match[1];
            fileInfo.imports.add(importPath);
            
            if (!this.imports.has(importPath)) {
                this.imports.set(importPath, new Set());
            }
            this.imports.get(importPath).add(fileInfo.absolutePath);
        }
    }

    extractExports(content, fileInfo) {
        const exportNames = new Set();
        
        // Named exports: export { X, Y }
        const namedExportRegex = /export\s+{([^}]+)}/g;
        let match;
        while ((match = namedExportRegex.exec(content)) !== null) {
            const exports = match[1].split(',').map(e => {
                const parts = e.trim().split(/\s+as\s+/);
                return parts[parts.length - 1].trim();
            });
            exports.forEach(name => exportNames.add(name));
        }
        
        // Direct exports: export const/let/var/function/class X
        const directExportRegex = /export\s+(?:default\s+)?(?:const|let|var|function|class)\s+(\w+)/g;
        while ((match = directExportRegex.exec(content)) !== null) {
            exportNames.add(match[1]);
        }
        
        // Default export: export default X
        if (/export\s+default\s+/.test(content)) {
            exportNames.add('default');
        }
        
        // Re-exports: export * from 'X' or export { Y } from 'X'
        const reExportRegex = /export\s+(?:\*|\{[^}]+\})\s+from\s+['"`][^'"`]+['"`]/g;
        if (reExportRegex.test(content)) {
            exportNames.add('__re-export__');
        }
        
        fileInfo.exports = exportNames;
        this.statistics.totalExports += exportNames.size;
        
        // Store exports by file
        this.exports.set(fileInfo.absolutePath, exportNames);
    }

    extractJSXComponents(content, fileInfo) {
        // JSX component usage: <ComponentName ... />
        const jsxComponentRegex = /<(\w+)[\s>/]/g;
        let match;
        
        while ((match = jsxComponentRegex.exec(content)) !== null) {
            const componentName = match[1];
            
            // Skip HTML elements (lowercase)
            if (componentName[0] === componentName[0].toLowerCase()) continue;
            
            fileInfo.jsxComponents.add(componentName);
            
            if (!this.jsxComponents.has(componentName)) {
                this.jsxComponents.set(componentName, new Set());
                this.statistics.jsxComponentsFound++;
            }
            this.jsxComponents.get(componentName).add(fileInfo.absolutePath);
        }
    }

    extractFunctionCalls(content, fileInfo) {
        // Function calls: functionName(...)
        const functionCallRegex = /\b(\w+)\s*\(/g;
        let match;
        
        while ((match = functionCallRegex.exec(content)) !== null) {
            const functionName = match[1];
            
            // Skip keywords and built-ins
            const keywords = ['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 
                            'typeof', 'instanceof', 'new', 'throw', 'import', 'require'];
            if (keywords.includes(functionName)) continue;
            
            fileInfo.functionCalls.add(functionName);
            
            if (!this.functionCalls.has(functionName)) {
                this.functionCalls.set(functionName, new Set());
            }
            this.functionCalls.get(functionName).add(fileInfo.absolutePath);
        }
    }

    resolveAllImports() {
        // Process each file's imports and mark used files
        for (const [filePath, fileInfo] of this.files) {
            for (const importPath of fileInfo.imports) {
                const resolvedPaths = this.resolveImportPath(importPath, filePath);
                
                for (const resolvedPath of resolvedPaths) {
                    const targetFile = this.files.get(resolvedPath);
                    if (targetFile) {
                        targetFile.isUsed = true;
                        targetFile.usedBy.add(filePath);
                    }
                }
            }
        }
        
        // Mark files used by JSX components
        for (const [componentName, usingFiles] of this.jsxComponents) {
            // Find files that export this component
            for (const [filePath, fileInfo] of this.files) {
                if (fileInfo.exports.has(componentName) || 
                    (fileInfo.exports.has('default') && 
                     path.basename(filePath, path.extname(filePath)) === componentName)) {
                    fileInfo.isUsed = true;
                    usingFiles.forEach(usingFile => fileInfo.usedBy.add(usingFile));
                }
            }
        }
        
        // Mark files used by function calls
        for (const [functionName, usingFiles] of this.functionCalls) {
            for (const [filePath, fileInfo] of this.files) {
                if (fileInfo.exports.has(functionName)) {
                    fileInfo.isUsed = true;
                    usingFiles.forEach(usingFile => fileInfo.usedBy.add(usingFile));
                }
            }
        }
    }

    resolveImportPath(importPath, fromFile) {
        const resolvedPaths = [];
        const fromDir = path.dirname(fromFile);
        
        // Handle relative imports
        if (importPath.startsWith('.')) {
            const basePath = path.resolve(fromDir, importPath);
            
            // Try exact path
            if (this.files.has(basePath)) {
                resolvedPaths.push(basePath);
            }
            
            // Try with extensions
            for (const ext of this.options.includeExts) {
                const withExt = basePath + ext;
                if (this.files.has(withExt)) {
                    resolvedPaths.push(withExt);
                }
            }
            
            // Try index files
            for (const ext of this.options.includeExts) {
                const indexPath = path.join(basePath, `index${ext}`);
                if (this.files.has(indexPath)) {
                    resolvedPaths.push(indexPath);
                }
            }
        } 
        // Handle @/ alias imports (maps to src/)
        else if (importPath.startsWith('@/')) {
            const aliasPath = importPath.substring(2); // Remove '@/'
            const srcPath = path.resolve(this.rootDir, aliasPath);
            
            // Try exact path
            if (this.files.has(srcPath)) {
                resolvedPaths.push(srcPath);
            }
            
            // Try with extensions
            for (const ext of this.options.includeExts) {
                const withExt = srcPath + ext;
                if (this.files.has(withExt)) {
                    resolvedPaths.push(withExt);
                }
            }
            
            // Try index files
            for (const ext of this.options.includeExts) {
                const indexPath = path.join(srcPath, `index${ext}`);
                if (this.files.has(indexPath)) {
                    resolvedPaths.push(indexPath);
                }
            }
        }
        // Handle absolute imports (from src/)
        else if (!importPath.startsWith('@') && !importPath.includes('node_modules')) {
            // Try from src directory
            const srcPath = path.resolve(this.rootDir, importPath);
            
            // Try exact path
            if (this.files.has(srcPath)) {
                resolvedPaths.push(srcPath);
            }
            
            // Try with extensions
            for (const ext of this.options.includeExts) {
                const withExt = srcPath + ext;
                if (this.files.has(withExt)) {
                    resolvedPaths.push(withExt);
                }
            }
            
            // Try index files
            for (const ext of this.options.includeExts) {
                const indexPath = path.join(srcPath, `index${ext}`);
                if (this.files.has(indexPath)) {
                    resolvedPaths.push(indexPath);
                }
            }
        }
        
        return resolvedPaths;
    }

    detectOrphaned() {
        for (const [filePath, fileInfo] of this.files) {
            // Skip entry points
            if (fileInfo.isEntryPoint) continue;
            
            // Check if file is orphaned
            if (!fileInfo.isUsed && fileInfo.usedBy.size === 0) {
                const isPotentialFalsePositive = this.isPotentialFalsePositive(fileInfo);
                
                if (isPotentialFalsePositive) {
                    this.potentialFalsePositives.push({
                        file: fileInfo.relativePath,
                        reason: this.getFalsePositiveReason(fileInfo),
                        exports: Array.from(fileInfo.exports)
                    });
                } else {
                    this.orphanedFiles.push({
                        file: fileInfo.relativePath,
                        exports: Array.from(fileInfo.exports),
                        jsxComponents: Array.from(fileInfo.jsxComponents)
                    });
                }
            }
            
            // Check for orphaned exports
            if (fileInfo.isUsed && fileInfo.exports.size > 0) {
                const usedExports = new Set();
                
                // Check which exports are actually imported
                for (const usingFile of fileInfo.usedBy) {
                    const usingFileInfo = this.files.get(usingFile);
                    if (usingFileInfo) {
                        // Check JSX usage
                        for (const exportName of fileInfo.exports) {
                            if (usingFileInfo.jsxComponents.has(exportName) ||
                                usingFileInfo.functionCalls.has(exportName)) {
                                usedExports.add(exportName);
                            }
                        }
                    }
                }
                
                // Mark unused exports
                for (const exportName of fileInfo.exports) {
                    if (!usedExports.has(exportName) && exportName !== 'default' && exportName !== '__re-export__') {
                        this.orphanedExports.push({
                            file: fileInfo.relativePath,
                            exportName
                        });
                    }
                }
            }
        }
    }

    isEntryPoint(relativePath) {
        // Check against entry point patterns
        return this.options.entryPointPatterns.some(pattern => pattern.test(relativePath));
    }

    isPotentialFalsePositive(fileInfo) {
        const basename = path.basename(fileInfo.relativePath);
        const dirPath = fileInfo.relativePath;
        
        // UI components are often used via JSX
        if (dirPath.includes('components/ui/') && fileInfo.exports.size > 0) {
            return true;
        }
        
        // React hooks
        if (basename.startsWith('use') && basename[3] === basename[3].toUpperCase()) {
            return true;
        }
        
        // Context providers
        if (basename.includes('Context') || basename.includes('Provider')) {
            return true;
        }
        
        // Type definition files
        if (basename.includes('.d.ts') || basename.includes('types')) {
            return true;
        }
        
        // Config files
        if (basename.includes('config') || basename.includes('Config')) {
            return true;
        }
        
        // Style files
        if (basename.includes('styles') || basename.includes('.module.')) {
            return true;
        }
        
        return false;
    }

    getFalsePositiveReason(fileInfo) {
        const basename = path.basename(fileInfo.relativePath);
        const dirPath = fileInfo.relativePath;
        
        if (dirPath.includes('components/ui/')) return 'UI component - may be used via JSX';
        if (basename.startsWith('use')) return 'React hook - usage pattern may not be detected';
        if (basename.includes('Context')) return 'React context - often used indirectly';
        if (basename.includes('Provider')) return 'React provider - often used indirectly';
        if (basename.includes('types')) return 'Type definitions - used at compile time';
        if (basename.includes('config')) return 'Configuration file - may be used dynamically';
        if (basename.includes('styles')) return 'Style file - imported for side effects';
        
        return 'Unknown pattern';
    }

    generateReport() {
        console.log('📊 ORPHANED CODE ANALYSIS REPORT');
        console.log('══════════════════════════════════════════════════\n');
        
        console.log('📈 SUMMARY');
        console.log('----------');
        console.log(`Total Files Analyzed: ${this.statistics.totalFiles}`);
        console.log(`Total Imports Found: ${this.statistics.totalImports}`);
        console.log(`Total Exports Found: ${this.statistics.totalExports}`);
        console.log(`JSX Components Detected: ${this.statistics.jsxComponentsFound}`);
        console.log(`Dynamic Imports: ${this.statistics.dynamicImportsFound}`);
        console.log(`Worker Imports: ${this.statistics.workerImportsFound}`);
        console.log(`Orphaned Files: ${this.orphanedFiles.length}`);
        console.log(`Orphaned Exports: ${this.orphanedExports.length}`);
        console.log(`Potential False Positives: ${this.potentialFalsePositives.length}\n`);
        
        if (this.orphanedFiles.length > 0) {
            console.log('🗑️  ORPHANED FILES');
            console.log('------------------');
            for (const orphan of this.orphanedFiles) {
                console.log(`📄 ${orphan.file}`);
                if (orphan.exports.length > 0) {
                    console.log(`   Exports: ${orphan.exports.join(', ')}`);
                }
                if (orphan.jsxComponents.length > 0) {
                    console.log(`   JSX Components: ${orphan.jsxComponents.join(', ')}`);
                }
                console.log('');
            }
        }
        
        if (this.orphanedExports.length > 0 && this.options.verbose) {
            console.log('📤 ORPHANED EXPORTS');
            console.log('-------------------');
            const exportsByFile = new Map();
            
            for (const orphan of this.orphanedExports) {
                if (!exportsByFile.has(orphan.file)) {
                    exportsByFile.set(orphan.file, []);
                }
                exportsByFile.get(orphan.file).push(orphan.exportName);
            }
            
            for (const [file, exports] of exportsByFile) {
                console.log(`📄 ${file}`);
                console.log(`   Unused exports: ${exports.join(', ')}\n`);
            }
        }
        
        if (this.potentialFalsePositives.length > 0 && this.options.showPotentialFalsePositives) {
            console.log('⚠️  POTENTIAL FALSE POSITIVES (Manual Review Needed)');
            console.log('----------------------------------------------------');
            for (const item of this.potentialFalsePositives) {
                console.log(`📄 ${item.file}`);
                console.log(`   Reason: ${item.reason}`);
                if (item.exports.length > 0) {
                    console.log(`   Exports: ${item.exports.join(', ')}`);
                }
                console.log('');
            }
        }
        
        console.log('\n✅ Analysis complete!');
        
        if (this.orphanedFiles.length === 0) {
            console.log('No orphaned files detected! 🎉');
        } else {
            console.log(`\n💡 To remove orphaned files safely:`);
            console.log('1. Review each file to ensure it\'s truly unused');
            console.log('2. Check for dynamic imports or runtime usage');
            console.log('3. Consider running tests after removal');
        }
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const options = {
        verbose: args.includes('--verbose') || args.includes('-v'),
        showPotentialFalsePositives: args.includes('--show-potential') || args.includes('-p')
    };
    
    const rootDir = args.find(arg => !arg.startsWith('-')) || './src';
    
    console.log('🚀 Orphaned Code Detector v2.0');
    console.log('================================\n');
    
    const detector = new OrphanedCodeDetector(rootDir, options);
    detector.analyze().catch(error => {
        console.error('❌ Analysis failed:', error);
        process.exit(1);
    });
}

export default OrphanedCodeDetector;