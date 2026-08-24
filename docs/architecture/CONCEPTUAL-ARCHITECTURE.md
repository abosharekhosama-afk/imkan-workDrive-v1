# Conceptual Architecture

## Tiered Architecture
1. **Client Tier:** Web Browser / Desktop Client (TrueSync) / Mobile App.
2. **API Gateway / Load Balancer:** Routes requests, handles TLS termination, rate limiting.
3. **Application Tier:** Stateless API instances. Validates requests, enforces RBAC, orchestrates storage and DB calls.
4. **Data Tier:** 
   - Relational Database (MySQL 8.x) for ACID transactions on metadata.
   - Object Storage for scalable, immutable blob storage.
   - (Optional) Redis for caching sessions and hot directory metadata.
