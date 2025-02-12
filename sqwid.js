const { default: axios } = require("axios");
const { GQL_ENDPOINT } = require("./constants");
const { getCurrentEra } = require("./nominators");

async function getEraDifferenceFromTimestamp(timestamp) {
    const currentTime = Date.now();
    const targetTimestamp = new Date(timestamp).getTime();
    const eraDuration = 24 * 60 * 60 * 1000; // 24 hours era
    const timeDiff = Math.abs(currentTime - targetTimestamp);
    const eraIndex = Math.floor(timeDiff / eraDuration);
    return eraIndex;
  }

function getTimestampFromDate(from){
    return from ? new Date(from.split('-').reverse().join('-')).getTime() : null
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

        for (let key in nominatorsWithRewardsEraMap) {
            if (nominatorsWithRewardsEraMap.hasOwnProperty(key)) { 
                nominatorsWithRewardsEraMap[key]=groupContinuousNumbers(nominatorsWithRewardsEraMap[key]);
            }
        }

        // now nominators[address]=[[window_1],[window_2]...]

        // find nominators with same eras
        const windowsEraToNominatorArray=groupByWindowSize(nominatorsWithRewardsEraMap);

        return windowsEraToNominatorArray;
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