const express = require("express");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 8080;

const uri = process.env.MONGODB_URI;

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const logger = (req, res, next) => {
  console.log(`${req.method} | ${req.url}`);
  next();
};

const verifyToken = async (req, res, next) => {
  const { authorization } = req.headers;

  const token = authorization?.split(" ")[1];
  //   console.log(token);

  if (!token) {
    return res.status(401).json({ message: "Unauthorize" });
  }

  try {
    const JWKS = createRemoteJWKSet(
      new URL("http://localhost:3000/api/auth/jwks"),
    );
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;

    next();
  } catch (error) {
    console.error("Token validation failed:", error);
    return res.status(401).json({ message: "Unauthorize" });
  }
};

async function run() {
  try {
    const db = client.db("mediQueue");
    const coursesCollection = db.collection("courses");
    const enrollmentCollection = db.collection("enrollments");

    app.get("/courses", async (req, res) => {
   

      const { search } = req.query;

      let cursor;

      if (search) {
        cursor = await coursesCollection.find({
          $or: [
            {
              tutorName: {
                $regex: search,
                $options: "i",
              },
            },
            {
              subject: {
                $regex: search,
                $options: "i",
              },
            },
            {
              location: {
                $regex: search,
                $options: "i",
              },
            },
          ],
        });
      } else {
        cursor = coursesCollection.find();
      }

      const result = await cursor.toArray();
      //   console.log(result);

      res.send(result);
    });

    app.get("/featured", async (req, res) => {
      const cursor = coursesCollection.find().limit(4);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/courses/:courseId", logger, async (req, res) => {
   

      const { courseId } = req.params;
      //   console.log(courseId);
      const query = { _id: new ObjectId(courseId) };
      const result = await coursesCollection.findOne(query);
      res.send(result);
    });

    app.get("/enrollments/:userId", verifyToken, async (req, res) => {
      const { userId } = req.params;
      const result = await enrollmentCollection
        .find({ userId: userId })
        .toArray();
      res.send(result);
    });

    app.patch("/enrollments/:courseId", verifyToken, async (req, res) => {
  

      const { courseId } = req.params;
      const enrollmentData = req.body;

      const course = await coursesCollection.findOne({
        _id: new ObjectId(courseId),
      });
      console.log("Found Course:", course);

      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }
      await coursesCollection.updateOne(
        { _id: new ObjectId(courseId) },
        {
          $inc: { totalSlot: -1, enrollCount: 1 },
          $set: {
            lastEnrolledAt: new Date(),
          },
        },
      );
      //   console.log(enrollmentData);

      const result = await enrollmentCollection.insertOne({
        ...enrollmentData,

        courseId, //new

        subject: course.subject,
        tutorName: course.tutorName,
        enrolledAt: new Date(),
      });

      res.send(result);
    });

    // app.delete("/enrollments/:id", async (req, res) => {
    //   const { id } = req.params;
    //   const result = await enrollmentCollection.deleteOne({
    //     _id: new ObjectId(id),
    //   });
    //   res.send(result);
    // });

    app.delete("/enrollments/:id", async (req, res) => {
      const { id } = req.params;

      const enrollment = await enrollmentCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!enrollment) {
        return res.status(404).send({ message: "Not found" });
      }

      // delete enrollment
      await enrollmentCollection.deleteOne({
        _id: new ObjectId(id),
      });

      //restore slot
      await coursesCollection.updateOne(
        { _id: new ObjectId(enrollment.courseId) },
        {
          $inc: {
            totalSlot: 1,
          },
        },
      );

      res.send({ success: true });
    });

    //

    app.post("/courses", async (req, res) => {
      const course = req.body;

      const result = await coursesCollection.insertOne({
        ...course,
        totalSlot: Number(course.totalSlot || 0),
        enrollCount: 0,
        createdAt: new Date(),
      });

      res.send(result);
    });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Welcome to the Server");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
