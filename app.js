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
SELECT username, tweet, date_time AS dateTime 
FROM tweet AS T
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

  const selectUserFollowingQuery = `
    SELECT name
    FROM user AS U JOIN follower AS F
    ON F.following_user_id = U.user_id
    WHERE F.follower_user_id = '${user_id}';
    `;
  console.log(selectFollowingQuery);

  const userFollowing = await db.all(selectUserFollowingQuery);
  response.send(userFollowing);
});

//API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getIdQuery = `SELECT user_id from user WHERE username = '${username}'`;
  const { user_id } = await db.get(getIdQuery);
  //   console.log(user_id);

  const selectUserFollowersQuery = `
    SELECT name
    FROM user AS U JOIN follower AS F
    ON F.follower_user_id = U.user_id
    WHERE F.following_user_id = '${user_id}';
    `;
  //   console.log(selectFollowingQuery);

  const userFollowers = await db.all(selectUserFollowersQuery);
  response.send(userFollowers);
});

//API 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;

  const getIdQuery = `SELECT user_id from user WHERE username = '${username}'`;
  const { user_id } = await db.get(getIdQuery);

  const tweetsQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`;

  const tweetsResult = await db.get(tweetsQuery);
  //   response.send(tweetsResult);

  const userFollowingQuery = `
        SELECT 
           *

        FROM  follower INNER JOIN user ON user.user_id = follower.following_user_id 
       
        WHERE 
            follower.follower_user_id  = ${user_id} 
    ;`;

  const userFollowing = await db.all(userFollowingQuery);
  // response.send(userFollowers);

  if (
    userFollowing.some(
      (item) => item.following_user_id === tweetsResult.user_id
    )
  ) {
    // console.log(tweetsResult);
    // console.log("-----------");
    // console.log(userFollowers);

    const getTweetDetailsQuery = `
            SELECT
                tweet,
                COUNT(DISTINCT(like.like_id)) AS likes,
                COUNT(DISTINCT(reply.reply_id)) AS replies,
                tweet.date_time AS dateTime
            FROM 
                tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
            WHERE 
                tweet.tweet_id = ${tweetId} AND tweet.user_id=${userFollowing[0].user_id}
            ;`;

    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API 7

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getIdQuery = `SELECT user_id from user WHERE username = '${username}'`;
    const { user_id } = await db.get(getIdQuery);

    const getTweetQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId};`;
    const tweet = await db.get(getTweetQuery);

    const userFollowingQuery = `
    SELECT * FROM user 
    JOIN follower ON user.user_id = follower.following_user_id
    WHERE follower.follower_user_id = ${user_id}`;

    const userFollowing = await db.all(userFollowingQuery);
    const namesArray = [];

    if (userFollowing.some((item) => item.user_id === tweet.user_id)) {
      const likedUsersQuery = `
        SELECT name from like join user on user.user_id = like.user_id
        where tweet_id = ${tweetId};
        `;
      const names = await db.all(likedUsersQuery);
      names.map((nameObj) => namesArray.push(nameObj.name));
      response.send({ likes: namesArray });
    } else {
      response.status(400);
      response.send("Invalid Request");
    }
  }
);

//API 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getIdQuery = `SELECT user_id from user WHERE username = '${username}'`;
    const { user_id } = await db.get(getIdQuery);

    const getTweetQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId};`;
    const tweet = await db.get(getTweetQuery);

    const userFollowingQuery = `
    SELECT * FROM user 
    JOIN follower ON user.user_id = follower.following_user_id
    WHERE follower.follower_user_id = ${user_id}`;

    const userFollowing = await db.all(userFollowingQuery);
    if (userFollowing.some((item) => item.user_id === tweet.user_id)) {
      const repliedUsersQuery = `
        SELECT name, reply from reply join user on user.user_id = reply.user_id
        where tweet_id = ${tweetId};
        `;
      const replies = await db.all(repliedUsersQuery);
      response.send({ replies: replies });
      //   names.map((nameObj) => namesArray.push(nameObj.name));
      //   response.send({ likes: namesArray });
    } else {
      response.status(400);
      response.send("Invalid Request");
    }
  }
);

// API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getIdQuery = `SELECT user_id from user WHERE username = '${username}'`;
  const { user_id } = await db.get(getIdQuery);

  const userTweetsQuery = `
      SELECT tweet, count(distinct(like.like_id)) AS likes, count(distinct(reply.reply_id)) as replies, tweet.date_time as dateTime FROM tweet
      join like on tweet.tweet_id = like.tweet_id
      join reply on tweet.tweet_id = reply.tweet_id
      where tweet.user_id = ${user_id}
      group by tweet.tweet_id;
      `;

  //   const userTweetsQuery = `
  // SELECT t.tweet_id, t.tweet, t.user_id, t.date_time,
  // r.reply_id, r.reply, r.tweet_id, r.user_id FROM tweet as t
  // join reply as r on t.tweet_id = r.tweet_id
  // where t.user_id = ${user_id};
  // `;
  const tweets = await db.all(userTweetsQuery);
  response.send(tweets);
});

function getCurrentDateTime() {
  const now = new Date();

  // Get the year, month, and day
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0"); // Months are zero-based
  const day = String(now.getDate()).padStart(2, "0");

  // Get the hours, minutes, and seconds
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  // Format the date and time
  const formattedDateTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

  return formattedDateTime;
}

//API 10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getIdQuery = `SELECT user_id from user WHERE username = '${username}'`;
  const { user_id } = await db.get(getIdQuery);
  const getTweets = `SELECT * FROM tweet;`;
  const { tweet } = request.body;

  const allTweets = await db.all(getTweets);

  const createTweetQuery = `
    insert into tweet(tweet_id, tweet, user_id, date_time)
    values(${
      allTweets.length + 1
    }, '${tweet}', ${user_id}, '${getCurrentDateTime()}'  )
    `;

  await db.run(createTweetQuery);

  response.send("Created a Tweet");

  console.log(await db.all(getTweets));
});

//API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getIdQuery = `SELECT user_id from user WHERE username = '${username}'`;
    const { user_id } = await db.get(getIdQuery);

    const getTweetQuery = `SELECT user_id from tweet where tweet_id = ${tweetId};`;

    const id = await db.get(getTweetQuery);

    if (id.user_id === user_id) {
      const deleteTweet = `
    delete from tweet 
    where user_id = ${user_id} AND tweet_id = ${tweetId};
    `;
      await db.run(deleteTweet);
      response.send("Tweet deleted");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

initializeDbAndServer();
module.exports = app;
