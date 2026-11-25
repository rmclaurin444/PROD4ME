import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
// migration history: how many + which are applied? A manual reset+redeploy
// would have every migration applied AFTER the wipe timestamp.
const migrations = await p.$queryRaw`SELECT migration_name, finished_at, applied_steps_count FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 6`
console.log(JSON.stringify(migrations, null, 1))
await p.$disconnect()
