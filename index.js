const { WsProvider } = require('@polkadot/api');
const { Provider } = require('@reef-chain/evm-provider');
const express = require("express");

const app = express();
const PORT = 3000;
const RPC_URL = "wss://rpc.reefscan.com/ws";

async function getProvider() {
  const provider = new Provider({
    provider: new WsProvider(RPC_URL)
  });
  await provider.api.isReadyOrError;
  return provider.api;
}

async function getValidators() {
  const api = await getProvider();
  return await api.query.session.validators();
}

function getTimestamp(timestamp) {
  return new Date(timestamp).toISOString(); 
}

function getRewardsQuery(from,to,signer){
  return ```
    query GetRewards {
      stakings(limit: 100, where: {timestamp_gte: "${from}", AND: {timestamp_lte: "${to}", AND: {signer: {id_eq: "${signer}"}}}}) {
        amount
        timestamp
      }
    }```;
}

async function getNominators() {
  const api = await getProvider();
  const validators = await getValidators();
  const nominatorsMap = await api.query.staking.nominators.entries();

  const nominatorsData = nominatorsMap.map(([key, value]) => {
    return {
      nominator: key.args[0].toString(),
      targets: value.unwrapOrDefault().targets.map(target => target.toString()),
      since: value.unwrapOrDefault().submittedIn.toNumber()
    };
  });

  let validatorsData = [];
  const currentEra = (await api.query.staking.activeEra()).unwrap().index.toNumber();

  for (let i = 0; i < validators.length; i++) {
    let validator = validators[i];
    let nominators = [];

    for (let j = 0; j < nominatorsData.length; j++) {
      if (nominatorsData[j].targets.includes(validator.toString())) {
        let days = (currentEra - nominatorsData[j].since) * 2;
        nominators.push({
          address: nominatorsData[j].nominator,
          days: days
        });
      }
    }

    validatorsData.push({
      validator,
      nominators_count: nominators.length,
      nominators
    });
  }

  return validatorsData;
}


async function getNominatorsForValidator(validator,from,to) {
  let fromTimestamp = from ? new Date(from.split('-').reverse().join('-')).getTime() : null;
  let toTimestamp = to ? new Date(to.split('-').reverse().join('-')).getTime() : null;

  console.log("From Timestamp:", getTimestamp(fromTimestamp));
  console.log("To Timestamp:", getTimestamp(toTimestamp));
  const api = await getProvider();
  const nominatorsMap = await api.query.staking.nominators.entries();

  const nominatorsData = nominatorsMap.map(([key, value]) => {
    return {
      nominator: key.args[0].toString(),
      targets: value.unwrapOrDefault().targets.map(target => target.toString()),
      since: value.unwrapOrDefault().submittedIn.toNumber()
    };
  });

  let validatorsData = [];
  const currentEra = (await api.query.staking.activeEra()).unwrap().index.toNumber();

  let nominators = [];

  for (let j = 0; j < nominatorsData.length; j++) {
    if (nominatorsData[j].targets.includes(validator.toString())) {
      let days = (currentEra - nominatorsData[j].since) * 2;
      nominators.push({
        address: nominatorsData[j].nominator,
        days: days
      });
    }
  }

    validatorsData.push({
      validator,
      from,
      to,
      nominators_count: nominators.length,
      nominators
    });

  return validatorsData;
}

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
