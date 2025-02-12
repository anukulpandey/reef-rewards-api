
const express = require("express");
const { PORT } = require('./constants');
const { getValidators, getNominators, getNominatorsForValidator, getCurrentEra } = require('./nominators');
const { getEraDifferenceFromTimestamp, getNominatorsForValidatorsFromSqwid, getTimestampFromDate } = require("./sqwid");

const app = express();

app.get("/sqwid",async(req,res)=>{
  try {
    const { from, to,validator } = req.query;

    // converting dd-mm-yyyy to timestamps
    let fromTimestamp = getTimestampFromDate(from);
    let toTimestamp = getTimestampFromDate(to);
  
    // fetching current era using provider.api
    const currentEra = await getCurrentEra();

    // calculating from & to era for passing to gql
    const fromEra =currentEra- await getEraDifferenceFromTimestamp(fromTimestamp);
    const toEra =currentEra- await getEraDifferenceFromTimestamp(toTimestamp);

    const response = await getNominatorsForValidatorsFromSqwid(fromEra,toEra,validator);

    res.json({
      from,to,validator,currentEra,fromEra,toEra,response
    })
  } catch (error) {
    console.error("Error fetching validators:", error);
    res.status(500).json({ error: "Failed to fetch validators from sqwid" });
  }
});

app.get("/validators", async (req, res) => {
  try {
    const validators = await getValidators();
    res.json({ validators });
  } catch (error) {
    console.error("Error fetching validators:", error);
    res.status(500).json({ error: "Failed to fetch validators" });
  }
});

app.get("/nominators", async (req, res) => {
  try {
    const nominators = await getNominators();
    res.json(nominators);
  } catch (error) {
    console.error("Error fetching nominators:", error);
    res.status(500).json({ error: "Failed to fetch nominators" });
  }
});

app.get("/nominators-for/:validator", async (req, res) => {
  try {
    const { from, to } = req.query;
    const nominators = await getNominatorsForValidator(req.params.validator,from,to);
    res.json(nominators);
  } catch (error) {
    console.error("Error fetching nominators:", error);
    res.status(500).json({ error: "Failed to fetch nominators" });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
