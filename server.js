//imports
import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import multer from 'multer'
import GridFsStorage from 'multer-gridfs-storage'
import Grid from 'gridfs-stream'
import bodyParser from 'body-parser'
import path from 'path'
import Pusher from 'pusher'
import Posts from './postModel.js'
import { v2 as cloudinary } from 'cloudinary'
require('dotenv').config()

// Make sure you fill your environment variables in .env file
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
});

//app config
Grid.mongo = mongoose.mongo
const app = express()
const port = process.env.PORT || 9000
const connection_url = 'mongodb+srv://jamstanleyambe:.@cluster1.aihacgp.mongodb.net/?retryWrites=true&w=majority'

const pusher = new Pusher({
    appId: "1175223",
    key: "e6b78845a265315af885",
    secret: "1ad6b85049db7e2d7f21",
    cluster: "ap2",
    useTLS: true
});

//middleware
app.use(bodyParser.json())
app.use(cors())

//DB Config
const connection = mongoose.createConnection(connection_url, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true
})

let gfs

connection.once('open', () => {
    console.log('DB Connected')
    gfs = Grid(connection.db, mongoose.mongo)
    gfs.collection('images')
})

const storage = new GridFsStorage({
    url: connection_url,
    file: (req, file) => {
        return new Promise((resolve, reject) => {
            const filename = `image-${Date.now()}${path.extname(file.originalname)}`
            const fileInfo = {
                filename: filename,
                bucketName: 'images'
            }
            resolve(fileInfo)
        })
    }
})

// cloudinary method to upload image
const uploadImageToCloudinary = (file) => {
    return new Promise((resolve, reject) => {
      const filename = `image-${Date.now()}${path.extname(file.originalname)}`;
      const uploadOptions = {
        folder: 'images',
        public_id: filename,
        overwrite: true,
      };
  
      cloudinary.uploader.upload(file.path, uploadOptions, (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result.secure_url); // Return the secure URL of the uploaded image
        }
      });
    });
  };

const upload = multer({ storage })

mongoose.connect(connection_url, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true
})

mongoose.connection.once('open', () => {
    console.log('DB Connected for pusher')
    const changeStream = mongoose.connection.collection('posts').watch()
    changeStream.on('change', change => {
        console.log(change)
        if (change.operationType === "insert") {
            console.log('Trigerring Pusher')
            pusher.trigger('posts', 'inserted', {
                change: change
            })
        } else {
            console.log('Error trigerring Pusher')
        }
    })
})


//api routes
app.get("/", (req, res) => res.status(200).send("Hello TheWebDev"))

// new route added to upload image using cloudinary
app.post('/upload', async (req, res) => {
    try {
      const imageUrl = await uploadImageToCloudinary(req.file);
      res.status(200).json({ imageUrl });
    } catch (error) {
      res.status(500).json({ error: 'Image upload failed' });
    }
  });

app.post('/upload/image', upload.single('file'), (req, res) => {
    res.status(201).send(req.file)
})

app.get('/images/single', (req, res) => {
    gfs.files.findOne({ filename: req.query.name }, (err, file) => {
        if (err) {
            res.status(500).send(err)
        } else {
            if (!file || file.length === 0) {
                res.status(404).json({ err: 'file not found' })
            } else {
                const readstream = gfs.createReadStream(file.filename)
                readstream.pipe(res)
            }
        }
    })
})

app.post('/upload/post', (req, res) => {
    const dbPost = req.body
    Posts.create(dbPost, (err, data) => {
        if (err)
            res.status(500).send(err)
        else
            res.status(201).send(data)
    })
})

app.get('/posts', (req, res) => {
    Posts.find((err, data) => {
        if (err) {
            res.status(500).send(err)
        } else {
            data.sort((b, a) => a.timestamp - b.timestamp)
            res.status(200).send(data)
        }
    })
})


//listen
app.listen(port, () => console.log(`Listening on localhost: ${port}`))
