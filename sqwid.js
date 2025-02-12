const { default: axios } = require("axios");
const { GQL_ENDPOINT } = require("./constants");
const { getCurrentEra, getTimestamp, getCumulatedStake } = require("./nominators");
const { formatStakings } = require("./gql");

async function getEraDifferenceFromTimestamp(timestamp) {
    const currentTime = Date.now();
    const targetTimestamp = new Date(timestamp).getTime();
    const eraDuration = 24 * 60 * 60 * 1000; // 24 hours era
    const timeDiff = Math.abs(currentTime - targetTimestamp);
    const eraIndex = Math.floor(timeDiff / eraDuration);
    return eraIndex;
  }

  async function getTimestampFromEra(eraIndex,currentEraIndex, referenceTimestamp = Date.now()) {
    const eraDuration = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    const targetTimestamp = referenceTimestamp - (currentEraIndex - eraIndex) * eraDuration;
    return new Date(targetTimestamp).toISOString();
}

function getTimestampFromDate(from){
    return from ? new Date(from.split('-').reverse().join('-')).getTime() : null
}

function transformMapToArray(inputObj, showRewards) {
    return Object.entries(inputObj).map(([address, stakes]) => {
        let result = { address };
        if (showRewards) {
            result.amount_staked = formatStakings(stakes.map(({ amount, timestamp }) => ({ amount, timestamp })));
        }
        return result;
    });
}


function getNominatorsForValidatorQuery(from,to,validator){
    return `
      query NominatorsForValidatorQuery {
        eraValidatorInfos(orderBy: era_DESC, limit: 200, where: {era_gte: ${from}, AND: {era_lte: ${to}, AND: {address_eq: "${validator}"}}}) {
            address
            others {
            who
            }
            era
        }
        }`;
  }


function getRewardsQuery(from,to,nominators){
    return `
      query GetRewards {
        stakings(limit: 200, where: {timestamp_gte: "${from}", AND: {timestamp_lte: "${to}", AND: {signer: {id_in: ${nominators}}}}}) {
          signer {
            id
          }
          amount
          timestamp
        }
      }`;
  }


  async function getRewardsForNominatorsArray(windowsEraToNominatorArray,currentEra) {
      try {
        const requests =Object.entries(windowsEraToNominatorArray).map(async ([key, value]) => {
            const eraFrame =JSON.parse(key);
            const nominators = JSON.stringify(value, null, 2);

            const fromTimestamp = getTimestamp(await getTimestampFromEra(eraFrame[0],currentEra));
            const toTimestamp = getTimestamp(await getTimestampFromEra(eraFrame[1],currentEra));

          try {
            const response = await axios({
              method: "post",
              url: GQL_ENDPOINT,
              headers: {
                "Content-Type": "application/json",
              },
              data: {
                query: getRewardsQuery(fromTimestamp, toTimestamp, nominators),
              },
            });
            
            return response.data.data.stakings;
          } catch (error) {
            console.error(`Error fetching rewards:`, error);
            return { };
          }
        });
        
        let parsedResult = {};

        const updatedNominators = await Promise.all(requests);

        for(let i=0;i<updatedNominators.length;i++){
            for(let j=0;j<updatedNominators[i].length;j++){
                if (!parsedResult[updatedNominators[i][j]['signer']['id']]) {
                    parsedResult[updatedNominators[i][j]['signer']['id']] = [];
                }
                parsedResult[updatedNominators[i][j]['signer']['id']].push({
                    amount:updatedNominators[i][j]['amount'],
                    timestamp:updatedNominators[i][j]['timestamp'],
                })
            } 
        }

        return parsedResult;
      } catch (error) {
        console.error("getNominatorsRewards error:", error);
      }
    }
    

async function getNominatorsForValidatorsFromSqwid(from,to,validator,showRewards) {
     // converting dd-mm-yyyy to timestamps
        let fromTimestamp = getTimestampFromDate(from);
        let toTimestamp = getTimestampFromDate(to);
      
        // fetching current era using provider.api
        const currentEra = await getCurrentEra();
    
        // calculating from & to era for passing to gql
        const fromEra =currentEra- await getEraDifferenceFromTimestamp(fromTimestamp);
        const toEra =currentEra- await getEraDifferenceFromTimestamp(toTimestamp);
    try {
        const response = await axios({
            method: "post",
            url: GQL_ENDPOINT,
            headers: {
                "Content-Type": "application/json",
            },
            data: {
                query: getNominatorsForValidatorQuery(fromEra, toEra, validator),
            },
        });

        // nominators[address]=[active_eras]
        let nominatorsWithRewardsEraMap = getNominatorsRewardsWindow(response.data.data.eraValidatorInfos);

        for (let key in nominatorsWithRewardsEraMap) {
            if (nominatorsWithRewardsEraMap.hasOwnProperty(key)) { 
                nominatorsWithRewardsEraMap[key]=groupContinuousNumbers(nominatorsWithRewardsEraMap[key]);
            }
        }

        // [window_from,window_to]=>address[]
        const windowsEraToNominatorArray=groupByWindowSize(nominatorsWithRewardsEraMap);

        // address=>{amount,timestamp}[]
        const nominatorRewardsMap = await getRewardsForNominatorsArray(windowsEraToNominatorArray,currentEra);

        const finalResult = transformMapToArray(nominatorRewardsMap,showRewards);

        return {
            nominators:finalResult,
            cumulated_stakes:getCumulatedStake(finalResult)
        };
    } catch (error) {
        console.log("error===",error);
        return [];
    }
}

function getNominatorsRewardsWindow(data){
    let result = {};

    data.forEach(entry => {
        entry.others.forEach(other => {
            if (!result[other.who]) {
                result[other.who] = [];
            }
            result[other.who].push(entry.era);
        });
    });
    return result;
}

function groupContinuousNumbers(arr) {
    //returns address=>window_era[] 
    arr.sort((a, b) => a - b);

    let result = [];
    let temp = [arr[0]]; 
  
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] === arr[i - 1] + 1) {
        temp.push(arr[i]);
      } else {
        result.push([temp[0], temp[temp.length - 1]]);
        temp = [arr[i]];
      }
    }
  
    result.push([temp[0], temp[temp.length - 1]]);
  
    return result;
  }

  function groupByWindowSize(data) {
    // converts address=>window_era[] to window_era=>address[]
    const grouped = {};

    Object.entries(data).forEach(([nominator, windows]) => {
    windows.forEach(window => {
        const key = JSON.stringify(window);
        if (!grouped[key]) {
        grouped[key] = [];
        }
        grouped[key].push(nominator);
    });
    });

return (grouped);
}
  

  
module.exports={getEraDifferenceFromTimestamp,getTimestampFromDate,getNominatorsForValidatorsFromSqwid}