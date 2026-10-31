import { resetData } from './db'

export default async function globalSetup() {
  await resetData()
}
