
export interface FsItem {
    name: string;
    path: string;
    isDirectory: boolean;
}

export interface FsListResponse {
    currentPath: string;
    items: FsItem[];
}
