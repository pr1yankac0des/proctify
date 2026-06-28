import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 })

;(async () => {
  try {
    await client.connect()
    const db = client.db('academyflow')
    const col = db.collection('store')
    const exists = await col.findOne({ _id: 'main' })
    if (!exists) {
      await col.insertOne({ _id: 'main', tests: [], submissions: [], students: [], pendingVerifications: [] })
      console.log('Inserted store document')
    } else {
      console.log('Store document already exists')
    }
    await client.close()
  } catch (err) {
    console.error('error:', err.message)
    process.exit(1)
  }
})()
