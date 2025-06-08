#!/usr/bin/env node

/**
 * Comprehensive Stress Test Suite for Audit Scripts
 * Tests performance, edge cases, and accuracy across all audit tools
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AuditStressTester {
    constructor() {
        this.testResults = new Map();
        this.performanceMetrics = new Map();
        this.errorCounts = new Map();
        this.testStartTime = null;
        this.totalTests = 0;
        this.passedTests = 0;
        
        // Test scenarios
        this.testScenarios = [
            'basic-functionality',
            'large-codebase',
            'edge-cases',
            'malformed-files',
            'performance-limits',
            'memory-stress',
            'concurrent-execution',
            'error-handling',
            'accuracy-validation',
            'file-audit-effectiveness'
        ];
        
        // Audit scripts to test
        this.auditScripts = [
            { name: 'Memory Audit', command: 'audit:memory', critical: true },
            { name: 'Architecture Audit', command: 'audit:architecture', critical: true },
            { name: 'Basic Orphaned', command: 'audit:orphaned', critical: false },
            { name: 'Enhanced Orphaned', command: 'audit:orphaned-enhanced', critical: true },
            { name: 'Ultra Orphaned', command: 'audit:orphaned-ultra', critical: true },
            { name: 'Dependency Graph', command: 'audit:deps', critical: false },
            { name: 'Complexity Analysis', command: 'audit:complexity', critical: false },
            { name: 'Single File Audit', command: 'audit:file', critical: true, requiresFilePath: true }
        ];
    }

    async runStressTests() {
        console.log('🧪 COMPREHENSIVE AUDIT SCRIPT STRESS TESTING');
        console.log('═══════════════════════════════════════════════════\n');
        
        this.testStartTime = Date.now();
        
        // Run all test scenarios
        for (const scenario of this.testScenarios) {
            await this.runScenario(scenario);
        }
        
        // Generate comprehensive report
        this.generateStressTestReport();
    }

    async runScenario(scenario) {
        console.log(`🔬 Running ${scenario} tests...`);
        
        switch (scenario) {
            case 'basic-functionality':
                await this.testBasicFunctionality();
                break;
            case 'large-codebase':
                await this.testLargeCodebase();
                break;
            case 'edge-cases':
                await this.testEdgeCases();
                break;
            case 'malformed-files':
                await this.testMalformedFiles();
                break;
            case 'performance-limits':
                await this.testPerformanceLimits();
                break;
            case 'memory-stress':
                await this.testMemoryStress();
                break;
            case 'concurrent-execution':
                await this.testConcurrentExecution();
                break;
            case 'error-handling':
                await this.testErrorHandling();
                break;
            case 'accuracy-validation':
                await this.testAccuracyValidation();
                break;
            case 'file-audit-effectiveness':
                await this.testFileAuditEffectiveness();
                break;
        }
        
        console.log(`   ✅ ${scenario} completed\n`);
    }

    async testBasicFunctionality() {
        console.log('   📋 Testing basic functionality...');
        
        for (const script of this.auditScripts) {
            const testName = `basic-${script.command}`;
            await this.runTest(testName, async () => {
                const startTime = Date.now();
                
                try {
                    let command;
                    if (script.requiresFilePath) {
                        // For file audit, test with a representative file
                        command = `pnpm ${script.command} src/physics/PhysicsEngine.js`;
                    } else {
                        command = `pnpm ${script.command} src --json`;
                    }
                    
                    const result = execSync(command, {
                        encoding: 'utf8',
                        timeout: 60000, // 1 minute timeout
                        stdio: 'pipe'
                    });
                    
                    const endTime = Date.now();
                    const duration = endTime - startTime;
                    
                    // Validate output format
                    const hasOutput = result && result.length > 0;
                    const hasValidStructure = this.validateOutputStructure(result, script.command);
                    
                    this.recordPerformance(testName, duration);
                    
                    return {
                        success: hasOutput && hasValidStructure,
                        duration,
                        outputSize: result.length,
                        details: `Output: ${hasOutput}, Structure: ${hasValidStructure}`
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: error.message,
                        duration: Date.now() - startTime
                    };
                }
            });
        }
    }

    async testLargeCodebase() {
        console.log('   📊 Testing with large codebase simulation...');
        
        // Create temporary large codebase
        const tempDir = await this.createLargeCodebaseTest();
        
        try {
            for (const script of this.auditScripts) {
                const testName = `large-${script.command}`;
                await this.runTest(testName, async () => {
                    const startTime = Date.now();
                    
                    try {
                        const result = execSync(`pnpm ${script.command} ${tempDir}`, {
                            encoding: 'utf8',
                            timeout: 300000, // 5 minute timeout for large tests
                            stdio: 'pipe'
                        });
                        
                        const duration = Date.now() - startTime;
                        this.recordPerformance(testName, duration);
                        
                        return {
                            success: true,
                            duration,
                            outputSize: result.length,
                            details: `Processed large codebase successfully`
                        };
                    } catch (error) {
                        return {
                            success: false,
                            error: error.message,
                            duration: Date.now() - startTime
                        };
                    }
                });
            }
        } finally {
            // Cleanup
            await this.cleanupTempDir(tempDir);
        }
    }

    async testEdgeCases() {
        console.log('   🧩 Testing edge cases...');
        
        // Create files with edge cases
        const edgeCaseDir = await this.createEdgeCaseFiles();
        
        try {
            const edgeCases = [
                'circular-imports',
                'deep-nesting',
                'unicode-content',
                'large-files',
                'empty-files',
                'special-characters'
            ];
            
            for (const edgeCase of edgeCases) {
                for (const script of this.auditScripts) {
                    const testName = `edge-${edgeCase}-${script.command}`;
                    await this.runTest(testName, async () => {
                        const startTime = Date.now();
                        
                        try {
                            let command;
                            if (script.requiresFilePath) {
                                // For file audit, test with an edge case file
                                command = `pnpm ${script.command} ${edgeCaseDir}/${edgeCase}/test.js`;
                            } else {
                                command = `pnpm ${script.command} ${edgeCaseDir}/${edgeCase}`;
                            }
                            
                            const result = execSync(command, {
                                encoding: 'utf8',
                                timeout: 120000, // 2 minute timeout
                                stdio: 'pipe'
                            });
                            
                            const duration = Date.now() - startTime;
                            this.recordPerformance(testName, duration);
                            
                            return {
                                success: true,
                                duration,
                                details: `Handled ${edgeCase} successfully`
                            };
                        } catch (error) {
                            // Some edge cases are expected to fail gracefully
                            const isGracefulFailure = error.message.includes('Analysis failed') && 
                                                     !error.message.includes('ENOENT');
                            
                            return {
                                success: isGracefulFailure,
                                error: error.message,
                                duration: Date.now() - startTime,
                                details: isGracefulFailure ? 'Graceful failure' : 'Unexpected error'
                            };
                        }
                    });
                }
            }
        } finally {
            await this.cleanupTempDir(edgeCaseDir);
        }
    }

    async testMalformedFiles() {
        console.log('   🔧 Testing malformed file handling...');
        
        const malformedDir = await this.createMalformedFiles();
        
        try {
            for (const script of this.auditScripts) {
                const testName = `malformed-${script.command}`;
                await this.runTest(testName, async () => {
                    const startTime = Date.now();
                    
                    try {
                        let command;
                        if (script.requiresFilePath) {
                            // For file audit, test with a malformed file
                            command = `pnpm ${script.command} ${malformedDir}/malformed.js`;
                        } else {
                            command = `pnpm ${script.command} ${malformedDir}`;
                        }
                        
                        const result = execSync(command, {
                            encoding: 'utf8',
                            timeout: 60000,
                            stdio: 'pipe'
                        });
                        
                        const duration = Date.now() - startTime;
                        this.recordPerformance(testName, duration);
                        
                        // Scripts should handle malformed files gracefully
                        const hasErrorHandling = result.includes('Error analyzing') || 
                                               result.includes('Analysis failed');
                        
                        return {
                            success: true, // Success means it didn't crash
                            duration,
                            details: hasErrorHandling ? 'Graceful error handling' : 'Processed without errors'
                        };
                    } catch (error) {
                        return {
                            success: false,
                            error: error.message,
                            duration: Date.now() - startTime
                        };
                    }
                });
            }
        } finally {
            await this.cleanupTempDir(malformedDir);
        }
    }

    async testPerformanceLimits() {
        console.log('   ⚡ Testing performance limits...');
        
        const performanceDir = await this.createPerformanceTestFiles();
        
        try {
            // Test with increasing file counts
            const fileCounts = [100, 500, 1000, 2000];
            
            for (const fileCount of fileCounts) {
                for (const script of this.auditScripts.filter(s => s.critical)) {
                    const testName = `perf-${fileCount}-${script.command}`;
                    await this.runTest(testName, async () => {
                        const testDir = `${performanceDir}/${fileCount}`;
                        const startTime = Date.now();
                        
                        try {
                            const result = execSync(`pnpm ${script.command} ${testDir}`, {
                                encoding: 'utf8',
                                timeout: 600000, // 10 minute timeout
                                stdio: 'pipe'
                            });
                            
                            const duration = Date.now() - startTime;
                            this.recordPerformance(testName, duration);
                            
                            // Check if performance is reasonable (< 5 seconds per 100 files)
                            const expectedMaxTime = (fileCount / 100) * 5000;
                            const isPerformant = duration < expectedMaxTime;
                            
                            return {
                                success: isPerformant,
                                duration,
                                fileCount,
                                details: `${duration}ms for ${fileCount} files (${isPerformant ? 'performant' : 'slow'})`
                            };
                        } catch (error) {
                            return {
                                success: false,
                                error: error.message,
                                duration: Date.now() - startTime,
                                fileCount
                            };
                        }
                    });
                }
            }
        } finally {
            await this.cleanupTempDir(performanceDir);
        }
    }

    async testMemoryStress() {
        console.log('   💾 Testing memory usage...');
        
        // Test with large files and many files
        const memoryTestDir = await this.createMemoryStressFiles();
        
        try {
            for (const script of this.auditScripts.filter(s => s.critical)) {
                const testName = `memory-${script.command}`;
                await this.runTest(testName, async () => {
                    const startTime = Date.now();
                    const initialMemory = process.memoryUsage();
                    
                    try {
                        const result = execSync(`pnpm ${script.command} ${memoryTestDir}`, {
                            encoding: 'utf8',
                            timeout: 300000, // 5 minute timeout
                            stdio: 'pipe',
                            maxBuffer: 50 * 1024 * 1024 // 50MB buffer
                        });
                        
                        const duration = Date.now() - startTime;
                        const finalMemory = process.memoryUsage();
                        const memoryDelta = finalMemory.heapUsed - initialMemory.heapUsed;
                        
                        this.recordPerformance(testName, duration);
                        
                        // Check if memory usage is reasonable (< 500MB increase)
                        const memoryLimitMB = 500 * 1024 * 1024;
                        const isMemoryEfficient = memoryDelta < memoryLimitMB;
                        
                        return {
                            success: isMemoryEfficient,
                            duration,
                            memoryDelta: Math.round(memoryDelta / 1024 / 1024),
                            details: `Memory delta: ${Math.round(memoryDelta / 1024 / 1024)}MB`
                        };
                    } catch (error) {
                        return {
                            success: false,
                            error: error.message,
                            duration: Date.now() - startTime
                        };
                    }
                });
            }
        } finally {
            await this.cleanupTempDir(memoryTestDir);
        }
    }

    async testConcurrentExecution() {
        console.log('   🔄 Testing concurrent execution...');
        
        // Test running multiple scripts simultaneously
        const promises = this.auditScripts.slice(0, 3).map(async (script, index) => {
            const testName = `concurrent-${index}-${script.command}`;
            return this.runTest(testName, async () => {
                const startTime = Date.now();
                
                try {
                    const result = execSync(`pnpm ${script.command} src`, {
                        encoding: 'utf8',
                        timeout: 120000,
                        stdio: 'pipe'
                    });
                    
                    const duration = Date.now() - startTime;
                    this.recordPerformance(testName, duration);
                    
                    return {
                        success: true,
                        duration,
                        details: `Concurrent execution ${index} completed`
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: error.message,
                        duration: Date.now() - startTime
                    };
                }
            });
        });
        
        await Promise.all(promises);
    }

    async testErrorHandling() {
        console.log('   🚨 Testing error handling...');
        
        const errorScenarios = [
            { name: 'nonexistent-dir', path: '/nonexistent/directory' },
            { name: 'permission-denied', path: '/root' },
            { name: 'empty-dir', path: await this.createEmptyDir() }
        ];
        
        try {
            for (const scenario of errorScenarios) {
                for (const script of this.auditScripts) {
                    const testName = `error-${scenario.name}-${script.command}`;
                    await this.runTest(testName, async () => {
                        const startTime = Date.now();
                        
                        try {
                            const result = execSync(`pnpm ${script.command} ${scenario.path}`, {
                                encoding: 'utf8',
                                timeout: 30000,
                                stdio: 'pipe'
                            });
                            
                            return {
                                success: true,
                                duration: Date.now() - startTime,
                                details: 'Handled error scenario gracefully'
                            };
                        } catch (error) {
                            // Expected for some scenarios - check if error is handled gracefully
                            const isGracefulError = error.message.includes('Analysis failed') ||
                                                   error.message.includes('ENOENT') ||
                                                   error.message.includes('EACCES');
                            
                            return {
                                success: isGracefulError,
                                error: error.message,
                                duration: Date.now() - startTime,
                                details: isGracefulError ? 'Graceful error handling' : 'Unexpected error'
                            };
                        }
                    });
                }
            }
        } finally {
            // Cleanup empty dir
            const emptyDirScenario = errorScenarios.find(s => s.name === 'empty-dir');
            if (emptyDirScenario) {
                await this.cleanupTempDir(emptyDirScenario.path);
            }
        }
    }

    async testAccuracyValidation() {
        console.log('   🎯 Testing accuracy validation...');
        
        // Create controlled test cases with known issues
        const accuracyDir = await this.createAccuracyTestFiles();
        
        try {
            // Test orphaned code detection accuracy
            const testName = 'accuracy-orphaned-detection';
            await this.runTest(testName, async () => {
                const startTime = Date.now();
                
                try {
                    const basicResult = execSync(`pnpm audit:orphaned ${accuracyDir}`, {
                        encoding: 'utf8',
                        timeout: 60000,
                        stdio: 'pipe'
                    });
                    
                    const enhancedResult = execSync(`pnpm audit:orphaned-enhanced ${accuracyDir}`, {
                        encoding: 'utf8',
                        timeout: 60000,
                        stdio: 'pipe'
                    });
                    
                    const ultraResult = execSync(`pnpm audit:orphaned-ultra ${accuracyDir}`, {
                        encoding: 'utf8',
                        timeout: 60000,
                        stdio: 'pipe'
                    });
                    
                    const duration = Date.now() - startTime;
                    
                    // Count orphaned files detected by each method
                    const basicCount = (basicResult.match(/📄/g) || []).length;
                    const enhancedCount = (enhancedResult.match(/📄/g) || []).length;
                    const ultraCount = (ultraResult.match(/📄/g) || []).length;
                    
                    // Enhanced and Ultra should detect fewer false positives
                    const improvementFound = enhancedCount <= basicCount && ultraCount <= enhancedCount;
                    
                    return {
                        success: improvementFound,
                        duration,
                        details: `Basic: ${basicCount}, Enhanced: ${enhancedCount}, Ultra: ${ultraCount}`,
                        basicCount,
                        enhancedCount,
                        ultraCount
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: error.message,
                        duration: Date.now() - startTime
                    };
                }
            });
        } finally {
            await this.cleanupTempDir(accuracyDir);
        }
    }

    async testFileAuditEffectiveness() {
        console.log('   🎯 Testing file audit effectiveness...');
        
        // Test file audit with different types of files to evaluate its effectiveness
        const testFiles = [
            { 
                name: 'physics-engine', 
                path: 'src/physics/PhysicsEngine.js',
                expectedViolations: ['Three.js imports in physics'],
                expectedPatterns: ['async', 'validation', 'caching']
            },
            { 
                name: 'ui-component', 
                path: 'src/components/ui/button.jsx',
                expectedViolations: [],
                expectedPatterns: ['react']
            },
            { 
                name: 'satellite-manager', 
                path: 'src/managers/SatelliteManager.js',
                expectedViolations: [],
                expectedPatterns: ['event handling', 'physics integration']
            }
        ];

        let totalEffectivenessScore = 0;
        const maxScore = testFiles.length * 100;

        for (const testFile of testFiles) {
            const testName = `file-audit-${testFile.name}`;
            await this.runTest(testName, async () => {
                const startTime = Date.now();
                
                try {
                    const result = execSync(`pnpm audit:file ${testFile.path}`, {
                        encoding: 'utf8',
                        timeout: 30000, // 30 second timeout
                        stdio: 'pipe'
                    });
                    
                    const duration = Date.now() - startTime;
                    this.recordPerformance(testName, duration);
                    
                    // Analyze the effectiveness of the audit
                    let effectivenessScore = 0;
                    const analysis = this.analyzeFileAuditOutput(result, testFile);
                    
                    // Score based on detection accuracy
                    if (analysis.detectsExpectedViolations) effectivenessScore += 30;
                    if (analysis.detectsExpectedPatterns) effectivenessScore += 30;
                    if (analysis.providesRecommendations) effectivenessScore += 20;
                    if (analysis.hasArchitectureCompliance) effectivenessScore += 10;
                    if (analysis.hasRelatedFiles) effectivenessScore += 10;
                    
                    totalEffectivenessScore += effectivenessScore;
                    
                    return {
                        success: effectivenessScore >= 70, // 70% threshold for success
                        duration,
                        effectivenessScore,
                        analysis,
                        details: `Effectiveness score: ${effectivenessScore}/100`
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: error.message,
                        duration: Date.now() - startTime,
                        effectivenessScore: 0
                    };
                }
            });
        }

        // Overall file audit effectiveness test
        await this.runTest('file-audit-overall-effectiveness', async () => {
            const overallScore = (totalEffectivenessScore / maxScore) * 100;
            
            return {
                success: overallScore >= 75, // 75% threshold for overall success
                overallScore,
                details: `Overall file audit effectiveness: ${overallScore.toFixed(1)}%`
            };
        });

        // Test architecture violation detection accuracy
        await this.runTest('file-audit-architecture-violations', async () => {
            const startTime = Date.now();
            
            try {
                // Test with physics file (should detect Three.js violation)
                const physicsResult = execSync('pnpm audit:file src/physics/PhysicsEngine.js', {
                    encoding: 'utf8',
                    timeout: 30000,
                    stdio: 'pipe'
                });
                
                // Test with UI component (should be clean)
                const uiResult = execSync('pnpm audit:file src/components/ui/button.jsx', {
                    encoding: 'utf8',
                    timeout: 30000,
                    stdio: 'pipe'
                });
                
                const duration = Date.now() - startTime;
                
                // Check if violations are properly detected
                const physicsViolation = physicsResult.includes('VIOLATION') || physicsResult.includes('Three.js');
                const uiClean = !uiResult.includes('VIOLATION') || uiResult.includes('No architecture violations');
                
                return {
                    success: physicsViolation && uiClean,
                    duration,
                    details: `Physics violation detected: ${physicsViolation}, UI clean: ${uiClean}`
                };
            } catch (error) {
                return {
                    success: false,
                    error: error.message,
                    duration: Date.now() - startTime
                };
            }
        });

        // Test dependency classification accuracy
        await this.runTest('file-audit-dependency-classification', async () => {
            const startTime = Date.now();
            
            try {
                const result = execSync('pnpm audit:file src/physics/PhysicsEngine.js', {
                    encoding: 'utf8',
                    timeout: 30000,
                    stdio: 'pipe'
                });
                
                const duration = Date.now() - startTime;
                
                // Check if dependencies are properly classified
                const hasImportCount = result.includes('Total imports:');
                const hasInternalExternal = result.includes('Internal') && result.includes('External');
                const hasFrameworkClassification = result.includes('Three.js related') || result.includes('React related');
                
                return {
                    success: hasImportCount && hasInternalExternal && hasFrameworkClassification,
                    duration,
                    details: `Import analysis: ${hasImportCount}, Classification: ${hasInternalExternal}, Frameworks: ${hasFrameworkClassification}`
                };
            } catch (error) {
                return {
                    success: false,
                    error: error.message,
                    duration: Date.now() - startTime
                };
            }
        });
    }

    analyzeFileAuditOutput(output, testFile) {
        return {
            detectsExpectedViolations: testFile.expectedViolations.some(violation => 
                output.toLowerCase().includes(violation.toLowerCase())
            ),
            detectsExpectedPatterns: testFile.expectedPatterns.some(pattern => 
                output.toLowerCase().includes(pattern.toLowerCase())
            ),
            providesRecommendations: output.includes('RECOMMENDATIONS'),
            hasArchitectureCompliance: output.includes('ARCHITECTURE COMPLIANCE'),
            hasRelatedFiles: output.includes('RELATED FILES'),
            hasLintAnalysis: output.includes('LINT ANALYSIS'),
            hasDataFlowPatterns: output.includes('DATA FLOW PATTERNS'),
            hasFunctionAnalysis: output.includes('FUNCTIONS & CLASSES')
        };
    }

    async runTest(testName, testFunction) {
        this.totalTests++;
        
        try {
            const result = await testFunction();
            result.testName = testName;
            result.timestamp = new Date().toISOString();
            
            this.testResults.set(testName, result);
            
            if (result.success) {
                this.passedTests++;
                console.log(`     ✅ ${testName} - PASSED`);
            } else {
                console.log(`     ❌ ${testName} - FAILED: ${result.error || result.details}`);
            }
        } catch (error) {
            this.testResults.set(testName, {
                testName,
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            console.log(`     💥 ${testName} - CRASHED: ${error.message}`);
        }
    }

    recordPerformance(testName, duration) {
        if (!this.performanceMetrics.has(testName)) {
            this.performanceMetrics.set(testName, []);
        }
        this.performanceMetrics.get(testName).push(duration);
    }

    validateOutputStructure(output, scriptType) {
        if (!output || output.length === 0) return false;
        
        // Check for common output patterns
        const hasTitle = output.includes('ANALYSIS') || output.includes('REPORT');
        const hasSummary = output.includes('SUMMARY') || output.includes('Found');
        const hasStructuredOutput = output.includes('----') || output.includes('===');
        
        return hasTitle && hasSummary && hasStructuredOutput;
    }

    // Test file creation methods
    async createLargeCodebaseTest() {
        const tempDir = `/tmp/audit-stress-large-${Date.now()}`;
        fs.mkdirSync(tempDir, { recursive: true });
        
        // Create 1000 files with realistic content
        for (let i = 0; i < 1000; i++) {
            const content = this.generateRealisticFileContent(i);
            fs.writeFileSync(`${tempDir}/file${i}.js`, content);
        }
        
        return tempDir;
    }

    async createEdgeCaseFiles() {
        const tempDir = `/tmp/audit-stress-edge-${Date.now()}`;
        fs.mkdirSync(tempDir, { recursive: true });
        
        // Circular imports
        const circularDir = `${tempDir}/circular-imports`;
        fs.mkdirSync(circularDir, { recursive: true });
        fs.writeFileSync(`${circularDir}/a.js`, `import './b.js'; export const a = 1;`);
        fs.writeFileSync(`${circularDir}/b.js`, `import './a.js'; export const b = 2;`);
        
        // Deep nesting
        const deepDir = `${tempDir}/deep-nesting`;
        fs.mkdirSync(deepDir, { recursive: true });
        let currentDir = deepDir;
        for (let i = 0; i < 20; i++) {
            currentDir = `${currentDir}/level${i}`;
            fs.mkdirSync(currentDir, { recursive: true });
            fs.writeFileSync(`${currentDir}/file.js`, `export const level${i} = true;`);
        }
        
        // Unicode content
        const unicodeDir = `${tempDir}/unicode-content`;
        fs.mkdirSync(unicodeDir, { recursive: true });
        fs.writeFileSync(`${unicodeDir}/unicode.js`, `
            // 测试文件 with 🚀 emojis and ñiño characters
            export const résumé = "café";
            const 变量 = "值";
        `);
        
        // Large files
        const largeDir = `${tempDir}/large-files`;
        fs.mkdirSync(largeDir, { recursive: true });
        const largeContent = 'export const data = [\n' + 
            Array(10000).fill().map((_, i) => `  { id: ${i}, value: "item${i}" }`).join(',\n') + 
            '\n];';
        fs.writeFileSync(`${largeDir}/large.js`, largeContent);
        
        // Empty files
        const emptyDir = `${tempDir}/empty-files`;
        fs.mkdirSync(emptyDir, { recursive: true });
        fs.writeFileSync(`${emptyDir}/empty.js`, '');
        
        // Special characters
        const specialDir = `${tempDir}/special-characters`;
        fs.mkdirSync(specialDir, { recursive: true });
        fs.writeFileSync(`${specialDir}/special.js`, `
            export const weird = \`template \${with} nested \\\`backticks\\\`\`;
            const regex = /complex[\\s\\S]*?regex/gim;
            /* multi
               line
               comment */
        `);
        
        return tempDir;
    }

    async createMalformedFiles() {
        const tempDir = `/tmp/audit-stress-malformed-${Date.now()}`;
        fs.mkdirSync(tempDir, { recursive: true });
        
        // Syntax errors
        fs.writeFileSync(`${tempDir}/syntax-error.js`, `
            import unclosed from 'module
            export const broken = {
                missing: quote"
            }
        `);
        
        // Invalid imports
        fs.writeFileSync(`${tempDir}/invalid-import.js`, `
            import { } from '';
            import from;
            export { nonexistent } from './missing';
        `);
        
        // Binary file with .js extension
        const binaryContent = Buffer.from([0xFF, 0xFE, 0x00, 0x01, 0x02, 0x03]);
        fs.writeFileSync(`${tempDir}/binary.js`, binaryContent);
        
        return tempDir;
    }

    async createPerformanceTestFiles() {
        const tempDir = `/tmp/audit-stress-performance-${Date.now()}`;
        fs.mkdirSync(tempDir, { recursive: true });
        
        const fileCounts = [100, 500, 1000, 2000];
        
        for (const count of fileCounts) {
            const countDir = `${tempDir}/${count}`;
            fs.mkdirSync(countDir, { recursive: true });
            
            for (let i = 0; i < count; i++) {
                const content = this.generateComplexFileContent(i, count);
                fs.writeFileSync(`${countDir}/file${i}.js`, content);
            }
        }
        
        return tempDir;
    }

    async createMemoryStressFiles() {
        const tempDir = `/tmp/audit-stress-memory-${Date.now()}`;
        fs.mkdirSync(tempDir, { recursive: true });
        
        // Create very large files
        for (let i = 0; i < 50; i++) {
            const largeContent = this.generateLargeFileContent(i);
            fs.writeFileSync(`${tempDir}/large${i}.js`, largeContent);
        }
        
        return tempDir;
    }

    async createEmptyDir() {
        const tempDir = `/tmp/audit-stress-empty-${Date.now()}`;
        fs.mkdirSync(tempDir, { recursive: true });
        return tempDir;
    }

    async createAccuracyTestFiles() {
        const tempDir = `/tmp/audit-stress-accuracy-${Date.now()}`;
        fs.mkdirSync(tempDir, { recursive: true });
        
        // Create truly orphaned file
        fs.writeFileSync(`${tempDir}/truly-orphaned.js`, `
            export const unused = 'never imported';
            function neverCalled() {}
        `);
        
        // Create file that looks orphaned but is used via dynamic import
        fs.writeFileSync(`${tempDir}/dynamic-import.js`, `
            export const dynamicallyUsed = 'loaded at runtime';
        `);
        
        fs.writeFileSync(`${tempDir}/main.js`, `
            async function loadModule() {
                const module = await import('./dynamic-import.js');
                return module.dynamicallyUsed;
            }
        `);
        
        // Create UI component that looks orphaned but is used in JSX
        fs.writeFileSync(`${tempDir}/ui-component.jsx`, `
            export const Button = ({ children }) => <button>{children}</button>;
        `);
        
        fs.writeFileSync(`${tempDir}/app.jsx`, `
            import { Button } from './ui-component.jsx';
            export const App = () => <Button>Click me</Button>;
        `);
        
        return tempDir;
    }

    generateRealisticFileContent(index) {
        return `
import React from 'react';
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

export const Component${index} = ({ data, onUpdate }) => {
    const [state, setState] = useState(null);
    
    useEffect(() => {
        if (data) {
            setState(data.value);
        }
    }, [data]);
    
    const handleClick = () => {
        onUpdate(state);
    };
    
    return (
        <div className="component-${index}">
            <button onClick={handleClick}>
                Update {state}
            </button>
        </div>
    );
};

Component${index}.propTypes = {
    data: PropTypes.object,
    onUpdate: PropTypes.func.isRequired
};

export default Component${index};
        `;
    }

    generateComplexFileContent(index, total) {
        const imports = Array(Math.min(10, total - index - 1))
            .fill()
            .map((_, i) => `import { Component${index + i + 1} } from './file${index + i + 1}.js';`)
            .join('\n');
        
        return `
${imports}

export class ComplexClass${index} {
    constructor(options = {}) {
        this.options = { ...this.getDefaults(), ...options };
        this.handlers = new Map();
        this.state = new Proxy({}, {
            set: (target, key, value) => {
                target[key] = value;
                this.notifyChange(key, value);
                return true;
            }
        });
    }
    
    getDefaults() {
        return {
            timeout: 5000,
            retries: 3,
            cache: true
        };
    }
    
    async processData(data) {
        try {
            const processed = await this.transform(data);
            return this.validate(processed);
        } catch (error) {
            console.error('Processing failed:', error);
            throw error;
        }
    }
    
    transform(data) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(data.map(item => ({ ...item, processed: true })));
            }, 100);
        });
    }
    
    validate(data) {
        return data.filter(item => item && typeof item === 'object');
    }
    
    notifyChange(key, value) {
        const handlers = this.handlers.get(key) || [];
        handlers.forEach(handler => handler(value));
    }
    
    subscribe(key, handler) {
        if (!this.handlers.has(key)) {
            this.handlers.set(key, []);
        }
        this.handlers.get(key).push(handler);
    }
}

export default ComplexClass${index};
        `;
    }

    generateLargeFileContent(index) {
        const data = Array(5000).fill().map((_, i) => ({
            id: i,
            name: `Item ${i}`,
            category: `Category ${i % 10}`,
            active: i % 2 === 0,
            metadata: {
                created: new Date().toISOString(),
                updated: new Date().toISOString(),
                tags: [`tag${i % 5}`, `tag${i % 7}`]
            }
        }));
        
        return `
export const largeDataSet${index} = ${JSON.stringify(data, null, 2)};

export const processLargeData${index} = (data) => {
    return data
        .filter(item => item.active)
        .map(item => ({
            ...item,
            processed: true,
            timestamp: Date.now()
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
};

export default { largeDataSet${index}, processLargeData${index} };
        `;
    }

    async cleanupTempDir(dir) {
        try {
            if (dir.includes('/tmp/audit-stress-')) {
                execSync(`rm -rf "${dir}"`, { stdio: 'ignore' });
            }
        } catch (error) {
            console.warn(`Failed to cleanup ${dir}:`, error.message);
        }
    }

    generateStressTestReport() {
        const totalDuration = Date.now() - this.testStartTime;
        const successRate = (this.passedTests / this.totalTests) * 100;
        
        console.log('\n🏁 STRESS TEST RESULTS');
        console.log('═══════════════════════════════════════════════════\n');
        
        console.log('📊 OVERALL SUMMARY');
        console.log('--------------------');
        console.log(`Total Tests: ${this.totalTests}`);
        console.log(`Passed: ${this.passedTests}`);
        console.log(`Failed: ${this.totalTests - this.passedTests}`);
        console.log(`Success Rate: ${successRate.toFixed(2)}%`);
        console.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s\n`);
        
        // Performance summary
        console.log('⚡ PERFORMANCE SUMMARY');
        console.log('--------------------');
        this.performanceMetrics.forEach((durations, testName) => {
            const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
            const max = Math.max(...durations);
            const min = Math.min(...durations);
            console.log(`${testName}: avg ${avg.toFixed(0)}ms, min ${min}ms, max ${max}ms`);
        });
        
        // Failed tests details
        const failedTests = Array.from(this.testResults.values()).filter(r => !r.success);
        if (failedTests.length > 0) {
            console.log('\n❌ FAILED TESTS');
            console.log('--------------------');
            failedTests.forEach(test => {
                console.log(`${test.testName}: ${test.error || test.details}`);
            });
        }
        
        // Scenario breakdown
        console.log('\n📋 SCENARIO BREAKDOWN');
        console.log('--------------------');
        const scenarioStats = new Map();
        this.testResults.forEach((result, testName) => {
            const scenario = testName.split('-')[0];
            if (!scenarioStats.has(scenario)) {
                scenarioStats.set(scenario, { total: 0, passed: 0 });
            }
            const stats = scenarioStats.get(scenario);
            stats.total++;
            if (result.success) stats.passed++;
        });
        
        scenarioStats.forEach((stats, scenario) => {
            const rate = (stats.passed / stats.total) * 100;
            console.log(`${scenario}: ${stats.passed}/${stats.total} (${rate.toFixed(1)}%)`);
        });
        
        // Final assessment
        console.log('\n🎯 FINAL ASSESSMENT');
        console.log('--------------------');
        if (successRate >= 95) {
            console.log('🟢 EXCELLENT - Audit scripts are highly robust and performant');
        } else if (successRate >= 85) {
            console.log('🟡 GOOD - Minor issues found, audit scripts are generally stable');
        } else if (successRate >= 70) {
            console.log('🟠 MODERATE - Several issues found, improvements needed');
        } else {
            console.log('🔴 POOR - Significant issues found, major improvements required');
        }
        
        // Export detailed report
        const report = {
            summary: {
                totalTests: this.totalTests,
                passedTests: this.passedTests,
                successRate,
                totalDuration,
                timestamp: new Date().toISOString()
            },
            performance: Object.fromEntries(this.performanceMetrics),
            testResults: Object.fromEntries(this.testResults),
            scenarios: Object.fromEntries(scenarioStats)
        };
        
        fs.writeFileSync('./stress-test-report.json', JSON.stringify(report, null, 2));
        console.log('\n📄 Detailed report exported to: stress-test-report.json');
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const tester = new AuditStressTester();
    tester.runStressTests().catch(error => {
        console.error('❌ Stress testing failed:', error.message);
        process.exit(1);
    });
}

export default AuditStressTester;