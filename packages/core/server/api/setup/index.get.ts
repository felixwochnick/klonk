export default defineEventHandler(async () => ({ setupDone: await isSetupDone() }))
