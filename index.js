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

async function getNominators() {
  const api = await getProvider();
  const validators = await getValidators();
  const nominatorsMap = await api.query.staking.nominators.entries();
  
  const nominatorsData = nominatorsMap.map(([key, value]) => {
    return {
      nominator: key.args[0].toString(),
      targets: value.unwrapOrDefault().targets.map(target => target.toString())
    };
  });

  let validatorsData = [];

  for(let i=0;i<validators.length;i++){
    let validator = validators[i];
    let nominators = [];

    for(let j=0;j<nominatorsData.length;j++){
      if(nominatorsData[j].targets.toString().includes(validator.toString())){
        nominators.push({
          address: nominatorsData[j].nominator,
          days:0
        });
      }
    }

    validatorsData.push({
      validator,
      nominators_count:nominators.length,
      nominators
    })

  }

  

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

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
