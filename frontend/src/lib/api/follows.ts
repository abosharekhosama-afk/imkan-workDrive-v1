import { apiRequest } from './client';
import type { ResourceType } from './types';

export type FollowRecord = {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  createdAt: string;
};

export function listFollows() {
  return apiRequest<FollowRecord[]>('/follows');
}

export function followResource(resourceType: ResourceType, resourceId: string) {
  return apiRequest(`/follows/${resourceType}/${resourceId}`, { method: 'POST' });
}

export function unfollowResource(resourceType: ResourceType, resourceId: string) {
  return apiRequest(`/follows/${resourceType}/${resourceId}`, { method: 'DELETE' });
}
