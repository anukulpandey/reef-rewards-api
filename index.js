const { ApiPromise, WsProvider } = require('@polkadot/api');

async function getValidators(rpcUrl) {
    const provider = new WsProvider(rpcUrl);
    const api = await ApiPromise.create({ provider });

    const validators = await api.query.session.validators();

    console.clear();

    console.log("List of Validators:");
    validators.forEach((validator, index) => {
        console.log(`${index + 1}. ${validator.toString()}`);
    });

    process.exit(1);
}

async function getNominatorsForValidator(rpcUrl, validatorAddress) {
    const provider = new WsProvider(rpcUrl);
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

const rpcUrl = "wss://rpc.reefscan.com/ws";

// getValidators(rpcUrl).catch(console.error);
getNominatorsForValidator(rpcUrl,"5H47J4ZkwVoV1jQDDzFBUt41aQMhxJXfz4zbm88GwDP8p5kS").catch(console.error);
