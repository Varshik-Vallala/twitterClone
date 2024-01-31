const express = require("express");
const app = express();
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const path = require("path");
const jwt = require("jsonwebtoken");

app.use(express.json());

let db = null;

const dbPath = path.join(__dirname, "twitterClone.db");

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000");
    });
  } catch (error) {
    console.log(`DB Error ${error.message}`);
    process.exit(1);
  }
};

const authenticateToken = async (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT token");
  } else {
    jwt.verify(jwtToken, "RandomString", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT token");
      } else {
        next();
      }
    });
  }
};

//API 1

app.post("/register", async (request, response) => {
  const { username, password, name, gender } = request.body;
  //   console.log(request.body);
  const selectUserQuery = `
    SELECT * FROM user
    WHERE username = '${username}';
    `;
  //   console.log(selectUserQuery);
  const user = await db.get(selectUserQuery);
  //   console.log(user);
  if (user === undefined) {
    const hashedPassword = await bcrypt.hash(password, 10);
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const insertUserQuery = `
            INSERT INTO 
            user(name, username, password, gender)
            VALUES('${name}', '${username}', '${hashedPassword}', '${gender}');
            `;

      await db.run(insertUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API 2

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
    SELECT * FROM user
    WHERE username = '${username}';
    `;

  const user = await db.get(selectUserQuery);

  if (user === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (isPasswordMatch === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "RandomString");
      response.send({ jwtToken: jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API 3
app.get(
  "/user/tweets/feed/",
  authenticateToken,
  async (request, response) => {}
);

initializeDbAndServer();
