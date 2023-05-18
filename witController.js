const express = require("express");
const router = express.Router();
const axios = require("axios");
const moment = require("moment");
const { isEmpty, get } = require("lodash");

const totalLeaves = 10;

router.post("/leaves", async (req, res) => {
  const { rawText = "" } = req.body;

  //CALL WIT API
  let config = {
    method: "get",
    maxBodyLength: Infinity,
    url: `https://api.wit.ai/message?v=${moment()
      .utc()
      .format("YYYYMMD")}&q=${encodeURIComponent(rawText)}`,
    headers: {
      Authorization: "Bearer CBS4VBTWVOHMKZVLCPY4L2NJOYYIQLOC",
    },
  };

  let witResponse = await axios
    .request(config)
    .then((response) => {
      console.log("WIT Response --> ", JSON.stringify(response.data));
      return response.data;
      return res.status(200).json(response.data);
    })
    .catch((error) => {
      console.log(error);
      return {};
      //   return res.status(400).json(error);
    });
  let query = "";
  let completeQuery = "";
  let startDate = moment().utc();
  let endDate = moment().utc();

  //CATEGORIZE THE INTENTS
  let intent = get(witResponse, "intents[0].name", null);
  let nameEntity = get(witResponse, "entities.name:name", {});
  let timeEntity = get(witResponse, "entities.wit$datetime:datetime", {});
  let comparisionEntity = get(
    witResponse,
    "comparison_factor:comparison_factor[0].value",
    "most"
  );

  //Destructure intent / enteties

  let { startTime, endTime, isTimePresent } = resolveTimeEntity(
    timeEntity,
    intent
  );
  startDate = startTime;
  endDate = endTime;

  let name = !isEmpty(nameEntity) ? getNameString(nameEntity) : "";

  if (!isEmpty(intent)) {
    if (intent == "get_public_holiday") {
      query =
        "SELECT holiday_name, TO_CHAR(holiday_date, 'DD-MM-YYYY') AS formatted_date from public_holiday";
      query += ` where holiday_date BETWEEN $1 AND $2`;
    } else {
      if (["get_leave", "get_leave_people"].includes(intent)) {
        query =
          "SELECT u.user_name, TO_CHAR(l.date, 'DD-MM-YYYY') AS leave_date FROM leaves l JOIN users u ON u.user_id=l.user_id";
      } else if (intent == "check_leave_people") {
        completeQuery = `SELECT
            CASE
              WHEN EXISTS (
                SELECT
                  1
                FROM
                  leaves l
                  JOIN users u ON u.user_id = l.user_id
                where
                  l.date BETWEEN $1 AND $2
                  AND u.user_name ILIKE ANY (ARRAY[${name}])
              ) THEN 'Yes'
              ELSE 'No'
            END AS ON_LEAVE;`;
      } else if (intent == "get_leave_count") {
        query = `SELECT (${totalLeaves} - COUNT(*)) AS  leaves_left FROM leaves l JOIN users u ON u.user_id=l.user_id`;
      } else if (intent == "get_leave_people_past") {
        completeQuery = `SELECT
        u.user_name,
        TO_CHAR(l.date, 'DD-MM-YYYY') AS leave_date
      FROM
        leaves l
        JOIN users u ON u.user_id = l.user_id
      where
        l.date BETWEEN $1 AND $2
        AND u.user_name ILIKE ANY (ARRAY[${name}])
      ORDER BY
        l.date
      LIMIT
        1`;
      } else if (intent == "get_leave_comparision") {
        let comp = comparisionEntity == "most" ? "desc" : "asc";
        completeQuery = `SELECT u.user_name, COUNT(*) AS leave_count
        FROM  leaves l JOIN users u ON u.user_id=l.user_id
        WHERE l.date BETWEEN $1 AND $2
        GROUP BY u.user_name
        ORDER BY leave_count ${comp}
        limit 1`;
      }
      query += ` where l.date  BETWEEN $1 AND $2`;
    }
  } else {
    return res.status(200).json("unable to get intent from the text");
  }

  if (!isEmpty(nameEntity)) {
    // query += ` AND u.user_name IN (${name})`; OLD QUERY
    query += ` AND u.user_name ILIKE ANY (ARRAY[${name}])`;
  }

  if (!isEmpty(completeQuery)) {
    query = completeQuery;
  }
  //   CALL POSTGRES DB
  console.log("DB QUERY -->", query, [startDate, endDate]);
  await global.pool.query(query, [startDate, endDate], (error, result) => {
    if (error) {
      console.error("Error executing query:", error);
      return res.status(400).json({ error: "Error executing query" });
    } else {
      let data = result.rows;
      console.log("RESULT -->", data);
      return res.status(200).json(formatResult(data, intent));
    }
  });
});

const getNameString = (array) => {
  const values = array.map((obj) => `'%${obj.value}%'`);
  return values.join(",");
};

const resolveTimeEntity = (timeEntity, intent) => {
  let startTime;
  let endTime;
  let defaultDate = moment();

  let timeObj = timeEntity[0];

  if (intent == "get_leave_people_past") {
    return {
      startTime: moment().utc().startOf("year").toDate(),
      endTime: moment().utc().endOf("day").toDate(),
      isTimePresent: false,
    };
  }
  
  if (intent == "get_leave_count") {
    return {
      startTime: moment().utc().startOf("year").toDate(),
      endTime: moment().utc().endOf("year").toDate(),
      isTimePresent: false,
    };
  }

  if (isEmpty(timeObj)) {
    return {
      startTime: moment().utc().startOf("day").toDate(),
      endTime: moment().utc().endOf("year").toDate(),
      isTimePresent: false,
    };
  } else {
    let type = get(timeObj, "type", "");
    let grain = get(timeObj, "grain", "");

    if (type == "interval") {
      let start = get(timeObj, "from.value", defaultDate);
      let end = get(timeObj, "to.value", defaultDate);
      startTime = moment(start).startOf("day").utc().toDate();
      endTime = moment(end).endOf("day").utc().toDate();
    }
    if (["day", "week", "month", "year"].includes(grain)) {
      let value = get(timeObj, "value", defaultDate);
      startTime = moment(value).startOf(grain).utc().toDate();
      endTime = moment(value).endOf(grain).utc().toDate();
    }
  }

  return {
    startTime,
    endTime,
    isTimePresent: true,
  };
};

const formatResult = (data, intent) => {
  let result;
  switch (intent) {
    case "get_public_holiday":
      result = data;
      break;
    case "get_leave":
    case "get_leave_people":
      result = isEmpty(data) ? "No Leaves found" : data;
      break;
    case "check_leave_people":
      result = data;
      break;
    case "get_leave_count":
      result = data;
      break;
    case "get_leave_people_past":
      result = isEmpty(data) ? "No Leaves found" : data;
      break;
    case "get_leave_comparision":
      result = data;
      break;
    default:
      result = "Unable to acquire leave data";
  }
  return result;
};

module.exports = router;
