const axios = require('axios');
const {GQL_ENDPOINT} = require("./constants");

function formatStakings(stakings) {
    return stakings.map(staking => ({
      amount: (BigInt(staking.amount) / BigInt(1e18)).toString(),
      timestamp: new Date(staking.timestamp)
        .toLocaleDateString("en-GB")
        .replace(/\//g, "-")
    }));
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

function getUniqueTimestamps(arr) {
    const timestampsSet = new Set();
  
    arr.forEach(item => {
      if (parseInt(item.amount) > 0) {
        timestampsSet.add(item.timestamp);
      }
    });
  
    return timestampsSet.size;
  }

  function cumulateNominatorRewards(arr) {
    return arr.reduce((sum, item) => sum + parseInt(item.amount), 0);
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
            rewarded_days:getUniqueTimestamps(formatStakings(response.data.data.stakings)),
            cumulated_rewards:cumulateNominatorRewards(formatStakings(response.data.data.stakings)),
            amount_staked: formatStakings(response.data.data.stakings)
          };
        } catch (error) {
          console.error(`Error fetching rewards for ${nominator.address}:`, error);
          return { ...nominator, rewarded_days:0 ,amount_staked: []};
        }
      });
      
      const updatedNominators = await Promise.all(requests);
      return updatedNominators;
    } catch (error) {
      console.error("getNominatorsRewards error:", error);
    }
  }
  
module.exports={
    getNominatorsRewards
}