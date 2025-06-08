# Enhanced Codebase Audit System

A comprehensive suite of analysis tools for the Darksun space simulation codebase, designed to detect memory leaks, architectural violations, and maintain code quality.

## Quick Start

```bash
# 🤖 AI-FIRST ANALYSIS (Recommended for AI agents)
pnpm audit:ai          # Complete AI intelligence gathering
pnpm audit:ai:md       # Human-readable AI report
pnpm audit:ai:fast     # Fast AI analysis

# 🔍 TRADITIONAL ANALYSIS (Human-focused)
pnpm audit             # Comprehensive audit
pnpm audit:memory      # Memory leak detection
pnpm audit:architecture # Architectural compliance
pnpm audit:orphaned    # Orphaned code detection (regex-based)
pnpm audit:orphaned-ast # Orphaned code detection (AST-based)
pnpm audit:deps        # Dependency graph analysis
pnpm audit:complexity  # Code complexity metrics
pnpm audit:file <path> # Single file dependency & data flow analysis

# 📊 EXPORT OPTIONS
pnpm audit:json        # JSON format
pnpm audit:html        # HTML report
pnpm audit:deps --mermaid # Mermaid diagram
pnpm audit:deps --dot  # DOT graph format
```

## Scripts Overview

### 🤖 `ai-audit-engine.js` - AI-First Audit Engine (NEW)
Revolutionary audit system designed specifically for AI agents to understand and improve the codebase autonomously:

**Key Features:**
- **AI-Optimized Output**: Structured JSON schema designed for AI consumption
- **Comprehensive Intelligence**: Gathers contextual information, patterns, and learning signals
- **Automated Fix Generation**: Creates specific, implementable solutions with confidence scores
- **Pattern Recognition**: Identifies good patterns and anti-patterns for AI learning
- **Execution Planning**: Provides step-by-step implementation guidance for AI agents

**Usage:**
```bash
pnpm audit:ai          # Full AI analysis with source code
pnpm audit:ai:md       # Markdown report for human review
pnpm audit:ai:fast     # Fast analysis without source inclusion
```

**AI Agent Integration:**
```javascript
import AIAuditEngine from './scripts/ai-audit-engine.js';

const auditor = new AIAuditEngine('./src');
const intelligence = await auditor.audit();

// Access structured data optimized for AI understanding
const fixes = intelligence.actionable.automatedFixes;
const patterns = intelligence.learningData.goodPatterns;
const issues = intelligence.issues.memoryLeaks;
```

### 🔍 `audit-codebase.js` - Comprehensive Analysis
Main audit script that analyzes the entire codebase for:
- Memory leak patterns
- Data flow violations
- Architectural compliance
- Call graph generation
- Comprehensive metrics

**Usage:**
```bash
node scripts/audit-codebase.js [directory] [options]

Options:
  --memory       Focus on memory analysis
  --architecture Focus on architectural analysis
  --json         Export JSON report
  --html         Export HTML report
```

### 🧠 `audit-memory.js` - Memory Leak Detection
Specialized memory leak detector for Three.js/React/Physics applications:

**Detects:**
- Event listeners without cleanup
- Animation frames without cancellation
- Workers without termination
- Three.js resources without disposal
- Static collections without size limits
- Timer leaks (setTimeout/setInterval)

**Usage:**
```bash
node scripts/audit-memory.js [directory]
```

### 🏗️ `audit-architecture.js` - Architectural Analysis
Analyzes separation of concerns and architectural patterns:

**Analyzes:**
- Domain boundary violations
- Cross-layer dependencies
- Circular dependencies
- Architectural patterns (Manager, Provider, etc.)
- Coupling and cohesion metrics

**Usage:**
```bash
node scripts/audit-architecture.js [directory]
```

### 🧹 `audit-orphaned-code.js` - Orphaned Code Detection (Regex-Based)
Identifies unused code that can be safely removed:

**Detects:**
- Orphaned files (not imported anywhere)
- Unused exports
- Unused functions and methods
- Unused imports
- Dead code patterns

**Features:**
- Intelligent entry point detection (index.js, main.js, App.js)
- Test file exclusion
- Dynamic import detection (`await import()`)
- Worker import detection (`new Worker(new URL(...))`)
- Re-export pattern recognition

**Usage:**
```bash
node scripts/audit-orphaned-code.js [directory] [options]

Options:
  --json    Export detailed JSON report
```

### 🎯 `audit-ast-orphaned.js` - AST-Based Orphaned Code Detection
More accurate orphaned code detection using AST-like parsing:

**Features:**
- Reachability analysis from entry points
- Precise import/export tracking
- Better handling of complex module patterns
- Dependency graph construction
- Dead code elimination suggestions

**Usage:**
```bash
node scripts/audit-ast-orphaned.js [directory] [options]

Options:
  --json    Export detailed JSON report
```

### 🔗 `audit-dependency-graph.js` - Dependency Graph Analysis
Visualizes and analyzes file dependencies and architectural patterns:

**Analyzes:**
- File dependency relationships
- Circular dependency detection
- Architectural layer violations
- Module coupling metrics
- Import/export patterns

**Features:**
- Multiple output formats (Mermaid, DOT, JSON)
- Directory clustering
- Layer violation detection
- Most connected files identification

**Usage:**
```bash
node scripts/audit-dependency-graph.js [directory] [options]

Options:
  --mermaid     Generate Mermaid diagram
  --dot         Generate DOT graph
  --json        Export JSON report
  --external    Include external dependencies
  --no-cluster  Disable directory clustering
```

### 📊 `audit-complexity.js` - Code Complexity Analysis
Comprehensive code complexity and maintainability metrics:

**Analyzes:**
- Cyclomatic complexity
- Function/file size metrics
- Nesting depth analysis
- Code smells detection
- Performance bottlenecks
- Technical debt assessment

**Features:**
- Complexity hotspot identification
- Performance warning detection
- Maintainability scoring (A-F grades)
- Configurable thresholds
- Magic number detection
- Duplicate code identification

**Usage:**
```bash
node scripts/audit-complexity.js [directory] [options]

Options:
  --json                      Export JSON report
  --threshold-fileSize=30000  Set file size threshold
  --threshold-complexity=10   Set complexity threshold
```

### 🎯 `audit-file.js` - Single File Analysis (NEW)
Comprehensive analysis of individual files for focused debugging and optimization:

**Analyzes:**
- Import/export dependencies and categorization
- Architecture compliance (Physics/Three.js/React separation)
- Data flow patterns (state, events, async, caching)
- Function and class structure
- ESLint issues with line numbers
- Related file mapping (imports and importers)

**Features:**
- **Dependency Classification**: Categorizes imports as internal/external, physics/three.js/react
- **Architecture Violation Detection**: Flags Three.js imports in physics files
- **Data Flow Pattern Recognition**: Identifies common patterns like state management, caching, validation
- **Related File Discovery**: Maps bidirectional dependencies
- **ESLint Integration**: Shows specific linting issues
- **Actionable Recommendations**: Provides specific improvement suggestions

**Usage:**
```bash
pnpm audit:file src/physics/PhysicsEngine.js
pnpm audit:file src/components/ui/button.jsx
pnpm audit:file src/managers/SatelliteManager.js

# Examples:
node scripts/audit-file.js src/physics/PhysicsEngine.js
node scripts/audit-file.js src/components/Satellite/Satellite.js
```

**Example Output:**
```
🔍 SINGLE FILE AUDIT: src/physics/PhysicsEngine.js
📄 FILE INFORMATION: 1318 lines, 53KB
📥 IMPORTS: 14 total (12 internal, 2 external, 1 Three.js, 0 React)
🏗️ ARCHITECTURE: ❌ VIOLATION: Physics file should not import Three.js
🔄 DATA FLOW: ✅ Async, Error handling, Validation, Caching
🧹 LINT: 4 issues found (unused imports)
💡 RECOMMENDATIONS: Remove Three.js dependencies, split large file
🔗 RELATED: 2 importers, 10 imports
```

## Output Formats

### Console Output (Default)
Color-coded terminal output with:
- 🔴 Critical issues (immediate action required)
- 🟡 High priority issues
- 🔵 Medium priority issues
- ✅ Good patterns found

### JSON Export
Structured data for CI/CD integration:
```json
{
  "memoryLeaks": { ... },
  "dataFlow": { ... },
  "architecture": { ... },
  "metrics": { ... }
}
```

### HTML Export
Interactive web report with graphs and navigation.

## Domain Classification

The auditor automatically classifies files into architectural domains:

- **Physics** (`src/physics/`) - Core physics engine and calculations
- **React** (`src/components/*.jsx`, `src/hooks/`) - UI components and React logic
- **Three.js** (`src/components/*.js`) - 3D rendering and graphics
- **Managers** (`src/managers/`) - Coordination and lifecycle management
- **Services** (`src/services/`) - Business logic and data processing
- **Utils** (`src/utils/`) - Pure utility functions

## Memory Leak Detection

### Critical Patterns Detected:
1. **Event Listeners** - `addEventListener` without `removeEventListener`
2. **Animation Frames** - `requestAnimationFrame` without `cancelAnimationFrame`
3. **Workers** - Worker creation without `.terminate()`
4. **Three.js Resources** - Geometry/Material/Texture without `.dispose()`

### Example Fix:
```javascript
// ❌ Memory leak
useEffect(() => {
  window.addEventListener('resize', handleResize);
}, []);

// ✅ Proper cleanup
useEffect(() => {
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
```

## Architectural Boundaries

### Allowed Cross-Domain Access:
- **React** → Utils, Services, Managers
- **Three.js** → Physics, Utils, Services
- **Physics** → Utils only
- **Managers** → All domains (coordination layer)
- **Utils** → External libraries only

### Violations Detected:
- React components importing Three.js directly
- Physics code in UI components
- Utils with side effects

## Integration with CI/CD

Add to your workflow:

```yaml
- name: Audit Codebase
  run: |
    pnpm audit:json
    # Parse audit-report.json for CI decisions
    
- name: Check Memory Leaks
  run: pnpm audit:memory
```

## Configuration

Thresholds can be adjusted in each script:

```javascript
const options = {
  threshold: {
    fileSize: 40000,    // bytes
    lines: 1000,        // lines of code
    complexity: 20,     // cyclomatic complexity
    coupling: 10        // import count
  }
}
```

## Best Practices

1. **Run audits regularly** - Integrate into development workflow
2. **Fix critical issues first** - Focus on memory leaks and boundary violations
3. **Monitor trends** - Use JSON exports to track improvements over time
4. **Enforce boundaries** - Use ESLint rules based on audit findings
5. **Add tests** - Verify cleanup functions work correctly

## Legacy Scripts

The original analysis scripts are still available:
- `analyze-codebase.js` - General codebase analysis
- `analyze-physics.js` - Physics directory specific analysis

## Output Examples

### Memory Leak Detection:
```
🔴 CRITICAL MEMORY LEAKS (4)
1. App3D.js:460 - requestAnimationFrame without cancel
2. SatelliteManager.js:24 - Worker without termination
```

### Architectural Violations:
```
🚧 BOUNDARY VIOLATIONS (36)
CRITICAL: React component importing Physics directly
HIGH: Three.js logic in UI component
```

### AI Intelligence Output:
```json
{
  "meta": {
    "fileCount": 218,
    "analysisConfidence": "68.6%",
    "domainDistribution": {
      "react": 70, "physics": 47, "threejs": 32, 
      "managers": 15, "utils": 10, "services": 3, "unknown": 41
    }
  },
  "actionable": {
    "automatedFixes": [ /* AI-implementable fixes */ ],
    "refactoringPlans": [ /* Structured refactoring guidance */ ],
    "confidenceScores": { /* AI decision-making confidence */ }
  },
  "learningData": {
    "goodPatterns": [ /* Examples for AI learning */ ],
    "antiPatterns": [ /* Patterns to avoid */ ],
    "contextualExamples": [ /* Contextual code examples */ ]
  }
}
```

### Metrics Summary:
```
📊 CODEBASE INTELLIGENCE
AI Analysis Confidence: 68.6%
Files Analyzed: 218
Domain Classification: ✅ COMPLETED
  - React: 70 files | Physics: 47 files | Three.js: 32 files
  - Managers: 15 files | Utils: 10 files | Services: 3 files
Memory Risk Assessment: MEDIUM
Architectural Health: GOOD
```

### Orphaned Code Detection:
```
📊 ORPHANED CODE REPORT
══════════════════════════════════════════════════

📈 SUMMARY
--------------------
Total Files: 219
Orphaned Files: 59
Orphaned Exports: 190
Orphaned Functions: 72
Orphaned Methods: 0
Unused Imports: 605

🗂️  ORPHANED FILES
------------------------------
📄 components/ui/Toast.jsx
   Exports: useToast, ToastProvider
   Functions: useToast, ToastProvider, showToast

📤 ORPHANED EXPORTS
------------------------------
RENDER_ORDER - components/planet/PlanetConstants.js:7
Button - components/ui/button.jsx:68
```

---

## 🚀 AI Agent Integration

This enhanced audit system is specifically designed for AI agents to understand and autonomously improve the codebase:

### For AI Agents:
1. **Use `ai-audit-engine.js`** for comprehensive intelligence gathering
2. **Parse structured JSON output** for decision-making
3. **Implement automated fixes** with provided confidence scores
4. **Learn from good patterns** in the `learningData` section
5. **Follow execution plans** for systematic improvements

### For Human Developers:
1. **Use traditional audit scripts** for detailed analysis
2. **Review AI-generated reports** for insights
3. **Validate AI recommendations** before implementation
4. **Monitor AI confidence scores** for reliability assessment

This system bridges the gap between human understanding and AI automation, providing both comprehensive analysis capabilities for maintaining a clean, performant, and well-architected Three.js/React/Physics simulation codebase.