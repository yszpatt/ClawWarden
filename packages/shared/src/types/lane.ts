export interface Lane {
    id: string;
    name: string;
    order: number;
    color: string;
}

export const DEFAULT_LANES: Lane[] = [
    { id: 'design', name: '设计', order: 0, color: '#8B5CF6' },
    { id: 'develop', name: '开发', order: 1, color: '#3B82F6' },
    { id: 'test', name: '测试', order: 2, color: '#10B981' },
    { id: 'pending-merge', name: '待合并', order: 3, color: '#F59E0B' },
    { id: 'archived', name: '已归档', order: 4, color: '#6B7280' },
    { id: 'deprecated', name: '已废弃', order: 5, color: '#EF4444' },
];
