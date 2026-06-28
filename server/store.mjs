import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI
const USE_LOCAL_DATA = process.env.DATA_STORE === 'local'
const DB_NAME = 'academyflow'
const COLLECTION = 'store'

let client = null
let db = null

const DEFAULT_DATA = {
  tests: [],
  attempts: [],
  submissions: [],
  students: [],
  pendingVerifications: [],
}

export async function connectDB() {
  if (USE_LOCAL_DATA || !MONGODB_URI) {
    console.warn('⚠️  MONGODB_URI not set — falling back to local data.json')
    return false
  }
  try {
    client = new MongoClient(MONGODB_URI, {
      // Docker Desktop's network layer (especially on Windows/WSL2) adds
      // latency to outbound connections; the default 5s window can be too
      // tight for the Atlas TLS handshake to complete.
      serverSelectionTimeoutMS: 15000,
      tls: true,
    })
    await client.connect()
    db = client.db(DB_NAME)
    // Ensure the store document exists
    const exists = await db.collection(COLLECTION).findOne({ _id: 'main' })
    if (!exists) {
      await db.collection(COLLECTION).insertOne({ _id: 'main', ...DEFAULT_DATA })
    }
    console.log('✅  Connected to MongoDB Atlas')
    return true
  } catch (err) {
    console.error('❌  MongoDB connection failed:', err.message)
    db = null
    return false
  }
}

export async function readData() {
  if (!db) {
    console.log('readData: using local data (db not set)')
    return readLocalData()
  }
  try {
    console.log('readData: using MongoDB')
    const doc = await db.collection(COLLECTION).findOne({ _id: 'main' })
    if (!doc) return { ...DEFAULT_DATA }
    return {
      tests: doc.tests ?? [],
      attempts: doc.attempts ?? [],
      submissions: doc.submissions ?? [],
      students: doc.students ?? [],
      pendingVerifications: doc.pendingVerifications ?? [],
    }
  } catch (err) {
    console.error('readData error:', err.message)
    throw err
  }
}

export async function writeData(data) {
  if (!db) {
    console.log('writeData: using local data (db not set)')
    return writeLocalData(data)
  }
  try {
    console.log('writeData: using MongoDB')
    await db.collection(COLLECTION).replaceOne(
      { _id: 'main' },
      { _id: 'main', ...data },
      { upsert: true }
    )
  } catch (err) {
    console.error('writeData error:', err.message)
    throw err
  }
}

// ─── Local JSON fallback (dev without MongoDB) ────────────────────────────────

import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_PATH = process.env.DATA_PATH ? resolve(process.env.DATA_PATH) : join(__dirname, 'data.json')

function readLocalData() {
  if (!existsSync(DATA_PATH)) return { ...DEFAULT_DATA }
  try {
    const raw = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
    return {
      tests: raw.tests ?? [],
      attempts: raw.attempts ?? [],
      submissions: raw.submissions ?? [],
      students: raw.students ?? [],
      pendingVerifications: raw.pendingVerifications ?? [],
    }
  } catch (error) {
    throw new Error(`Local data file is invalid: ${error.message}`)
  }
}

function writeLocalData(data) {
  const temporaryPath = `${DATA_PATH}.tmp`
  writeFileSync(temporaryPath, JSON.stringify(data, null, 2))
  renameSync(temporaryPath, DATA_PATH)
}

export function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
