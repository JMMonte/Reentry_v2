#!/usr/bin/env node

/**
 * Ultra-Enhanced Orphaned Code Detector
 * Maximum false positive reduction using advanced static analysis
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class UltraOrphanedCodeDetector {
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
        this.usageMap = new Map();
        this.exportUsageMap = new Map();
        this.jsxComponentUsage = new Map();
        this.hookUsage = new Map();
        this.barrelExports = new Map();
        this.dynamicUsage = new Set();
        this.configFiles = new Set();
        this.typeDefinitions = new Map();
        this.propTypesUsage = new Map();
        this.contextProviders = new Map();
        this.routeComponents = new Set();
        this.webWorkerFiles = new Set();
        this.cssClassUsage = new Map();
        this.stringLiteralUsage = new Map();
        this.configExports = new Set();
        this.lifecycleHooks = new Set();
        this.eventListeners = new Map();
        this.apiEndpoints = new Set();
        this.constantExports = new Set();
        this.utilityFunctions = new Map();
        
        // Advanced patterns
        this.uiComponentPatterns = /^(components\/(ui\/|common\/|shared\/)|src\/(ui\/|components\/))/;
        this.hookPatterns = /^use[A-Z]/;
        this.eventHandlerPatterns = /^(handle|on)[A-Z]/;
        this.providerPatterns = /(Provider|Context|Store|State)$/;
        this.configPatterns = /(config|Config|constants|Constants|settings|Settings)$/;
        this.utilsPatterns = /(utils|Utils|helpers|Helpers|lib|Lib)$/;
        this.typePatterns = /(types|Types|interfaces|Interfaces|defs|Defs)$/;
        this.routePatterns = /(routes|Routes|pages|Pages|screens|Screens)$/;
        this.workerPatterns = /(worker|Worker|workers|Workers)$/;
        this.apiPatterns = /(api|Api|service|Service|client|Client)$/;
        this.hocPatterns = /^(with[A-Z]|enhance[A-Z]|wrap[A-Z])/;
        
        // Results
        this.orphanedFiles = [];
        this.orphanedExports = [];
        this.potentiallyOrphaned = [];
        this.protectedFiles = new Map();
    }

    async analyze() {
        console.log('🔍 Ultra-enhanced orphaned code analysis with maximum false positive reduction...\\n');
        
        await this.collectAllFiles();
        await this.analyzeImportExportPatterns();
        await this.analyzeJSXUsage();
        await this.analyzeHookUsage();
        await this.analyzeBarrelExports();
        await this.analyzeDynamicUsage();
        await this.analyzeEventHandlerUsage();
        await this.analyzeConfigFiles();
        await this.analyzeTypeDefinitions();
        await this.analyzePropTypesUsage();
        await this.analyzeContextProviders();
        await this.analyzeRouteComponents();
        await this.analyzeWebWorkers();
        await this.analyzeCSSClassUsage();
        await this.analyzeStringLiterals();
        await this.analyzeLifecycleHooks();
        await this.analyzeEventListeners();
        await this.analyzeAPIEndpoints();
        await this.analyzeUtilityFunctions();
        await this.analyzeConstantExports();
        
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
                isConfig: this.configPatterns.test(path.basename(relativePath)),
                isUtils: this.utilsPatterns.test(path.dirname(relativePath)),
                isTypes: this.typePatterns.test(path.dirname(relativePath)) || /\.d\.ts$/.test(relativePath),
                isRoute: this.routePatterns.test(path.dirname(relativePath)),
                isWorker: this.workerPatterns.test(relativePath) || content.includes('self.onmessage'),
                isAPI: this.apiPatterns.test(path.dirname(relativePath)),
                exports: new Set(),
                imports: new Set(),
                namedImports: new Map(),
                defaultImports: new Map(),
                jsxComponents: new Set(),
                usedHooks: new Set(),
                eventHandlers: new Set(),
                cssClasses: new Set(),
                stringLiterals: new Set(),
                propTypes: new Set(),
                contextUsage: new Set(),
                lifecycleHooks: new Set(),
                apiCalls: new Set(),
                constants: new Set(),
                isEntryPoint: this.isEntryPoint(relativePath),
                protectionReasons: new Set()
            };
            
            this.extractImports(content, fileInfo);
            this.extractExports(content, fileInfo);
            this.extractJSXComponents(content, fileInfo);
            this.extractHookUsage(content, fileInfo);
            this.extractEventHandlers(content, fileInfo);
            this.extractCSSClasses(content, fileInfo);
            this.extractStringLiterals(content, fileInfo);
            this.extractPropTypes(content, fileInfo);
            this.extractContextUsage(content, fileInfo);
            this.extractLifecycleHooks(content, fileInfo);
            this.extractAPIUsage(content, fileInfo);
            this.extractConstants(content, fileInfo);
            
            // Add advanced protection analysis
            this.analyzeAdvancedProtections(fileInfo);
            
            this.files.set(relativePath, fileInfo);
            
        } catch (error) {
            console.error(`Error analyzing ${filePath}:`, error.message);
        }
    }

    extractImports(content, fileInfo) {
        // Copy from working enhanced version
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
                    return parts[parts.length - 1];
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
            this.webWorkerFiles.add(match[1]);
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
        // Copy from working enhanced version
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
                return parts[0].trim();
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
        
        // JSX component usage
        const jsxRegex = /<(\w+)(?:\.\w+)?[\s>]/g;
        let match;
        
        while ((match = jsxRegex.exec(content)) !== null) {
            const componentName = match[1];
            if (componentName[0] === componentName[0].toLowerCase()) {
                continue;
            }
            fileInfo.jsxComponents.add(componentName);
        }
        
        // React.createElement usage
        const createElementRegex = /React\.createElement\s*\(\s*([A-Z]\w*)/g;
        while ((match = createElementRegex.exec(content)) !== null) {
            fileInfo.jsxComponents.add(match[1]);
        }
    }

    extractHookUsage(content, fileInfo) {
        const hookRegex = /(use[A-Z]\w*)\s*\(/g;
        let match;
        
        while ((match = hookRegex.exec(content)) !== null) {
            fileInfo.usedHooks.add(match[1]);
        }
    }

    extractEventHandlers(content, fileInfo) {
        const handlerRegex = /(?:on\w+|handle\w+)\s*[=:]\s*\{?\s*(\w+)/g;
        let match;
        
        while ((match = handlerRegex.exec(content)) !== null) {
            if (this.eventHandlerPatterns.test(match[1])) {
                fileInfo.eventHandlers.add(match[1]);
            }
        }
        
        const handlerPropRegex = /(\w*[Hh]andler?\w*|\w*[Oo]n[A-Z]\w*)\s*[=:]/g;
        while ((match = handlerPropRegex.exec(content)) !== null) {
            fileInfo.eventHandlers.add(match[1]);
        }
    }

    extractCSSClasses(content, fileInfo) {
        const classNameRegex = /className\s*=\s*['"`]([^'"`]+)['"`]/g;
        let match;
        
        while ((match = classNameRegex.exec(content)) !== null) {
            const classes = match[1].split(/\s+/).filter(Boolean);
            classes.forEach(cls => fileInfo.cssClasses.add(cls));
        }
        
        const cssModuleRegex = /styles\.(\w+)/g;
        while ((match = cssModuleRegex.exec(content)) !== null) {
            fileInfo.cssClasses.add(match[1]);
        }
    }

    extractStringLiterals(content, fileInfo) {
        const stringRegex = /['"`]([^'"`]+)['"`]/g;
        let match;
        
        while ((match = stringRegex.exec(content)) !== null) {
            const str = match[1];
            if (str.includes('/') || str.includes('.') || /^[A-Z]\w*$/.test(str)) {
                fileInfo.stringLiterals.add(str);
            }
        }
    }

    extractPropTypes(content, fileInfo) {
        const propTypesRegex = /(\w+)\.propTypes/g;
        let match;
        
        while ((match = propTypesRegex.exec(content)) !== null) {
            fileInfo.propTypes.add(match[1]);
        }
    }

    extractContextUsage(content, fileInfo) {
        const contextRegex = /(\w*Context\w*|\w*Provider\w*|\w*Consumer\w*)/g;
        let match;
        
        while ((match = contextRegex.exec(content)) !== null) {
            fileInfo.contextUsage.add(match[1]);
        }
        
        const useContextRegex = /useContext\s*\(\s*(\w+)/g;
        while ((match = useContextRegex.exec(content)) !== null) {
            fileInfo.contextUsage.add(match[1]);
        }
    }

    extractLifecycleHooks(content, fileInfo) {
        const lifecycleRegex = /(componentDidMount|componentDidUpdate|componentWillUnmount|useEffect|useLayoutEffect|useMemo|useCallback)/g;
        let match;
        
        while ((match = lifecycleRegex.exec(content)) !== null) {
            fileInfo.lifecycleHooks.add(match[1]);
        }
    }

    extractAPIUsage(content, fileInfo) {
        const apiRegex = /(fetch|axios|api\.|service\.|client\.)/g;
        let match;
        
        while ((match = apiRegex.exec(content)) !== null) {
            fileInfo.apiCalls.add(match[1]);
        }
        
        const endpointRegex = /['"`]\/(api|v\d+)\/[^'"`]+['"`]/g;
        while ((match = endpointRegex.exec(content)) !== null) {
            this.apiEndpoints.add(match[0]);
        }
    }

    extractConstants(content, fileInfo) {
        const constRegex = /export\s+const\s+(\w+)\s*=/g;
        let match;
        
        while ((match = constRegex.exec(content)) !== null) {
            fileInfo.constants.add(match[1]);
            if (/^[A-Z_]+$/.test(match[1])) {
                this.constantExports.add(match[1]);
            }
        }
    }

    analyzeAdvancedProtections(fileInfo) {
        // Config file protection
        if (fileInfo.isConfig || this.configPatterns.test(fileInfo.basename)) {
            fileInfo.protectionReasons.add('config file');
            this.configFiles.add(fileInfo.relativePath);
        }
        
        // Type definition protection
        if (fileInfo.isTypes) {
            fileInfo.protectionReasons.add('type definitions');
        }
        
        // Provider/Context protection
        if (this.providerPatterns.test(fileInfo.basename) || fileInfo.contextUsage.size > 0) {
            fileInfo.protectionReasons.add('context provider/consumer');
        }
        
        // Route component protection
        if (fileInfo.isRoute || fileInfo.content.includes('useNavigate') || fileInfo.content.includes('useRouter')) {
            fileInfo.protectionReasons.add('route component');
            this.routeComponents.add(fileInfo.relativePath);
        }
        
        // Web worker protection
        if (fileInfo.isWorker) {
            fileInfo.protectionReasons.add('web worker');
        }
        
        // API client protection
        if (fileInfo.isAPI || fileInfo.apiCalls.size > 0) {
            fileInfo.protectionReasons.add('API endpoint/client');
        }
        
        // Utility function protection
        if (fileInfo.isUtils) {
            fileInfo.protectionReasons.add('utility functions');
            fileInfo.exports.forEach(exp => {
                this.utilityFunctions.set(exp, fileInfo.relativePath);
            });
        }
        
        // Lifecycle hooks protection
        if (fileInfo.lifecycleHooks.size > 0) {
            fileInfo.protectionReasons.add('lifecycle hooks usage');
        }
        
        // Event listener protection
        if (fileInfo.content.includes('addEventListener') || 
            fileInfo.content.includes('removeEventListener') ||
            fileInfo.content.includes('useEventListener')) {
            fileInfo.protectionReasons.add('event listener usage');
        }
        
        // forwardRef protection
        if (fileInfo.content.includes('forwardRef')) {
            fileInfo.protectionReasons.add('forwardRef usage');
        }
        
        // HOC protection
        const hocRegex = /(with\w+|enhance\w+|wrap\w+)\s*\(/g;
        if (hocRegex.test(fileInfo.content)) {
            fileInfo.protectionReasons.add('higher-order component');
        }
        
        // Render props protection
        if (fileInfo.content.includes('render=') || fileInfo.content.includes('children=')) {
            fileInfo.protectionReasons.add('render props pattern');
        }
        
        // Metadata protection
        if (fileInfo.content.includes('displayName') || 
            fileInfo.content.includes('defaultProps') ||
            fileInfo.content.includes('propTypes')) {
            fileInfo.protectionReasons.add('component metadata');
        }
    }

    // Import analysis methods from enhanced version
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
        
        this.barrelExports.forEach((exportedPaths, barrelPath) => {
            exportedPaths.forEach(exportPath => {
                const resolvedPath = this.resolveImportPath(exportPath, barrelPath);
                if (resolvedPath && this.files.has(resolvedPath)) {
                    if (this.usageMap.has(barrelPath)) {
                        if (!this.usageMap.has(resolvedPath)) {
                            this.usageMap.set(resolvedPath, new Set());
                        }
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
        
        this.dynamicUsage.forEach(dynamicPath => {
            this.files.forEach((fileInfo, filePath) => {
                const resolvedPath = this.resolveImportPath(dynamicPath, filePath);
                if (resolvedPath && this.files.has(resolvedPath)) {
                    if (!this.usageMap.has(resolvedPath)) {
                        this.usageMap.set(resolvedPath, new Set());
                    }
                    this.usageMap.get(resolvedPath).add('__dynamic__');
                    
                    const targetFile = this.files.get(resolvedPath);
                    if (targetFile) {
                        targetFile.protectionReasons.add('dynamic import');
                    }
                }
            });
        });
    }

    async analyzeEventHandlerUsage() {
        console.log('🎯 Analyzing event handler usage...');
        
        this.files.forEach((fileInfo, filePath) => {
            fileInfo.eventHandlers.forEach(handlerName => {
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

    async analyzeConfigFiles() {
        console.log('⚙️  Analyzing configuration files...');
        // Already handled in analyzeAdvancedProtections
    }

    async analyzeTypeDefinitions() {
        console.log('📝 Analyzing type definitions...');
        // Already handled in analyzeAdvancedProtections
    }

    async analyzePropTypesUsage() {
        console.log('🏷️  Analyzing PropTypes usage...');
        
        this.files.forEach((fileInfo, filePath) => {
            fileInfo.propTypes.forEach(componentName => {
                if (!this.propTypesUsage.has(componentName)) {
                    this.propTypesUsage.set(componentName, new Set());
                }
                this.propTypesUsage.get(componentName).add(filePath);
            });
        });
    }

    async analyzeContextProviders() {
        console.log('🔄 Analyzing Context providers...');
        // Already handled in analyzeAdvancedProtections
    }

    async analyzeRouteComponents() {
        console.log('🛣️  Analyzing route components...');
        // Already handled in analyzeAdvancedProtections
    }

    async analyzeWebWorkers() {
        console.log('👷 Analyzing Web Workers...');
        // Already handled in analyzeAdvancedProtections
    }

    async analyzeCSSClassUsage() {
        console.log('🎨 Analyzing CSS class usage...');
        
        this.files.forEach((fileInfo, filePath) => {
            fileInfo.cssClasses.forEach(className => {
                if (!this.cssClassUsage.has(className)) {
                    this.cssClassUsage.set(className, new Set());
                }
                this.cssClassUsage.get(className).add(filePath);
            });
        });
    }

    async analyzeStringLiterals() {
        console.log('📝 Analyzing string literal usage...');
        
        this.files.forEach((fileInfo, filePath) => {
            fileInfo.stringLiterals.forEach(literal => {
                const matchingFiles = Array.from(this.files.keys()).filter(f => 
                    f.includes(literal) || literal.includes(path.basename(f, path.extname(f)))
                );
                
                matchingFiles.forEach(matchingFile => {
                    if (!this.stringLiteralUsage.has(matchingFile)) {
                        this.stringLiteralUsage.set(matchingFile, new Set());
                    }
                    this.stringLiteralUsage.get(matchingFile).add(filePath);
                    
                    const targetFile = this.files.get(matchingFile);
                    if (targetFile) {
                        targetFile.protectionReasons.add('string literal reference');
                    }
                });
            });
        });
    }

    async analyzeLifecycleHooks() {
        console.log('🔄 Analyzing lifecycle hooks...');
        // Already handled in analyzeAdvancedProtections
    }

    async analyzeEventListeners() {
        console.log('🎧 Analyzing event listeners...');
        // Already handled in analyzeAdvancedProtections
    }

    async analyzeAPIEndpoints() {
        console.log('🌐 Analyzing API endpoints...');
        // Already handled in analyzeAdvancedProtections
    }

    async analyzeUtilityFunctions() {
        console.log('🛠️  Analyzing utility functions...');
        // Already handled in analyzeAdvancedProtections
    }

    async analyzeConstantExports() {
        console.log('📊 Analyzing constant exports...');
        
        this.constantExports.forEach(constName => {
            this.files.forEach((fileInfo, filePath) => {
                if (fileInfo.content.includes(constName)) {
                    this.files.forEach((otherFileInfo, otherFilePath) => {
                        if (otherFileInfo.exports.has(constName)) {
                            if (!this.usageMap.has(otherFilePath)) {
                                this.usageMap.set(otherFilePath, new Set());
                            }
                            this.usageMap.get(otherFilePath).add(filePath);
                        }
                    });
                }
            });
        });
    }

    resolveImportPath(importPath, fromFile) {
        if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
            return null;
        }
        
        if (importPath.startsWith('./') || importPath.startsWith('../')) {
            const fromDir = path.dirname(fromFile);
            const resolved = path.normalize(path.join(fromDir, importPath));
            
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
        console.log('🚨 Detecting truly orphaned code with ultra protection...\\n');
        
        // Store protection reasons
        this.files.forEach((fileInfo, filePath) => {
            if (fileInfo.protectionReasons.size > 0) {
                this.protectedFiles.set(filePath, fileInfo.protectionReasons);
            }
        });
        
        // Detect orphaned files with maximum protection
        this.files.forEach((fileInfo, filePath) => {
            if (fileInfo.isTest || fileInfo.isEntryPoint) {
                return;
            }
            
            const isUsed = this.usageMap.has(filePath);
            const hasJSXUsage = Array.from(this.jsxComponentUsage.values()).some(usageSet => 
                usageSet.has(filePath)
            );
            const hasHookUsage = Array.from(this.hookUsage.values()).some(usageSet => 
                usageSet.has(filePath)
            );
            const isDynamicallyUsed = this.dynamicUsage.has(filePath);
            const hasStringLiteralUsage = this.stringLiteralUsage.has(filePath);
            const isProtected = fileInfo.protectionReasons.size > 0;
            
            // Ultra-conservative protection patterns
            const isUIComponent = this.uiComponentPatterns.test(filePath);
            const isProvider = this.providerPatterns.test(fileInfo.basename);
            const isMessageComponent = filePath.includes('messages/');
            const isConfig = fileInfo.isConfig;
            const isUtils = fileInfo.isUtils;
            const isTypes = fileInfo.isTypes;
            const isRoute = fileInfo.isRoute;
            const isWorker = fileInfo.isWorker;
            const isAPI = fileInfo.isAPI;
            const hasExports = fileInfo.exports.size > 0;
            
            if (!isUsed && !hasJSXUsage && !hasHookUsage && !isDynamicallyUsed && !hasStringLiteralUsage && !isProtected) {
                // Ultra-conservative: Only flag files with ZERO protection patterns
                if (!isUIComponent && !isProvider && !isMessageComponent && !isConfig && 
                    !isUtils && !isTypes && !isRoute && !isWorker && !isAPI && 
                    !hasExports) {
                    this.orphanedFiles.push({
                        file: filePath,
                        reason: 'No imports, usage, exports, or protection patterns detected',
                        exports: Array.from(fileInfo.exports),
                        confidence: 'ultra-high'
                    });
                } else {
                    this.potentiallyOrphaned.push({
                        file: filePath,
                        reason: 'Has protection patterns - requires manual review',
                        category: isUIComponent ? 'UI Component' : 
                                 isProvider ? 'Provider/Context' : 
                                 isMessageComponent ? 'Message Component' :
                                 isConfig ? 'Configuration' :
                                 isUtils ? 'Utility' :
                                 isTypes ? 'Type Definition' :
                                 isRoute ? 'Route Component' :
                                 isWorker ? 'Web Worker' :
                                 isAPI ? 'API Client' : 'Has Exports',
                        exports: Array.from(fileInfo.exports),
                        confidence: 'very-low',
                        protectionReasons: Array.from(fileInfo.protectionReasons)
                    });
                }
            }
        });
        
        // Detect orphaned exports with ultra protection
        this.files.forEach((fileInfo, filePath) => {
            if (this.usageMap.has(filePath) || fileInfo.protectionReasons.size > 0) {
                fileInfo.exports.forEach(exportName => {
                    const exportKey = `${filePath}:${exportName}`;
                    const isUsed = this.exportUsageMap.has(exportKey);
                    const isJSXUsed = this.jsxComponentUsage.has(exportName);
                    const isHookUsed = this.hookUsage.has(exportName);
                    const isPropTypeUsed = this.propTypesUsage.has(exportName);
                    const isUtilFunction = this.utilityFunctions.has(exportName);
                    const isConstant = this.constantExports.has(exportName);
                    
                    if (!isUsed && !isJSXUsed && !isHookUsed && !isPropTypeUsed && 
                        !isUtilFunction && !isConstant && exportName !== 'default') {
                        
                        // Ultra-conservative export detection
                        const isEventHandler = this.eventHandlerPatterns.test(exportName);
                        const isUIExport = this.uiComponentPatterns.test(filePath);
                        const isHOC = this.hocPatterns.test(exportName);
                        const isProtectedFile = fileInfo.protectionReasons.size > 0;
                        
                        if (!isEventHandler && !isHOC && !isProtectedFile &&
                            !(isUIExport && exportName && exportName[0] === exportName[0].toUpperCase())) {
                            this.orphanedExports.push({
                                name: exportName,
                                file: filePath,
                                reason: 'Exported but never imported or used anywhere'
                            });
                        }
                    }
                });
            }
        });
    }

    isEntryPoint(relativePath) {
        const basename = path.basename(relativePath);
        const dirname = path.dirname(relativePath);
        
        if (/^(index|main|App)\.(js|jsx|ts|tsx)$/.test(basename)) {
            return true;
        }
        
        if (dirname === '.' && !/\.test\.|\.spec\./.test(basename)) {
            return true;
        }
        
        return false;
    }

    generateReport() {
        console.log('📊 ULTRA-ENHANCED ORPHANED CODE ANALYSIS');
        console.log('══════════════════════════════════════════════════\\n');
        
        console.log('📈 SUMMARY');
        console.log('--------------------');
        console.log(`Total Files: ${this.files.size}`);
        console.log(`Ultra High Confidence Orphaned Files: ${this.orphanedFiles.length}`);
        console.log(`Potentially Orphaned (Manual Review): ${this.potentiallyOrphaned.length}`);
        console.log(`Protected Files: ${this.protectedFiles.size}`);
        console.log(`Orphaned Exports: ${this.orphanedExports.length}`);
        console.log(`JSX Components Detected: ${this.jsxComponentUsage.size}`);
        console.log(`React Hooks Detected: ${this.hookUsage.size}`);
        console.log(`Dynamic Imports: ${this.dynamicUsage.size}`);
        console.log(`Config Files: ${this.configFiles.size}`);
        console.log(`Route Components: ${this.routeComponents.size}`);
        console.log(`Utility Functions: ${this.utilityFunctions.size}\\n`);
        
        // Ultra high confidence orphaned files
        if (this.orphanedFiles.length > 0) {
            console.log('🔴 ULTRA HIGH CONFIDENCE ORPHANED FILES');
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
            console.log('🟡 POTENTIALLY ORPHANED (EXTENSIVE MANUAL REVIEW NEEDED)');
            console.log('--------------------');
            this.potentiallyOrphaned.forEach(file => {
                console.log(`📄 ${file.file} (${file.category})`);
                console.log(`   Reason: ${file.reason}`);
                if (file.protectionReasons && file.protectionReasons.length > 0) {
                    console.log(`   Protection: ${file.protectionReasons.join(', ')}`);
                }
                if (file.exports.length > 0) {
                    console.log(`   Exports: ${file.exports.join(', ')}`);
                }
                console.log('');
            });
        }
        
        // Protected files summary
        if (this.protectedFiles.size > 0) {
            console.log('🛡️  ULTRA PROTECTION SUMMARY');
            console.log('--------------------');
            const protectionReasons = new Map();
            this.protectedFiles.forEach((reasons, filePath) => {
                reasons.forEach(reason => {
                    if (!protectionReasons.has(reason)) {
                        protectionReasons.set(reason, 0);
                    }
                    protectionReasons.set(reason, protectionReasons.get(reason) + 1);
                });
            });
            
            Array.from(protectionReasons.entries())
                .sort((a, b) => b[1] - a[1])
                .forEach(([reason, count]) => {
                    console.log(`   ${reason}: ${count} files`);
                });
            console.log('');
        }
        
        // Orphaned exports (minimal list)
        if (this.orphanedExports.length > 0) {
            console.log('📤 ORPHANED EXPORTS (ULTRA HIGH CONFIDENCE)');
            console.log('--------------------');
            this.orphanedExports.slice(0, 5).forEach(exp => {
                console.log(`${exp.name} - ${exp.file}`);
            });
            
            if (this.orphanedExports.length > 5) {
                console.log(`... and ${this.orphanedExports.length - 5} more\\n`);
            } else {
                console.log('');
            }
        }
        
        // Ultra success metrics
        console.log('✅ ULTRA FALSE POSITIVE REDUCTION METRICS');
        console.log('--------------------');
        console.log(`UI Components Protected: ${Array.from(this.jsxComponentUsage.keys()).length}`);
        console.log(`React Hooks Protected: ${Array.from(this.hookUsage.keys()).length}`);
        console.log(`Dynamic Imports Protected: ${this.dynamicUsage.size}`);
        console.log(`String Literal References: ${this.stringLiteralUsage.size}`);
        console.log(`Config Files Protected: ${this.configFiles.size}`);
        console.log(`Route Components Protected: ${this.routeComponents.size}`);
        console.log(`Utility Functions Protected: ${this.utilityFunctions.size}`);
        console.log(`Constant Exports Protected: ${this.constantExports.size}`);
        console.log(`Barrel Exports Resolved: ${this.barrelExports.size}`);
        console.log(`Total Protection Patterns: ${this.protectedFiles.size}`);
        
        // Export JSON report
        if (this.options.json) {
            const report = {
                summary: {
                    totalFiles: this.files.size,
                    ultraHighConfidenceOrphaned: this.orphanedFiles.length,
                    potentiallyOrphaned: this.potentiallyOrphaned.length,
                    protectedFiles: this.protectedFiles.size,
                    orphanedExports: this.orphanedExports.length,
                    jsxComponents: this.jsxComponentUsage.size,
                    hooks: this.hookUsage.size,
                    dynamicImports: this.dynamicUsage.size,
                    configFiles: this.configFiles.size,
                    routeComponents: this.routeComponents.size,
                    utilityFunctions: this.utilityFunctions.size
                },
                orphanedFiles: this.orphanedFiles,
                potentiallyOrphaned: this.potentiallyOrphaned,
                orphanedExports: this.orphanedExports,
                protectedFiles: Array.from(this.protectedFiles.entries()).map(([file, reasons]) => ({
                    file,
                    protectionReasons: Array.from(reasons)
                })),
                protectedComponents: Array.from(this.jsxComponentUsage.keys()),
                protectedHooks: Array.from(this.hookUsage.keys()),
                protectedConstants: Array.from(this.constantExports)
            };
            
            fs.writeFileSync('./ultra-orphaned-report.json', JSON.stringify(report, null, 2));
            console.log('\\n📄 Report exported to: ultra-orphaned-report.json');
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
    
    const detector = new UltraOrphanedCodeDetector(rootDir, options);
    detector.analyze().catch(error => {
        console.error('❌ Analysis failed:', error.message);
        process.exit(1);
    });
}

export default UltraOrphanedCodeDetector;