# Architecture Dependency Map

## Execution Order
1. **Infrastructure**: MySQL, MinIO, BullMQ (Redis).
2. **Database Schema**: Must be created via Prisma before any backend services.
3. **Core Services**: Auth Service -> Storage Service -> Permission Service.
4. **API Endpoints**: Depend on Core Services.
5. **Frontend**: Depends on API Endpoints and IMKAN One UI tokens.
