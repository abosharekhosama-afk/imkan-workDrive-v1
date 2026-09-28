import { apiRequest } from './client';
import type { ResourceType } from './types';

export type FollowRecord = {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  notifyBell: boolean;
  notifyEmail: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FollowPreferences = { notifyBell: boolean; notifyEmail: boolean };

export function listFollows() {
  return apiRequest<FollowRecord[]>('/follows');
}

export function followResource(resourceType: ResourceType, resourceId: string, preferences: FollowPreferences = { notifyBell: true, notifyEmail: false }) {
  return apiRequest<FollowRecord>(`/follows/${resourceType}/${resourceId}`, { method: 'POST', body: JSON.stringify(preferences) });
}

export function updateFollowPreferences(resourceType: ResourceType, resourceId: string, preferences: FollowPreferences) {
  return apiRequest<FollowRecord>(`/follows/${resourceType}/${resourceId}`, { method: 'PATCH', body: JSON.stringify(preferences) });
}

export function unfollowResource(resourceType: ResourceType, resourceId: string) {
  return apiRequest(`/follows/${resourceType}/${resourceId}`, { method: 'DELETE' });
}
