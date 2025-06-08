/**
 * AI Audit Configuration
 * 
 * Configuration optimized for AI agents to understand and improve the codebase.
 * Defines what information to extract, how to structure it, and what intelligence to generate.
 */

export const aiAuditConfig = {
    // Analysis depth and focus
    analysis: {
        includeSourceCode: true,
        includeFullContext: true,
        maxContextLines: 20,
        generateExamples: true,
        createTemplates: true,
        buildCallGraphs: true,
        trackDataFlow: true
    },

    // AI Learning Configuration
    learning: {
        extractPatterns: true,
        identifyAntiPatterns: true,
        buildKnowledgeBase: true,
        createRefactoringRules: true,
        generateBestPractices: true,
        trackEvolution: true
    },

    // Memory Leak Detection for AI
    memoryAnalysis: {
        patterns: {
            eventListeners: {
                addPatterns: [
                    /addEventListener\s*\(\s*['"`]([^'"`]+)['"`]/g,
                    /on\w+\s*=\s*function/g,
                    /\.on\s*\(\s*['"`]([^'"`]+)['"`]/g
                ],
                removePatterns: [
                    /removeEventListener\s*\(\s*['"`]([^'"`]+)['"`]/g,
                    /\.off\s*\(\s*['"`]([^'"`]+)['"`]/g
                ],
                contextRequired: true,
                generateFix: true,
                severity: 'critical'
            },
            animationFrames: {
                addPatterns: [/requestAnimationFrame\s*\(/g],
                removePatterns: [/cancelAnimationFrame\s*\(/g],
                contextRequired: true,
                generateFix: true,
                severity: 'critical'
            },
            workers: {
                addPatterns: [/new\s+(?:Worker|SharedWorker)\s*\(/g],
                removePatterns: [/\.terminate\s*\(\s*\)/g],
                contextRequired: true,
                generateFix: true,
                severity: 'critical'
            },
            threeJsResources: {
                addPatterns: [
                    /new\s+THREE\.(?:\w+)?Geometry\s*\(/g,
                    /new\s+THREE\.(?:\w+)?Material\s*\(/g,
                    /new\s+THREE\.(?:Texture|TextureLoader)\s*\(/g
                ],
                removePatterns: [/\.dispose\s*\(\s*\)/g],
                contextRequired: true,
                generateFix: true,
                severity: 'high'
            },
            timers: {
                addPatterns: [
                    /setTimeout\s*\(/g,
                    /setInterval\s*\(/g
                ],
                removePatterns: [
                    /clearTimeout\s*\(/g,
                    /clearInterval\s*\(/g
                ],
                contextRequired: true,
                generateFix: true,
                severity: 'high'
            }
        },
        
        // AI context generation for memory leaks
        aiContextGenerators: {
            eventListener: (leak) => ({
                whyProblem: `Event listeners without cleanup cause memory leaks as they hold references to DOM elements and callback functions. In single-page applications, this accumulates over component lifecycles.`,
                howToFix: `Add removeEventListener in cleanup function (useEffect return, componentWillUnmount, or dispose method)`,
                relatedPatterns: ['cleanup-pattern', 'react-hooks', 'component-lifecycle'],
                exampleFix: generateEventListenerFix(leak),
                testCase: generateEventListenerTest(leak),
                preventionStrategy: 'Always pair addEventListener with removeEventListener in the same scope'
            }),
            animationFrame: (leak) => ({
                whyProblem: `Uncancelled animation frames continue consuming CPU cycles and memory, especially in loops that recreate themselves.`,
                howToFix: `Store the animation frame ID and call cancelAnimationFrame in cleanup`,
                relatedPatterns: ['animation-cleanup', 'raf-pattern', 'performance-optimization'],
                exampleFix: generateAnimationFrameFix(leak),
                testCase: generateAnimationFrameTest(leak),
                preventionStrategy: 'Always store RAF IDs and cancel them in cleanup functions'
            })
        }
    },

    // Architectural Analysis for AI
    architecturalAnalysis: {
        domains: {
            physics: {
                purpose: 'Core physics simulation and mathematical calculations',
                allowedDependencies: ['utils', 'external'],
                prohibitedDependencies: ['react', 'threejs'],
                patterns: ['pure-functions', 'mathematical-models', 'state-management'],
                responsibilities: ['orbital-mechanics', 'forces', 'integration', 'coordinate-transforms']
            },
            react: {
                purpose: 'User interface components and state management',
                allowedDependencies: ['utils', 'services', 'managers', 'external'],
                prohibitedDependencies: ['physics', 'threejs'],
                patterns: ['hooks', 'components', 'providers', 'lifecycle-management'],
                responsibilities: ['ui-rendering', 'user-interaction', 'state-binding', 'event-handling']
            },
            threejs: {
                purpose: '3D rendering and graphics visualization',
                allowedDependencies: ['physics', 'utils', 'services', 'external'],
                prohibitedDependencies: ['react'],
                patterns: ['scene-management', 'resource-disposal', 'performance-optimization'],
                responsibilities: ['3d-rendering', 'graphics', 'shaders', 'geometry', 'materials']
            },
            managers: {
                purpose: 'Coordination and lifecycle management between domains',
                allowedDependencies: ['physics', 'threejs', 'react', 'services', 'utils', 'external'],
                prohibitedDependencies: [],
                patterns: ['singleton', 'facade', 'observer', 'lifecycle-management'],
                responsibilities: ['coordination', 'lifecycle', 'integration', 'state-synchronization']
            },
            services: {
                purpose: 'Business logic and data processing',
                allowedDependencies: ['utils', 'physics', 'external'],
                prohibitedDependencies: ['react', 'threejs'],
                patterns: ['service-layer', 'data-processing', 'algorithms'],
                responsibilities: ['business-logic', 'data-processing', 'calculations', 'api-integration']
            },
            utils: {
                purpose: 'Pure utility functions without side effects',
                allowedDependencies: ['external'],
                prohibitedDependencies: ['physics', 'react', 'threejs', 'managers', 'services'],
                patterns: ['pure-functions', 'immutable-operations', 'functional-programming'],
                responsibilities: ['transformations', 'formatting', 'validation', 'constants']
            }
        },

        violationAnalysis: {
            boundaryViolation: {
                severity: 'critical',
                explanation: 'Cross-domain dependencies violate separation of concerns',
                refactoringStrategy: 'introduce-interface-layer',
                aiGuidance: 'Suggest creating adapter or facade patterns to maintain clean boundaries'
            },
            circularDependency: {
                severity: 'high',
                explanation: 'Circular dependencies create tight coupling and prevent clean testing',
                refactoringStrategy: 'dependency-injection',
                aiGuidance: 'Identify shared abstractions and extract to separate modules'
            },
            godClass: {
                severity: 'medium',
                explanation: 'Large classes violate single responsibility principle',
                refactoringStrategy: 'class-decomposition',
                aiGuidance: 'Identify distinct responsibilities and extract to focused classes'
            }
        }
    },

    // Pattern Recognition for AI Learning
    patternRecognition: {
        goodPatterns: {
            managerPattern: {
                indicators: ['lifecycle management', 'clean interfaces', 'proper disposal'],
                template: 'class-with-lifecycle-methods',
                reusability: 'high',
                contexts: ['resource-management', 'coordination', 'state-synchronization']
            },
            cleanupPattern: {
                indicators: ['paired resource creation/disposal', 'useEffect cleanup', 'dispose methods'],
                template: 'cleanup-function-template',
                reusability: 'high',
                contexts: ['memory-management', 'resource-lifecycle', 'component-cleanup']
            },
            hookPattern: {
                indicators: ['custom hooks', 'reusable logic', 'clean dependencies'],
                template: 'custom-hook-template',
                reusability: 'medium',
                contexts: ['react-components', 'state-management', 'side-effects']
            }
        },

        antiPatterns: {
            godClass: {
                indicators: ['> 500 lines', 'multiple responsibilities', 'high coupling'],
                refactoringStrategy: 'extract-classes',
                priority: 'medium'
            },
            memoryLeak: {
                indicators: ['uncleaned resources', 'growing static collections', 'missing disposal'],
                refactoringStrategy: 'add-cleanup',
                priority: 'critical'
            },
            mixedConcerns: {
                indicators: ['UI logic in physics', 'physics in React', 'Three.js in utils'],
                refactoringStrategy: 'separate-concerns',
                priority: 'high'
            }
        }
    },

    // AI Fix Generation Configuration
    fixGeneration: {
        automatedFixes: {
            eventListenerLeak: {
                confidence: 0.95,
                strategy: 'add-cleanup-function',
                template: 'event-listener-cleanup',
                validation: ['check-cleanup-called', 'verify-no-memory-leak']
            },
            animationFrameLeak: {
                confidence: 0.90,
                strategy: 'store-and-cancel-raf',
                template: 'animation-frame-cleanup',
                validation: ['check-cancel-called', 'verify-no-infinite-loop']
            },
            workerLeak: {
                confidence: 0.85,
                strategy: 'add-worker-termination',
                template: 'worker-cleanup',
                validation: ['check-terminate-called', 'verify-no-hanging-workers']
            }
        },

        refactoringPlans: {
            godClass: {
                confidence: 0.75,
                strategy: 'responsibility-extraction',
                phases: ['identify-responsibilities', 'extract-classes', 'update-interfaces', 'verify-functionality'],
                riskLevel: 'medium'
            },
            circularDependency: {
                confidence: 0.70,
                strategy: 'dependency-inversion',
                phases: ['identify-abstractions', 'create-interfaces', 'inject-dependencies', 'verify-decoupling'],
                riskLevel: 'high'
            }
        }
    },

    // Output Configuration for AI Consumption
    output: {
        formats: {
            structured: {
                format: 'json',
                schema: './ai-audit-schema.json',
                includeSourceCode: true,
                includeContext: true,
                includeExamples: true
            },
            narrative: {
                format: 'markdown',
                includeExplanations: true,
                includeCodeSamples: true,
                optimizeForAI: true
            },
            actionable: {
                format: 'json',
                focusOn: ['fixes', 'refactoring-plans', 'implementation-guidance'],
                includeConfidenceScores: true,
                includeExecutionPlans: true
            }
        },

        aiOptimizations: {
            structuredData: true,
            explicitRelationships: true,
            confidenceScores: true,
            executionPlans: true,
            contextualExamples: true,
            learningSignals: true,
            metaInformation: true
        }
    }
};

// Template generators for AI fix suggestions
function generateEventListenerFix(leak) {
    const eventType = leak.content.match(/addEventListener\s*\(\s*['"`]([^'"`]+)['"`]/)?.[1] || 'event';
    const target = leak.content.match(/(\w+)\.addEventListener/)?.[1] || 'element';
    
    return `
// Before (Memory Leak):
${leak.content}

// After (Fixed):
useEffect(() => {
    const handler = (event) => {
        // your event handling logic
    };
    
    ${target}.addEventListener('${eventType}', handler);
    
    // Cleanup function prevents memory leak
    return () => {
        ${target}.removeEventListener('${eventType}', handler);
    };
}, [/* dependencies */]);`;
}

function generateEventListenerTest(leak) {
    const eventType = leak.content.match(/addEventListener\s*\(\s*['"`]([^'"`]+)['"`]/)?.[1] || 'event';
    
    return `
// Test to verify cleanup
test('should clean up event listener on unmount', () => {
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
    
    const { unmount } = render(<YourComponent />);
    
    expect(addEventListenerSpy).toHaveBeenCalledWith('${eventType}', expect.any(Function));
    
    unmount();
    
    expect(removeEventListenerSpy).toHaveBeenCalledWith('${eventType}', expect.any(Function));
});`;
}

function generateAnimationFrameFix(leak) {
    return `
// Before (Memory Leak):
${leak.content}

// After (Fixed):
useEffect(() => {
    let rafId;
    
    const animate = () => {
        // your animation logic
        rafId = requestAnimationFrame(animate);
    };
    
    rafId = requestAnimationFrame(animate);
    
    // Cleanup function prevents memory leak
    return () => {
        if (rafId) {
            cancelAnimationFrame(rafId);
        }
    };
}, [/* dependencies */]);`;
}

function generateAnimationFrameTest(leak) {
    return `
// Test to verify RAF cleanup
test('should cancel animation frame on unmount', () => {
    const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => 123);
    const cancelSpy = jest.spyOn(window, 'cancelAnimationFrame');
    
    const { unmount } = render(<YourComponent />);
    
    expect(rafSpy).toHaveBeenCalled();
    
    unmount();
    
    expect(cancelSpy).toHaveBeenCalledWith(123);
});`;
}

export default aiAuditConfig;