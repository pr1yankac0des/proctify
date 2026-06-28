import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 })

;(async () => {
  try {
    await client.connect()
    const db = client.db('academyflow')
    const doc = await db.collection('store').findOne({ _id: 'main' })
    console.log('connected: true')
    console.log('store doc found:', !!doc)
    console.log(doc)
    await client.close()
  } catch (err) {
    console.error('error:', err.message)
    process.exit(1)
  }
})()
