import { BadRequestException, Injectable } from '@nestjs/common';

export type ConnectionProviderDefinition = {
  key: string;
  name: string;
  authTypes: string[];
  oauth: boolean;
  capabilities: string[];
};

const DEFINITIONS: ConnectionProviderDefinition[] = [
  { key: 'google', name: 'Google', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'revoke', 'probe'] },
  { key: 'microsoft', name: 'Microsoft', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'probe'] },
  { key: 'dropbox', name: 'Dropbox', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'revoke', 'probe'] },
  { key: 'rest', name: 'REST API', authTypes: ['API_KEY', 'BEARER', 'BASIC', 'CUSTOM_HEADER', 'NONE'], oauth: false, capabilities: ['request'] },
];

@Injectable()
export class ConnectionProviderRegistry {
  list() { return DEFINITIONS.map((x) => ({ ...x, authTypes: [...x.authTypes], capabilities: [...x.capabilities] })); }
  get(key: string) { const found = DEFINITIONS.find((x) => x.key === key); if (!found) throw new BadRequestException(`Unsupported connection provider: ${key}`); return found; }
  supports(key: string, authType: string) { const p = DEFINITIONS.find((x) => x.key === key); return !!p && p.authTypes.includes(authType); }
}
