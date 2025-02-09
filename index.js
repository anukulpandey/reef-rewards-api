const { ApiPromise, WsProvider } = require('@polkadot/api');
const express = require("express");

const app = express();
const PORT = 3000;
const RPC_URL = "wss://rpc.reefscan.com/ws";


async function getValidators() {
  const provider = new WsProvider(RPC_URL);
  const api = await ApiPromise.create({ provider });
  return await api.query.session.validators();
}

async function getNominatorsForValidator(validatorAddress) {
  const provider = new WsProvider(RPC_URL);
  const api = await ApiPromise.create({ provider });
  const nominatorsEntries = await api.query.staking.nominators.entries();

const nominatorsForValidator = nominatorsEntries
  .filter(([_, nominatorOpt]) => {
    if (nominatorOpt.isSome) {
      const nominator = nominatorOpt.unwrap();
      return nominator.targets.includes(validatorAddress);
    }
    return false;
  })
  .map(([nominatorId]) => nominatorId.toHuman());

  console.log("Nominators for ",validatorAddress," :",nominatorsForValidator);

  process.exit(1);
}

app.get("/validators", async (req, res) => {
    try {
        const validators = await getValidators(RPC_URL);
        res.json({ validators });
    } catch (error) {
        console.error("Error fetching validators:", error);
        res.status(500).json({ error: "Failed to fetch validators" });
    }
});

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
