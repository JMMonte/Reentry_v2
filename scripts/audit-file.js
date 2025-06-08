#!/usr/bin/env node

/**
 * Single File Audit Script
 * 
 * Analyzes a specific file for:
 * - Input/output dependencies (imports/exports)
 * - Data flow patterns
 * - ESLint issues
 * - Architecture compliance
 * - Integration with physics/three.js/react layers
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Get file path from command line arguments
const filePath = process.argv[2];

if (!filePath) {
    console.error('Usage: node scripts/audit-file.js <file-path>');
    console.error('Example: node scripts/audit-file.js src/physics/PhysicsEngine.js');
    process.exit(1);
}

const fullPath = path.resolve(projectRoot, filePath);

if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${fullPath}`);
    process.exit(1);
}

console.log(`\n🔍 SINGLE FILE AUDIT: ${filePath}\n`);
console.log('=' .repeat(80));

// Read file content
const content = fs.readFileSync(fullPath, 'utf8');
const lines = content.split('\n');

// 1. BASIC FILE INFO
console.log('\n📄 FILE INFORMATION');
console.log('-'.repeat(40));
console.log(`Path: ${filePath}`);
console.log(`Size: ${content.length} characters`);
console.log(`Lines: ${lines.length}`);
console.log(`Type: ${path.extname(filePath)}`);

// 2. IMPORTS ANALYSIS
console.log('\n📥 IMPORTS & DEPENDENCIES');
console.log('-'.repeat(40));

const imports = [];
const importRegex = /^import\s+(?:(?:\*\s+as\s+\w+)|(?:\{[^}]*\})|(?:\w+))\s+from\s+['"]([^'"]+)['"];?/gm;
let match;

while ((match = importRegex.exec(content)) !== null) {
    imports.push({
        line: content.substring(0, match.index).split('\n').length,
        statement: match[0].trim(),
        module: match[1]
    });
}

// Categorize imports
const internalImports = imports.filter(imp => imp.module.startsWith('.'));
const externalImports = imports.filter(imp => !imp.module.startsWith('.'));
const physicsImports = imports.filter(imp => imp.module.includes('physics'));
const threeImports = imports.filter(imp => imp.module.includes('three'));
const reactImports = imports.filter(imp => imp.module.includes('react'));

console.log(`Total imports: ${imports.length}`);
console.log(`  • Internal (relative): ${internalImports.length}`);
console.log(`  • External (npm): ${externalImports.length}`);
console.log(`  • Physics layer: ${physicsImports.length}`);
console.log(`  • Three.js related: ${threeImports.length}`);
console.log(`  • React related: ${reactImports.length}`);

if (imports.length > 0) {
    console.log('\nDetailed imports:');
    imports.forEach(imp => {
        const type = imp.module.startsWith('.') ? 'Internal' : 'External';
        console.log(`  ${imp.line.toString().padStart(3)}: [${type}] ${imp.module}`);
    });
}

// 3. EXPORTS ANALYSIS
console.log('\n📤 EXPORTS & INTERFACE');
console.log('-'.repeat(40));

const exports = [];
const exportRegex = /^export\s+(?:default\s+)?(?:class|function|const|let|var|\{[^}]*\})/gm;
const namedExportRegex = /export\s+\{([^}]+)\}/g;
const defaultExportRegex = /export\s+default\s+(\w+)/g;

while ((match = exportRegex.exec(content)) !== null) {
    exports.push({
        line: content.substring(0, match.index).split('\n').length,
        statement: match[0].trim()
    });
}

console.log(`Total exports: ${exports.length}`);
if (exports.length > 0) {
    exports.forEach(exp => {
        console.log(`  ${exp.line.toString().padStart(3)}: ${exp.statement}`);
    });
}

// 4. ARCHITECTURE COMPLIANCE
console.log('\n🏗️ ARCHITECTURE COMPLIANCE');
console.log('-'.repeat(40));

// Check separation of concerns
const hasThreeJS = threeImports.length > 0 || content.includes('THREE.');
const hasReact = reactImports.length > 0 || content.includes('React') || content.includes('jsx');
const isPhysicsFile = filePath.includes('src/physics/');
const isManagerFile = filePath.includes('src/managers/');
const isComponentFile = filePath.includes('src/components/');

console.log('Layer classification:');
console.log(`  • Physics layer: ${isPhysicsFile ? '✅' : '❌'}`);
console.log(`  • Manager layer: ${isManagerFile ? '✅' : '❌'}`);
console.log(`  • Component layer: ${isComponentFile ? '✅' : '❌'}`);

console.log('\nDependency analysis:');
console.log(`  • Uses Three.js: ${hasThreeJS ? '✅' : '❌'}`);
console.log(`  • Uses React: ${hasReact ? '✅' : '❌'}`);

// Check for violations
const violations = [];
if (isPhysicsFile && hasThreeJS) {
    violations.push('❌ VIOLATION: Physics file should not import Three.js');
}
if (isPhysicsFile && hasReact) {
    violations.push('❌ VIOLATION: Physics file should not import React');
}

if (violations.length > 0) {
    console.log('\n⚠️ ARCHITECTURE VIOLATIONS:');
    violations.forEach(v => console.log(`  ${v}`));
} else {
    console.log('\n✅ No architecture violations detected');
}

// 5. DATA FLOW ANALYSIS
console.log('\n🔄 DATA FLOW PATTERNS');
console.log('-'.repeat(40));

// Look for common patterns
const patterns = {
    'State management': content.includes('useState') || content.includes('setState'),
    'Event handling': content.includes('addEventListener') || content.includes('dispatchEvent'),
    'Physics integration': content.includes('PhysicsEngine') || content.includes('physicsEngine'),
    'Three.js scene': content.includes('.scene') || content.includes('Scene'),
    'Worker communication': content.includes('postMessage') || content.includes('worker'),
    'Promise/async': content.includes('async ') || content.includes('Promise'),
    'Error handling': content.includes('try {') || content.includes('catch'),
    'Validation': content.includes('validate') || content.includes('_validate'),
    'Caching': content.includes('cache') || content.includes('Cache'),
    'Performance optimization': content.includes('performance.now') || content.includes('requestAnimationFrame')
};

Object.entries(patterns).forEach(([pattern, found]) => {
    console.log(`  • ${pattern}: ${found ? '✅' : '❌'}`);
});

// 6. FUNCTION/CLASS ANALYSIS
console.log('\n🔧 FUNCTIONS & CLASSES');
console.log('-'.repeat(40));

// Count functions and classes
const functionCount = (content.match(/function\s+\w+/g) || []).length;
const arrowFunctionCount = (content.match(/=>\s*{/g) || []).length;
const classCount = (content.match(/class\s+\w+/g) || []).length;
const methodCount = (content.match(/^\s*\w+\s*\([^)]*\)\s*{/gm) || []).length;

console.log(`Functions: ${functionCount}`);
console.log(`Arrow functions: ${arrowFunctionCount}`);
console.log(`Classes: ${classCount}`);
console.log(`Methods: ${methodCount}`);

// Find public API (exported functions/classes)
const publicMethods = [];
const methodRegex = /^\s*([a-zA-Z_]\w*)\s*\([^)]*\)\s*{/gm;
while ((match = methodRegex.exec(content)) !== null) {
    if (!match[1].startsWith('_')) { // Not private
        publicMethods.push(match[1]);
    }
}

if (publicMethods.length > 0) {
    console.log('\nPublic methods:');
    publicMethods.slice(0, 10).forEach(method => { // Show first 10
        console.log(`  • ${method}()`);
    });
    if (publicMethods.length > 10) {
        console.log(`  ... and ${publicMethods.length - 10} more`);
    }
}

// 7. LINT ANALYSIS
console.log('\n🧹 LINT ANALYSIS');
console.log('-'.repeat(40));

try {
    const lintResult = execSync(`npx eslint "${fullPath}" --format json`, { 
        encoding: 'utf8',
        cwd: projectRoot,
        stdio: 'pipe'
    });
    
    const lintData = JSON.parse(lintResult);
    if (lintData.length > 0 && lintData[0].messages.length > 0) {
        console.log(`ESLint issues found: ${lintData[0].messages.length}`);
        lintData[0].messages.forEach(msg => {
            const severity = msg.severity === 2 ? 'ERROR' : 'WARNING';
            console.log(`  ${msg.line}:${msg.column} [${severity}] ${msg.message}`);
        });
    } else {
        console.log('✅ No ESLint issues found');
    }
} catch (error) {
    if (error.stdout) {
        try {
            const lintData = JSON.parse(error.stdout);
            if (lintData.length > 0 && lintData[0].messages.length > 0) {
                console.log(`ESLint issues found: ${lintData[0].messages.length}`);
                lintData[0].messages.slice(0, 10).forEach(msg => { // Show first 10
                    const severity = msg.severity === 2 ? 'ERROR' : 'WARNING';
                    console.log(`  ${msg.line}:${msg.column} [${severity}] ${msg.message}`);
                });
                if (lintData[0].messages.length > 10) {
                    console.log(`  ... and ${lintData[0].messages.length - 10} more issues`);
                }
            } else {
                console.log('✅ No ESLint issues found');
            }
        } catch (parseError) {
            console.log('❌ Could not parse ESLint output');
        }
    } else {
        console.log('❌ ESLint analysis failed');
    }
}

// 8. RECOMMENDATIONS
console.log('\n💡 RECOMMENDATIONS');
console.log('-'.repeat(40));

const recommendations = [];

if (imports.length > 15) {
    recommendations.push('Consider reducing import count - file may have too many dependencies');
}

if (isPhysicsFile && (hasThreeJS || hasReact)) {
    recommendations.push('Remove Three.js/React dependencies from physics layer for better separation');
}

if (lines.length > 500) {
    recommendations.push('Consider splitting large file into smaller modules');
}

if (functionCount + methodCount > 20) {
    recommendations.push('High function count - consider extracting utility modules');
}

if (!content.includes('export')) {
    recommendations.push('File has no exports - ensure it serves a clear purpose');
}

if (recommendations.length > 0) {
    recommendations.forEach(rec => {
        console.log(`  • ${rec}`);
    });
} else {
    console.log('✅ No specific recommendations - file structure looks good');
}

// 9. RELATED FILES
console.log('\n🔗 RELATED FILES');
console.log('-'.repeat(40));

const relatedFiles = new Set();

// Find files that import this file
const srcDir = path.join(projectRoot, 'src');
if (fs.existsSync(srcDir)) {
    const findImporters = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullEntryPath = path.join(dir, entry.name);
            
            if (entry.isDirectory()) {
                findImporters(fullEntryPath);
            } else if (entry.name.endsWith('.js') || entry.name.endsWith('.jsx')) {
                try {
                    const fileContent = fs.readFileSync(fullEntryPath, 'utf8');
                    const relativeTarget = path.relative(path.dirname(fullEntryPath), fullPath);
                    
                    if (fileContent.includes(relativeTarget.replace(/\\/g, '/'))) {
                        const relPath = path.relative(projectRoot, fullEntryPath);
                        relatedFiles.add(`Imported by: ${relPath}`);
                    }
                } catch (err) {
                    // Skip files that can't be read
                }
            }
        }
    };
    
    findImporters(srcDir);
}

// Add files that this file imports
internalImports.forEach(imp => {
    const resolvedPath = path.resolve(path.dirname(fullPath), imp.module);
    const extensions = ['', '.js', '.jsx'];
    
    for (const ext of extensions) {
        const testPath = resolvedPath + ext;
        if (fs.existsSync(testPath)) {
            const relPath = path.relative(projectRoot, testPath);
            relatedFiles.add(`Imports: ${relPath}`);
            break;
        }
    }
});

if (relatedFiles.size > 0) {
    Array.from(relatedFiles).slice(0, 10).forEach(file => {
        console.log(`  • ${file}`);
    });
    if (relatedFiles.size > 10) {
        console.log(`  ... and ${relatedFiles.size - 10} more files`);
    }
} else {
    console.log('No related files found in immediate dependencies');
}

console.log('\n' + '=' .repeat(80));
console.log('🎯 AUDIT COMPLETE\n');