const { WsProvider } = require('@polkadot/api');
const { Provider } = require('@reef-chain/evm-provider');
const axios = require('axios')
const express = require("express");

const app = express();
const PORT = 3000;
const RPC_URL = "wss://rpc.reefscan.com/ws";
const GQL_ENDPOINT =  "https://squid.subsquid.io/reef-explorer/graphql";

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
  return `
    query GetRewards {
      stakings(limit: 100, where: {timestamp_gte: "${from}", AND: {timestamp_lte: "${to}", AND: {signer: {id_eq: "${signer}"}}}}) {
        amount
        timestamp
        signer {
          id
        }
      }
    }`;
}

function formatStakings(stakings) {
  return stakings.map(staking => ({
    amount: (BigInt(staking.amount) / BigInt(1e18)).toString(),
    timestamp: new Date(staking.timestamp)
      .toLocaleDateString("en-GB")
      .replace(/\//g, "-")
  }));
}

function getDaysInRange(fromTimestamp, toTimestamp, nominatorEra, currentEra) {
  const eraDuration = 2 * 24 * 60 * 60;
  const now = Math.floor(Date.now() / 1000);

  const currentEraStart = now - (currentEra - nominatorEra) * eraDuration;

  const fromEra = nominatorEra + Math.floor((fromTimestamp/1000 - currentEraStart) / eraDuration);
  const toEra = nominatorEra + Math.floor((toTimestamp/1000 - currentEraStart) / eraDuration);

  return (Math.max(fromEra,nominatorEra)-Math.min(toEra,currentEra))*2
}




async function getNominatorsRewards(nominators, from, to) {
  try {
    const requests = nominators.map(async (nominator) => {
      try {
        const response = await axios({
          method: "post",
          url: GQL_ENDPOINT,
          headers: {
            "Content-Type": "application/json",
          },
          data: {
            query: getRewardsQuery(from, to, nominator.address),
          },
        });
        
        return {
          ...nominator,
          amount_staked: formatStakings(response.data.data.stakings),
        };
      } catch (error) {
        console.error(`Error fetching rewards for ${nominator.address}:`, error);
        return { ...nominator, amount_staked: [] };
      }
    });
    
    const updatedNominators = await Promise.all(requests);
    return updatedNominators;
  } catch (error) {
    console.error("getNominatorsRewards error:", error);
  }
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

function getCumulatedStake(nominators) {
  const stakeMap = new Map();
  for (const nominator of nominators) {
    for (const { amount, timestamp } of nominator.amount_staked) {
      stakeMap.set(timestamp, (stakeMap.get(timestamp) || 0) + Number(amount));
    }
  }
  return Array.from(stakeMap, ([timestamp, amount]) => ({ amount,timestamp }));
}

function getActiveNominatorsInFrame(nominators){
  return nominators.filter(nominator => nominator.amount_staked.length > 0);
}


async function getNominatorsForValidator(validator,from,to) {
  let fromTimestamp = from ? new Date(from.split('-').reverse().join('-')).getTime() : null;
  let toTimestamp = to ? new Date(to.split('-').reverse().join('-')).getTime() : null;

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
      // let days = (currentEra - nominatorsData[j].since) * 2;
      let days = getDaysInRange(fromTimestamp,toTimestamp,nominatorsData[j].since,currentEra)
      nominators.push({
        address: nominatorsData[j].nominator,
        days: days
      });
    }
  }

  const nominators_updated = await getNominatorsRewards(nominators,getTimestamp(fromTimestamp),getTimestamp(toTimestamp));

  const cumulated_stake = getCumulatedStake(nominators_updated);

    validatorsData.push({
      validator,
      from,
      to,
      nominators_count: getActiveNominatorsInFrame(nominators_updated).length,
      cumulated_stake,
      nominators:getActiveNominatorsInFrame(nominators_updated)
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
