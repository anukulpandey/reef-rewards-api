const { default: axios } = require("axios");
const { GQL_ENDPOINT } = require("./constants");

async function getEraDifferenceFromTimestamp(timestamp) {
    const currentTime = Date.now();
    const targetTimestamp = new Date(timestamp).getTime();
    const eraDuration = 48 * 60 * 60 * 1000;
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
    try {
        const response = await axios({
            method: "post",
            url: GQL_ENDPOINT,
            headers: {
                "Content-Type": "application/json",
            },
            data: {
                query: getNominatorsForValidatorQuery(from, to, validator),
            },
        });
        return response.data.data.eraValidatorInfos;
    } catch (error) {
        console.log("error===",error);
        return [];
    }
}

  
module.exports={getEraDifferenceFromTimestamp,getTimestampFromDate,getNominatorsForValidatorsFromSqwid}