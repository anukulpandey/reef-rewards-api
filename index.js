const { WsProvider } = require('@polkadot/api');
const {Provider} = require('@reef-chain/evm-provider');
const express = require("express");

const app = express();
const PORT = 3000;
const RPC_URL = "wss://rpc.reefscan.com/ws";

async function getProvider(){
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

app.get("/validators", async (req, res) => {
    try {
        const validators = await getValidators();
        res.json({ validators });
    } catch (error) {
        console.error("Error fetching validators:", error);
        res.status(500).json({ error: "Failed to fetch validators" });
    }
});

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
