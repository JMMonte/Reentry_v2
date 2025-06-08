#!/usr/bin/env node

/**
 * Worker-Specific Issues Audit Script
 * 
 * Deep analysis of worker-related code for:
 * - Message handler binding issues
 * - Worker creation problems
 * - Event listener patterns
 * - Memory leaks in worker handling
 * - Async/Promise patterns that could break
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Get file path from command line arguments
const filePath = process.argv[2];

if (!filePath) {
    console.error('Usage: node scripts/audit-worker-issues.js <file-path>');
    console.error('Example: node scripts/audit-worker-issues.js src/managers/WorkerPoolManager.js');
    process.exit(1);
}

const fullPath = path.resolve(projectRoot, filePath);

if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${fullPath}`);
    process.exit(1);
}

console.log(`\n🔧 WORKER ISSUES AUDIT: ${filePath}\n`);
console.log('=' .repeat(80));

// Read file content
const content = fs.readFileSync(fullPath, 'utf8');
const lines = content.split('\n');

// 1. WORKER CREATION PATTERNS
console.log('\n🏭 WORKER CREATION ANALYSIS');
console.log('-'.repeat(40));

const workerCreationPatterns = [
    { pattern: /new Worker\(/g, description: 'Worker instantiation' },
    { pattern: /new URL\([^)]*worker[^)]*\)/gi, description: 'Worker URL creation' },
    { pattern: /type:\s*['"]module['"]/g, description: 'Module worker type' },
    { pattern: /\.terminate\(\)/g, description: 'Worker termination' }
];

workerCreationPatterns.forEach(({ pattern, description }) => {
    const matches = content.match(pattern) || [];
    console.log(`${description}: ${matches.length} occurrences`);
    if (matches.length > 0) {
        // Find line numbers
        let lineNum = 1;
        let searchIndex = 0;
        const matchPositions = [];
        let match;
        pattern.lastIndex = 0; // Reset regex
        while ((match = pattern.exec(content)) !== null) {
            const beforeMatch = content.substring(0, match.index);
            const lineNumber = beforeMatch.split('\n').length;
            matchPositions.push(lineNumber);
            pattern.lastIndex = match.index + 1; // Continue search
        }
        matchPositions.forEach(line => {
            console.log(`  Line ${line}: ${lines[line - 1].trim()}`);
        });
    }
});

// 2. MESSAGE HANDLER BINDING ANALYSIS
console.log('\n📨 MESSAGE HANDLER BINDING ANALYSIS');
console.log('-'.repeat(40));

const bindingPatterns = [
    { pattern: /\.onmessage\s*=/g, description: 'Direct onmessage assignment' },
    { pattern: /\.addEventListener\(['"]message['"]/g, description: 'addEventListener for message' },
    { pattern: /\.bind\(this\)/g, description: 'Function binding' },
    { pattern: /arrow function.*=>/g, description: 'Arrow function assignments' },
    { pattern: /function\s*\([^)]*event[^)]*\)/g, description: 'Event handler functions' }
];

bindingPatterns.forEach(({ pattern, description }) => {
    const matches = content.match(pattern) || [];
    console.log(`${description}: ${matches.length} occurrences`);
});

// Find specific onmessage assignments
const onmessageRegex = /(\w+)\.onmessage\s*=\s*([^;]+);?/g;
let match;
console.log('\nMessage handler assignments:');
while ((match = onmessageRegex.exec(content)) !== null) {
    const beforeMatch = content.substring(0, match.index);
    const lineNumber = beforeMatch.split('\n').length;
    console.log(`  Line ${lineNumber}: ${match[1]}.onmessage = ${match[2]}`);
}

// 3. EVENT HANDLER CONTEXT ISSUES
console.log('\n🎯 CONTEXT & SCOPE ANALYSIS');
console.log('-'.repeat(40));

const contextIssues = [];

// Check for potential 'this' binding issues
const thisRegex = /this\._\w+/g;
const thisMatches = content.match(thisRegex) || [];
console.log(`'this' references in handlers: ${thisMatches.length}`);

// Check for arrow function vs regular function usage in handlers
const arrowInHandler = content.match(/onmessage\s*=\s*\([^)]*\)\s*=>/g) || [];
const regularInHandler = content.match(/onmessage\s*=\s*function/g) || [];
const boundInHandler = content.match(/onmessage\s*=\s*[^.]+\.bind\(this\)/g) || [];

console.log(`Arrow functions as handlers: ${arrowInHandler.length}`);
console.log(`Regular functions as handlers: ${regularInHandler.length}`);
console.log(`Bound functions as handlers: ${boundInHandler.length}`);

if (boundInHandler.length === 0 && regularInHandler.length === 0) {
    contextIssues.push('⚠️  No explicit function binding found - may lose context');
}

// 4. ASYNC/PROMISE ISSUES
console.log('\n⏳ ASYNC/PROMISE PATTERNS');
console.log('-'.repeat(40));

const asyncPatterns = [
    { pattern: /async\s+function/g, description: 'Async functions' },
    { pattern: /await\s+/g, description: 'Await calls' },
    { pattern: /\.then\(/g, description: 'Promise chains' },
    { pattern: /\.catch\(/g, description: 'Error handling' },
    { pattern: /Promise\.all/g, description: 'Promise.all usage' },
    { pattern: /setTimeout/g, description: 'Timeouts' },
    { pattern: /setInterval/g, description: 'Intervals' }
];

asyncPatterns.forEach(({ pattern, description }) => {
    const matches = content.match(pattern) || [];
    console.log(`${description}: ${matches.length} occurrences`);
});

// 5. MEMORY LEAK PATTERNS
console.log('\n🔒 MEMORY LEAK ANALYSIS');
console.log('-'.repeat(40));

const memoryLeakPatterns = [
    { pattern: /\.addEventListener\(/g, description: 'Event listeners added' },
    { pattern: /\.removeEventListener\(/g, description: 'Event listeners removed' },
    { pattern: /\.dispose\(/g, description: 'Disposal methods' },
    { pattern: /\.clear\(/g, description: 'Clear methods' },
    { pattern: /\.delete\(/g, description: 'Map/Set deletions' },
    { pattern: /= null/g, description: 'Null assignments' }
];

const addListeners = content.match(/\.addEventListener\(/g) || [];
const removeListeners = content.match(/\.removeEventListener\(/g) || [];

console.log(`Event listeners added: ${addListeners.length}`);
console.log(`Event listeners removed: ${removeListeners.length}`);

if (addListeners.length > removeListeners.length) {
    contextIssues.push('⚠️  More listeners added than removed - potential memory leak');
}

memoryLeakPatterns.forEach(({ pattern, description }) => {
    const matches = content.match(pattern) || [];
    console.log(`${description}: ${matches.length} occurrences`);
});

// 6. ERROR HANDLING ANALYSIS
console.log('\n🚨 ERROR HANDLING PATTERNS');
console.log('-'.repeat(40));

const errorPatterns = [
    { pattern: /try\s*{/g, description: 'Try blocks' },
    { pattern: /catch\s*\([^)]*\)\s*{/g, description: 'Catch blocks' },
    { pattern: /throw\s+/g, description: 'Throw statements' },
    { pattern: /console\.error/g, description: 'Error logging' },
    { pattern: /console\.warn/g, description: 'Warning logging' },
    { pattern: /\.onerror\s*=/g, description: 'Error handlers' }
];

errorPatterns.forEach(({ pattern, description }) => {
    const matches = content.match(pattern) || [];
    console.log(`${description}: ${matches.length} occurrences`);
});

// Find try-catch blocks and their error handling
const tryBlockRegex = /try\s*{([^}]+)}\s*catch\s*\(([^)]*)\)\s*{([^}]+)}/gs;
let tryMatches = [...content.matchAll(tryBlockRegex)];
console.log(`\nTry-catch blocks: ${tryMatches.length}`);

// 7. WORKER MESSAGE FLOW ANALYSIS
console.log('\n💬 MESSAGE FLOW ANALYSIS');
console.log('-'.repeat(40));

const messageFlowPatterns = [
    { pattern: /postMessage\(/g, description: 'Messages sent' },
    { pattern: /event\.data/g, description: 'Event data access' },
    { pattern: /\.type\s*===/g, description: 'Type checking (===)' },
    { pattern: /\.type\s*==/g, description: 'Type checking (==)' },
    { pattern: /switch\s*\([^)]*\.type/g, description: 'Switch on message type' },
    { pattern: /if\s*\([^)]*\.type/g, description: 'If statements on type' }
];

messageFlowPatterns.forEach(({ pattern, description }) => {
    const matches = content.match(pattern) || [];
    console.log(`${description}: ${matches.length} occurrences`);
});

// 8. SPECIFIC ISSUES DETECTION
console.log('\n🔍 SPECIFIC ISSUE DETECTION');
console.log('-'.repeat(40));

const specificIssues = [];

// Check for common worker issues
if (content.includes('worker.onmessage = this._handleWorkerMessage.bind(this)')) {
    console.log('✅ Found proper message handler binding');
} else if (content.includes('worker.onmessage =') && !content.includes('.bind(')) {
    specificIssues.push('⚠️  Worker message handler may not be properly bound');
}

// Check for worker pool management
if (content.includes('workerPool') && content.includes('activeJobs')) {
    console.log('✅ Found worker pool management pattern');
}

// Check for worker cleanup
if (content.includes('.terminate()') && content.includes('dispose')) {
    console.log('✅ Found worker cleanup patterns');
} else {
    specificIssues.push('⚠️  No worker cleanup detected - may cause memory leaks');
}

// Check for message counter/debugging
if (content.includes('messageCount') || content.includes('debug')) {
    console.log('✅ Found debugging/counting mechanisms');
}

// Check for fallback mechanisms
if (content.includes('fallback') || content.includes('workersSupported')) {
    console.log('✅ Found fallback mechanisms for worker failures');
}

// 9. IDENTIFIED ISSUES SUMMARY
console.log('\n⚠️  IDENTIFIED ISSUES');
console.log('-'.repeat(40));

if (contextIssues.length === 0 && specificIssues.length === 0) {
    console.log('✅ No critical issues detected');
} else {
    contextIssues.concat(specificIssues).forEach(issue => {
        console.log(`  ${issue}`);
    });
}

// 10. RECOMMENDATIONS
console.log('\n💡 WORKER-SPECIFIC RECOMMENDATIONS');
console.log('-'.repeat(40));

const recommendations = [];

if (content.includes('onmessage =') && !content.includes('.bind(this)')) {
    recommendations.push('Use .bind(this) for message handlers to maintain context');
}

if (!content.includes('try') && content.includes('postMessage')) {
    recommendations.push('Add try-catch blocks around postMessage calls');
}

if (!content.includes('dispose') && content.includes('new Worker')) {
    recommendations.push('Implement dispose() method for proper cleanup');
}

if (content.includes('setTimeout') && !content.includes('clearTimeout')) {
    recommendations.push('Clear timeouts in cleanup to prevent memory leaks');
}

if (!content.includes('workersSupported')) {
    recommendations.push('Add worker support detection and fallbacks');
}

if (recommendations.length > 0) {
    recommendations.forEach(rec => {
        console.log(`  • ${rec}`);
    });
} else {
    console.log('✅ No specific recommendations - worker handling looks robust');
}

console.log('\n' + '=' .repeat(80));
console.log('🎯 WORKER AUDIT COMPLETE\n');