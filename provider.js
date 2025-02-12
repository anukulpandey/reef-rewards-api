const { WsProvider } = require('@polkadot/api');
const { Provider } = require('@reef-chain/evm-provider');
const { RPC_URL } = require('./constants');

async function getProvider() {
    const provider = new Provider({
      provider: new WsProvider(RPC_URL)
    });
    await provider.api.isReadyOrError;
    return provider.api;
  }

module.exports = {getProvider}