const { getNominatorsRewards } = require("./gql");
const { getProvider } = require("./provider");

async function getValidators() {
    const api = await getProvider();
    return await api.query.session.validators();
  }
  
  function getTimestamp(timestamp) {
    return new Date(timestamp).toISOString(); 
  }
  
  function getDaysInRange(fromTimestamp, toTimestamp, nominatorEra, currentEra) {
    const eraDuration = 2 * 24 * 60 * 60;
    const now = Math.floor(Date.now() / 1000);
  
    const currentEraStart = now - (currentEra - nominatorEra) * eraDuration;
  
    const fromEra = nominatorEra + Math.floor((fromTimestamp/1000 - currentEraStart) / eraDuration);
    const toEra = nominatorEra + Math.floor((toTimestamp/1000 - currentEraStart) / eraDuration);
  
    return (Math.min(toEra,currentEra)-Math.max(fromEra,nominatorEra))*2
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

  
module.exports ={getValidators, getNominators,getNominatorsForValidator}