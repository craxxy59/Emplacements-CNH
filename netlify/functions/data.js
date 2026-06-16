const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(process.cwd(), 'data.json');

// Ensure data file exists
function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ boats: [], profiles: [] }, null, 2));
  }
}

exports.handler = async (event, context) => {
  // CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  ensureDataFile();
  let raw = fs.readFileSync(DATA_FILE, 'utf8');
  let data = JSON.parse(raw);

  const { httpMethod, path, body } = event;
  const action = path.split('/').pop(); // last segment

  let result;

  try {
    switch (action) {
      case 'fetchBoats':
        result = { boats: data.boats };
        break;

      case 'upsertBoat':
        const boat = JSON.parse(body || '{}').boat;
        if (!boat) throw new Error('Boat missing');
        const idx = data.boats.findIndex(b => b.id === boat.id);
        if (idx >= 0) data.boats[idx] = boat;
        else data.boats.push(boat);
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        result = { success: true, boat };
        break;

      case 'deleteBoat':
        const { boatId } = JSON.parse(body || '{}');
        data.boats = data.boats.filter(b => b.id !== boatId);
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        result = { success: true };
        break;

      case 'fetchProfiles':
        result = { profiles: data.profiles };
        break;

      case 'updateProfile':
        const { profileId, patch } = JSON.parse(body || '{}');
        const pIdx = data.profiles.findIndex(p => p.id === profileId);
        if (pIdx >= 0) {
          data.profiles[pIdx] = { ...data.profiles[pIdx], ...patch };
          fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        }
        result = { success: true };
        break;

      default:
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (err) {
    console.error('Netlify Function error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Internal error' })
    };
  }
};