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
        request.username = payload.username;
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
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getIdQuery = `SELECT user_id from user WHERE username = '${username}'`;
  const { user_id } = await db.get(getIdQuery);

  const selectQuery = `
SELECT username, tweet, date_time AS dateTime FROM tweet AS T
JOIN follower AS F ON T.user_id = F.following_user_id
JOIN user AS U on F.following_user_id = U.user_id
WHERE F.follower_user_id = ${user_id}
ORDER BY T.date_time DESC
LIMIT 4;
`;

  const tweets = await db.all(selectQuery);
  response.send(tweets);
});

//API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getIdQuery = `SELECT user_id from user WHERE username = '${username}'`;
  const { user_id } = await db.get(getIdQuery);
  console.log(user_id);

  const selectFollowingQuery = `
    SELECT name
    FROM user AS U JOIN follower AS F
    ON F.following_user_id = U.user_id
    WHERE F.follower_user_id = '${user_id}';
    `;
  console.log(selectFollowingQuery);

  const following = await db.all(selectFollowingQuery);
  response.send(following);
});

//API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getIdQuery = `SELECT user_id from user WHERE username = '${username}'`;
  const { user_id } = await db.get(getIdQuery);
  //   console.log(user_id);

  const selectFollowingQuery = `
    SELECT name
    FROM user AS U JOIN follower AS F
    ON F.follower_user_id = U.user_id
    WHERE F.following_user_id = '${user_id}';
    `;
  //   console.log(selectFollowingQuery);

  const following = await db.all(selectFollowingQuery);
  response.send(following);
});

//API 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;

  const getIdQuery = `SELECT user_id from user WHERE username = '${username}'`;
  const { user_id } = await db.get(getIdQuery);

  //   const getUserFollowingTweetQuery = `SELECT
  //     t.tweet AS tweet,
  //     COUNT(l.tweet_id) AS likes,
  //     COUNT(r.reply_id) AS replies,
  //     t.date_time AS dateTime
  // FROM
  //     tweet t
  // JOIN
  //     follower f ON t.user_id = f.following_user_id
  // LEFT JOIN
  //     like l ON t.tweet_id = l.tweet_id
  // LEFT JOIN
  //     reply r ON t.tweet_id = r.tweet_id
  // WHERE
  //     f.follower_user_id = :userId
  // GROUP BY
  //     t.tweet_id, t.tweet, t.date_time;
  // ORDER BY
  //     t.date_time DESC
  // LIMIT 1;`;

  //   const userFollowingTweet = await db.get(getUserFollowingTweetQuery);
  //   response.send(userFollowingTweet);

  const tweetsQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`;
  const tweetsResult = await db.get(tweetsQuery);
  //   response.send(tweetsResult);

  const userFollowersQuery = `
        SELECT 
           *

        FROM  follower INNER JOIN user ON user.user_id = follower.following_user_id 
       
        WHERE 
            follower.follower_user_id  = ${user_id} 
    ;`;

  const userFollowers = await db.all(userFollowersQuery);
  // response.send(userFollowers);

  if (
    userFollowers.some(
      (item) => item.following_user_id === tweetsResult.user_id
    )
  ) {
    console.log(tweetsResult);
    console.log("-----------");
    console.log(userFollowers);

    const getTweetDetailsQuery = `
            SELECT
                tweet,
                COUNT(DISTINCT(like.like_id)) AS likes,
                COUNT(DISTINCT(reply.reply_id)) AS replies,
                tweet.date_time AS dateTime
            FROM 
                tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
            WHERE 
                tweet.tweet_id = ${tweetId} AND tweet.user_id=${userFollowers[0].user_id}
            ;`;

    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});
initializeDbAndServer();
module.exports = app;
