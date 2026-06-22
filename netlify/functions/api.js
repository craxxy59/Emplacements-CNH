const { getStore } = require("@netlify/blobs");

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: HEADERS, body: "" };
  }

  try {
    const store = getStore("cnh-data");
    const action = event.path.split("/").pop();
    let raw = await store.get("data.json");
    let data = raw ? JSON.parse(raw) : { boats: [] };
    let result;

    switch (action) {

      case "fetchBoats":
        result = { boats: data.boats || [] };
        break;

      case "upsertBoat": {
        const body = JSON.parse(event.body || "{}");
        const boat = body.boat || body;
        if (!boat || !boat.id) throw new Error("Bateau invalide");
        const idx = data.boats.findIndex(function(b) {
          return b.id === boat.id;
        });
        if (idx >= 0) data.boats[idx] = boat;
        else data.boats.push(boat);
        await store.setJSON("data.json", data);
        result = { boat: boat };
        break;
      }

      case "deleteBoat": {
        const body = JSON.parse(event.body || "{}");
        const boatId = body.boatId || (JSON.parse(event.body || "{}")).boatId;
        data.boats = data.boats.filter(function(b) {
          return b.id !== boatId;
        });
        await store.setJSON("data.json", data);
        result = { success: true };
        break;
      }

      default:
        return { statusCode: 404, headers: HEADERS,
          body: JSON.stringify({ error: "Route inconnue" }) };
    }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify(result) };
  } catch (err) {
    console.error("API Error:", err.message);
    return { statusCode: 500, headers: HEADERS,
      body: JSON.stringify({ error: err.message }) };
  }
};