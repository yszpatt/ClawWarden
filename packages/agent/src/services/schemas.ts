import type { DesignOutput, DevelopmentOutput, TestingOutput } from '@antiwarden/shared';

/**
 * JSON Schemas for structured outputs from Claude Agent SDK
 * These schemas define the expected format for different task types
 */

/**
 * Design output schema - for design lane tasks
 */
export const designOutputSchema = {
    type: 'object',
    properties: {
        summary: {
            type: 'string',
            description: 'Brief summary of the design approach'
        },
        approach: {
            type: 'string',
            description: 'Detailed technical approach and architecture decisions'
        },
        components: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    files: {
                        type: 'array',
                        items: { type: 'string' }
                    }
                },
                required: ['name', 'description', 'files']
            }
        },
        dependencies: {
            type: 'array',
            items: { type: 'string' },
            description: 'External dependencies or packages required'
        },
        considerations: {
            type: 'array',
            items: { type: 'string' },
            description: 'Important considerations, constraints, or edge cases'
        },
        estimatedComplexity: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Estimated implementation complexity'
        }
    },
    required: ['summary', 'approach', 'components', 'estimatedComplexity']
} as const;

/**
 * Development output schema - for develop lane tasks
 */
export const developmentOutputSchema = {
    type: 'object',
    properties: {
        summary: {
            type: 'string',
            description: 'Summary of changes made'
        },
        changes: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    file: { type: 'string' },
                    action: {
                        type: 'string',
                        enum: ['created', 'modified', 'deleted']
                    },
                    description: { type: 'string' }
                },
                required: ['file', 'action', 'description']
            }
        },
        testsAdded: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of test files added'
        },
        breakingChanges: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of breaking changes'
        },
        nextSteps: {
            type: 'array',
            items: { type: 'string' },
            description: 'Recommended next steps'
        }
    },
    required: ['summary', 'changes']
} as const;

/**
 * Testing output schema - for test lane tasks
 */
export const testingOutputSchema = {
    type: 'object',
    properties: {
        summary: {
            type: 'string',
            description: 'Summary of test results'
        },
        testsRun: {
            type: 'number',
            description: 'Total number of tests run'
        },
        testsPassed: {
            type: 'number',
            description: 'Number of tests passed'
        },
        testsFailed: {
            type: 'number',
            description: 'Number of tests failed'
        },
        issues: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    severity: {
                        type: 'string',
                        enum: ['low', 'medium', 'high', 'critical']
                    },
                    description: { type: 'string' },
                    location: { type: 'string' }
                },
                required: ['severity', 'description']
            }
        },
        coverage: {
            type: 'object',
            properties: {
                lines: { type: 'number' },
                functions: { type: 'number' },
                branches: { type: 'number' }
            }
        }
    },
    required: ['summary', 'testsRun', 'testsPassed', 'testsFailed']
} as const;

/**
 * Generic output schema - fallback for any task type
 */
export const genericOutputSchema = {
    type: 'object',
    properties: {
        summary: {
            type: 'string',
            description: 'Summary of the task execution'
        },
        details: {
            type: 'string',
            description: 'Detailed information about the execution'
        },
        result: {
            type: 'string',
            enum: ['success', 'partial', 'failed'],
            description: 'Overall result of the task'
        },
        artifacts: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    type: { type: 'string' },
                    path: { type: 'string' },
                    description: { type: 'string' }
                }
            }
        }
    },
    required: ['summary', 'result']
} as const;

/**
 * Get the appropriate schema for a given lane
 */
export function getSchemaForLane(laneId: string) {
    switch (laneId) {
        case 'design':
            return { type: 'json_schema', schema: designOutputSchema } as const;
        case 'develop':
            return { type: 'json_schema', schema: developmentOutputSchema } as const;
        case 'test':
            return { type: 'json_schema', schema: testingOutputSchema } as const;
        default:
            return { type: 'json_schema', schema: genericOutputSchema } as const;
    }
}

/**
 * Get the output type for a given lane
 */
export function getOutputTypeForLane(laneId: string): 'design' | 'development' | 'testing' | 'generic' {
    switch (laneId) {
        case 'design':
            return 'design';
        case 'develop':
            return 'development';
        case 'test':
            return 'testing';
        default:
            return 'generic';
    }
}
