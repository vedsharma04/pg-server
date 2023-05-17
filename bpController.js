const express = require("express");
const router = express.Router();
const moment = require("moment");
const { isEmpty } = require("lodash");

// #V1
// router.post("/leaves", async (req, res) => {
//   // Handle the GET request
//   // req.body;
//   try {
//     const { name = [], date = "", type = "", intent = "" } = req.body.data;
//     console.log(req.body.data);
//     const currentDate = moment().utc();
//     console.log(currentDate);
//     let startDate = "";
//     let endDate = "";
//     let query = "";

//     if (intent == "public_holiday") {
//       query = "SELECT * from public_holiday ";
//     } else {
//       query =
//         "SELECT u.user_name FROM leaves l JOIN users u ON u.user_id=l.user_id ";

//       if (
//         [
//           "tomorrow",
//           "next day",
//           "next_day",
//           "upcoming_day",
//           "current+1",
//         ].includes(date)
//       ) {
//         startDate = currentDate.add(1, "day");
//         endDate= startDate
//       }

//       query += `where l.date  BETWEEN $1 AND $2`;
//     }
//     console.log(startDate,endDate)
//     console.log(query, [
//       startDate.utc().startOf("day").toDate(),
//       endDate.utc().endOf("day").toDate(),
//     ]);

//     global.pool.query(
//       query,
//       [
//         startDate.utc().startOf("day").toDate(),
//         endDate.utc().endOf("day").toDate(),
//       ],
//       (error, result) => {
//         if (error) {
//           console.error("Error executing query:", error);
//           return res.status(500).json({ error: "Error executing query" });
//         } else {
//           console.log(result.rows);

//           return res.status(200).json(result.rows);
//         }
//       }
//     );
//     //res.send("This is the leave route");
//   } catch (err) {
//     console.log(err);
//     return res.status(500).json({ error: "Error executing query" });
//   }
// });

// #V2
router.post("/leaves", async (req, res) => {
  try {
    const { name = [], date = "", type = "", intent = "" } = req.body;

    let query = "";
    const currentDate = moment().utc();

    //Diff between public and leave query

    if (
      ["ph+next", "ph+all", "ph+rem"].includes(date) ||
      ["list_public_holiday"].includes(intent) || ['public_holiday'].includes(type)
    ) {
      //PUBLIC HOLIDAY
      if (intent == "list_public_holiday") {
        // intent --> list_public_holiday
        query =
          "SELECT holiday_name, TO_CHAR(holiday_date, 'DD-MM-YYYY') AS formatted_date from public_holiday";
      } else {
        // intent --> number
        query = "SELECT COUNT(*) AS holiday_count from public_holiday";
      }
      query += ` where holiday_date BETWEEN $1 AND $2`;
    } else {
      // LEAVES
      if (intent == "number") {
        // intent --> number
        query =
          "SELECT COUNT(*) AS people_on_leave FROM leaves l JOIN users u ON u.user_id=l.user_id";
      } else if (intent == "peopleWithDates") {
        // intent --> peopleWithDates
        query =
          "SELECT u.user_name, TO_CHAR(l.date, 'DD-MM-YYYY') AS leave_date FROM leaves l JOIN users u ON u.user_id=l.user_id";
      } else {
        // intent --> people
        query =
          "SELECT STRING_AGG(u.user_name, ',') AS user_names FROM leaves l JOIN users u ON u.user_id=l.user_id";
      }
      query += ` where l.date  BETWEEN $1 AND $2`;
    }

    //Date Operations
    const { startDate, endDate } = interpretDateString(date);

    //Name Operations
  
    let name1=name.replace(/'/g, '"');
    if(Array.isArray(JSON.parse(name1)) && !isEmpty(JSON.parse(name1))){
      let formattedUsernames = JSON.parse(name1).map(username => `'${username}'`).join(', ');
      query+= ` AND u.user_name IN (${formattedUsernames})`;
    }

    if(date =='ph+next'){query+= ' ORDER BY holiday_date LIMIT 1'}

    console.log(query,[startDate,endDate])
    // Pool Selection
    global.pool.query(
            query,
            [
              startDate,
              endDate,
            ],
            (error, result) => {
              if (error) {
                console.error("Error executing query:", error);
                return res.status(500).json({ error: "Error executing query" });
              } else {
                console.log(result.rows);
                return res.status(200).json(result.rows);
              }
            }
          );
  } catch (err) {
    console.log(err, err.message);
    return res.status(400).json({ error: "Error executing query" });
  }
});

const interpretDateString = (value) => {
  let startDate = moment().utc();
  let endDate = moment().utc();

  if (isEmpty(value)) {
    startDate = startDate.startOf("day").toDate();
    endDate = endDate.add(1, "week").endOf("day").toDate();
  }

  if (value.startsWith("current")) {
    if (value.endsWith("+0")) {
      startDate = startDate.startOf("day").toDate();
      endDate = endDate.endOf("day").toDate();
    } else if (value.endsWith("currentw")) {
      startDate = startDate.startOf("week").toDate();
      endDate = endDate.endOf("week").toDate();
    } else if (value.endsWith("currentm")) {
      startDate = startDate.startOf("month").toDate();
      endDate = endDate.endOf("month").toDate();
    } else {
      //MATCH +1 -1
      const pattern1 = /current(\+|-)(\d+)/;
      const match1 = value.match(pattern1);
      if (match1) {
        const operator = match1[1];
        const diff = parseInt(match1[2]);
        if (operator == "+") {
          startDate = startDate.add(diff, "day").startOf("day").toDate();
          endDate = endDate.add(diff, "day").endOf("day").toDate();
        } else {
          startDate = startDate.subtract(diff, "day").startOf("day").toDate();
          endDate = endDate.subtract(diff, "day").endOf("day").toDate();
        }
      }

      //MATCH +w -m
      const pattern2 = /current(\+|-)([mw])/;
      const match2 = value.match(pattern2);
      if (match2) {
        const operator = match2[1];
        const diff = match2[2] == "m" ? "month" : "week";
        if (operator == "+") {
          startDate = startDate.add(1, diff).startOf(diff).toDate();
          endDate = endDate.add(1, diff).endOf(diff).toDate();
        } else {
          startDate = startDate.subtract(1, diff).startOf(diff).toDate();
          endDate = endDate.subtract(1, diff).endOf(diff).toDate();
        }
      }

      //MATCH d1 d4
      const pattern4 = /currentd(\d+)/;
      const match4 = value.match(pattern4);

      if (match4) {
        const number = match4[1];
        startDate = startDate.weekday(`${number}`).startOf("day").toDate();
        endDate = endDate.weekday(`${number}`).endOf("day").toDate();
      }

      //MATCH +d1 -d3
      const pattern3 = /current(\+|-)d(\d+)/;
      const match3 = value.match(pattern3);

      if (match3) {
        const operator = match3[1];
        const diff = parseInt(match3[2]);
        if (operator == "+") {
          startDate = startDate
            .weekday(`${operator}${diff}`)
            .add(1, "week")
            .startOf("day")
            .toDate();
          endDate = endDate
            .weekday(`${operator}${diff}`)
            .add(1, "week")
            .endOf("day")
            .toDate();
        } else {
          startDate = startDate
            .weekday(`${operator}${7 - diff}`)
            .startOf("day")
            .toDate();
          endDate = endDate
            .weekday(`${operator}${7 - diff}`)
            .endOf("day")
            .toDate();
        }
      }
    }
  } else if (value.startsWith("range")) {
    const datePattern = /range(\d{4}-\d{2}-\d{2})to(\d{4}-\d{2}-\d{2})/;
    const matches = value.match(datePattern);

    if (matches && matches.length === 3) {
      startDate = moment(matches[1]).startOf("day").toDate();
      endDate = moment(matches[2]).endOf("day").toDate();
    } else {
      throw "Invalid pattern received for date";
    }
  } else if (value.startsWith("ph")) {
    if (value == "ph+next") {
        startDate = startDate.startOf("day").toDate();
        endDate = endDate.endOf("year").toDate();
    } else if (value == "ph+all") {
        startDate = startDate.startOf("year").toDate();
        endDate = endDate.endOf("year").toDate();
    } else {
        startDate = startDate.startOf("day").toDate();
        endDate = endDate.endOf("year").toDate();
    }
  }

  return { startDate, endDate };
};

module.exports = router;
