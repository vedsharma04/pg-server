const express = require("express");
const moment = require("moment");
const bodyParser = require("body-parser");
const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "db.yygghtcyodceevrjkfce.supabase.co",
  database: "postgres",
  password: "TZExf5jrJK5VeY9z",
  port: 5432, // default PostgreSQL port
});

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

pool.connect((err, client, done) => {
  if (err) throw err;
  console.log("Connected to PostgreSQL database");

  app.listen(3000, () => {
    console.log("Server is running on port 3000");
  });

  app.get("/users/:status", (req, res) => {
    let query = "SELECT * FROM users";
    if (["active", "inactive"].includes(req.params.status)) {
      query += ` WHERE status = '${req.params.status}'`;
    }
    pool.query(query, (error, result) => {
      if (error) {
        console.log(error);
        return res.status(200).json([]);
      }
      return res.status(200).json(result.rows);
    });
  });

  app.get("/orders/:empId", (req, res) => {
    console.log(
      req.params.empId,
      `SELECT * FROM orders where user_id = ${req.params.empId}`
    );
    pool.query(
      `SELECT * FROM orders where user_id = ${req.params.empId}`,
      (error, result) => {
        if (error) {
          console.log(error);
          return res.status(200).json([]);
        }
        return res.status(200).json(result.rows);
      }
    );
  });

  app.get("/inventory", (req, res) => {
    pool.query(
      `SELECT u.user_name,i.* FROM inventory i JOIN users u ON u.user_id=i.user_id`,
      (error, result) => {
        if (error) {
          console.log(error);
          return res.status(200).json([]);
        }
        return res.status(200).json(result.rows);
      }
    );
  });

  app.get("/inventory/device-not-present", (req, res) => {
    pool.query(
      `SELECT * FROM users WHERE user_id NOT IN ( SELECT user_id FROM inventory WHERE user_id IS NOT NULL);`,
      (error, result) => {
        if (error) {
          console.log(error);
          return res.status(200).json([]);
        }
        return res.status(200).json(result.rows);
      }
    );
  });

  app.get("/leaves/:date", (req, res) => {
    let startDate = moment(req.params.date, "YYYY-MM-DD").toDate();
    let endDate = moment(req.params.date, "YYYY-MM-DD").add(1, "d").toDate();
    console.log(
      `SELECT u.user_name FROM leaves l JOIN users u ON u.user_id=l.user_id where l.date BETWEEN ${startDate} AND ${endDate}`
    );
    pool.query(
      `SELECT u.user_name ,l.reason,l.status,l.date FROM leaves l JOIN users u ON u.user_id=l.user_id where l.date BETWEEN $1 AND $2`,
      [startDate, endDate],
      (error, result) => {
        if (error) {
          console.log(error);
          return res.status(200).json([]);
        }
        return res.status(200).json(result.rows);
      }
    );
  });

  app.get("*", (req, res) => {
    console.log("received request", req.url);
  });
});
