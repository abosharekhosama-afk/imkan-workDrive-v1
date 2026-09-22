import { apiRequest } from './client';
export type CollaborationOverview={notifications:any[];activities:any[];comments:any[]};
export const getCollaborationOverview=(limit=50)=>apiRequest<CollaborationOverview>(`/collaboration/overview?limit=${limit}`);
