require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId, Timestamp } = require('mongodb')
const jwt = require('jsonwebtoken')
const morgan = require('morgan')

const port = process.env.PORT || 9000
const app = express()
// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

app.use(express.json())
app.use(cookieParser())
app.use(morgan('dev'))

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token

  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err)
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded
    next()
  })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tp3bo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})
async function run() {
  try {
    // DB
    const db = client.db('PlantNet')
    // COLLECTIONS 
    const usersCollection = db.collection('users');
    const plantsCollection = db.collection('plants');
    const ordersCollection = db.collection('orders');


    // verify ADMIN middleware 
    const verifyAdmin = async (req, res, next) => {
      const email = req?.user?.email;
      const query = { email }
      const user = await usersCollection.findOne(query)

      if (!user || user?.role !== 'admin') return res.status(401).send({ message: 'UnAuthorize Access' })

      next()
    }
    // verify Seller middleware 
    const verifySeller = async (req, res, next) => {
      const email = req?.user?.email;
      const query = { email }
      const user = await usersCollection.findOne(query)

      if (!user || user?.role !== 'seller') return res.status(401).send({ message: 'UnAuthorize Access' })

      next()
    }


    // save or a user in db 
    app.post('/users/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      // check if user exists in db 
      const query = { email };
      const isExist = await usersCollection.findOne(query)
      if (isExist) {
        return res.send(isExist)
      }

      const result = await usersCollection.insertOne({
        ...user,
        role: 'customer',
        timestamp: Date.now()
      });
      res.send(result);
    })

    // manage user status and role 
    app.patch('/users/:email', verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email
      const query = { email }
      const user = await usersCollection.findOne(query)
      if (!user || user?.status === 'Requested') return res.status(400).send('You have already requested, Wait for some time')

      const updateDoc = {
        $set: {
          status: 'Requested'
        }
      }
      const result = await usersCollection.updateOne(query, updateDoc)
      res.send(result)

    })

    // get user role 
    app.get('/users/role/:email', verifyToken, async (req, res) => {
      const email = req.params.email
      const query = { email }
      const result = await usersCollection.findOne(query)
      res.send({ role: result?.role })
    })

    // update a user role 
    app.patch('/users/role/:email', verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email
      const { role } = req.body
      const filter = { email }
      const updateDoc = {
        $set: {
          role, status: "Verified"
        }
      }
      const result = await usersCollection.updateOne(filter, updateDoc)
      res.send(result)
    })


    // Generate jwt token
    app.post('/jwt', async (req, res) => {
      const email = req.body
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365d',
      })
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })
    })
    // Logout
    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          })
          .send({ success: true })
      } catch (err) {
        res.status(500).send(err)
      }
    })


    // get all user data
    app.get('/all-users/:email', verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email
      const query = { email: { $ne: email } }
      result = await usersCollection.find(query).toArray();
      res.send(result)
    })


    // add plant in db 
    app.post('/plants', verifyToken, verifySeller, async (req, res) => {
      const plant = req.body;
      const result = await plantsCollection.insertOne(plant);
      res.send(result)
    })

    // seller My inventory get all plant posts
    app.get('/plants/seller/', verifyToken, verifySeller, async (req, res) => {
      const email = req?.user?.email
      const query = { 'seller.email': email }
      const result = await plantsCollection.find(query).toArray()
      res.send(result)
    })


    // delete a plant from db by seller 
    app.delete('/plants/:id', verifyToken, verifySeller, async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await plantsCollection.deleteOne(query)
      res.send(result)
    })

    // get all plants
    app.get('/plants', async (req, res) => {
      const result = await plantsCollection.find().toArray();
      res.send(result);
    })

    // get a specific plant 
    app.get('/plant/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await plantsCollection.findOne(query)
      res.send(result)
    })


    // order collection 
    app.post('/orders', verifyToken, async (req, res) => {
      const orderInfo = req.body;
      const result = await ordersCollection.insertOne(orderInfo)
      res.send(result)
    })


    // manage plant quantity 
    app.patch('/plants/quantity/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const { quantityToUpdate, status } = req.body;

      const filter = { _id: new ObjectId(id) }

      let updatedDoc = {
        $inc: { quantity: -quantityToUpdate }
      }
      if (status === 'increase') {
        updatedDoc = {
          $inc: { quantity: quantityToUpdate }
        }
      }

      const result = await plantsCollection.updateOne(filter, updatedDoc)
      res.send(result)
    })

    app.get('/customer-orders/:email', verifyToken, async (req, res) => {
      const email = req.params.email
      const query = { 'customer.email': email }
      const result = await ordersCollection.aggregate([
        {
          $match: query, //Match specific customer data by email 
        },
        {
          $addFields: {
            plantId: { $toObjectId: '$plantId' } // Convert plantId string to ObjectId 
          }
        },
        {
          $lookup: {  // go to different collection and look for data
            from: 'plants', // Collection name
            localField: 'plantId', // local data that you want to match 
            foreignField: '_id', // foreign field name of the same data
            as: 'plants' // return the data as plant array (array naming)
          }
        },
        {
          $unwind: '$plants' // unwind lookup result, return without array
        },
        {
          $addFields: { // add this field in order object 
            name: '$plants.name', //
            category: '$plants.category',
            image: '$plants.imageUrl'
          }
        },
        {
          $project: {  // remove plants object property form order object 
            plants: 0,
          }
        }
      ]).toArray()
      res.send(result);
    })


    // cancel or delete and order 
    app.delete('/orders/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }

      // check product status - if delivered -> return 
      const order = await ordersCollection.findOne(query)
      if (order.status === 'delivered') return res.status(409).send(`Can't cancel once the product is delivered!!`)

      const result = await ordersCollection.deleteOne(query)
      res.send(result)
    })

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from plantNet Server..')
})

app.listen(port, () => {
  console.log(`plantNet is running on port ${port}`)
})
