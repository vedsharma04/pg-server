const express = require('express');
const router = express.Router();

router.post('/leaves', (req, res) => {
    // Handle the GET request
    res.send('This is the leaves route');
  });


  module.exports = router;
