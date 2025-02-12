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

function transformMapToArray(inputObj) {
    return Object.entries(inputObj).map(([address, stakes]) => {
        let result = { address };
        // if (showRewards) {
        //     result.amount_staked = formatStakings(stakes.map(({ amount, timestamp }) => ({ amount, timestamp })));
        // }
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


function getRewardsQuery(from,to,nominators,offset){
    return `
      query GetRewards {
        stakings(limit: 200, offset: ${offset}, where: {timestamp_gte: "${from}", AND: {timestamp_lte: "${to}", AND: {signer: {id_in: ${nominators}}}}}) {
          signer {
            id
          }
          amount
          timestamp
        }
      }`;
  }


  async function getRewardsForNominatorsArray(windowsEraToNominatorArray, currentEra) {
    try {
        const parsedResult = {};
        const addresses = new Set();

        for (const [key, value] of Object.entries(windowsEraToNominatorArray)) {
            const eraFrame = JSON.parse(key);
            const nominators = JSON.stringify(value, null, 2);

            const fromTimestamp = getTimestamp(await getTimestampFromEra(eraFrame[0], currentEra));
            const toTimestamp = getTimestamp(await getTimestampFromEra(eraFrame[1], currentEra));

            for(let x=0;x<value.length;x++){
                addresses.add(value[x]);
            }

            let offset = 0;
            const maxOffset = value.length * (eraFrame[1] - eraFrame[0]);
            while (offset < maxOffset) {
                try {
                    const response = await axios({
                        method: "post",
                        url: GQL_ENDPOINT,
                        headers: { "Content-Type": "application/json" },
                        data: {
                            query: getRewardsQuery(fromTimestamp, toTimestamp, nominators, offset),
                        },
                    });

                    const rewards = response.data.data.stakings || [];

                    for (const reward of rewards) {
                        const signerId = reward.signer.id;
                        if (!parsedResult[signerId]) {
                            parsedResult[signerId] = [];
                        }
                        parsedResult[signerId].push({
                            amount: reward.amount,
                            timestamp: reward.timestamp,
                        });
                    }

                    offset += 200;

                } catch (error) {
                    console.error(`Error fetching rewards at offset ${offset}:`, error);
                }
            }
        }

        console.log("preprocessed===",addresses.size);

        return {parsedResult,addresses};
    } catch (error) {
        console.error("getNominatorsRewards error:", error);
    }
}

    

async function getNominatorsForValidatorsFromSqwid(from,to,validator) {
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

        let count=0;

        for (let key in nominatorsWithRewardsEraMap) {
            if (nominatorsWithRewardsEraMap.hasOwnProperty(key)) { 
                nominatorsWithRewardsEraMap[key]=groupContinuousNumbers(nominatorsWithRewardsEraMap[key]);
            }
            count++;
        }

        // [window_from,window_to]=>address[]
        const windowsEraToNominatorArray=groupByWindowSize(nominatorsWithRewardsEraMap);

        // address=>{amount,timestamp}[]
        const {parsedResult:nominatorRewardsMap,addresses} = await getRewardsForNominatorsArray(windowsEraToNominatorArray,currentEra);

        console.log("processed===",Object.keys(nominatorRewardsMap).length); 

        const processedSet = new Set(Object.keys(nominatorRewardsMap));

// Find elements that are in 'preprocessed' but not in 'processed'
const missingInProcessed = [...addresses].filter(item => !processedSet.has(item));
console.log("missingInProcessed:",missingInProcessed.length)
for(let u=0;u<missingInProcessed.length;u++){
    console.log(missingInProcessed[u]+":"+nominatorsWithRewardsEraMap[missingInProcessed[u]])
}


        const finalResult = transformMapToArray(nominatorRewardsMap);

        return {
            nominators:finalResult,
            // cumulated_stakes:getCumulatedStake(finalResult)
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